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

const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product'
const USER_AGENT = 'FitnessApp-BarcodeLogging/1.0 (nutrition log feature)'

export const SOURCE_OPEN_FOOD_FACTS = 'open_food_facts'

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
      `${OFF_BASE_URL}/${encodeURIComponent(trimmed)}.json?fields=product_name,nutriments,code`,
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

  const name = typeof data.product.product_name === 'string' ? data.product.product_name.trim() : ''
  const nutriments = data.product.nutriments ?? {}
  const caloriesPer100g = toFiniteOrNull(nutriments['energy-kcal_100g'])
  const proteinPer100g = toFiniteOrNull(nutriments['proteins_100g'])

  if (!name || caloriesPer100g === null) {
    // A real product was found, but not enough to log against -- surfaced
    // distinctly from `not_found` so the UI can say "found the product,
    // but it's missing nutrition data" rather than "couldn't find it at
    // all" (requirement: a clear message either way, manual entry offered).
    return { status: 'no_nutrition_data', barcode: trimmed, productName: name || null }
  }

  return {
    status: 'found',
    barcode: trimmed,
    product: {
      name,
      caloriesPer100g,
      proteinPer100g, // may be null -- an unknown-protein product, handled the same as everywhere else in this feature
      source: SOURCE_OPEN_FOOD_FACTS,
      sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(trimmed)}`,
    },
  }
}

function toFiniteOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
