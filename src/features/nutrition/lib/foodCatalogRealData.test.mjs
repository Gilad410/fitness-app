// Integration test: reads the ACTUAL supabase/sql/039 + 040 migration
// files (not a fixture) and validates the real, final-state,
// USDA-verified food_reference_catalog data with parseCatalogValues()/
// validateCatalogRows() (foodCatalogValidation.js). This is the permanent
// regression guard for the USDA-verified catalog: it fails the whole test
// suite (and so CI) the moment a future edit to either file introduces a
// duplicate name, a negative/non-numeric nutrition value, an invalid
// category/basis, a missing source_id/source_name, or a restaurant/
// branded/fast-food record slipping back in.
//
// The only I/O in this feature's test suite -- every other *.test.mjs
// here is pure-fixture, per this project's established DI-testing
// convention. That's fine for a test (as opposed to the app runtime
// modules under this same lib/ directory, which never import fs/Supabase):
// this file is never imported by any Vue component or Pinia store.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseCatalogValues, validateCatalogRows } from './foodCatalogValidation.js'
import { checkPlausibility } from './foodCatalogPlausibility.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const sqlDir = path.resolve(here, '../../../../supabase/sql')
const auditsDir = path.resolve(here, '../../../../supabase/audits')

function read(file) {
  return readFileSync(path.join(sqlDir, file), 'utf8')
}

function readAudit(file) {
  return readFileSync(path.join(auditsDir, file), 'utf8')
}

// 039 corrects/backfills the surviving pre-existing rows (calories,
// protein, category, basis, source_* all set directly in its UPDATE ...
// VALUES) after deleting the ones that couldn't be verified; 040 inserts
// the new USDA-verified rows. Together they ARE the final catalog -- no
// need to replay 004-008 first, unlike the earlier (memory-based, now
// superseded) draft of this milestone.
function loadFinalCatalog() {
  const corrected = parseCatalogValues(read('039_food_reference_catalog_metadata.sql'))
  const inserted = parseCatalogValues(read('040_food_reference_catalog_usda_verified_expansion.sql'))
  return { corrected, inserted, all: [...corrected, ...inserted] }
}

// The set of names live in the catalog BEFORE 039/040's USDA
// verification pass -- i.e. what 042/043 actually run against in
// reality, as opposed to loadFinalCatalog()'s narrower "was this name
// already part of the 490-row formally-verified set" question. Built
// from 005 onward, NOT 004 -- 005 TRUNCATEs the table before its own
// insert (see that migration's own header), so 004's original 137
// rows are entirely superseded and are not part of the real catalog at
// any point after 005 runs. 006/007(insert)/008 are purely additive on
// top of 005's reseed (006/007 use ON CONFLICT DO NOTHING, 008 is
// UPDATE-only), so unioning their inserted names in is correct and
// does not double-count or lose anything.
function preTruncateReseedCatalogNames() {
  return [
    ...parseCatalogValues(read('005_food_reference_protein_and_expansion.sql')),
    ...parseCatalogValues(read('006_food_reference_catalog_expansion.sql')),
    ...parseCatalogValues(read('007_food_reference_catalog_corrections.sql')),
  ].map((r) => r.name.toLowerCase())
}

// 041 is a small, targeted post-deployment correction, drafted but NOT
// yet applied to Supabase: 3 rows corrected to freshly live-verified
// USDA values, 2 rows deleted (their only close USDA match named a
// specific commercial brand, not a generic food). Its UPDATE ... VALUES
// tuple shape is (name, calories, protein, source_name, source_id,
// source_url) -- different column order than 039/040 (no
// category/basis in this tuple, since those don't change) -- so this
// reads `.fields` directly by position rather than relying on
// parseCatalogValues' generic .category/.basis/.sourceName/.sourceId,
// which assume THAT other shape.
function load041Corrections() {
  const text = read('041_food_reference_catalog_post_deployment_corrections.sql')
  const updateBlock = text.slice(text.indexOf('update public.food_reference_catalog'), text.indexOf('-- Remove the 2 rows'))
  const corrections = parseCatalogValues(updateBlock).map((row) => ({
    name: row.name,
    calories: row.fields[0],
    protein: row.fields[1],
    sourceName: row.fields[2],
    sourceId: row.fields[3],
    sourceUrl: row.fields[4],
  }))

  const deleteBlock = text.slice(text.indexOf('delete from public.food_reference_catalog'), text.indexOf('-- Guard:'))
  const deletedNames = [...deleteBlock.matchAll(/lower\('((?:[^'\\]|'')*)'\)/g)].map((m) => m[1].replace(/''/g, "'"))

  return { corrections, deletedNames, text }
}

