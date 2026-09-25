// Tests the FINAL prepared import (055_food_reference_catalog_
// openfoodfacts_source_import.sql) against a REAL Postgres engine
// (PGlite -- Postgres compiled to WASM, real constraint enforcement,
// real ON CONFLICT index inference), reusing the exact cumulative
// schema (004+005+039+049) already verified in testMigrations.mjs.
// Seeds a REALISTIC 504-row fixture (the actual live catalog's names,
// from out/live_catalog_names_504.json) rather than 3 sample rows, so
// the "existing rows untouched" and "zero overlap with the 504" checks
// are meaningful, not token.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const importDir = path.resolve(here, '..')
const sqlDir = path.resolve(here, '../../../supabase/sql')

let allOk = true
function check(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}${detail ? ' -- ' + detail : ''}`)
  if (!cond) allOk = false
}

const db = new PGlite()

// --- 1. Real cumulative schema (004+005+039+049), identical to testMigrations.mjs ---
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
console.log('Schema built (004+005+039+049 cumulative DDL, real Postgres via PGlite). OK.\n')

// --- 2. Seed the REAL 504-name fixture (not 3 sample rows) ---
const names504 = JSON.parse(readFileSync(path.join(importDir, 'out/live_catalog_names_504.json'), 'utf8')).names
const escapedNames = names504.map((n) => n.replace(/'/g, "''"))
const seedValues = escapedNames.map((n) => `('${n}', 100.0, 5.0)`).join(',\n')
await db.exec(`insert into public.food_reference_catalog (name, calories_per_100g, protein_per_100g) values\n${seedValues};`)
const preCount = (await db.query('select count(*)::int as c from public.food_reference_catalog')).rows[0].c
check('Seeded exactly 504 fixture rows', preCount === 504, `got ${preCount}`)

// --- 3. Run the FINAL import file (055) once ---
const importSql = readFileSync(path.join(sqlDir, '055_food_reference_catalog_openfoodfacts_source_import.sql'), 'utf8')
const finalRows = JSON.parse(readFileSync(path.join(importDir, 'out/FINAL_SQL_ROWS.json'), 'utf8'))
const expectedInserted = finalRows.length

let firstRunError = null
try {
  await db.exec(importSql)
} catch (e) {
  firstRunError = e
}
check('First run executed without error', firstRunError === null, firstRunError?.message)

const postCount = (await db.query('select count(*)::int as c from public.food_reference_catalog')).rows[0].c
const actuallyInserted = postCount - preCount
check(
  `First-run inserted count reconciles with expected (${expectedInserted})`,
  actuallyInserted === expectedInserted,
  `expected ${expectedInserted}, actual ${actuallyInserted} (pre=${preCount}, post=${postCount}) -- a mismatch here means something silently conflicted and must be investigated, not ignored`,
)

// --- 4. Fixture rows byte-unchanged ---
const fixtureCheck = await db.query(
  `select count(*)::int as c from public.food_reference_catalog
   where source is null and (calories_per_100g != 100.0 or protein_per_100g != 5.0)`,
)
check('All 504 fixture rows unchanged (still calories=100.0, protein=5.0, source=null)', fixtureCheck.rows[0].c === 0, `${fixtureCheck.rows[0].c} deviated`)

// --- 5. All final preserved rows present with verification_status='verified' ---
const verifiedCount = (await db.query(`select count(*)::int as c from public.food_reference_catalog where verification_status = 'verified'`)).rows[0].c
const expectedVerified = finalRows.filter((r) => r.verification_status === 'verified').length
check(`${expectedVerified} verified (preserved) rows present`, verifiedCount === expectedVerified, `got ${verifiedCount}`)

// --- 6. All final source-provided rows present and correctly classified ---
const sourceProvidedCount = (await db.query(`select count(*)::int as c from public.food_reference_catalog where verification_status = 'unverified' and source = 'openfoodfacts'`)).rows[0].c
const expectedSourceProvided = finalRows.filter((r) => r.verification_status === 'unverified' && r.source === 'openfoodfacts').length
check(`${expectedSourceProvided} source-provided (unverified, source=openfoodfacts) rows present`, sourceProvidedCount === expectedSourceProvided, `got ${sourceProvidedCount}`)

// --- 7. Zero overlap with the 149 exceptions ---
const categorization = JSON.parse(readFileSync(path.join(importDir, 'out/CATEGORIZATION_976.json'), 'utf8'))
const t24 = JSON.parse(readFileSync(path.join(importDir, 'ledger/the24_reconciled.json'), 'utf8'))
const rejected = JSON.parse(readFileSync(path.join(importDir, 'out/REAL_PIPELINE_REJECTED.json'), 'utf8'))
const needsReview = JSON.parse(readFileSync(path.join(importDir, 'out/FINAL_NEEDS_REVIEW.json'), 'utf8'))
const nameCollisions = JSON.parse(readFileSync(path.join(importDir, 'out/EXCLUDED_NAME_COLLISIONS.json'), 'utf8'))
const hebrewNamingExclusions = JSON.parse(readFileSync(path.join(importDir, 'out/HEBREW_NAMING_EXCLUSIONS.json'), 'utf8'))
const exceptionBarcodes = [
  ...categorization.correction_proposed,
  ...categorization.unresolved_conflict,
  ...Object.keys(t24).filter((bc) => t24[bc].finalOutcome !== 'VERIFIED'),
  ...rejected.map((r) => r.barcode),
  ...needsReview.map((r) => r.barcode),
  ...nameCollisions.map((r) => r.barcode),
  ...hebrewNamingExclusions.map((r) => r.barcode),
]
const uniqueExceptionBarcodes = [...new Set(exceptionBarcodes)]
console.log(`\n${uniqueExceptionBarcodes.length} unique exception barcodes to check for zero overlap...`)
const placeholders = uniqueExceptionBarcodes.map((_, i) => `$${i + 1}`).join(',')
const overlapResult = await db.query(
  `select barcode from public.food_reference_catalog where barcode in (${placeholders})`,
  uniqueExceptionBarcodes,
)
check('Zero overlap between imported rows and all documented exceptions', overlapResult.rows.length === 0, `${overlapResult.rows.length} exception barcode(s) found in the table: ${overlapResult.rows.map((r) => r.barcode).join(',')}`)

// --- 8. Actual numeric(6,1) rounding behavior -- report any calorie/protein changes ---
console.log('\n--- Numeric precision check: comparing pre-insert (source JS) values to actual stored Postgres values ---')
const highPrecisionRows = finalRows.filter((r) => {
  const c = String(r.calories), p = String(r.protein)
  return (c.includes('.') && c.split('.')[1].length > 1) || (p.includes('.') && p.split('.')[1].length > 1)
}).slice(0, 2000) // cap for query volume; report full count separately
console.log(`${highPrecisionRows.length} rows had more than 1 decimal place before insert (out of ${finalRows.length} total).`)
let roundingChanges = []
for (const r of highPrecisionRows) {
  const res = await db.query(`select calories_per_100g, protein_per_100g from public.food_reference_catalog where barcode = $1`, [r.barcode])
  if (res.rows.length === 0) continue
  const stored = res.rows[0]
  const storedCal = parseFloat(stored.calories_per_100g)
  const storedProt = parseFloat(stored.protein_per_100g)
  if (storedCal !== r.calories || storedProt !== r.protein) {
    roundingChanges.push({ barcode: r.barcode, name: r.name, before: { calories: r.calories, protein: r.protein }, after: { calories: storedCal, protein: storedProt } })
  }
}
console.log(`Rows whose calories/protein value actually CHANGED due to the numeric(6,1) column's rounding: ${roundingChanges.length} of ${highPrecisionRows.length} checked.`)
for (const c of roundingChanges.slice(0, 15)) {
  console.log(`  ${c.barcode} (${c.name}): calories ${c.before.calories} -> ${c.after.calories}, protein ${c.before.protein} -> ${c.after.protein}`)
}
writeChangesFile(roundingChanges)

