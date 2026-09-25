import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapOffProductToCandidate, mapCategoriesTagsToInternalCategory } from './openFoodFactsCandidateMapping.js'
import { validateImportCandidate } from './foodCatalogImportValidation.js'

// Fixtures below are trimmed, real shapes taken from an actual
// world.openfoodfacts.org/api/v2/search?countries_tags=israel response
// (fetched read-only while building this pipeline; see
// scripts/food-catalog-import/raw/ for the full, preserved responses).

const REAL_TNUVA_MILK = {
  code: '7290004131074',
  brands: 'תנובה',
  product_name: 'חלב טרי 3%',
  lang: 'he',
  countries_tags: ['en:israel'],
  nutrition_data_per: '100g',
  nutriments: {
    'energy-kcal_100g': 60,
    energy_100g: 251.25,
    proteins_100g: 3.3,
    carbohydrates_100g: 4.95,
    fat_100g: 3,
  },
}

// A real record with no_nutrition_data:"on" -- OFF's own zeros live
// only in nutriments_estimated, never in the real nutriments object.
const REAL_MINERAL_WATER_NO_DATA = {
  code: '7290019056942',
  brands: 'עין גדי',
  product_name: 'מים מינרליים',
  lang: 'he',
  countries_tags: ['en:israel'],
  no_nutrition_data: 'on',
  nutrition_data_per: '100g',
  nutriments: {
    'added-sugars_100g': 0,
  },
  nutriments_estimated: {
    'energy-kcal_100g': 0,
    proteins_100g: 0,
  },
}

test('mapOffProductToCandidate: maps a real, complete Tnuva milk record to a valid candidate', () => {
  const result = mapOffProductToCandidate(REAL_TNUVA_MILK, { retrievedAt: '2026-09-20' })
  assert.equal(result.rejected, false)
  assert.equal(result.candidate.name, 'חלב טרי 3%')
  assert.equal(result.candidate.brand, 'תנובה')
  assert.equal(result.candidate.caloriesPer100g, 60)
  assert.equal(result.candidate.proteinPer100g, 3.3)
  assert.equal(result.candidate.barcode, '7290004131074')
  assert.equal(result.candidate.source, 'openfoodfacts')
  assert.equal(result.candidate.verificationStatus, 'unverified')
  assert.equal(result.candidate.measurementBasis, '100g')

  const validated = validateImportCandidate(result.candidate)
  assert.equal(validated.valid, true, JSON.stringify(validated.errors))
})

test('REGRESSION: mapOffProductToCandidate rejects a no_nutrition_data:"on" record even though nutriments_estimated has plausible-looking zeros -- never falls back to OFF\'s own estimated fields', () => {
  const result = mapOffProductToCandidate(REAL_MINERAL_WATER_NO_DATA)
  assert.equal(result.rejected, true)
  assert.match(result.reason, /no_nutrition_data/)
})

test('mapOffProductToCandidate: rejects a record with no barcode', () => {
  const result = mapOffProductToCandidate({ product_name: 'X', nutrition_data_per: '100g', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 5 } })
  assert.equal(result.rejected, true)
  assert.match(result.reason, /barcode/)
})

test('REGRESSION: mapOffProductToCandidate uses product_name_he as the name when product_name is empty/absent -- found on a real, complete Tnuva whipping-cream record this pipeline was wrongly rejecting', () => {
  const result = mapOffProductToCandidate({
    code: '7290000043814', brands: 'תנובה Tnuva',
    lang: 'en', // product_name absent entirely (real shape from the fetched data)
    product_name_he: 'Whipping Cream 38% שמנת להקצפה',
    nutrition_data_per: '100g',
    nutriments: { 'energy-kcal_100g': 366, proteins_100g: 2 },
  })
  assert.equal(result.rejected, false)
  assert.equal(result.candidate.name, 'Whipping Cream 38% שמנת להקצפה')
  assert.equal(result.candidate.nameHe, 'Whipping Cream 38% שמנת להקצפה')
})

test('mapOffProductToCandidate: rejects a record with no product_name', () => {
  const result = mapOffProductToCandidate({ code: '123', nutrition_data_per: '100g', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 5 } })
  assert.equal(result.rejected, true)
  assert.match(result.reason, /product_name/)
})

test('REGRESSION: mapOffProductToCandidate rejects a per-100ml record instead of silently treating it as per-100g', () => {
  const result = mapOffProductToCandidate({
    code: '999', product_name: 'Some Drink', nutrition_data_per: '100ml',
    nutriments: { 'energy-kcal_100g': 40, proteins_100g: 0.5 },
  })
  assert.equal(result.rejected, false, 'the mapper itself only reads the field -- the rejection happens in validateImportCandidate')
  const validated = validateImportCandidate(result.candidate)
  assert.equal(validated.valid, false)
  assert.ok(validated.errors.some((e) => e.includes('100ml')))
})

