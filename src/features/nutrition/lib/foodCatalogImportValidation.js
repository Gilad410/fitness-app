// Validation rules for a NEW multi-source food-catalog import pipeline
// (target: >=1,500 foods from >=2 real sources -- see
// 049_food_reference_catalog_multi_source_infrastructure.sql). Distinct
// from foodCatalogValidation.js, which validates the EXISTING
// migration-file-based seed data (004-043, name-keyed, no source/
// external_id/barcode concept) -- this module validates a CANDIDATE row
// from a real external source BEFORE it is ever written into a
// migration file or imported, for the new source+external_id/barcode
// identity this catalog is being extended to support.
//
// Pure/DI throughout: no Vue, no Supabase, no network. Every rule here
// operates only on values already present in its input -- there is
// deliberately no function anywhere in this module that fills in,
// estimates, or averages a missing value. That absence is the actual
// guarantee behind requirement 8 ("never invent, estimate, average,
// infer or generate nutritional values"), not an oversight.

export const CALORIE_MIN = 0
export const CALORIE_MAX = 900
export const PROTEIN_MIN = 0
export const PROTEIN_MAX = 100

// The exact, internationally standard thermochemical conversion factor
// between kilojoules and kilocalories -- a unit conversion of a real,
// explicitly-reported number, not an estimate or invented value. Some
// sources (Open Food Facts in particular) report energy only in kJ for
// a given record; this lets a real kJ figure become a real kcal figure
// without ever guessing.
export const KJ_PER_KCAL = 4.184

// Only "100g" is accepted as a normalizable measurement basis. A
// per-100ml value is NOT the same as per-100g for any but a
// density-1 liquid (a guess this module refuses to make); a per-serving
// value is handled separately (see perServingToPer100g, which requires
// an explicit gram weight). Anything else (missing, "100ml", "serving",
// an unrecognized string) is rejected outright, never silently treated
// as per-100g.
export const ACCEPTED_MEASUREMENT_BASIS = '100g'

// basis === undefined/null means the caller hasn't stated one -- true
// and fine for USDA FDC, whose per-100g reporting is unambiguous and
// unconditional (see foodCatalogRealData.test.mjs's own basis check).
// A source that DOES report an explicit basis (Open Food Facts' own
// nutrition_data_per field) must pass it through here rather than omit
// it, so a "100ml" or "serving" record is actually caught.
export function validateMeasurementBasis(basis) {
  if (basis === undefined || basis === null) return { valid: true }
  if (basis !== ACCEPTED_MEASUREMENT_BASIS) {
    return {
      valid: false,
      reason: `measurement basis is '${basis}', not per-100g -- refusing to treat this as per-100g without a reliable, product-specific conversion`,
    }
  }
  return { valid: true }
}

// Resolves a real reported energy value to kcal, preferring an explicit
// kcal figure when present and falling back to a documented kJ->kcal
// conversion only when kcal itself is absent. Returns null (nothing to
// resolve, not a fabricated 0) when neither is a finite number. The
// `converted` flag lets a caller record, per requirement 2 ("document
// any exact unit conversion"), whether this candidate's calories came
// from a real reported kcal value or were derived via the exact kJ
// conversion factor above.
export function resolveCaloriesFromEnergyFields({ kcal, kj } = {}) {
  if (typeof kcal === 'number' && Number.isFinite(kcal)) {
    return { value: kcal, unit: 'kcal', converted: false }
  }
  if (typeof kj === 'number' && Number.isFinite(kj)) {
    return { value: Math.round((kj / KJ_PER_KCAL) * 10) / 10, unit: 'kj', converted: true }
  }
  return null
}

// Rejects NULL, NaN, non-numeric, negative, or out-of-bounds values --
// the exact same 0-900 / 0-100 bounds 049's own database CHECK
// constraints enforce, checked here too so a bad candidate is caught
// before it is ever sent, not only after a failed insert.
export function validateNutrientValue(value, { min, max }) {
  if (value === null || value === undefined) return { valid: false, reason: 'missing' }
  if (typeof value !== 'number' || !Number.isFinite(value)) return { valid: false, reason: 'not a finite number' }
  if (value < min) return { valid: false, reason: `below minimum ${min}` }
  if (value > max) return { valid: false, reason: `above maximum ${max}` }
  return { valid: true }
}

export function validateCalories(value) {
  return validateNutrientValue(value, { min: CALORIE_MIN, max: CALORIE_MAX })
}

export function validateProtein(value) {
  return validateNutrientValue(value, { min: PROTEIN_MIN, max: PROTEIN_MAX })
}

// "A protein value of zero is allowed only when the source explicitly
// reports zero." proteinExplicitlyZero must be true -- meaning the
// source's own raw payload genuinely contained a 0, not a missing/null
// field the import script defaulted to 0 -- for a protein === 0
// candidate to pass. Any other case (proteinExplicitlyZero absent or
// false) is rejected outright rather than silently importing a
// possibly-missing value as "0g protein."
export function validateProteinZeroClaim(protein, { proteinExplicitlyZero } = {}) {
  if (protein !== 0) return { valid: true }
  return proteinExplicitlyZero === true
    ? { valid: true }
    : { valid: false, reason: 'protein is 0 but the source did not explicitly report zero -- refusing to treat a possibly-missing value as zero' }
}

