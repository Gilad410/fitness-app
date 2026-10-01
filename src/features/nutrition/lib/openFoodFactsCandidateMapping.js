// Maps a raw Open Food Facts product record (as returned by
// https://world.openfoodfacts.org/api/v2/search) to the candidate shape
// validateImportCandidate() (foodCatalogImportValidation.js) expects --
// or returns a rejection with a reason, for a record this module can
// tell up front is unusable, before it ever reaches that shared
// validator. Pure/DI: takes a plain object, returns a plain object,
// no network, no fs, no Supabase.
//
// The single most important rule this module enforces, ahead of
// anything else: Open Food Facts' own API response carries TWO
// separate nutrient objects per product -- `nutriments` (what the
// product's contributor actually entered) and `nutriments_estimated`
// (values OFF's own pipeline back-fills from ingredient lists when the
// real ones are missing). This module reads ONLY `nutriments` --
// `nutriments_estimated` is never consulted for calories or protein,
// anywhere in this file. Treating an OFF-estimated value as if it were
// a real reported one would be exactly the "invent/estimate/generate a
// nutritional value" this catalog's own rules (and this session's
// standing instruction) forbid -- it would just be OFF's estimate
// instead of this app's, which is no better.

import { resolveCaloriesFromEnergyFields } from './foodCatalogImportValidation.js'

const OFF_SOURCE = 'openfoodfacts'

function firstNonEmpty(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return null
}

const HEBREW_SCRIPT = /[֐-׿]/ // the Hebrew Unicode block
function hasHebrewScript(str) {
  return typeof str === 'string' && HEBREW_SCRIPT.test(str)
}
// A conservative "is this actually Latin/English text" check -- at
// least one Latin letter AND no Hebrew script. Deliberately not the
// mere negation of hasHebrewScript, so a value that's neither (e.g.
// pure digits/symbols) resolves to neither language rather than being
// wrongly claimed as English.
function looksLatin(str) {
  return typeof str === 'string' && /[A-Za-z]/.test(str) && !hasHebrewScript(str)
}

// Conservative, best-effort mapping from OFF's own `categories_tags`
// (e.g. "en:dairies", "en:fermented-milk-products") to this catalog's
// existing CATEGORIES enum (foodCatalogPlausibility.js) -- ordered
// most-specific-first so a product tagged both broadly and specifically
// (common in OFF) resolves to the more precise category. Returns null
// (never a guess) when nothing in the product's tag list matches any
// rule -- a NULL category is the existing, safe, pre-049 default for
// every row before this import too, not a new failure mode.
const CATEGORY_TAG_RULES = [
  [/^en:(plant-based-milks|plant-milks|soy-milks|almond-milks|oat-milks)/, 'plant_milk'],
  [/^en:(dairies|milks|yogurts|fermented-milk-products|cheeses)/, 'dairy'],
  [/^en:(eggs)/, 'egg'],
  [/^en:(fishes|seafood|smoked-fishes|canned-fish)/, 'fish_seafood'],
  [/^en:(meats|poultries|sausages|cold-cuts|charcuterie)/, 'meat_poultry'],
  [/^en:(breads|flatbreads|pitas|bakery-products|cakes|pastries)/, 'bread_bakery'],
  [/^en:(legumes|beans|lentils|chickpeas)/, 'legume'],
  [/^en:(cereals-and-potatoes|cereals|rices|pastas|potatoes)/, 'grain_carb'],
  [/^en:(nuts|seeds|plant-based-fats|oils|nut-butters|peanut-butters)/, 'nuts_seeds_fats'],
  [/^en:(sweets|snacks|chocolates|biscuits-and-cakes|salty-snacks|chips-and-fries)/, 'sweets_snacks'],
  [/^en:(sauces|condiments|dressings|mayonnaises|ketchups)/, 'sauce_condiment'],
  [/^en:(spices|herbs)/, 'spice_herb'],
  [/^en:(beverages|waters|sodas|juices|soft-drinks|teas|coffees)/, 'beverage'],
  [/^en:(soups|salads)/, 'soup_salad'],
  [/^en:(sandwiches)/, 'sandwich'],
  [/^en:(dietary-supplements|food-supplements)/, 'supplement'],
  [/^en:(fruits|dried-fruits)/, 'fruit'],
  [/^en:(vegetables|canned-vegetables|frozen-vegetables)/, 'vegetable'],
  [/^en:(prepared-meals|meals|ready-to-eat)/, 'prepared_dish'],
]
export function mapCategoriesTagsToInternalCategory(categoriesTags) {
  if (!Array.isArray(categoriesTags)) return null
  for (const [pattern, category] of CATEGORY_TAG_RULES) {
    if (categoriesTags.some((tag) => pattern.test(tag))) return category
  }
  return null
}

// OFF's own `nutrition_data_per` field states the basis the CURRENT,
// as-sold nutriments object is reported on: "100g", "100ml", or
// "serving". Anything other than "100g" is rejected by
// validateMeasurementBasis() downstream -- this function just reads the
// field as-is, applying no normalization or guessing (e.g. never
// treating "100ml" as "100g" for a liquid, per explicit requirement).
function readMeasurementBasis(product) {
  const raw = product?.nutrition_data_per
  if (raw === '100g' || raw === '100ml' || raw === 'serving') return raw
  return raw ?? null
}

