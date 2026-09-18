// Barcode -> product lookup against Open Food Facts (world.openfoodfacts.org).
// Pure/DI: takes an injectable `fetchImpl` (defaults to the global fetch)
// so this is fully testable under plain Node with a fake implementation
// -- no network access needed in tests, same DI convention as every
// other module in this directory.
//
// Open Food Facts: a free, open, community-maintained product database
// (Open Database License for the data, CC-BY-SA for images/free text --
// see the license note in the barcode-food-logging PR description). No
// API key is required for read-only product lookups on the public read
// API used here, and none is embedded or exposed by this module. Per
// their documented fair-use guidance we send a descriptive User-Agent
// identifying this app -- not a workaround for any access restriction,
// just good API citizenship, matching what OFF's own docs ask
// integrators to do.
//
// Never throws -- every outcome (found, not found, found but missing
// nutrition data, or a network/parse error) resolves to a plain,
// discriminated { status, ... } object, so a caller (the Vue component)
// can switch on `.status` with no try/catch of its own. This also keeps
// every branch trivially testable with a fake fetchImpl.

import { extractCaloriesPer100g, extractProteinPer100g, extractProductName } from './barcodeNutrientExtraction.js'

const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product'
const USER_AGENT = 'FitnessApp-BarcodeLogging/1.0 (nutrition log feature)'
// Every field extractCaloriesPer100g/extractProteinPer100g/
// extractProductName know how to fall back through (see that module's
// own comment for why several variants are tried) -- requested
// explicitly so OFF's response actually includes them; OFF's `fields`
// parameter only returns what's asked for.
const OFF_FIELDS = [
  'product_name',
  'product_name_en',
  'generic_name',
  'generic_name_en',
  'nutriments',
  'serving_quantity',
  'code',
].join(',')

export const SOURCE_OPEN_FOOD_FACTS = 'open_food_facts'
// A coach's own manually-typed values, either just now (this scan) or
// reused from an earlier approval (see coachBarcodeProducts.js /
// 046_coach_barcode_products.sql) -- 045's source-check constraint
// never restricts barcode_source to a specific value, so both are
// valid, distinct values for audit clarity: SOURCE_MANUAL means "the
// coach typed this in during the current scan"; SOURCE_COACH_SAVED
// means "this exact value was approved on an earlier scan and reused
// automatically this time, without asking again."
export const SOURCE_MANUAL = 'manual'
export const SOURCE_COACH_SAVED = 'coach_saved'

export function isPlausibleBarcode(value) {
  const trimmed = String(value ?? '').trim()
  // EAN-8/EAN-13/UPC-A/UPC-E are all-digit codes of 8, 12, or 13 digits
  // (occasionally 14 for GTIN-14). Deliberately loose (accepts the
  // common lengths, not a checksum validator) -- this only gates
  // "is it even worth sending to the lookup," not correctness; a wrong
  // checksum still resolves cleanly to `not_found` from the API itself.
  return /^\d{8}$|^\d{12,14}$/.test(trimmed)
}

export async function lookupBarcode(barcode, { fetchImpl = fetch } = {}) {
  const trimmed = String(barcode ?? '').trim()
  if (!isPlausibleBarcode(trimmed)) {
    return { status: 'invalid_barcode', barcode: trimmed }
  }

  let response
  try {
    response = await fetchImpl(
      `${OFF_BASE_URL}/${encodeURIComponent(trimmed)}.json?fields=${OFF_FIELDS}`,
      { headers: { 'User-Agent': USER_AGENT } },
    )
  } catch {
    return { status: 'error', barcode: trimmed, message: 'שגיאת רשת בעת חיפוש הברקוד' }
  }

  if (!response.ok) {
    return { status: 'error', barcode: trimmed, message: `שגיאה מהשרת (${response.status})` }
  }

  let data
  try {
    data = await response.json()
  } catch {
    return { status: 'error', barcode: trimmed, message: 'תגובה לא תקינה מהשרת' }
  }

  if (data?.status !== 1 || !data.product) {
    return { status: 'not_found', barcode: trimmed }
  }

  const productName = extractProductName(data.product)
  const nutriments = data.product.nutriments ?? {}
  const servingQuantity = data.product.serving_quantity
  const caloriesPer100g = extractCaloriesPer100g(nutriments, servingQuantity)
  const proteinPer100g = extractProteinPer100g(nutriments, servingQuantity)

  if (caloriesPer100g === null) {
    // A real product was found (its name is reported here whenever one
    // was extractable, even though calories were not), but no usable
    // calories figure exists under any of the fields/units
    // extractCaloriesPer100g tries -- surfaced distinctly from
    // `not_found` so the UI can say "found the product, but it's
    // missing nutrition data" rather than "couldn't find it at all",
    // and can show the product's own name in that message rather than
    // just its barcode.
    return { status: 'no_nutrition_data', barcode: trimmed, productName }
  }

  return {
    status: 'found',
    barcode: trimmed,
    product: {
      // A calories-bearing product with no name at all in any of the 4
      // tried fields is rare in practice, but not treated as "missing
      // nutrition" -- it gets the same neutral placeholder the manual-
      // entry flow already uses for an unnamed product, not a lost log.
      name: productName ?? 'מוצר ללא שם',
      caloriesPer100g,
      proteinPer100g, // may be null -- an unknown-protein product, handled the same as everywhere else in this feature
      source: SOURCE_OPEN_FOOD_FACTS,
      sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(trimmed)}`,
    },
  }
}