// Applies 041 on top of the 039+040 merge -- the catalog state 041
// proposes, once approved and applied (not yet the live state).
function loadCorrectedCatalog() {
  const { all } = loadFinalCatalog()
  const { corrections, deletedNames } = load041Corrections()
  const deletedSet = new Set(deletedNames.map((n) => n.toLowerCase()))
  const correctionsByName = new Map(corrections.map((c) => [c.name.toLowerCase(), c]))

  const result = []
  for (const row of all) {
    const key = row.name.toLowerCase()
    if (deletedSet.has(key)) continue
    const correction = correctionsByName.get(key)
    if (correction) {
      result.push({
        ...row,
        calories: correction.calories,
        protein: correction.protein,
        sourceName: correction.sourceName,
        sourceId: correction.sourceId,
      })
    } else {
      result.push(row)
    }
  }
  return result
}

test('the real USDA-verified catalog (039 corrections + 040 inserts) has zero validation errors, except the 3 known branded-record rows 041 fixes', () => {
  // As deployed today (039+040, before 041 is applied), this catalog
  // genuinely contains 3 named-commercial-brand rows -- discovered by
  // this same GROCERY_BRAND_PATTERN check during the post-deployment
  // investigation that produced 041. Rather than let this test fail
  // permanently for an already-diagnosed, already-fixed-in-a-drafted-
  // migration issue (which would erode the signal of "all tests
  // passing"), the 3 known errors are named and excluded here; any
  // OTHER, new/unexpected error still fails this test. The corrected
  // (039+040+041) state is separately asserted to have zero of any kind
  // further down.
  const { all } = loadFinalCatalog()
  const { errors } = validateCatalogRows(all)
  const KNOWN_PRE_041_BRAND_ERRORS = [
    /^יוגורט יווני 0%: .*CHOBANI/,
    /^יוגורט אפרסק: .*CHOBANI/,
    /^עוגיות ג'ינג'ר: .*Archway/,
  ]
  const unexpected = errors.filter((e) => !KNOWN_PRE_041_BRAND_ERRORS.some((re) => re.test(e)))
  assert.deepEqual(unexpected, [], `Unexpected catalog validation errors:\n${unexpected.join('\n')}`)
  assert.equal(errors.length, 3, `expected exactly the 3 known pre-041 brand errors, found ${errors.length}:\n${errors.join('\n')}`)
})

test('the real USDA-verified catalog totals exactly 490 products', () => {
  const { all } = loadFinalCatalog()
  assert.equal(all.length, 490, `Expected exactly 490 verified products, found ${all.length}`)
})

test('039 corrects/backfills exactly 221 pre-existing rows, and deletes exactly 113', () => {
  const text = read('039_food_reference_catalog_metadata.sql')
  const { corrected } = loadFinalCatalog()
  assert.equal(corrected.length, 221, `expected 221 corrected rows, found ${corrected.length}`)
  const deleteMatches = [...text.matchAll(/lower\('((?:[^'\\]|'')*)'\)/g)]
  assert.equal(deleteMatches.length, 113, `expected 113 deleted names in the DELETE list, found ${deleteMatches.length}`)
})

test('040 inserts exactly 269 new verified rows', () => {
  const { inserted } = loadFinalCatalog()
  assert.equal(inserted.length, 269, `expected 269 new rows, found ${inserted.length}`)
})

test('every row in the final catalog carries a real source_id (USDA fdcId) and source_name', () => {
  const { all } = loadFinalCatalog()
  assert.ok(all.length > 0, 'expected a non-empty catalog')
  for (const row of all) {
    assert.ok(row.sourceId && /^\d+$/.test(row.sourceId), `${row.name}: source_id must be a real numeric USDA fdcId, got "${row.sourceId}"`)
    assert.ok(row.sourceName && row.sourceName.includes('USDA FoodData Central'), `${row.name}: source_name must cite USDA FoodData Central, got "${row.sourceName}"`)
  }
})

test('every row in the final catalog carries category and basis', () => {
  const { all } = loadFinalCatalog()
  for (const row of all) {
    assert.ok(row.category, `${row.name}: missing category`)
    assert.ok(row.basis, `${row.name}: missing basis`)
  }
})

test('040 rows each carry a live source_url pointing at the matched USDA record', () => {
  const { inserted } = loadFinalCatalog()
  for (const row of inserted) {
    const url = row.fields.find((f) => typeof f === 'string' && f.startsWith('https://fdc.nal.usda.gov/'))
    assert.ok(url, `${row.name}: missing a source_url pointing at fdc.nal.usda.gov`)
    assert.ok(url.includes(row.sourceId), `${row.name}: source_url "${url}" does not reference its own source_id "${row.sourceId}"`)
  }
})

