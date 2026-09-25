// Tests migration 056 (owner/coach administration) against a REAL
// Postgres engine (PGlite), extending testMigrations.mjs/testFinalImport.mjs's
// established pattern -- but going further than either of those: this is
// the first local test in this repo to actually simulate Supabase's
// auth.uid()/auth.users mechanics and to RUN AS A NON-SUPERUSER ROLE, so
// RLS policies are genuinely enforced rather than silently bypassed (the
// PGlite default connection is a superuser, which ignores RLS entirely --
// confirmed directly below before trusting any later result).
//
// Honest limitation, stated once here rather than repeated at every
// assertion: this is still NOT Supabase's real GoTrue/auth schema, real
// JWT verification, or a real hosted Postgres -- auth.uid()/auth.users
// are hand-built minimal stand-ins good enough to exercise this
// migration's own SQL logic (RLS predicates, trigger bodies, RPC
// authorization). It is not a substitute for a real preview-environment
// test against actual Supabase Auth, which has not been performed.
import { PGlite } from '@electric-sql/pglite'

let allOk = true
function check(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}${detail ? ' -- ' + detail : ''}`)
  if (!cond) allOk = false
}
async function expectError(label, fn) {
  try {
    await fn()
    check(label, false, 'expected an error, none was thrown')
  } catch (e) {
    check(label, true, e.message?.slice(0, 80))
  }
}

const db = new PGlite()

// --- 1. Minimal auth schema stand-in ---
await db.exec(`
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
-- Simulates Supabase's auth.uid(): reads a session-local GUC the test
-- sets per-simulated-caller via SET LOCAL, instead of a real JWT.
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('app.current_uid', true), '')::uuid; $$;
`)

// --- 2. A non-superuser role -- RLS is a no-op for a superuser/BYPASSRLS
// role, so every later assertion would be meaningless without this.
await db.exec(`
create role anon nosuperuser noBypassRLS;
create role authenticated nosuperuser noBypassRLS;
create role app_user nosuperuser noBypassRLS in role authenticated;
grant usage on schema public, auth to app_user, anon, authenticated;
grant select on auth.users to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
`)

// --- 3. Cumulative pre-056 schema this migration actually depends on:
// 021 (user_roles/trainees/is_coach/is_trainee), 046 (coach_barcode_products,
// WITHOUT is_coach() -- the real, current, pre-fix shape). Trimmed to
// exactly what 056 reads or modifies -- not a full 055-migration replay.
await db.exec(`
create table public.trainees (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id)
);
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('coach', 'trainee')),
  created_at timestamptz not null default now()
);
alter table public.user_roles enable row level security;
create policy user_roles_select_own on public.user_roles for select using (user_id = auth.uid());

create or replace function public.is_coach() returns boolean
language sql security definer set search_path = public, pg_temp stable
as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'coach'); $$;
create or replace function public.is_trainee() returns boolean
language sql security definer set search_path = public, pg_temp stable
as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'trainee'); $$;

create table public.coach_barcode_products (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  barcode text not null,
  product_name text not null,
  calories_per_100g numeric(7,2) not null,
  protein_per_100g numeric(6,2)
);
alter table public.coach_barcode_products enable row level security;
create policy coach_barcode_products_select_own on public.coach_barcode_products for select using (coach_id = auth.uid());
create policy coach_barcode_products_insert_own on public.coach_barcode_products for insert with check (coach_id = auth.uid());
create policy coach_barcode_products_update_own on public.coach_barcode_products for update using (coach_id = auth.uid()) with check (coach_id = auth.uid());
`)
console.log('Pre-056 baseline schema (021 + 046, trimmed) built. OK.\n')

// --- 4. Seed two existing coaches (pre-migration) + one trainee, one future owner ---
const { rows: seeded } = await db.query(`
  insert into auth.users (email, email_confirmed_at) values
    ('coach.a@example.com', now()),
    ('coach.b@example.com', now()),
    ('owner@example.com', now()),
    ('trainee1@example.com', now())
  returning id, email;
