// Pure extraction of calories/protein-per-100g and a display name from a
// raw Open Food Facts product object -- tries every realistic field/unit
// variant before concluding a value is genuinely unavailable. OFF
// products vary a lot in which fields are actually populated: energy in
// kcal vs. only in kJ, per-100g vs. only per-serving, a name under one
// language-specific field vs. another. Reading only the single most
// common field (the previous behavior) rejected products that genuinely
// do have usable data under a different key -- exactly the Milka case
// this module exists to fix.
//
// Every fallback here is a real, direct unit conversion or field lookup
// -- 1 kcal = 4.184 kJ is a standard physical conversion, and
// per-serving -> per-100g is a straight proportional scaling using the
// product's own real serving_quantity. Nothing here is ever an estimate
// or invented value: if nothing usable is found anywhere, the
// corresponding function returns null, same as before -- it just looks
// harder at genuinely-present data before giving up.
const KCAL_PER_KJ = 1 / 4.184

export function extractCaloriesPer100g(nutriments = {}, servingQuantity = null) {
  const direct = toFiniteOrNull(nutriments['energy-kcal_100g'])
  if (direct !== null) return direct

  const kjPer100g = toFiniteOrNull(nutriments['energy_100g'])
  if (kjPer100g !== null) return round2(kjPer100g * KCAL_PER_KJ)

  const servingQty = toFiniteOrNull(servingQuantity)
  if (servingQty !== null && servingQty > 0) {
    const kcalPerServing = toFiniteOrNull(nutriments['energy-kcal_serving'])
    if (kcalPerServing !== null) return round2((kcalPerServing / servingQty) * 100)

    const kjPerServing = toFiniteOrNull(nutriments['energy_serving'])
    if (kjPerServing !== null) return round2(((kjPerServing * KCAL_PER_KJ) / servingQty) * 100)
  }

  return null
}

export function extractProteinPer100g(nutriments = {}, servingQuantity = null) {
  const direct = toFiniteOrNull(nutriments['proteins_100g'])
  if (direct !== null) return direct

  const servingQty = toFiniteOrNull(servingQuantity)
  if (servingQty !== null && servingQty > 0) {
    const perServing = toFiniteOrNull(nutriments['proteins_serving'])
    if (perServing !== null) return round2((perServing / servingQty) * 100)
  }

  return null
}

// Priority order: the product's own primary name field first, then the
// English variant (most consistently populated second language on
// OFF), then the generic-name equivalents of both. Not exhaustive of
// every locale OFF supports -- there is no fixed, bounded list of
// language codes to fully enumerate -- but covers the realistic common
// case of "the default field is empty/generic but a named-language
// field has the real name", which is what a bounded, testable
// implementation can reasonably promise.
const NAME_FIELD_PRIORITY = ['product_name', 'product_name_en', 'generic_name', 'generic_name_en']

export function extractProductName(product = {}) {
  for (const field of NAME_FIELD_PRIORITY) {
    const value = product[field]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

function toFiniteOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function round2(n) {
  return Math.round(n * 100) / 100
}