test('no row in the final catalog is a named-restaurant-chain, "restaurant"-qualified, or "Fast foods" record', () => {
  const { all } = loadFinalCatalog()
  const { errors } = validateCatalogRows(all)
  const restaurantErrors = errors.filter((e) => /restaurant|Fast foods/i.test(e))
  assert.deepEqual(restaurantErrors, [])
})

test('039\'s UPDATE ... SET clause never references a v.<column> missing from the "as v(...)" alias', () => {
  // Regression test for a real production failure: the SET clause once
  // referenced `v.source_url`, but the `from (values ...) as v(...)`
  // alias list didn't include source_url as one of its columns --
  // Postgres error 42703 ("column v.source_url does not exist"), caught
  // only when actually run against Supabase. This statically re-derives
  // both sides from the SQL text itself and fails loudly if they ever
  // drift apart again, without needing a live database to catch it.
  const text = read('039_food_reference_catalog_metadata.sql')
  const updateBlock = text.slice(text.indexOf('update public.food_reference_catalog'), text.indexOf('where lower(f.name)'))
  const setColumns = [...updateBlock.matchAll(/^\s*(\w+)\s*=\s*v\.(\w+)/gm)].map((m) => m[2])
  assert.ok(setColumns.length > 0, 'expected to find at least one v.<column> reference in the SET clause')

  const aliasMatch = text.match(/\)\s*as\s*v\(([^)]+)\)/)
  assert.ok(aliasMatch, 'expected to find the "as v(...)" alias column list')
  const aliasColumns = aliasMatch[1].split(',').map((c) => c.trim())

  const missing = setColumns.filter((c) => !aliasColumns.includes(c))
  assert.deepEqual(missing, [], `SET clause references v.<column> not present in the "as v(...)" alias: ${missing.join(', ')}`)
})

test('039 opens with begin; and closes with commit;, wrapping DELETE/ALTER/UPDATE/report in order (atomic -- a mid-script failure leaves nothing partially applied)', () => {
  const text = read('039_food_reference_catalog_metadata.sql')
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.match(withoutComments.trimStart(), /^\s*begin;/, '039 must open with an explicit begin; (no statement before it)')
  assert.match(withoutComments.trimEnd(), /commit;\s*$/, '039 must close with an explicit commit;')
  const beginIndex = withoutComments.indexOf('begin;')
  const deleteIndex = withoutComments.indexOf('delete from')
  const alterIndex = withoutComments.indexOf('alter table')
  const updateIndex = withoutComments.indexOf('update public.food_reference_catalog as f')
  const commitIndex = withoutComments.lastIndexOf('commit;')
  assert.ok(
    beginIndex < deleteIndex && deleteIndex < alterIndex && alterIndex < updateIndex && updateIndex < commitIndex,
    'begin; must precede DELETE/ALTER/UPDATE, and commit; must come after all of them',
  )
})

test('039 never references category/basis/source_* before its own begin;/ALTER TABLE creates them', () => {
  // Regression test for a real production failure: an earlier version
  // put a PREFLIGHT `select` referencing these columns BEFORE begin;/the
  // ALTER TABLE that creates them -- ERROR 42703 ("column category does
  // not exist"), the very first statement in the file, caught only by
  // actually running it against Supabase (it aborted before the real
  // transaction ever started). Nothing before begin; may reference any
  // column this migration itself adds.
  const text = read('039_food_reference_catalog_metadata.sql')
  const withoutComments = text.replace(/--.*$/gm, '')
  const beginIndex = withoutComments.indexOf('begin;')
  const beforeBegin = withoutComments.slice(0, beginIndex)
  assert.doesNotMatch(beforeBegin, /\bcategory\b|\bbasis\b|\bsource_name\b|\bsource_id\b|\bsource_url\b|\bsource_checked_at\b/)
})

test('039\'s ALTER TABLE uses "add column if not exists" for every new column (defensive against a prior attempt leaving one behind)', () => {
  const text = read('039_food_reference_catalog_metadata.sql')
  const alterBlock = text.slice(text.indexOf('alter table public.food_reference_catalog'), text.indexOf('update public.food_reference_catalog as f'))
  const addColumnCount = (alterBlock.match(/add column/gi) || []).length
  const addColumnIfNotExistsCount = (alterBlock.match(/add column if not exists/gi) || []).length
  assert.equal(addColumnCount, 6, `expected 6 "add column" clauses, found ${addColumnCount}`)
  assert.equal(addColumnIfNotExistsCount, 6, 'every "add column" clause must use "if not exists"')
})

test('039 never tightens category/basis/source_* to NOT NULL (deliberate -- the live table can hold rows outside this migration\'s own known name lists; tightening deferred to a future migration)', () => {
  const text = read('039_food_reference_catalog_metadata.sql')
  assert.doesNotMatch(text, /set\s+not\s+null/i)
})

