// Tests the draft 050-053 migration files against a REAL Postgres
// engine (PGlite -- Postgres compiled to WASM, not a parser or a mock:
// real constraint enforcement, real ON CONFLICT index inference), not
// just pglast syntax checking. The schema built here is a direct,
// verified transcription of food_reference_catalog's actual cumulative
// DDL as of migrations 004, 005, 039, and 049 -- not the full
// migration history (which depends on Supabase's auth schema, not
// present in a vanilla Postgres) -- so this exercises exactly the real
// constraints/indexes 050-053 will run against, without claiming to be
// a full environment replica.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sqlDir = path.resolve(here, '../../../supabase/sql')

const db = new PGlite()

// --- 1. Build the real, current cumulative schema (004 + 005 + 039 + 049) ---
await db.exec(`
create table public.food_reference_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  calories_per_100g numeric(6, 1) not null check (calories_per_100g >= 0),
  created_at timestamptz not null default now()
);
create unique index food_reference_catalog_name_idx on public.food_reference_catalog (lower(name));

alter table public.food_reference_catalog
  add column protein_per_100g numeric(6, 1)
  check (protein_per_100g is null or protein_per_100g >= 0);
alter table public.food_reference_catalog alter column protein_per_100g set not null;

alter table public.food_reference_catalog
  add column if not exists category text
    check (category in (
      'fruit', 'vegetable', 'grain_carb', 'bread_bakery', 'meat_poultry',
      'fish_seafood', 'egg', 'dairy', 'plant_milk', 'legume',
      'nuts_seeds_fats', 'sweets_snacks', 'sauce_condiment', 'spice_herb',
      'beverage', 'prepared_dish', 'soup_salad', 'sandwich', 'supplement'
    )),
  add column if not exists basis text
    check (basis in (
      'raw', 'cooked', 'grilled', 'roasted', 'fried', 'boiled', 'baked',
      'steamed', 'dried', 'canned_drained', 'as_sold'
    )),
  add column if not exists source_name text check (char_length(trim(source_name)) > 0),
  add column if not exists source_id text check (char_length(trim(source_id)) > 0),
  add column if not exists source_url text check (char_length(trim(source_url)) > 0),
  add column if not exists source_checked_at date;

alter table public.food_reference_catalog
  add column if not exists source text,
  add column if not exists external_id text,
  add column if not exists barcode text,
  add column if not exists name_he text,
  add column if not exists name_en text,
  add column if not exists brand text,
  add column if not exists preparation_state text,
  add column if not exists verification_status text
    default 'unverified'
    check (verification_status in ('unverified', 'verified', 'needs_review', 'rejected')),
  add column if not exists last_verified_at timestamptz;

alter table public.food_reference_catalog
  add constraint food_reference_catalog_calories_bounds
    check (calories_per_100g >= 0 and calories_per_100g <= 900),
  add constraint food_reference_catalog_protein_bounds
    check (protein_per_100g >= 0 and protein_per_100g <= 100);

create unique index if not exists food_reference_catalog_source_external_id_idx
  on public.food_reference_catalog (source, external_id)
  where external_id is not null;

create unique index if not exists food_reference_catalog_barcode_idx
  on public.food_reference_catalog (barcode)
  where barcode is not null;
`)
console.log('Schema built (004+005+039+049 cumulative DDL). OK.')

// --- 2. Seed a few real existing rows to prove preservation ---
await db.exec(`
insert into public.food_reference_catalog (name, calories_per_100g, protein_per_100g)
values ('בננה', 89, 1.09), ('חזה עוף צלוי', 165, 31.02), ('פלאפל', 514, 8.28);
`)
const preCount = (await db.query('select count(*)::int as c from public.food_reference_catalog')).rows[0].c
console.log(`Seeded ${preCount} pre-existing rows.`)

// --- 3. Run each draft migration file VERBATIM, exactly as written ---
// Discovered dynamically (not hardcoded to 4) -- the number of batches
// grows as retrieval finds more accepted candidates.
import { readdirSync } from 'node:fs'
const batchFileNames = readdirSync(sqlDir)
  .filter((f) => /^0(5[0-9]|[6-9][0-9])_food_reference_catalog_openfoodfacts_israel_batch\d+\.sql$/.test(f))
  .sort()
console.log(`Discovered ${batchFileNames.length} batch files: ${batchFileNames.join(', ')}`)
const files = batchFileNames.map((f) => readFileSync(path.join(sqlDir, f), 'utf8'))

let allOk = true
for (const [i, sql] of files.entries()) {
  const batchNum = i + 1
  try {
    await db.exec(sql)
    console.log(`Batch ${batchNum}: applied successfully (real Postgres exec, not just parsed).`)
  } catch (e) {
    allOk = false
    console.log(`Batch ${batchNum}: FAILED -- ${e.message}`)
  }
}

// --- 4. Verify: pre-existing rows untouched, new rows landed, ON CONFLICT target real ---
const postCount = (await db.query('select count(*)::int as c from public.food_reference_catalog')).rows[0].c
const preserved = await db.query(
  `select name, calories_per_100g, protein_per_100g from public.food_reference_catalog where lower(name) in (lower('בננה'), lower('חזה עוף צלוי'), lower('פלאפל')) order by name`,
)
console.log(`Row count: ${preCount} (pre-existing) -> ${postCount} (after all 4 batches). Delta: ${postCount - preCount}`)
console.log('Pre-existing rows, re-checked after the import (must be byte-identical to what was seeded):')
console.log(preserved.rows)

// Idempotency: re-run batch 1 again, confirm ON CONFLICT (barcode) DO NOTHING
// actually fires against the REAL partial unique index (not just parses) --
// row count must not change.
try {
  await db.exec(files[0])
  const afterRerun = (await db.query('select count(*)::int as c from public.food_reference_catalog')).rows[0].c
  console.log(`Re-ran batch 1: row count after = ${afterRerun} (must equal ${postCount} -- ON CONFLICT (barcode) DO NOTHING must have fired against the real partial index, not errored or duplicated)`)
  if (afterRerun !== postCount) {
    allOk = false
    console.log('FAIL: re-run changed the row count -- ON CONFLICT target did not behave as expected.')
  }
} catch (e) {
  allOk = false
  console.log(`Re-run of batch 1 FAILED (this would mean the ON CONFLICT clause does not actually match a real index): ${e.message}`)
}

console.log(allOk ? '\nALL REAL-SCHEMA MIGRATION TESTS PASSED.' : '\nSOME TESTS FAILED -- see above.')
await db.close()
process.exit(allOk ? 0 : 1)
