import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCalories,
  validateProtein,
  validateProteinZeroClaim,
  checkCalorieMacroConsistency,
  candidateDedupeKey,
  perServingToPer100g,
  validateImportCandidate,
  validateMeasurementBasis,
  resolveCaloriesFromEnergyFields,
  KJ_PER_KCAL,
} from './foodCatalogImportValidation.js'

// ---------------------------------------------------------------------
// Requirement 5: bounds, NULL/NaN/negative rejection.
// ---------------------------------------------------------------------

test('validateCalories: accepts the documented live boundary value (900, a real pure-fat/oil row) and rejects anything over it', () => {
  assert.equal(validateCalories(900).valid, true)
  assert.equal(validateCalories(900.1).valid, false)
})

test('validateCalories: accepts 0 and rejects negative', () => {
  assert.equal(validateCalories(0).valid, true)
  assert.equal(validateCalories(-1).valid, false)
})

test('validateCalories: rejects null, undefined, NaN, and non-numeric values -- never silently coerced', () => {
  assert.equal(validateCalories(null).valid, false)
  assert.equal(validateCalories(undefined).valid, false)
  assert.equal(validateCalories(NaN).valid, false)
  assert.equal(validateCalories('300').valid, false)
})

test('validateProtein: accepts the 0-100 bounds inclusive, rejects outside them', () => {
  assert.equal(validateProtein(0).valid, true)
  assert.equal(validateProtein(100).valid, true)
  assert.equal(validateProtein(100.1).valid, false)
  assert.equal(validateProtein(-0.1).valid, false)
})

test('validateProtein: rejects NaN and non-numeric the same as calories', () => {
  assert.equal(validateProtein(NaN).valid, false)
  assert.equal(validateProtein('12').valid, false)
})

// ---------------------------------------------------------------------
// Requirement 5: "protein zero only when the source explicitly reports
// zero."
// ---------------------------------------------------------------------

test('validateProteinZeroClaim: protein 0 WITH proteinExplicitlyZero: true is accepted -- the real shape of e.g. pure oil, sugar, water', () => {
  assert.equal(validateProteinZeroClaim(0, { proteinExplicitlyZero: true }).valid, true)
})

test('REGRESSION: validateProteinZeroClaim rejects protein 0 with no explicit-zero flag -- never treats a missing value as "0g protein"', () => {
  assert.equal(validateProteinZeroClaim(0, {}).valid, false)
  assert.equal(validateProteinZeroClaim(0).valid, false)
  assert.equal(validateProteinZeroClaim(0, { proteinExplicitlyZero: false }).valid, false)
})

test('validateProteinZeroClaim: a non-zero protein value is never gated by the explicit-zero flag at all', () => {
  assert.equal(validateProteinZeroClaim(5.8, {}).valid, true)
})

// ---------------------------------------------------------------------
// Requirement 6: calorie/macro cross-check.
// ---------------------------------------------------------------------

test('checkCalorieMacroConsistency: a well-formed product (chicken breast-like macros) is consistent', () => {
  // 31g protein, 0g carbs, 3.6g fat -> 31*4 + 0*4 + 3.6*9 = 156.4
  const result = checkCalorieMacroConsistency({ calories: 165, protein: 31, carbs: 0, fat: 3.6 })
  assert.equal(result.consistent, true)
  assert.equal(result.expectedCalories, 156.4)
})

test('checkCalorieMacroConsistency: a high-fiber food within the generous tolerance is NOT flagged (fiber-driven overstatement is exactly what the tolerance accommodates)', () => {
  // A fibrous vegetable: 5g protein, 20g carbs (much of it fiber), 0.5g fat
  // -> Atwater estimate 5*4+20*4+0.5*9 = 104.5, real label calories lower (84) due to fiber
  const result = checkCalorieMacroConsistency({ calories: 84, protein: 5, carbs: 20, fat: 0.5 })
  assert.equal(result.consistent, true)
})

test('REGRESSION: a genuinely inconsistent row (calories far off from its own reported macros) is flagged, not silently imported', () => {
  // Reported 500 kcal, but macros only support ~120 kcal (30*4) -- a real
  // unit/decimal-point/mismatched-record error, the exact class this
  // check exists to catch.
  const result = checkCalorieMacroConsistency({ calories: 500, protein: 30, carbs: 0, fat: 0 })
  assert.equal(result.consistent, false)
  assert.equal(result.expectedCalories, 120)
})

test('checkCalorieMacroConsistency: returns null (nothing to check) when any of the three macros is missing -- never runs on partial data', () => {
  assert.equal(checkCalorieMacroConsistency({ calories: 165, protein: 31, carbs: 0, fat: null }), null)
  assert.equal(checkCalorieMacroConsistency({ calories: 165, protein: 31 }), null)
})