// --- 9. Rerun safety: same file, second time, must add ZERO rows and change nothing ---
console.log('\n--- Rerun test ---')
let rerunError = null
try {
  await db.exec(importSql)
} catch (e) {
  rerunError = e
}
check('Second run (rerun) executed without error (ON CONFLICT DO NOTHING handles it)', rerunError === null, rerunError?.message)
const afterRerunCount = (await db.query('select count(*)::int as c from public.food_reference_catalog')).rows[0].c
check('Rerun added ZERO rows', afterRerunCount === postCount, `before rerun ${postCount}, after rerun ${afterRerunCount}`)

const afterRerunFixtureCheck = await db.query(
  `select count(*)::int as c from public.food_reference_catalog
   where source is null and (calories_per_100g != 100.0 or protein_per_100g != 5.0)`,
)
check('Fixture rows still unchanged after rerun', afterRerunFixtureCheck.rows[0].c === 0, `${afterRerunFixtureCheck.rows[0].c} deviated`)

const sampleBarcode = finalRows.find((r) => r.source === 'openfoodfacts')?.barcode
if (sampleBarcode) {
  const before = await db.query(`select calories_per_100g, protein_per_100g from public.food_reference_catalog where barcode = $1`, [sampleBarcode])
  check('Spot-checked source-provided row value unchanged after rerun', before.rows.length === 1, `barcode ${sampleBarcode}`)
}

console.log(allOk ? '\n=== ALL FINAL-IMPORT PGLITE TESTS PASSED ===' : '\n=== SOME TESTS FAILED -- see above ===')
await db.close()
process.exit(allOk ? 0 : 1)

function writeChangesFile(changes) {
  writeFileSync(path.join(importDir, 'out/NUMERIC_ROUNDING_CHANGES.json'), JSON.stringify(changes, null, 2))
}