// Maps ONE raw OFF product to either a rejection ({ rejected: true,
// reason }) or an accepted candidate ({ rejected: false, candidate,
// rawSnapshot }) ready for validateImportCandidate(). Never throws on
// a malformed product -- a missing/wrong-shaped field is a rejection
// reason, not an exception.
export function mapOffProductToCandidate(product, { retrievedAt } = {}) {
  const reject = (reason) => ({ rejected: true, reason, code: product?.code ?? null })

  if (!product || typeof product !== 'object') return reject('not a product object')

  const barcode = firstNonEmpty(product.code)
  if (!barcode) return reject('missing barcode (code)')

  // OFF explicitly flags a record as having no real nutrition data at
  // all -- an unambiguous, source-provided signal to reject, not a
  // value to fall back to nutriments_estimated for.
  if (product.no_nutrition_data === 'on') {
    return reject('source explicitly flags no_nutrition_data -- refusing to use nutriments_estimated as a substitute')
  }

  // Real OFF records frequently carry a usable name ONLY in
  // product_name_he (or leave product_name empty/absent while still
  // having a real Hebrew name) -- checking product_name alone rejected
  // real, complete, usable products (found by inspecting actual fetched
  // data: e.g. a Tnuva whipping cream and a Nestlé granola, both with
  // full nutrient panels, whose product_name was empty/missing but
  // product_name_he was populated). generic_name is the last, weakest
  // fallback.
  const name = firstNonEmpty(product.product_name, product.product_name_he, product.generic_name)
  if (!name) return reject('missing product_name')

  const measurementBasis = readMeasurementBasis(product)
  // A record with no stated basis at all is treated as unresolved, not
  // assumed-100g -- OFF states this field on essentially every record
  // with real nutrition data; its absence is itself a signal the record
  // is incomplete.
  if (measurementBasis === null) return reject('no nutrition_data_per basis stated -- cannot confirm this is per-100g')

  const nutriments = product.nutriments && typeof product.nutriments === 'object' ? product.nutriments : {}

  const rawKcal = nutriments['energy-kcal_100g']
  const rawKj = nutriments['energy_100g'] // OFF's generic `energy` field is always kJ-unit when present
  const energy = resolveCaloriesFromEnergyFields({
    kcal: typeof rawKcal === 'number' ? rawKcal : undefined,
    kj: typeof rawKj === 'number' ? rawKj : undefined,
  })
  if (energy === null) return reject('no real (non-estimated) energy value present (neither energy-kcal_100g nor energy_100g)')

  const rawProtein = nutriments['proteins_100g']
  const proteinPresent = typeof rawProtein === 'number' && Number.isFinite(rawProtein)
  if (!proteinPresent) return reject('no real (non-estimated) proteins_100g value present')

  const rawCarbs = nutriments['carbohydrates_100g']
  const rawFat = nutriments['fat_100g']

  const brand = firstNonEmpty(product.brands)

  // Content-based, NOT metadata-based: real fetched data shows OFF's
  // own `lang`/`product_name_he`/`product_name_en` fields are
  // sometimes simply wrong (found on real records: lang:"en" with a
  // genuinely Hebrew product_name, and a product_name_he field holding
  // English text, e.g. barcode 7290004131074 -- Tnuva milk -- whose
  // product_name_he is literally "Milk 3%"). Trusting those labels
  // blindly produced swapped Hebrew/English names. Every name-shaped
  // field OFF returned is pooled and picked by what script it actually
  // contains, never by which field name it arrived in.
  const nameCandidates = [product.product_name_he, product.product_name, product.product_name_en, product.generic_name]
  const nameHe = firstNonEmpty(...nameCandidates.filter(hasHebrewScript))
  const nameEn = firstNonEmpty(...nameCandidates.filter(looksLatin))

  const category = mapCategoriesTagsToInternalCategory(product.categories_tags)

  const candidate = {
    name,
    nameHe,
    nameEn,
    brand,
    category,
    caloriesPer100g: energy.value,
    caloriesUnit: energy.unit,
    caloriesConvertedFromKj: energy.converted,
    proteinPer100g: rawProtein,
    proteinExplicitlyZero: rawProtein === 0,
    carbsPer100g: typeof rawCarbs === 'number' && Number.isFinite(rawCarbs) ? rawCarbs : undefined,
    fatPer100g: typeof rawFat === 'number' && Number.isFinite(rawFat) ? rawFat : undefined,
    measurementBasis,
    source: OFF_SOURCE,
    externalId: barcode,
    barcode,
    sourceUrl: `https://world.openfoodfacts.org/product/${barcode}`,
    retrievedAt: retrievedAt ?? null,
    verificationStatus: 'unverified', // community_source, per requirement 5 -- never described as verified here
  }

  return { rejected: false, candidate }
}