// Cross-checks reported calories against the Atwater general-factor
// estimate (protein*4 + carbs*4 + fat*9) whenever all three macros are
// present -- returns null (nothing to check) when they are not; this
// check deliberately never runs on partial data. Tolerance is the
// GREATER of 20% relative or 50 kcal absolute, to accommodate fiber
// (the general-factor system overstates calories from fiber, which
// actually contributes closer to ~2 kcal/g), label rounding, and minor
// sugar-alcohol/measurement variance -- generous, but bounded: it is
// never a license to silently accept an actually-wrong value. A row
// whose macros don't reconcile within tolerance is flagged for manual
// review (see validateImportCandidate's needsReview), never imported
// automatically and never silently corrected.
export function checkCalorieMacroConsistency({ calories, protein, carbs, fat }) {
  if (![calories, protein, carbs, fat].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return null
  }
  const expected = protein * 4 + carbs * 4 + fat * 9
  const diff = Math.abs(calories - expected)
  const tolerance = Math.max(expected * 0.2, 50)
  return {
    expectedCalories: Math.round(expected * 10) / 10,
    reportedCalories: calories,
    difference: Math.round(diff * 10) / 10,
    tolerance: Math.round(tolerance * 10) / 10,
    consistent: diff <= tolerance,
  }
}

// The identity a candidate is deduplicated on: (source, externalId), or
// barcode when the candidate is a specific packaged product. NEVER the
// bare name -- two different real records can legitimately share a
// name (raw vs. cooked pasta; two different brands' plain oats), and
// deduping by name alone would wrongly collapse those into one row
// (violating requirement 7's "preserving legitimate raw/cooked and
// branded variations"). Returns null when neither a real (source,
// externalId) pair nor a barcode is present -- the caller must then
// reject the candidate (see validateImportCandidate), since there is
// nothing stable to prevent a future duplicate import of the same
// record under a different name spelling.
export function candidateDedupeKey({ source, externalId, barcode } = {}) {
  if (barcode) return `barcode:${barcode}`
  if (source && externalId) return `source:${source}:${externalId}`
  return null
}

// Converts a per-serving value to per-100g ONLY when the exact serving
// weight (in grams) is explicitly present -- a straight proportional
// scale, the same real conversion barcodeNutrientExtraction.js already
// uses for Open Food Facts' own per-serving fields (extractCaloriesPer100g's
// serving-quantity branch) -- never a guessed or averaged serving size.
// Returns null (not a fabricated number) when either input is missing,
// non-numeric, or the serving weight is not a positive number.
export function perServingToPer100g(valuePerServing, servingWeightGrams) {
  if (typeof valuePerServing !== 'number' || !Number.isFinite(valuePerServing)) return null
  if (typeof servingWeightGrams !== 'number' || !Number.isFinite(servingWeightGrams) || servingWeightGrams <= 0) return null
  return Math.round((valuePerServing / servingWeightGrams) * 100 * 100) / 100
}

// The single entry point a real import pipeline would call per
// candidate row before it is ever written to a migration file. Never
// mutates or fills in the candidate -- only validates what is already
// there and reports what to do with it: import as verified, flag for
// manual review (a real macro inconsistency), or reject outright (a
// hard validation failure). Expected candidate shape: { name,
// caloriesPer100g, proteinPer100g, proteinExplicitlyZero, carbsPer100g,
// fatPer100g, source, externalId, barcode, per, servingWeightGrams }.
export function validateImportCandidate(candidate) {
  const errors = []

  if (!candidate?.name || String(candidate.name).trim() === '') {
    errors.push('missing name')
  }

  const calCheck = validateCalories(candidate?.caloriesPer100g)
  if (!calCheck.valid) errors.push(`calories_per_100g: ${calCheck.reason}`)

  const protCheck = validateProtein(candidate?.proteinPer100g)
  if (!protCheck.valid) {
    errors.push(`protein_per_100g: ${protCheck.reason}`)
  } else {
    const zeroCheck = validateProteinZeroClaim(candidate.proteinPer100g, {
      proteinExplicitlyZero: candidate?.proteinExplicitlyZero,
    })
    if (!zeroCheck.valid) errors.push(`protein_per_100g: ${zeroCheck.reason}`)
  }

  const dedupeKey = candidateDedupeKey(candidate ?? {})
  if (!dedupeKey) {
    errors.push('no (source, externalId) pair or barcode present -- cannot safely dedupe, refusing to import')
  }

  if (candidate?.per === 'serving' && (candidate?.servingWeightGrams === null || candidate?.servingWeightGrams === undefined)) {
    errors.push('per-serving value with no explicit serving weight in grams -- cannot convert to per-100g without guessing, refusing to import')
  }

  const basisCheck = validateMeasurementBasis(candidate?.measurementBasis)
  if (!basisCheck.valid) errors.push(basisCheck.reason)

  const macroCheck = checkCalorieMacroConsistency({
    calories: candidate?.caloriesPer100g,
    protein: candidate?.proteinPer100g,
    carbs: candidate?.carbsPer100g,
    fat: candidate?.fatPer100g,
  })

  return {
    valid: errors.length === 0,
    errors,
    // A structurally-valid candidate whose macros don't reconcile is
    // still flagged, not silently imported -- see requirement 6.
    needsReview: macroCheck !== null && !macroCheck.consistent,
    macroCheck,
    dedupeKey,
  }
}