test('039\'s safe-by-construction leftover-nulls report is a read-only SELECT positioned AFTER the ALTER TABLE and BEFORE the final commit; (never a raise/exception -- can\'t abort the migration)', () => {
  const text = read('039_food_reference_catalog_metadata.sql')
  const withoutComments = text.replace(/--.*$/gm, '')
  const alterIndex = withoutComments.indexOf('alter table')
  const updateIndex = withoutComments.indexOf('update public.food_reference_catalog as f')
  const commitIndex = withoutComments.lastIndexOf('commit;')
  const reportSelectIndex = withoutComments.indexOf('select id, name, calories_per_100g')
  assert.ok(reportSelectIndex !== -1, 'expected a report select after the corrections')
  assert.ok(
    alterIndex < updateIndex && updateIndex < reportSelectIndex && reportSelectIndex < commitIndex,
    'the report select must come after ALTER TABLE and UPDATE, and before the final commit;',
  )
  assert.doesNotMatch(withoutComments, /raise\s+exception/i, '039 must never raise/abort on finding leftover-null rows -- report only')
})

test('the standalone preflight check file is schema-agnostic (references only columns that predate 039, so it can never fail regardless of whether 039 has run)', () => {
  const text = readAudit('food_reference_catalog_039_preflight_check.sql')
  // Comments are allowed to mention category/basis/source_* in prose
  // (explaining why the query below doesn't) -- only the actual SQL
  // matters for "can this query ever fail with column-does-not-exist".
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.doesNotMatch(withoutComments, /\bcategory\b|\bbasis\b|\bsource_name\b|\bsource_id\b|\bsource_url\b|\bsource_checked_at\b/)
  assert.match(withoutComments, /from public\.food_reference_catalog/)
  assert.match(withoutComments, /information_schema\.columns/)
  assert.doesNotMatch(withoutComments, /\b(delete|insert|update|alter)\b/i, 'the preflight check must be read-only -- no writes')
})

test('the 039 DELETE list and the 039/040 final catalog names never overlap (nothing "corrected" that was also deleted)', () => {
  const text = read('039_food_reference_catalog_metadata.sql')
  const deleteSection = text.slice(text.indexOf('delete from'), text.indexOf('alter table'))
  const deletedNames = new Set(
    [...deleteSection.matchAll(/lower\('((?:[^'\\]|'')*)'\)/g)].map((m) => m[1].replace(/''/g, "'").toLowerCase()),
  )
  const { all } = loadFinalCatalog()
  const overlap = all.filter((row) => deletedNames.has(row.name.toLowerCase()))
  assert.deepEqual(overlap.map((r) => r.name), [])
})

// ---------------------------------------------------------------------
// 041 (post-deployment correction -- drafted, NOT yet applied). Reported
// live: חזה עוף צלוי showed 79 kcal / 16.8g protein, implausible for
// "roasted chicken breast" -- traced to its stored source_url, which
// turned out to be a lean, pre-sliced deli product, not the plain
// roasted breast the name means. A read-only plausibility audit of all
// 490 rows found 4 more of the same error class.
// ---------------------------------------------------------------------

test('041 is transaction-safe: wrapped in begin;/commit; with a guard verifying its own intended effect', () => {
  const text = read('041_food_reference_catalog_post_deployment_corrections.sql')
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.match(withoutComments.trimStart(), /^\s*begin;/, '041 must open with begin;')
  assert.match(withoutComments.trimEnd(), /commit;\s*$/, '041 must close with commit;')
  assert.match(withoutComments, /raise exception/i, '041 must guard its own effect (unlike a bare update/delete with no verification)')
  // Unlike 039's first, failed guard attempt, 041's guard must only
  // reference the 5 rows this migration itself names -- never a
  // whole-table check that could fail because of unrelated data.
  const doBlock = withoutComments.slice(withoutComments.indexOf('do $$'), withoutComments.indexOf('commit;'))
  assert.doesNotMatch(doBlock, /select count\(\*\) into \w+\s*\n\s*from public\.food_reference_catalog;/, 'the guard must not count the whole table')
})

test('041 corrects exactly 4 rows and deletes exactly 2, with no overlap between the two lists', () => {
  const { corrections, deletedNames } = load041Corrections()
  assert.equal(corrections.length, 4, `expected 4 corrected rows, found ${corrections.length}`)
  assert.equal(deletedNames.length, 2, `expected 2 deleted rows, found ${deletedNames.length}`)
  const correctedNames = new Set(corrections.map((c) => c.name))
  for (const deleted of deletedNames) {
    assert.ok(!correctedNames.has(deleted), `"${deleted}" is in both the correction and deletion lists`)
  }
})

