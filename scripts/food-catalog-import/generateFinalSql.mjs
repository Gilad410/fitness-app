// Generates the final import SQL from the Hebrew-reviewed candidate files.
// Same column pattern as the established
// 050_food_reference_catalog_openfoodfacts_israel_batch1.sql. Preparation
// only -- this file is written to disk for review, never executed here.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

const preserved = rd('out/HEBREW_FINAL_PRESERVED.json')
const sourceProvided = rd('out/HEBREW_FINAL_SOURCE_PROVIDED.json')
const bucket2 = rd('out/bucket2_remaining.json')
const bucketArr = Array.isArray(bucket2) ? bucket2 : Object.values(bucket2)
const bucketByBarcode = new Map(bucketArr.map(x => [x.barcode, x]))
const the24Worklist = rd('ledger/the24_worklist.json')
const the24ByBarcode = new Map(the24Worklist.map(x => [x.barcode, x]))
const liveNames = rd('out/live_catalog_names_504.json').names

// These records contain enough source information to distinguish them from
// an existing catalog name without changing their nutritional values.
const displayNameOverrides = {
  '7290000497112': 'ברמן - לחם מלא',
  '7290108501490': 'אירו - מוצרלה',
  '7290000120874': "הלמנ'ס - מיונז לייט",
}

// These records collide with an existing generic catalog name and do not
// contain enough identity information to create a trustworthy distinct name.
const importExclusions = new Map([
  ['7290018023914', 'שם כללי שכבר קיים בקטלוג; אין מותג או שם מוצר בתמונה'],
  ['7290008425193', 'שם כללי שכבר קיים בקטלוג; אין מותג או סוג זיתים במקור'],
  ['7290014791565', 'שם כללי שכבר קיים בקטלוג; אין זן או מותג במקור'],
])

const today = new Date().toISOString().slice(0, 10)

function sqlStr(v) {
  if (v === null || v === undefined) return 'null'
  return `'${String(v).replace(/'/g, "''")}'`
}
function sqlNum(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'null'
  return String(v)
}

const rows = []

// --- Preserved Hebrew records: verification_status = 'verified' ---
for (const r of preserved) {
  if (importExclusions.has(r.barcode)) continue
  const item = bucketByBarcode.get(r.barcode) || the24ByBarcode.get(r.barcode)
  const displayName = displayNameOverrides[r.barcode] || r.hebrewName
  rows.push({
    name: displayName, calories: r.storedCalories, protein: r.storedProtein,
    source_name: 'Independent verification', source_id: r.barcode, source_url: null, source_checked_at: today,
    category: null, source: 'independent_verification', external_id: r.barcode, barcode: r.barcode,
    name_he: displayName,
    name_en: /[A-Za-z]/.test(r.name) && !/[֐-׿]/.test(r.name) ? r.name : null,
    brand: item ? item.brand : null, preparation_state: 'as_sold', verification_status: 'verified',
  })
}
// --- Source-provided Hebrew records: verification_status = 'unverified' ---
for (const c of sourceProvided) {
  if (importExclusions.has(c.barcode)) continue
  const displayName = displayNameOverrides[c.barcode] || c.hebrewName
  rows.push({
    name: displayName, calories: c.calories, protein: c.protein,
    source_name: 'Open Food Facts', source_id: c.barcode, source_url: c.sourceUrl, source_checked_at: today,
    category: c.category, source: 'openfoodfacts', external_id: c.barcode, barcode: c.barcode,
    name_he: displayName, name_en: c.nameEn || (/[A-Za-z]/.test(c.name) ? c.name : null), brand: c.brand, preparation_state: 'as_sold',
    verification_status: 'unverified',
  })
}

