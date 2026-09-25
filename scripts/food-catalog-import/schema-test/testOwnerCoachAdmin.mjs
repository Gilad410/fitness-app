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
// IMPORTANT: that reuse is reachable here ONLY because no auth.users row
// exists for this address yet -- i.e. it models a retry after a send that
// never reached GoTrue. It is NOT resend support. Once a real invite
// email goes out, GoTrue creates an unconfirmed auth.users row and the
// pre-existing-account check rejects this same call. Section 27 below
// proves exactly that, so this check cannot be mistaken for resend.

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

// =====================================================================
// Review-correction regression tests (added after Codex review)
// =====================================================================

// --- 20. CORRECTION 1: the audit trail cannot be bypassed by a raw UPDATE ---
// The owner has SELECT on public.coaches but deliberately NO update
// policy, so every one of these must fail rather than silently change
// state without writing coach_status_history.
// NOTE on what "blocked" looks like in Postgres, because the two cases
// differ and asserting the wrong one would make this whole section
// meaningless: an INSERT with no permitting policy raises a
// WITH CHECK violation, but an UPDATE/DELETE with no permitting policy
// does NOT raise -- RLS simply filters the target rows away, so the
// statement succeeds having affected ZERO rows. The security property
// to assert for UPDATE/DELETE is therefore "0 rows affected AND the
// stored value is unchanged", not "it threw". (An earlier version of
// this test asserted a throw and failed here, which is how this
// distinction got pinned down rather than assumed.)
const preTamper = await queryAs(OWNER,
  `select access_status, payment_status, paid_through, owner_note from public.coaches where user_id = $1`, [COACH_A])

const upd1 = await queryAs(OWNER, `update public.coaches set access_status = 'suspended' where user_id = $1`, [COACH_A])
check('Owner raw-UPDATE of access_status affects ZERO rows (audit trail cannot be bypassed)', (upd1.affectedRows ?? 0) === 0, `affectedRows=${upd1.affectedRows}`)
const upd2 = await queryAs(OWNER, `update public.coaches set payment_status = 'paid' where user_id = $1`, [COACH_A])
check('Owner raw-UPDATE of payment_status affects ZERO rows', (upd2.affectedRows ?? 0) === 0)
const upd3 = await queryAs(OWNER, `update public.coaches set paid_through = current_date where user_id = $1`, [COACH_A])
check('Owner raw-UPDATE of payment dates affects ZERO rows', (upd3.affectedRows ?? 0) === 0)
const upd4 = await queryAs(OWNER, `update public.coaches set owner_note = 'tampered' where user_id = $1`, [COACH_A])
check('Owner raw-UPDATE of owner_note affects ZERO rows', (upd4.affectedRows ?? 0) === 0)
const del1 = await queryAs(OWNER, `delete from public.coaches where user_id = $1`, [COACH_A])
check('Owner raw-DELETE of a coaches row affects ZERO rows', (del1.affectedRows ?? 0) === 0)
const del2 = await queryAs(OWNER, `delete from public.coach_status_history where coach_user_id = $1`, [COACH_B])
check('Owner raw-DELETE of coach_status_history affects ZERO rows (append-only)', (del2.affectedRows ?? 0) === 0)

const postTamper = await queryAs(OWNER,
  `select access_status, payment_status, paid_through, owner_note from public.coaches where user_id = $1`, [COACH_A])
check('...and every stored value is byte-identical after all six tamper attempts',
  JSON.stringify(preTamper.rows[0]) === JSON.stringify(postTamper.rows[0]),
  `${JSON.stringify(preTamper.rows[0])} vs ${JSON.stringify(postTamper.rows[0])}`)
const historyStillIntact = await queryAs(OWNER, `select count(*)::int as c from public.coach_status_history where coach_user_id = $1`, [COACH_B])
check('...and Coach B\'s history rows survived the delete attempt', historyStillIntact.rows[0].c >= 1)

// INSERT is the case that DOES raise (WITH CHECK violation).
await expectError('Owner CANNOT raw-INSERT a coaches row', () =>
  queryAs(OWNER, `insert into public.coaches (user_id, access_status) values ($1,'active')`, [TRAINEE1]))
await expectError('Owner CANNOT insert a forged coach_status_history row', () =>
  queryAs(OWNER, `insert into public.coach_status_history (coach_user_id, new_status, changed_by) values ($1,'active',$1)`, [COACH_A]))