test('041\'s 4 corrections carry the exact live-verified USDA calories, protein, source_id and source_url', () => {
  const { corrections } = load041Corrections()
  const byName = new Map(corrections.map((c) => [c.name, c]))

  const expected = {
    'חזה עוף צלוי': { calories: 165, protein: 31.02, sourceId: '171477', urlFragment: '171477' },
    'מוצרלה': { calories: 299, protein: 22.17, sourceId: '170845', urlFragment: '170845' },
    'חמאת בוטנים': { calories: 598, protein: 22.2, sourceId: '2707537', urlFragment: '2707537' },
    'יוגורט יווני 0%': { calories: 61, protein: 10, sourceId: '330137', urlFragment: '330137' },
  }

  for (const [name, exp] of Object.entries(expected)) {
    const row = byName.get(name)
    assert.ok(row, `expected a correction for "${name}"`)
    assert.equal(row.calories, exp.calories, `${name}: calories`)
    assert.equal(row.protein, exp.protein, `${name}: protein`)
    assert.equal(row.sourceId, exp.sourceId, `${name}: source_id`)
    assert.ok(row.sourceUrl.includes(exp.urlFragment), `${name}: source_url must reference its own source_id`)
    assert.ok(row.sourceName.includes('USDA FoodData Central'), `${name}: source_name must cite USDA FoodData Central`)
  }
})

test('041 deletes exactly the 2 branded-product rows (יוגורט אפרסק, עוגיות ג\'ינג\'ר) and no others', () => {
  const { deletedNames } = load041Corrections()
  assert.deepEqual(new Set(deletedNames), new Set(['יוגורט אפרסק', "עוגיות ג'ינג'ר"]))
})

test('041 does not touch יוגורט טבעי (the ambiguous row left for a human decision, not guessed)', () => {
  const { corrections, deletedNames } = load041Corrections()
  assert.ok(!corrections.some((c) => c.name === 'יוגורט טבעי'), 'יוגורט טבעי must not be in the corrections list')
  assert.ok(!deletedNames.includes('יוגורט טבעי'), 'יוגורט טבעי must not be in the deletions list')
})

test('the corrected catalog (039+040+041 applied) totals 488 products (490 - 2 deleted) with zero validation errors', () => {
  const corrected = loadCorrectedCatalog()
  assert.equal(corrected.length, 488, `expected 488 rows after 041, found ${corrected.length}`)
  const { errors } = validateCatalogRows(corrected)
  assert.deepEqual(errors, [], `Corrected-catalog validation errors:\n${errors.join('\n')}`)
})

test('the corrected catalog preserves category and basis for the 4 corrected rows (same preparation state, only the matched product changed)', () => {
  const corrected = loadCorrectedCatalog()
  const byName = new Map(corrected.map((r) => [r.name, r]))
  assert.deepEqual(
    { category: byName.get('חזה עוף צלוי').category, basis: byName.get('חזה עוף צלוי').basis },
    { category: 'meat_poultry', basis: 'roasted' },
  )
  assert.deepEqual(
    { category: byName.get('מוצרלה').category, basis: byName.get('מוצרלה').basis },
    { category: 'dairy', basis: 'as_sold' },
  )
  assert.deepEqual(
    { category: byName.get('חמאת בוטנים').category, basis: byName.get('חמאת בוטנים').basis },
    { category: 'nuts_seeds_fats', basis: 'as_sold' },
  )
  assert.deepEqual(
    { category: byName.get('יוגורט יווני 0%').category, basis: byName.get('יוגורט יווני 0%').basis },
    { category: 'dairy', basis: 'as_sold' },
  )
})

test('the corrected catalog carries zero named-restaurant-chain or named-grocery-brand records (the exact defect class that prompted 041)', () => {
  const corrected = loadCorrectedCatalog()
  const { errors } = validateCatalogRows(corrected)
  const brandErrors = errors.filter((e) => /restaurant chain|grocery brand|Fast foods/i.test(e))
  assert.deepEqual(brandErrors, [])
})

test('the pre-041 catalog (as currently live) DOES still carry the 3 known branded records -- proves 041 is a real fix, not a no-op', () => {
  const { all } = loadFinalCatalog()
  const { errors } = validateCatalogRows(all)
  const brandErrors = errors.filter((e) => /grocery brand/i.test(e))
  assert.equal(brandErrors.length, 3, 'expected the live (pre-041) catalog to still contain exactly the 3 known branded rows (2 deleted + 1 corrected by 041)')
})

// ---------------------------------------------------------------------
// 042 (falafel addition -- drafted, NOT yet applied). A clean,
// primary-source USDA match (fdcId 2707408, Survey (FNDDS), full token
// coverage, no restaurant/brand qualifier) that was wrongly excluded
// during the original pass because it fell outside prepared_dish's
// plausibility kcal ceiling (500 at the time). Approved for inclusion
// alongside raising that ceiling to 550 -- see
// foodCatalogPlausibility.js and the expansion proposal report.
// ---------------------------------------------------------------------