const normalizedNames = rows.map((r) => r.name.trim().toLocaleLowerCase('he'))
const duplicateNewNames = normalizedNames.filter((name, index) => normalizedNames.indexOf(name) !== index)
const normalizedLiveNames = new Set(liveNames.map((name) => name.trim().toLocaleLowerCase('he')))
const liveNameCollisions = rows.filter((r) => normalizedLiveNames.has(r.name.trim().toLocaleLowerCase('he')))
const latinDisplayNames = rows.filter((r) => /[A-Za-z]/.test(r.name))
if (duplicateNewNames.length || liveNameCollisions.length || latinDisplayNames.length) {
  throw new Error(`Unsafe final names: ${duplicateNewNames.length} duplicate new names, ${liveNameCollisions.length} collisions with the existing 504, ${latinDisplayNames.length} Latin display names`)
}

const columns = '(name, calories_per_100g, protein_per_100g, source_name, source_id, source_url, source_checked_at, category, source, external_id, barcode, name_he, name_en, brand, preparation_state, verification_status)'
const valueLines = rows.map(r => `  (${sqlStr(r.name)}, ${sqlNum(r.calories)}, ${sqlNum(r.protein)}, ${sqlStr(r.source_name)}, ${sqlStr(r.source_id)}, ${sqlStr(r.source_url)}, ${sqlStr(r.source_checked_at)}, ${sqlStr(r.category)}, ${sqlStr(r.source)}, ${sqlStr(r.external_id)}, ${sqlStr(r.barcode)}, ${sqlStr(r.name_he)}, ${sqlStr(r.name_en)}, ${sqlStr(r.brand)}, ${sqlStr(r.preparation_state)}, ${sqlStr(r.verification_status)})`)

const sql = `-- ============================================================
-- PREPARED FOR REVIEW ONLY -- DO NOT RUN AGAINST PRODUCTION YET.
-- Generated ${today}. Source: the final Hebrew-reviewed preserved and
-- source-provided candidate files
-- (Open Food Facts, verification_status='unverified', import-integrity
-- checked via the actual application pipeline --
-- src/features/nutrition/lib/openFoodFactsCandidateMapping.js +
-- foodCatalogImportValidation.js -- not a reimplementation).
--
-- Excludes all previously documented audit/naming exceptions plus three
-- generic-name records that collide with the existing 504-row catalog and
-- cannot be disambiguated responsibly from their source data.
--
-- Row count: ${rows.length} (${rows.filter((r) => r.verification_status === 'verified').length} verified + ${rows.filter((r) => r.verification_status === 'unverified').length} unverified/source-provided).
--
-- Run manually, once, in the Supabase Dashboard -> SQL Editor, after
-- 049_food_reference_catalog_multi_source_infrastructure.sql (confirmed
-- applied). Does not touch, update, or delete any existing row.
--
-- ON CONFLICT (barcode) DO NOTHING makes a re-run of this exact file
-- safe (adds zero rows, changes nothing) -- verified against a real
-- Postgres engine (PGlite), see schema-test/testFinalImport.mjs. This
-- does NOT silently hide a problem on the FIRST run: that test verifies
-- the actual inserted-row count equals the expected ${rows.length} exactly on
-- the first application, so an unexpected conflict there would be
-- caught and reported, not masked by this clause.
-- ============================================================

begin;

insert into public.food_reference_catalog
  ${columns}
values
${valueLines.join(',\n')}
on conflict (barcode) where barcode is not null do nothing;

commit;
`

writeFileSync(path.join(here, '../../supabase/sql/055_food_reference_catalog_openfoodfacts_source_import.sql'), sql)
writeFileSync(path.join(here, 'out/FINAL_SQL_ROWS.json'), JSON.stringify(rows, null, 2))
console.log('Wrote SQL file with', rows.length, 'rows to supabase/sql/055_food_reference_catalog_openfoodfacts_source_import.sql')
console.log('  verified:', rows.filter((r) => r.verification_status === 'verified').length, ' unverified/source-provided:', rows.filter((r) => r.verification_status === 'unverified').length)
console.log('  excluded at import for unresolved collision with existing catalog:', importExclusions.size)