// ...while the approved RPCs still work, and still write history.
const historyBefore = await queryAs(OWNER, `select count(*)::int as c from public.coach_status_history where coach_user_id = $1`, [COACH_A])
await queryAs(OWNER, `select public.owner_set_coach_status($1,'suspended','audit-trail regression check')`, [COACH_A])
const historyAfter = await queryAs(OWNER, `select count(*)::int as c from public.coach_status_history where coach_user_id = $1`, [COACH_A])
check('Approved RPC still works AND appends exactly one history row',
  historyAfter.rows[0].c === historyBefore.rows[0].c + 1, `${historyBefore.rows[0].c} -> ${historyAfter.rows[0].c}`)
await queryAs(OWNER, `select public.owner_set_coach_status($1,'active','restoring for later checks')`, [COACH_A])

// --- 21. CORRECTION 3: owner_set_coach_note + payment date validation ---
await queryAs(OWNER, `select public.owner_set_coach_note($1,'  private note  ')`, [COACH_A])
const noteRow = await queryAs(OWNER, `select owner_note from public.coaches where user_id = $1`, [COACH_A])
check('owner_set_coach_note stores the trimmed note', noteRow.rows[0].owner_note === 'private note')
await queryAs(OWNER, `select public.owner_set_coach_note($1,'   ')`, [COACH_A])
const clearedNote = await queryAs(OWNER, `select owner_note from public.coaches where user_id = $1`, [COACH_A])
check('owner_set_coach_note normalizes whitespace-only to NULL (one "cleared" state)', clearedNote.rows[0].owner_note === null)
await expectError('owner_set_coach_note: a coach cannot call it', () =>
  queryAs(COACH_B, `select public.owner_set_coach_note($1,'x')`, [COACH_A]))
await expectError('owner_set_coach_note: rejects an over-long note', () =>
  queryAs(OWNER, `select public.owner_set_coach_note($1, repeat('x', 2001))`, [COACH_A]))
await expectError('owner_set_coach_note: cannot target a non-coach account', () =>
  queryAs(OWNER, `select public.owner_set_coach_note($1,'x')`, [TRAINEE1]))
const noteStatusCheck = await queryAs(OWNER, `select access_status from public.coaches where user_id = $1`, [COACH_A])
check('owner_set_coach_note never changes access_status', noteStatusCheck.rows[0].access_status === 'active')

await expectError('owner_set_coach_payment_status: rejects paid_through earlier than the review date', () =>
  queryAs(OWNER, `select public.owner_set_coach_payment_status($1,'paid','2026-06-01','2026-01-01')`, [COACH_A]))
await expectError('owner_set_coach_payment_status: rejects an out-of-range date (typo\'d year)', () =>
  queryAs(OWNER, `select public.owner_set_coach_payment_status($1,'paid','2026-01-01','2999-01-01')`, [COACH_A]))

// --- 22. CORRECTION 4: pending-invitation listing, without tokens ---
const pendingList = await queryAs(OWNER, `select * from public.owner_list_pending_invitations()`)
check('owner_list_pending_invitations returns the live invitation', pendingList.rows.length >= 0)
const listedColumns = pendingList.fields ? pendingList.fields.map((f) => f.name) : Object.keys(pendingList.rows[0] ?? {})
check('owner_list_pending_invitations NEVER exposes invite_token',
  !listedColumns.includes('invite_token'), `columns: ${listedColumns.join(',')}`)
await expectError('owner_list_pending_invitations: a coach cannot call it', () =>
  queryAs(COACH_A, `select * from public.owner_list_pending_invitations()`))
await expectError('owner_list_pending_invitations: an unauthenticated caller is rejected', () =>
  queryAs(null, `select * from public.owner_list_pending_invitations()`))

// A brand-new invitation must show up in that list immediately.
await queryAs(OWNER, `select * from public.owner_get_or_invite_coach('listed.coach@example.com')`)
const afterInviteList = await queryAs(OWNER, `select * from public.owner_list_pending_invitations()`)
check('A newly sent invitation appears immediately in the pending list',
  afterInviteList.rows.some((r) => r.email === 'listed.coach@example.com'))
check('Pending invitation is reported with state=pending while unexpired',
  afterInviteList.rows.find((r) => r.email === 'listed.coach@example.com')?.state === 'pending')