function load042Addition() {
  const text = read('042_food_reference_catalog_falafel_addition.sql')
  return parseCatalogValues(text)
}

test('042 inserts exactly 1 new row: falafel', () => {
  const rows = load042Addition()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'פלאפל')
})

test('042\'s falafel row carries the exact live-verified USDA values, category, basis and source', () => {
  const [row] = load042Addition()
  assert.equal(row.calories, 514)
  assert.equal(row.protein, 8.28)
  assert.equal(row.category, 'prepared_dish')
  assert.equal(row.basis, 'as_sold')
  assert.equal(row.sourceId, '2707408')
  assert.ok(row.sourceName.includes('USDA FoodData Central'))
  const url = row.fields.find((f) => typeof f === 'string' && f.startsWith('https://fdc.nal.usda.gov/'))
  assert.ok(url && url.includes('2707408'), 'source_url must reference fdcId 2707408')
})

test('042\'s falafel row passes validateCatalogRows with zero errors', () => {
  const { errors } = validateCatalogRows(load042Addition())
  assert.deepEqual(errors, [])
})

test('042\'s falafel row is plausible ONLY under the raised prepared_dish ceiling (regression proving the rule change is what unblocks it, not a data change)', () => {
  const [row] = load042Addition()
  const underRaisedCeiling = checkPlausibility(row.category, row.calories, row.protein)
  assert.equal(underRaisedCeiling.plausible, true)

  // Simulate the OLD 500 ceiling directly (without importing the old
  // scratchpad tool, which was never committed) to prove this is a real
  // before/after, not a tautology.
  const OLD_PREPARED_DISH_CEILING = 500
  const wouldHaveBeenFlagged = row.calories > OLD_PREPARED_DISH_CEILING
  assert.equal(wouldHaveBeenFlagged, true, 'falafel (514 kcal) must have been outside the old 500 ceiling -- otherwise there was nothing to fix')
})

test('042 does not duplicate a name already present in the 039+040 catalog (no accidental double-insert)', () => {
  const { all } = loadFinalCatalog()
  const existingNames = new Set(all.map((r) => r.name.toLowerCase()))
  const [row] = load042Addition()
  assert.ok(!existingNames.has(row.name.toLowerCase()), `"${row.name}" must not already exist in the 039+040 catalog`)
})

// CORRECTED (2026-09-20): 042 originally used
// ON CONFLICT ((lower(name))) DO NOTHING, matching 040's pattern for a
// genuinely new row. That was wrong -- see the two tests below.
test('REGRESSION: falafel already exists in the FULL live catalog (a real, pre-existing, hand-entered row from 006) -- this is exactly why DO NOTHING would have silently discarded 042\'s entire purpose', () => {
  // Deliberately checked against the fuller 004-040 reconstruction, not
  // loadFinalCatalog() (which only covers 039's 221 corrected + 040's
  // 269 inserted rows) -- loadFinalCatalog() alone would have missed
  // this collision entirely, since falafel was never part of that
  // narrower, formally-USDA-verified set. This is the real blind spot
  // that let the original DO NOTHING version through review. Built from
  // 005 onward (NOT 004) -- 005 TRUNCATEs the table before its own
  // insert, so 004's original rows are entirely superseded and are not
  // part of the real pre-039 catalog at all.
  const existingNames = new Set(preTruncateReseedCatalogNames())
  assert.ok(existingNames.has('פלאפל'), 'falafel must already exist as a hand-entered row -- proving 042\'s insert is NOT a fresh row')
})

test('042 uses ON CONFLICT ((lower(name))) DO UPDATE, explicitly setting every column from the new verified values (converges the pre-existing falafel row to the USDA record instead of silently discarding it)', () => {
  const text = read('042_food_reference_catalog_falafel_addition.sql')
  assert.doesNotMatch(text, /on conflict \(\(lower\(name\)\)\) do nothing/, '042 must no longer use DO NOTHING -- it would silently no-op against the real pre-existing falafel row')
  assert.match(text, /on conflict \(\(lower\(name\)\)\) do update set/)
  for (const col of ['calories_per_100g', 'protein_per_100g', 'category', 'basis', 'source_name', 'source_id', 'source_url', 'source_checked_at']) {
    assert.match(text, new RegExp(`${col} = excluded\\.${col}`), `042's DO UPDATE must set ${col} from excluded`)
  }
})