`)
const uid = Object.fromEntries(seeded.map((r) => [r.email, r.id]))
await db.query(`insert into public.user_roles (user_id, role) values ($1,'coach'), ($2,'coach'), ($3,'trainee')`, [
  uid['coach.a@example.com'], uid['coach.b@example.com'], uid['trainee1@example.com'],
])
await db.query(`insert into public.trainees (coach_id) values ($1)`, [uid['coach.a@example.com']])
await db.query(`insert into public.coach_barcode_products (coach_id, barcode, product_name, calories_per_100g) values ($1, '111', 'x', 50)`, [uid['coach.a@example.com']])
console.log('Seeded 2 pre-existing coaches, 1 trainee, 1 future-owner account, 1 trainee row, 1 barcode-product row.\n')

// --- 5. Apply migration 056 (real file, run verbatim) ---
const migrationSql = await (await import('node:fs')).promises.readFile(
  new URL('../../../supabase/sql/056_owner_coach_administration.sql', import.meta.url),
  'utf8',
)
let migrationError = null
try {
  await db.exec(migrationSql)
} catch (e) {
  migrationError = e
}
check('Migration 056 applies without error', migrationError === null, migrationError?.message)
if (migrationError) {
  console.log('\nCannot continue -- migration itself failed.')
  await db.close()
  process.exit(1)
}

// Promote one account to owner AFTER the migration (mirrors the documented
// manual bootstrap step -- not part of the migration file itself). This
// account never had any prior role row (it's a fresh account being
// bootstrapped as the very first owner), so it's an INSERT, not an UPDATE.
await db.query(`insert into public.user_roles (user_id, role) values ($1, 'owner')`, [uid['owner@example.com']])
const OWNER = uid['owner@example.com']
const COACH_A = uid['coach.a@example.com']
const COACH_B = uid['coach.b@example.com']
const TRAINEE1 = uid['trainee1@example.com']

// --- 6. Backfill correctness ---
const backfill = await db.query(`select user_id, access_status, payment_status from public.coaches order by user_id`)
check('Exactly 2 coaches rows exist after backfill (the 2 pre-existing coaches)', backfill.rows.length === 2, `got ${backfill.rows.length}`)
check('Both pre-existing coaches backfilled as active/paid', backfill.rows.every((r) => r.access_status === 'active' && r.payment_status === 'paid'), JSON.stringify(backfill.rows))

// --- 7. is_coach() still true for existing coaches (as app_user, simulating each) ---
// PGlite/postgres SET LOCAL ROLE + set_config both need to be issued
// inside a transaction to take effect for the query that follows;
// queryAs() below commits (not rolls back) so RPC side-effects like a
// status change persist across the checks that build on each other.
async function queryAs(userId, sql, params = []) {
  await db.query('begin')
  await db.query(`set local role app_user`)
  await db.query(`select set_config('app.current_uid', $1, true)`, [userId ?? ''])
  try {
    return await db.query(sql, params)
  } finally {
    await db.query('commit') // commit so RPC side-effects (status changes) persist across checks that build on each other
  }
}

const coachAIsCoach = await queryAs(COACH_A, 'select public.is_coach() as v')
check('is_coach() true for existing active Coach A', coachAIsCoach.rows[0].v === true)

// --- 8. RLS: superuser bypass sanity check (proves the harness itself is valid) ---
await db.query('set role postgres') // back to superuser/default for setup
const bypassCheck = await db.query(`select count(*)::int as c from public.coaches`)
check('Sanity: superuser query sees all coaches (RLS bypassed for setup role, as expected)', bypassCheck.rows[0].c === 2)

// --- 9. RLS: Coach A (non-owner) cannot read public.coaches at all ---
const coachAReadCoaches = await queryAs(COACH_A, `select count(*)::int as c from public.coaches`)
check('RLS: a coach gets ZERO rows from public.coaches directly (no SELECT policy granted to non-owner)', coachAReadCoaches.rows[0].c === 0)

// --- 10. RLS: the owner CAN read public.coaches ---
const ownerReadCoaches = await queryAs(OWNER, `select count(*)::int as c from public.coaches`)
check('RLS: the owner sees all coach rows directly', ownerReadCoaches.rows[0].c === 2)

// --- 11. owner_list_coaches() authorization ---
await expectError('owner_list_coaches(): a coach caller is rejected', () => queryAs(COACH_A, `select * from public.owner_list_coaches()`))
await expectError('owner_list_coaches(): a trainee caller is rejected', () => queryAs(TRAINEE1, `select * from public.owner_list_coaches()`))
await expectError('owner_list_coaches(): an unauthenticated caller (no uid set) is rejected', () => queryAs(null, `select * from public.owner_list_coaches()`))
const ownerList = await queryAs(OWNER, `select * from public.owner_list_coaches()`)
check('owner_list_coaches(): owner sees exactly 2 coaches', ownerList.rows.length === 2, JSON.stringify(ownerList.rows.map(r=>r.email)))
check('owner_list_coaches(): trainee_count correct for Coach A (1 trainee)', ownerList.rows.find(r=>r.user_id===COACH_A)?.trainee_count == 1)
check('owner_list_coaches(): trainee_count correct for Coach B (0 trainees)', ownerList.rows.find(r=>r.user_id===COACH_B)?.trainee_count == 0)

// --- 12. owner_set_coach_status: authorization + validation + atomicity ---
await expectError('owner_set_coach_status: a coach cannot call it', () => queryAs(COACH_A, `select public.owner_set_coach_status($1,'suspended','test')`, [COACH_B]))
await expectError('owner_set_coach_status: rejects an invalid status value', () => queryAs(OWNER, `select public.owner_set_coach_status($1,'banned','test')`, [COACH_B]))
await expectError('owner_set_coach_status: requires a non-empty reason', () => queryAs(OWNER, `select public.owner_set_coach_status($1,'suspended','')`, [COACH_B]))
await expectError('owner_set_coach_status: cannot target the owner account itself (not a coach)', () => queryAs(OWNER, `select public.owner_set_coach_status($1,'suspended','test')`, [OWNER]))
await expectError('owner_set_coach_status: cannot target a trainee account', () => queryAs(OWNER, `select public.owner_set_coach_status($1,'suspended','test')`, [TRAINEE1]))

await queryAs(OWNER, `select public.owner_set_coach_status($1,'suspended','non-payment, per phone call')`, [COACH_B])
const bStatus = await queryAs(OWNER, `select access_status from public.coaches where user_id = $1`, [COACH_B])
check('Coach B is now suspended', bStatus.rows[0].access_status === 'suspended')
const history = await queryAs(OWNER, `select old_status, new_status, changed_by, reason from public.coach_status_history where coach_user_id = $1`, [COACH_B])
check('coach_status_history recorded the change atomically (1 row, correct old/new/changed_by/reason)',
  history.rows.length === 1 && history.rows[0].old_status === 'active' && history.rows[0].new_status === 'suspended' && history.rows[0].changed_by === OWNER,
  JSON.stringify(history.rows))

// --- 13. THE CORE REQUIREMENT: suspended Coach B loses access everywhere is_coach() gates ---
const bIsCoachAfterSuspend = await queryAs(COACH_B, 'select public.is_coach() as v')
check('is_coach() now FALSE for suspended Coach B (existing session, same auth.uid(), no sign-out simulated)', bIsCoachAfterSuspend.rows[0].v === false)

const bBarcodeAccess = await queryAs(COACH_B, `select count(*)::int as c from public.coach_barcode_products where coach_id = $1`, [COACH_B])
check('coach_barcode_products: suspended coach\'s SELECT also returns zero rows (not just blocked writes)', bBarcodeAccess.rows[0].c === 0)
await expectError('coach_barcode_products: suspended coach cannot INSERT (the independently-found gap, now fixed)', () =>
  queryAs(COACH_B, `insert into public.coach_barcode_products (coach_id, barcode, product_name, calories_per_100g) values ($1,'222','y',10)`, [COACH_B]))

const aBarcodeStillWorks = await queryAs(COACH_A, `select count(*)::int as c from public.coach_barcode_products where coach_id = $1`, [COACH_A])
check('coach_barcode_products: still-active Coach A retains normal access (no cross-coach blast radius)', aBarcodeStillWorks.rows[0].c === 1)

// --- 14. Cross-coach isolation: Coach A cannot see/touch Coach B's data ---
const crossRead = await queryAs(COACH_A, `select count(*)::int as c from public.trainees where coach_id = $1`, [COACH_B])
check('Cross-coach: Coach A sees 0 of Coach B\'s trainees even after direct query attempt', crossRead.rows[0].c === 0)

// --- 15. owner_set_coach_payment_status: independence from access_status ---
await queryAs(OWNER, `select public.owner_set_coach_payment_status($1,'overdue','2026-01-01','2026-02-01')`, [COACH_A])
const aAfterPayment = await queryAs(OWNER, `select access_status, payment_status from public.coaches where user_id = $1`, [COACH_A])
check('Payment-status change does NOT alter access_status', aAfterPayment.rows[0].access_status === 'active' && aAfterPayment.rows[0].payment_status === 'overdue', JSON.stringify(aAfterPayment.rows[0]))
const aHistoryAfterPayment = await queryAs(OWNER, `select count(*)::int as c from public.coach_status_history where coach_user_id = $1`, [COACH_A])
check('Payment-status change writes NOTHING to coach_status_history', aHistoryAfterPayment.rows[0].c === 0)

// --- 16. Reactivation restores access, preserves all data ---
await queryAs(OWNER, `select public.owner_set_coach_status($1,'active','payment received')`, [COACH_B])
const bAfterReactivate = await queryAs(COACH_B, 'select public.is_coach() as v')
check('Reactivated Coach B: is_coach() true again', bAfterReactivate.rows[0].v === true)
const bTraineesIntact = await queryAs(OWNER, `select count(*)::int as c from public.trainees where coach_id = $1`, [COACH_A])
check('Sanity: Coach A\'s trainee row untouched throughout the whole suspend/reactivate cycle of Coach B', bTraineesIntact.rows[0].c === 1)

// --- 17. Trainee access is completely independent of coach status ---
const traineeStillTrainee = await queryAs(TRAINEE1, 'select public.is_trainee() as v')
check('Trainee role check never referenced coach status -- is_trainee() unaffected by any coach suspend/reactivate above', traineeStillTrainee.rows[0].v === true)

// --- 18. Coach invitation flow: idempotent issue, duplicate email handling, linking trigger ---
const invite1 = await queryAs(OWNER, `select * from public.owner_get_or_invite_coach('new.coach@example.com')`)
check('First invite: newly_issued = true', invite1.rows[0].newly_issued === true)
const invite2 = await queryAs(OWNER, `select * from public.owner_get_or_invite_coach('new.coach@example.com')`)
check('Duplicate invite to the same still-pending email: reuses the SAME token (newly_issued=false)',
  invite2.rows[0].newly_issued === false && invite2.rows[0].invite_token === invite1.rows[0].invite_token)

await expectError('Inviting an email that already belongs to an existing coach is rejected', () =>
  queryAs(OWNER, `select * from public.owner_get_or_invite_coach('coach.a@example.com')`))
await expectError('A non-owner cannot invite a coach', () => queryAs(COACH_A, `select * from public.owner_get_or_invite_coach('someone@example.com')`))

// Simulate the invited person accepting: insert their auth.users row with
// the token in metadata, confirmed -- fires the linking trigger.
await db.query('set role postgres')
await db.query(
  `insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, now(), jsonb_build_object('coach_invite_token', $2::text))`,
  ['new.coach@example.com', invite1.rows[0].invite_token],
)
const newCoachRow = await db.query(`select u.id from auth.users u where u.email = 'new.coach@example.com'`)
const NEW_COACH = newCoachRow.rows[0].id
const newCoachRole = await db.query(`select role from public.user_roles where user_id = $1`, [NEW_COACH])
check('Linking trigger granted role=coach to the newly-confirmed account', newCoachRole.rows[0]?.role === 'coach')
const newCoachStatus = await db.query(`select access_status from public.coaches where user_id = $1`, [NEW_COACH])
check('New coach begins as PENDING, not active (approval is a separate owner action)', newCoachStatus.rows[0]?.access_status === 'pending')
const newCoachIsCoachYet = await queryAs(NEW_COACH, 'select public.is_coach() as v')
check('Pending coach: is_coach() is FALSE until explicitly approved', newCoachIsCoachYet.rows[0].v === false)

await queryAs(OWNER, `select public.owner_set_coach_status($1,'active','approved after review')`, [NEW_COACH])
const newCoachApproved = await queryAs(NEW_COACH, 'select public.is_coach() as v')
check('After explicit owner approval: is_coach() now TRUE', newCoachApproved.rows[0].v === true)

// --- 19. coach_get_own_status(): the frontend live-recheck RPC ---
const ownStatus = await queryAs(COACH_A, 'select * from public.coach_get_own_status()')
check('coach_get_own_status(): a coach can read their own status', ownStatus.rows[0]?.access_status === 'active')
const traineeOwnStatus = await queryAs(TRAINEE1, 'select * from public.coach_get_own_status()')
check('coach_get_own_status(): a trainee (no coaches row) gets zero rows, not an error', traineeOwnStatus.rows.length === 0)

console.log(allOk ? '\n=== ALL OWNER/COACH-ADMIN PGLITE TESTS PASSED ===' : '\n=== SOME TESTS FAILED -- see above ===')
await db.close()
process.exit(allOk ? 0 : 1)