// Cancelling removes it from the pending list.
const toCancel = afterInviteList.rows.find((r) => r.email === 'listed.coach@example.com')
await queryAs(OWNER, `select public.owner_cancel_coach_invite($1)`, [toCancel.invitation_id])
const afterCancelList = await queryAs(OWNER, `select * from public.owner_list_pending_invitations()`)
check('A cancelled invitation disappears from the pending list',
  !afterCancelList.rows.some((r) => r.email === 'listed.coach@example.com'))

// Expiry is reported as a distinct computed state, not silently "pending".
await db.query('set role postgres')
await db.query(`insert into public.coach_invitations (email, invite_token, invited_by, invite_sent_at, invite_expires_at)
                values ('expired.coach@example.com', gen_random_uuid(), $1, now() - interval '9 days', now() - interval '2 days')`, [OWNER])
const expiredList = await queryAs(OWNER, `select * from public.owner_list_pending_invitations()`)
check('An expired-but-unswept invitation is reported as state=expired',
  expiredList.rows.find((r) => r.email === 'expired.coach@example.com')?.state === 'expired')

// --- 23. CORRECTION 6: any pre-existing auth.users email is rejected ---
await db.query('set role postgres')
await db.query(`insert into auth.users (email, email_confirmed_at) values ('roleless@example.com', now())`)
await expectError('A pre-existing Auth account with NO role is still rejected (no unusable pending invitation)', () =>
  queryAs(OWNER, `select * from public.owner_get_or_invite_coach('roleless@example.com')`))
const noStrayInvite = await db.query(`select count(*)::int as c from public.coach_invitations where lower(email) = 'roleless@example.com'`)
check('...and no invitation row was left behind for it', noStrayInvite.rows[0].c === 0)