test('042 is transaction-safe: wrapped in begin;/commit; with a guard verifying the falafel row actually carries the verified source_id afterward', () => {
  const text = read('042_food_reference_catalog_falafel_addition.sql')
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.match(withoutComments.trimStart(), /^\s*begin;/, '042 must open with begin;')
  assert.match(withoutComments.trimEnd(), /commit;\s*$/, '042 must close with commit;')
  assert.match(withoutComments, /raise exception/i, '042 must guard its own effect')
})

// ---------------------------------------------------------------------
// 043 (wrong-match + category-reassignment fixes -- drafted, NOT yet
// applied). Scope, per explicit instruction: ONLY the live בייגל
// wrong-match bug and the 6 missing rows whose only blocker was a
// category assignment. Bound-tuning fixes (egg white, oysters, TVP,
// cornstarch) are explicitly out of scope and untouched by 043.
// ---------------------------------------------------------------------

function load043Fixes() {
  const text = read('043_food_reference_catalog_category_fixes.sql')
  const deleteBlock = text.slice(text.indexOf('delete from'), text.indexOf('-- Part 2'))
  const deletedNames = [...deleteBlock.matchAll(/lower\('((?:[^'\\]|'')*)'\)/g)].map((m) => m[1].replace(/''/g, "'"))
  const insertBlock = text.slice(text.indexOf('insert into'), text.indexOf('on conflict'))
  const inserted = parseCatalogValues(insertBlock)
  return { deletedNames, inserted, text }
}

test('043 deletes exactly 1 row (the wrong בייגל mapping) and inserts exactly 6 recategorized rows', () => {
  const { deletedNames, inserted } = load043Fixes()
  assert.deepEqual(deletedNames, ['בייגל'])
  assert.equal(inserted.length, 6, `expected 6 recategorized inserts, found ${inserted.length}`)
})

test('043\'s 6 recategorized rows carry the exact live-verified USDA values, corrected category, and source', () => {
  const { inserted } = load043Fixes()
  const byName = new Map(inserted.map((r) => [r.name, r]))

  const expected = {
    'בייגלה': { calories: 451, protein: 12.3, category: 'sweets_snacks', basis: 'as_sold', sourceId: '2708292' },
    'קוקוס': { calories: 354, protein: 3.33, category: 'nuts_seeds_fats', basis: 'raw', sourceId: '170169' },
    'חמאת שקדים': { calories: 641, protein: 20.7, category: 'nuts_seeds_fats', basis: 'as_sold', sourceId: '2707533' },
    'ממרח חמאת בוטנים חלק': { calories: 520, protein: 25.9, category: 'nuts_seeds_fats', basis: 'as_sold', sourceId: '172458' },
    'גרנולה': { calories: 464, protein: 9.8, category: 'sweets_snacks', basis: 'as_sold', sourceId: '2707933' },
    'קמח שקדים': { calories: 622.042, protein: 26.24375, category: 'nuts_seeds_fats', basis: 'raw', sourceId: '2261420' },
  }

  for (const [name, exp] of Object.entries(expected)) {
    const row = byName.get(name)
    assert.ok(row, `expected a row for "${name}"`)
    assert.equal(row.calories, exp.calories, `${name}: calories`)
    assert.equal(row.protein, exp.protein, `${name}: protein`)
    assert.equal(row.category, exp.category, `${name}: category`)
    assert.equal(row.basis, exp.basis, `${name}: basis`)
    assert.equal(row.sourceId, exp.sourceId, `${name}: source_id`)
    assert.ok(row.sourceName.includes('USDA FoodData Central'), `${name}: source_name must cite USDA FoodData Central`)
    const url = row.fields.find((f) => typeof f === 'string' && f.startsWith('https://fdc.nal.usda.gov/'))
    assert.ok(url && url.includes(exp.sourceId), `${name}: source_url must reference its own source_id`)
  }
})

test('043\'s 6 recategorized rows are plausible under their NEW category (proves the fix is real, not just a relabel)', () => {
  const { inserted } = load043Fixes()
  for (const row of inserted) {
    const { plausible, issues } = checkPlausibility(row.category, row.calories, row.protein)
    assert.equal(plausible, true, `${row.name}: expected plausible under "${row.category}", issues: ${issues.join('; ')}`)
  }
})

test('043\'s 6 recategorized rows would NOT have been plausible under their OLD (wrong) category -- proves there was a real problem to fix', () => {
  const { inserted } = load043Fixes()
  const OLD_CATEGORY = {
    'בייגלה': 'grain_carb',
    'קוקוס': 'fruit',
    'חמאת שקדים': 'sauce_condiment',
    'ממרח חמאת בוטנים חלק': 'sauce_condiment',
    'גרנולה': 'grain_carb',
    'קמח שקדים': 'grain_carb',
  }
  for (const row of inserted) {
    const oldCategory = OLD_CATEGORY[row.name]
    const { plausible } = checkPlausibility(oldCategory, row.calories, row.protein)
    assert.equal(plausible, false, `${row.name}: expected implausible under the old "${oldCategory}" category (otherwise there was nothing to fix)`)
  }
})