// ---------------------------------------------------------------------
// Requirement 7: dedupe by source+external_id or barcode, never bare
// name -- preserves legitimate raw/cooked and branded variations.
// ---------------------------------------------------------------------

test('candidateDedupeKey: a barcode takes priority and forms a stable key', () => {
  assert.equal(candidateDedupeKey({ barcode: '7622202268298' }), 'barcode:7622202268298')
})

test('candidateDedupeKey: source+externalId forms a stable key when there is no barcode', () => {
  assert.equal(candidateDedupeKey({ source: 'usda_fdc', externalId: '169728' }), 'source:usda_fdc:169728')
})

test('REGRESSION: candidateDedupeKey never keys on name -- two records with the SAME name but different sources/externalIds (e.g. raw vs. cooked pasta, both literally an FDC id) get DIFFERENT keys, so neither collapses the other', () => {
  const rawPasta = candidateDedupeKey({ source: 'usda_fdc', externalId: '169736' })
  const cookedPasta = candidateDedupeKey({ source: 'usda_fdc', externalId: '169728' })
  assert.notEqual(rawPasta, cookedPasta)
})

test('candidateDedupeKey: returns null when neither a barcode nor a complete source+externalId pair is present -- nothing stable to dedupe on', () => {
  assert.equal(candidateDedupeKey({}), null)
  assert.equal(candidateDedupeKey({ source: 'usda_fdc' }), null) // externalId missing
  assert.equal(candidateDedupeKey({ externalId: '169728' }), null) // source missing
})

// ---------------------------------------------------------------------
// Requirement 5: per-100g vs per-serving, explicit-weight-only
// conversion.
// ---------------------------------------------------------------------

test('perServingToPer100g: scales a real per-serving value using an explicit serving weight -- a straight proportional conversion, not a guess', () => {
  // 100 kcal per 25g serving -> 400 kcal/100g (same real conversion
  // barcodeNutrientExtraction.js already performs for Open Food Facts data)
  assert.equal(perServingToPer100g(100, 25), 400)
})

test('REGRESSION: perServingToPer100g returns null (never a fabricated number) when the serving weight is missing, zero, or negative', () => {
  assert.equal(perServingToPer100g(100, null), null)
  assert.equal(perServingToPer100g(100, undefined), null)
  assert.equal(perServingToPer100g(100, 0), null)
  assert.equal(perServingToPer100g(100, -5), null)
})

// ---------------------------------------------------------------------
// validateImportCandidate -- the single entry point, composing every
// rule above.
// ---------------------------------------------------------------------

test('validateImportCandidate: a fully valid, well-sourced candidate passes with no errors and no review flag', () => {
  const result = validateImportCandidate({
    name: 'Chicken breast, roasted',
    caloriesPer100g: 165,
    proteinPer100g: 31,
    carbsPer100g: 0,
    fatPer100g: 3.6,
    source: 'usda_fdc',
    externalId: '171077',
  })
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
  assert.equal(result.needsReview, false)
  assert.equal(result.dedupeKey, 'source:usda_fdc:171077')
})

test('validateImportCandidate: rejects a candidate with no name', () => {
  const result = validateImportCandidate({
    caloriesPer100g: 100, proteinPer100g: 5, source: 'usda_fdc', externalId: '1',
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('missing name')))
})

test('validateImportCandidate: rejects a candidate with no dedupe identity at all (no barcode, no source+externalId)', () => {
  const result = validateImportCandidate({
    name: 'Mystery Food', caloriesPer100g: 100, proteinPer100g: 5,
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('cannot safely dedupe')))
})

test('validateImportCandidate: rejects a protein-0 candidate that does not explicitly claim zero', () => {
  const result = validateImportCandidate({
    name: 'Suspicious Zero-Protein Item', caloriesPer100g: 100, proteinPer100g: 0,
    source: 'usda_fdc', externalId: '2',
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('explicitly report zero')))
})

test('validateImportCandidate: accepts a genuine protein-0 candidate (e.g. oil) when explicitly claimed', () => {
  const result = validateImportCandidate({
    name: 'Olive Oil', caloriesPer100g: 884, proteinPer100g: 0, proteinExplicitlyZero: true,
    source: 'usda_fdc', externalId: '3',
  })
  assert.equal(result.valid, true)
})

test('validateImportCandidate: rejects a per-serving candidate with no explicit serving weight', () => {
  const result = validateImportCandidate({
    name: 'Serving-Only Item', caloriesPer100g: 100, proteinPer100g: 5,
    source: 'usda_fdc', externalId: '4', per: 'serving',
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('serving weight')))
})