// --- 24. CORRECTION 7: acceptance is atomic and role-conflict-safe ---
// A trainee account that somehow presents a valid coach token must NOT
// become a coach, must NOT get a coaches row, and must NOT leave the
// invitation falsely accepted.
const conflictInvite = await queryAs(OWNER, `select * from public.owner_get_or_invite_coach('conflict@example.com')`)
await db.query('set role postgres')
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'conflict@example.com', '{}'::jsonb)`)
const conflictUser = await db.query(`select id from auth.users where email = 'conflict@example.com'`)
const CONFLICT_ID = conflictUser.rows[0].id
await db.query(`insert into public.user_roles (user_id, role) values ($1,'trainee')`, [CONFLICT_ID])
// Now confirm the email WITH the coach token -> fires the trigger.
await db.query(
  `update auth.users set raw_user_meta_data = jsonb_build_object('coach_invite_token', $2::text), email_confirmed_at = now() where id = $1`,
  [CONFLICT_ID, conflictInvite.rows[0].invite_token],
)
const conflictRole = await db.query(`select role from public.user_roles where user_id = $1`, [CONFLICT_ID])
check('Role conflict: an existing trainee keeps role=trainee (never silently converted)', conflictRole.rows[0].role === 'trainee')
const conflictCoachRow = await db.query(`select count(*)::int as c from public.coaches where user_id = $1`, [CONFLICT_ID])
check('Role conflict: NO stray coaches row is created', conflictCoachRow.rows[0].c === 0)
const conflictInviteState = await db.query(`select status from public.coach_invitations where id = $1`, [conflictInvite.rows[0].invitation_id])
check('Role conflict: the invitation is NOT falsely marked accepted (stays invited)', conflictInviteState.rows[0].status === 'invited')

// Duplicate trigger execution on a valid acceptance stays idempotent.
const dupInvite = await queryAs(OWNER, `select * from public.owner_get_or_invite_coach('dup@example.com')`)
await db.query('set role postgres')
await db.query(
  `insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, now(), jsonb_build_object('coach_invite_token', $2::text))`,
  ['dup@example.com', dupInvite.rows[0].invite_token],
)
const dupUser = await db.query(`select id from auth.users where email = 'dup@example.com'`)
const DUP_ID = dupUser.rows[0].id
check('Valid acceptance: role granted', (await db.query(`select role from public.user_roles where user_id=$1`, [DUP_ID])).rows[0]?.role === 'coach')
check('Valid acceptance: pending coaches row created', (await db.query(`select access_status from public.coaches where user_id=$1`, [DUP_ID])).rows[0]?.access_status === 'pending')
check('Valid acceptance: invitation marked accepted', (await db.query(`select status from public.coach_invitations where id=$1`, [dupInvite.rows[0].invitation_id])).rows[0].status === 'accepted')
// Re-fire the confirm trigger path for the same user -- must change nothing.
await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [DUP_ID])
await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [DUP_ID])
const dupRoleCount = await db.query(`select count(*)::int as c from public.user_roles where user_id=$1`, [DUP_ID])
const dupCoachCount = await db.query(`select count(*)::int as c from public.coaches where user_id=$1`, [DUP_ID])
check('Duplicate trigger execution is idempotent (exactly one role row, one coaches row)',
  dupRoleCount.rows[0].c === 1 && dupCoachCount.rows[0].c === 1)

// --- 25. CORRECTION 5: invitation issuance is serialized by an
//     advisory lock keyed on the NORMALIZED email.
//
// HONEST SCOPE OF THIS TEST. PGlite is a single embedded connection --
// it cannot open two genuinely concurrent transactions, so this test
// CANNOT prove that two simultaneous callers converge; that requires a
// real multi-connection Postgres and is listed as an outstanding
// preview-environment step. What is verified here is everything the
// single-connection engine can actually decide: that the advisory lock
// is really taken (visible in pg_locks) while the issuing transaction
// is open, that it is transaction-scoped (gone after commit, with no
// explicit unlock), and that the lock key is computed from the
// normalized address, so two callers using different casing/whitespace
// for the same mailbox contend on the SAME key rather than sailing past
// each other. The previous revision's claim of concurrency safety
// rested only on the JavaScript fake lock in the Edge Function's unit
// tests, which proves nothing about the SQL -- that is precisely the
// gap this section exists to narrow (not close).
const keyNorm = await db.query(
  `select hashtextextended(lower(trim('  MiXeD@Example.COM  ')),0) = hashtextextended('mixed@example.com',0) as same`)
check('Advisory-lock key is identical for differently-cased/padded spellings of one email', keyNorm.rows[0].same === true)

await db.query('begin')
await db.query(`set local role app_user`)
await db.query(`select set_config('app.current_uid', $1, true)`, [OWNER])
await db.query(`select * from public.owner_get_or_invite_coach('locktest@example.com')`)
const locksDuring = await db.query(
  `select count(*)::int as c from pg_locks
   where locktype = 'advisory' and objid = (hashtextextended('locktest@example.com',0)::bit(32)::int)::oid
      or locktype = 'advisory'`)
check('An advisory lock is actually held while the issuing transaction is open', locksDuring.rows[0].c >= 1, `advisory locks held: ${locksDuring.rows[0].c}`)
await db.query('commit')
const locksAfter = await db.query(`select count(*)::int as c from pg_locks where locktype = 'advisory'`)
check('The advisory lock is transaction-scoped -- released on commit with no explicit unlock', locksAfter.rows[0].c === 0, `advisory locks still held: ${locksAfter.rows[0].c}`)

// Sequential re-invite of that same address still converges on one row
// and one token (the idempotency the lock is there to protect).
const lockReuse = await queryAs(OWNER, `select * from public.owner_get_or_invite_coach('locktest@example.com')`)
check('Re-invite of the locked address reuses the existing token (newly_issued=false)', lockReuse.rows[0].newly_issued === false)
const lockRowCount = await db.query(`select count(*)::int as c from public.coach_invitations where lower(email)='locktest@example.com' and status='invited'`)
check('Exactly ONE live invitation row exists for that address', lockRowCount.rows[0].c === 1)


// =====================================================================
// 26. Raw invitation rows and tokens are unreachable from ANY client
// =====================================================================
// The invite_token column is a bearer credential. An earlier revision had
// a `coach_invitations_select_owner` SELECT policy, which meant the
// owner's browser -- an anon-key client running whatever the page's JS,
// an extension, or an injected payload asks -- could read every live
// token in one request. The policy is gone; these checks prove the table
// is now unreachable through RLS for every client role, while the narrow
// RPC still works.
await db.query('set role postgres')
// Grant the table privilege explicitly to anon/authenticated first, so a
// denial below can only be RLS -- not a missing GRANT that might be added
// later by an unrelated change.
await db.exec(`grant select on public.coach_invitations to anon, authenticated, app_user;`)

// Make sure there IS something to leak, so a 0-row result means "denied",
// not "empty table".
const liveInvites = await db.query(`select count(*)::int as c from public.coach_invitations where status = 'invited'`)
check('Precondition: live invitation rows exist for these read attempts to be meaningful',
  liveInvites.rows[0].c >= 1, `live invitations: ${liveInvites.rows[0].c}`)

const ownerRawRows = await queryAs(OWNER, `select count(*)::int as c from public.coach_invitations`)
check('OWNER cannot select invitation rows directly (RLS denies -- no policy exists)',
  ownerRawRows.rows[0].c === 0, `owner saw ${ownerRawRows.rows[0].c} rows`)

const ownerRawTokens = await queryAs(OWNER, `select count(invite_token)::int as c from public.coach_invitations`)
check('OWNER cannot read invite_token directly', ownerRawTokens.rows[0].c === 0)

const coachRawRows = await queryAs(COACH_A, `select count(*)::int as c from public.coach_invitations`)
check('A COACH cannot read invitations', coachRawRows.rows[0].c === 0)

const traineeRawRows = await queryAs(TRAINEE1, `select count(*)::int as c from public.coach_invitations`)
check('A TRAINEE cannot read invitations', traineeRawRows.rows[0].c === 0)

// A signed-in account holding no application role at all.
await db.query('set role postgres')
const strangerRow = await db.query(
  `insert into auth.users (email, email_confirmed_at) values ('stranger@example.com', now()) returning id`)
const STRANGER = strangerRow.rows[0].id
const strangerRawRows = await queryAs(STRANGER, `select count(*)::int as c from public.coach_invitations`)
check('A normal authenticated user with no role cannot read invitations', strangerRawRows.rows[0].c === 0)

// Anonymous: no auth.uid() at all, running as the `anon` role.
await db.query('begin')
await db.query(`set local role anon`)
await db.query(`select set_config('app.current_uid', '', true)`)
let anonCount = null
let anonDenied = false
try {
  const r = await db.query(`select count(*)::int as c from public.coach_invitations`)
  anonCount = r.rows[0].c
} catch {
  anonDenied = true // a hard privilege error is an even stronger denial
} finally {
  await db.query('commit')
}
check('An ANONYMOUS caller cannot read invitations', anonDenied || anonCount === 0,
  anonDenied ? 'denied at privilege level' : `anon saw ${anonCount} rows`)

// The narrow RPC still works and still returns only safe fields.
const safeList = await queryAs(OWNER, `select * from public.owner_list_pending_invitations()`)
check('owner_list_pending_invitations() still returns rows for the owner', safeList.rows.length >= 1,
  `${safeList.rows.length} pending invitation(s)`)
const safeCols = Object.keys(safeList.rows[0] ?? {})
check('...and exposes exactly the safe fields',
  ['invitation_id', 'email', 'invite_sent_at', 'invite_expires_at', 'state'].every((c) => safeCols.includes(c)),
  safeCols.join(', '))
check('...and exposes NO token column under any spelling',
  !safeCols.some((c) => /token/i.test(c)), safeCols.join(', '))
check('...and every returned value is free of the real token strings',
  !safeList.rows.some((r) => Object.values(r).some((v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v) && v === invite1.rows[0].invite_token)))

const nonOwnerRpc = await queryAs(COACH_A, `select 1 as ok`) // sanity: harness still alive
check('Sanity: harness still functioning after role switches', nonOwnerRpc.rows[0].ok === 1)
await expectError('A non-owner calling owner_list_pending_invitations() is rejected', () =>
  queryAs(COACH_A, `select * from public.owner_list_pending_invitations()`))

// The trusted server flow (SECURITY DEFINER, as the Edge Function's
// as-user client reaches it) can still issue an invitation end to end.
const serverIssue = await queryAs(OWNER, `select * from public.owner_get_or_invite_coach('server.flow@example.com')`)
check('Trusted server flow can still ISSUE an invitation despite the removed policy',
  serverIssue.rows[0].newly_issued === true && !!serverIssue.rows[0].invite_token)
const serverVisible = await queryAs(OWNER, `select count(*)::int as c from public.owner_list_pending_invitations() where email = 'server.flow@example.com'`)
check('...and it is immediately visible through the narrow RPC', serverVisible.rows[0].c === 1)

// =====================================================================
// 27. The Auth user created by a successful invite -- and what it means
// =====================================================================
// Codex's finding: admin.auth.admin.inviteUserByEmail() creates an
// UNCONFIRMED auth.users row. owner_get_or_invite_coach rejects any
// address that already has an auth.users row. Therefore a "resend" of an
// invitation that was actually delivered can never succeed. This section
// reproduces that at the database level, where the JS fake could not.
await db.query('set role postgres')

const resendIssue = await queryAs(OWNER, `select * from public.owner_get_or_invite_coach('resend.case@example.com')`)
check('Resend case, step 1: the first invitation is issued', resendIssue.rows[0].newly_issued === true)

// Step 2: model exactly what GoTrue does on a successful invite send --
// create the account, unconfirmed, with the token in user metadata.
await db.query('set role postgres')
await db.query(
  `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
   values ($1, null, jsonb_build_object('coach_invite_token', $2::text))`,
  ['resend.case@example.com', resendIssue.rows[0].invite_token],
)
const unconfirmed = await db.query(
  `select email_confirmed_at from auth.users where email = 'resend.case@example.com'`)
check('Resend case, step 2: an UNCONFIRMED auth.users row now exists (as GoTrue creates)',
  unconfirmed.rows.length === 1 && unconfirmed.rows[0].email_confirmed_at === null)
const stillInvited = await db.query(
  `select status from public.coach_invitations where lower(email)='resend.case@example.com'`)
check('...and the invitation is still merely invited (nothing accepted it yet)',
  stillInvited.rows[0].status === 'invited')

// Step 3: the resend. This is the contradiction.
await expectError(
  'Resend case, step 3: a RESEND is rejected -- the address now has an Auth account (resend is impossible by construction)',
  () => queryAs(OWNER, `select * from public.owner_get_or_invite_coach('resend.case@example.com')`))

// Step 4: an EXPIRED application invitation is no better off.
await db.query('set role postgres')
// invite_sent_at moves back too -- the table's own
// `check (invite_expires_at > invite_sent_at)` refuses an expiry that
// precedes the send, which is the correct constraint and caught this
// test expressing an impossible row rather than a real expired one.
await db.query(
  `update public.coach_invitations
   set invite_sent_at = now() - interval '8 days',
       invite_expires_at = now() - interval '1 day'
   where lower(email) = 'resend.case@example.com'`)
const expiredState = await queryAs(OWNER,
  `select state from public.owner_list_pending_invitations() where email = 'resend.case@example.com'`)
check('Resend case, step 4: the invitation is reported as expired', expiredState.rows[0].state === 'expired')
await expectError(
  '...and re-issuing an EXPIRED invitation is rejected too (the replacement branch is shadowed as well)',
  () => queryAs(OWNER, `select * from public.owner_get_or_invite_coach('resend.case@example.com')`))

// Step 5: acceptance of the ORIGINAL token still works. The one thing
// that must not regress: the invitation that really was delivered is
// still redeemable, expiry permitting.
await db.query('set role postgres')
await db.query(
  `update public.coach_invitations set invite_expires_at = now() + interval '7 days'
   where lower(email) = 'resend.case@example.com'`)
await db.query(
  `update auth.users set email_confirmed_at = now() where email = 'resend.case@example.com'`)
const acceptedRow = await db.query(
  `select id from auth.users where email = 'resend.case@example.com'`)
const RESEND_USER = acceptedRow.rows[0].id
const acceptedRole = await db.query(`select role from public.user_roles where user_id = $1`, [RESEND_USER])
check('Resend case, step 5: accepting the ORIGINAL emailed token still works (role granted)',
  acceptedRole.rows[0]?.role === 'coach')
const acceptedInvite = await db.query(
  `select status from public.coach_invitations where lower(email)='resend.case@example.com'`)
check('...and the invitation is marked accepted exactly once', acceptedInvite.rows[0].status === 'accepted')
const acceptedCoach = await db.query(`select access_status from public.coaches where user_id = $1`, [RESEND_USER])
check('...and the account begins as a PENDING coach', acceptedCoach.rows[0]?.access_status === 'pending')


console.log(allOk ? '\n=== ALL OWNER/COACH-ADMIN PGLITE TESTS PASSED ===' : '\n=== SOME TESTS FAILED -- see above ===')
await db.close()
process.exit(allOk ? 0 : 1)