test('043 passes validateCatalogRows with zero errors (no restaurant/brand/fast-food/duplicate issues introduced)', () => {
  const { inserted } = load043Fixes()
  const { errors } = validateCatalogRows(inserted)
  assert.deepEqual(errors, [])
})

test('043 does not duplicate a name already present in the 039+040 catalog', () => {
  const { all } = loadFinalCatalog()
  const existingNames = new Set(all.map((r) => r.name.toLowerCase()))
  const { inserted } = load043Fixes()
  for (const row of inserted) {
    assert.ok(!existingNames.has(row.name.toLowerCase()), `"${row.name}" must not already exist in the 039+040 catalog`)
  }
})

test('043 deletes the wrong בייגל row BEFORE inserting the corrected בייגלה row (distinct names, but keeps the fix\'s intent legible)', () => {
  const text = read('043_food_reference_catalog_category_fixes.sql')
  const deleteIndex = text.indexOf('delete from')
  const insertIndex = text.indexOf('insert into')
  assert.ok(deleteIndex !== -1 && insertIndex !== -1 && deleteIndex < insertIndex)
})

test('043 is transaction-safe: wrapped in begin;/commit; with a guard verifying its own intended effect, scoped to only the rows it touches', () => {
  const text = read('043_food_reference_catalog_category_fixes.sql')
  const withoutComments = text.replace(/--.*$/gm, '')
  assert.match(withoutComments.trimStart(), /^\s*begin;/, '043 must open with begin;')
  assert.match(withoutComments.trimEnd(), /commit;\s*$/, '043 must close with commit;')
  assert.match(withoutComments, /raise exception/i, '043 must guard its own effect')
  const doBlock = withoutComments.slice(withoutComments.indexOf('do $$'), withoutComments.indexOf('commit;'))
  assert.doesNotMatch(doBlock, /select count\(\*\) into \w+\s*\n\s*from public\.food_reference_catalog;/, 'the guard must not count the whole table')
})

// CORRECTED (2026-09-20): 043's Part 2 insert originally used
// ON CONFLICT ((lower(name))) DO NOTHING, matching 040's pattern for
// genuinely new rows. That was wrong for 4 of the 6 -- see the two
// tests below.
test('REGRESSION: 4 of 043\'s 6 recategorized names (בייגלה, קוקוס, חמאת שקדים, גרנולה) already exist in the FULL live catalog as pre-existing hand-entered rows -- this is exactly why DO NOTHING would have silently discarded most of 043\'s effect', () => {
  const existingNames = new Set(preTruncateReseedCatalogNames())
  const { inserted } = load043Fixes()
  const colliding = inserted.filter((r) => existingNames.has(r.name.toLowerCase())).map((r) => r.name)
  const notColliding = inserted.filter((r) => !existingNames.has(r.name.toLowerCase())).map((r) => r.name)
  assert.deepEqual(colliding.sort(), ['בייגלה', 'גרנולה', 'חמאת שקדים', 'קוקוס'].sort())
  assert.deepEqual(notColliding.sort(), ['ממרח חמאת בוטנים חלק', 'קמח שקדים'].sort())
})

test('043 uses ON CONFLICT ((lower(name))) DO UPDATE, explicitly setting every column from the new verified values (converges all 4 colliding rows to their corrected category/values instead of silently leaving them unfixed)', () => {
  const text = read('043_food_reference_catalog_category_fixes.sql')
  assert.doesNotMatch(text, /on conflict \(\(lower\(name\)\)\) do nothing/, '043 must no longer use DO NOTHING -- it would silently no-op against 4 of its 6 target rows')
  assert.match(text, /on conflict \(\(lower\(name\)\)\) do update set/)
  for (const col of ['calories_per_100g', 'protein_per_100g', 'category', 'basis', 'source_name', 'source_id', 'source_url', 'source_checked_at']) {
    assert.match(text, new RegExp(`${col} = excluded\\.${col}`), `043's DO UPDATE must set ${col} from excluded`)
  }
})

test('043 explicitly does NOT touch the 4 bound-tuning items (egg white, oysters, TVP, cornstarch) -- out of scope for this pass', () => {
  const text = read('043_food_reference_catalog_category_fixes.sql')
  for (const outOfScope of ['חלבון ביצה', 'צדפות', 'חלבון סויה טקסטורי', 'עמילן תירס']) {
    assert.ok(!text.includes(outOfScope), `043 must not reference "${outOfScope}" -- bound-tuning is a separate decision, not recategorization`)
  }
})