test('mapOffProductToCandidate: rejects a record with no nutrition_data_per basis stated at all', () => {
  const result = mapOffProductToCandidate({
    code: '999', product_name: 'Unclear Basis Item',
    nutriments: { 'energy-kcal_100g': 40, proteins_100g: 0.5 },
  })
  assert.equal(result.rejected, true)
  assert.match(result.reason, /basis/)
})

test('mapOffProductToCandidate: rejects a record with no real energy value (kcal or kJ) even if other nutrients are present', () => {
  const result = mapOffProductToCandidate({
    code: '999', product_name: 'No Energy Item', nutrition_data_per: '100g',
    nutriments: { proteins_100g: 5 },
  })
  assert.equal(result.rejected, true)
  assert.match(result.reason, /energy/)
})

test('mapOffProductToCandidate: rejects a record with no real proteins_100g value', () => {
  const result = mapOffProductToCandidate({
    code: '999', product_name: 'No Protein Item', nutrition_data_per: '100g',
    nutriments: { 'energy-kcal_100g': 100 },
  })
  assert.equal(result.rejected, true)
  assert.match(result.reason, /protein/)
})

test('mapOffProductToCandidate: converts a real kJ-only energy value using the documented exact factor when energy-kcal_100g is absent', () => {
  const result = mapOffProductToCandidate({
    code: '999', product_name: 'kJ Only Item', nutrition_data_per: '100g',
    nutriments: { energy_100g: 418.4, proteins_100g: 5 },
  })
  assert.equal(result.rejected, false)
  assert.equal(result.candidate.caloriesPer100g, 100)
  assert.equal(result.candidate.caloriesConvertedFromKj, true)
})

test('mapOffProductToCandidate: a real reported protein of exactly 0 is treated as explicit (it came from the real nutriments object, not nutriments_estimated)', () => {
  const result = mapOffProductToCandidate({
    code: '999', product_name: 'Genuine Zero Protein Item', nutrition_data_per: '100g',
    nutriments: { 'energy-kcal_100g': 884, proteins_100g: 0 },
  })
  assert.equal(result.rejected, false)
  assert.equal(result.candidate.proteinExplicitlyZero, true)
  const validated = validateImportCandidate(result.candidate)
  assert.equal(validated.valid, true)
})

test('REGRESSION: mapOffProductToCandidate picks nameHe/nameEn by actual script content, not by OFF\'s own (sometimes wrong) lang/field-name metadata -- found on a real Tnuva milk record where lang was "en" and product_name_he literally held the English text "Milk 3%"', () => {
  const result = mapOffProductToCandidate({
    code: '7290004131074', brands: 'תנובה',
    lang: 'en', // wrong/misleading, per the real record
    product_name: 'חלב טרי 3%', // the real Hebrew name, despite lang:"en"
    product_name_he: 'Milk 3%', // OFF's own field, mislabeled -- English, not Hebrew
    generic_name: 'Milk 3% fat',
    nutrition_data_per: '100g',
    nutriments: { 'energy-kcal_100g': 60, proteins_100g: 3.3 },
  })
  assert.equal(result.rejected, false)
  assert.equal(result.candidate.nameHe, 'חלב טרי 3%', 'nameHe must be the actually-Hebrew string, regardless of which field it came from')
  assert.equal(result.candidate.nameEn, 'Milk 3%', 'nameEn must be the actually-Latin string, regardless of which field it came from')
})

test('mapCategoriesTagsToInternalCategory: maps a real dairy tag set to "dairy"', () => {
  assert.equal(mapCategoriesTagsToInternalCategory(['en:dairies', 'en:fermented-milk-products', 'en:yogurts']), 'dairy')
})

test('mapCategoriesTagsToInternalCategory: maps a real bread tag set to "bread_bakery"', () => {
  assert.equal(mapCategoriesTagsToInternalCategory(['en:plant-based-foods-and-beverages', 'en:breads', 'en:pitas']), 'bread_bakery')
})

test('REGRESSION: mapCategoriesTagsToInternalCategory returns null (never guesses) when no tag matches any rule', () => {
  assert.equal(mapCategoriesTagsToInternalCategory(['en:some-unrecognized-thing']), null)
  assert.equal(mapCategoriesTagsToInternalCategory([]), null)
  assert.equal(mapCategoriesTagsToInternalCategory(undefined), null)
  assert.equal(mapCategoriesTagsToInternalCategory(null), null)
})

test('mapOffProductToCandidate: attaches a category when categories_tags matches a known rule', () => {
  const result = mapOffProductToCandidate({
    code: '999', product_name: 'Test Yogurt', nutrition_data_per: '100g',
    categories_tags: ['en:dairies', 'en:yogurts'],
    nutriments: { 'energy-kcal_100g': 60, proteins_100g: 4 },
  })
  assert.equal(result.candidate.category, 'dairy')
})

test('mapOffProductToCandidate: preserves brand, barcode, and source URL for traceability', () => {
  const result = mapOffProductToCandidate(REAL_TNUVA_MILK)
  assert.equal(result.candidate.sourceUrl, 'https://world.openfoodfacts.org/product/7290004131074')
  assert.equal(result.candidate.externalId, '7290004131074')
})