test('validateImportCandidate: a structurally valid candidate with an inconsistent calorie/macro relationship is flagged for review, not rejected outright', () => {
  const result = validateImportCandidate({
    name: 'Suspicious Macro Mismatch', caloriesPer100g: 500, proteinPer100g: 30,
    carbsPer100g: 0, fatPer100g: 0, source: 'usda_fdc', externalId: '5',
  })
  assert.equal(result.valid, true, 'a macro inconsistency alone does not fail hard validation')
  assert.equal(result.needsReview, true, 'but it must be flagged for manual review, never auto-imported silently')
  assert.equal(result.macroCheck.consistent, false)
})

// ---------------------------------------------------------------------
// Open Food Facts import: measurement-basis (per-100g vs per-100ml vs
// per-serving) and kcal/kJ handling.
// ---------------------------------------------------------------------

test('validateMeasurementBasis: accepts "100g" and accepts an unstated basis (USDA never states one -- always per-100g by convention)', () => {
  assert.equal(validateMeasurementBasis('100g').valid, true)
  assert.equal(validateMeasurementBasis(undefined).valid, true)
  assert.equal(validateMeasurementBasis(null).valid, true)
})

test('REGRESSION: validateMeasurementBasis rejects "100ml" -- never silently treated as per-100g for a liquid product', () => {
  const result = validateMeasurementBasis('100ml')
  assert.equal(result.valid, false)
  assert.match(result.reason, /100ml/)
})

test('validateMeasurementBasis: rejects "serving" and any other non-100g basis string', () => {
  assert.equal(validateMeasurementBasis('serving').valid, false)
  assert.equal(validateMeasurementBasis('unknown').valid, false)
})

test('resolveCaloriesFromEnergyFields: prefers a real reported kcal value, never converts when kcal itself is already present', () => {
  const result = resolveCaloriesFromEnergyFields({ kcal: 60, kj: 251.25 })
  assert.equal(result.value, 60)
  assert.equal(result.converted, false)
  assert.equal(result.unit, 'kcal')
})

test('resolveCaloriesFromEnergyFields: converts from kJ using the exact standard factor only when kcal is absent, and documents the conversion', () => {
  const result = resolveCaloriesFromEnergyFields({ kj: 251.25 })
  assert.equal(result.converted, true)
  assert.equal(result.unit, 'kj')
  assert.equal(result.value, Math.round((251.25 / KJ_PER_KCAL) * 10) / 10)
  // Sanity check only, not exact-round-trip -- 251.25 kJ is itself
  // OFF's own rounded figure for a real 60 kcal product, so converting
  // it back lands close to but not always bit-for-bit at 60 (60.1 here,
  // a 0.1 kcal/100g rounding artifact of the source data, not this
  // module's conversion).
  assert.ok(Math.abs(result.value - 60) <= 0.5, 'converting back from OFF\'s own kJ figure should land close to the real 60 kcal value')
})

test('REGRESSION: resolveCaloriesFromEnergyFields returns null (never a fabricated number) when neither kcal nor kJ is a finite number', () => {
  assert.equal(resolveCaloriesFromEnergyFields({}), null)
  assert.equal(resolveCaloriesFromEnergyFields({ kcal: null, kj: undefined }), null)
  assert.equal(resolveCaloriesFromEnergyFields({ kcal: NaN }), null)
})

test('validateImportCandidate: rejects a candidate whose measurement basis is per-100ml, not per-100g', () => {
  const result = validateImportCandidate({
    name: 'Milk 3%', caloriesPer100g: 60, proteinPer100g: 3.3,
    source: 'openfoodfacts', externalId: '7290004131074', measurementBasis: '100ml',
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((e) => e.includes('100ml')))
})

test('validateImportCandidate: accepts a candidate with an explicit "100g" measurement basis', () => {
  const result = validateImportCandidate({
    name: 'Cottage Cheese 5%', caloriesPer100g: 106, proteinPer100g: 11,
    source: 'openfoodfacts', externalId: '7290000000001', measurementBasis: '100g',
  })
  assert.equal(result.valid, true)
})

test('REGRESSION: raw and cooked variants of the same-named food both pass and get distinct dedupe keys -- neither is rejected as a "duplicate" of the other', () => {
  const raw = validateImportCandidate({
    name: 'Pasta', caloriesPer100g: 371, proteinPer100g: 13, proteinExplicitlyZero: false,
    source: 'usda_fdc', externalId: '169736',
  })
  const cooked = validateImportCandidate({
    name: 'Pasta', caloriesPer100g: 131, proteinPer100g: 5.15,
    source: 'usda_fdc', externalId: '169728',
  })
  assert.equal(raw.valid, true)
  assert.equal(cooked.valid, true)
  assert.notEqual(raw.dedupeKey, cooked.dedupeKey)
})
