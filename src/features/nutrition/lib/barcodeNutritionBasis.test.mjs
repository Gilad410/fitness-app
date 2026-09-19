import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASIS_AS_SOLD,
  BASIS_PREPARED,
  BASIS_COOKED_PACKAGE,
  BASIS_LABELS,
  PREFERENCE_ACTION_USE_SAVED,
  PREFERENCE_ACTION_USE_AS_SOLD,
  PREFERENCE_ACTION_EDIT_PACKAGE,
  hasDistinctPreparedBasis,
  nutritionForBasis,
  initialBasisFor,
  needsManualCookedPackageEntry,
  nutritionBasisForPreferenceAction,
  cookedPackageFieldsFromPreference,
  productNameWithBasis,
} from './barcodeNutritionBasis.js'
import { isManualNutritionValid, parseManualNutrition } from './manualNutritionEntry.js'

// ---------------------------------------------------------------------
// hasDistinctPreparedBasis / initialBasisFor -- deciding whether a real
// choice is even meaningful for this product, using ONLY data Open Food
// Facts actually returned.
// ---------------------------------------------------------------------

test('hasDistinctPreparedBasis: false when Open Food Facts has no prepared-basis calories at all -- the real, common case for plain dry pasta (verified against several real barcodes)', () => {
  const dryPastaProduct = { caloriesPer100g: 360, proteinPer100g: 12, preparedCaloriesPer100g: null, preparedProteinPer100g: null }
  assert.equal(hasDistinctPreparedBasis(dryPastaProduct), false)
})

test('hasDistinctPreparedBasis: false when ONLY prepared data exists (no as-sold figure) -- the real barcode 8852018101024 shape (instant noodles: prepared 76 kcal/100g, no as-sold figure at all) -- one real number is not a "choice"', () => {
  const instantNoodleProduct = { caloriesPer100g: null, proteinPer100g: null, preparedCaloriesPer100g: 76, preparedProteinPer100g: 1.3 }
  assert.equal(hasDistinctPreparedBasis(instantNoodleProduct), false)
})

test('hasDistinctPreparedBasis: true only when BOTH a real as-sold AND a real prepared calories figure exist -- two real, different numbers to choose between', () => {
  const bothBasesProduct = { caloriesPer100g: 360, preparedCaloriesPer100g: 150 }
  assert.equal(hasDistinctPreparedBasis(bothBasesProduct), true)
})

test('initialBasisFor: auto-resolves to as_sold when there is no real second number to choose between -- never forces a pointless choice', () => {
  const dryPastaProduct = { caloriesPer100g: 360, preparedCaloriesPer100g: null }
  assert.equal(initialBasisFor(dryPastaProduct), BASIS_AS_SOLD)
})

test('initialBasisFor: auto-resolves to prepared when ONLY prepared data exists -- the real barcode 8852018101024 shape -- again, one real option, no pointless choice forced', () => {
  const instantNoodleProduct = { caloriesPer100g: null, preparedCaloriesPer100g: 76 }
  assert.equal(initialBasisFor(instantNoodleProduct), BASIS_PREPARED)
})

test('initialBasisFor: returns null (forcing an explicit choice) only when BOTH a real as-sold AND a real prepared figure exist', () => {
  const bothBasesProduct = { caloriesPer100g: 360, preparedCaloriesPer100g: 150 }
  assert.equal(initialBasisFor(bothBasesProduct), null)
})

// ---------------------------------------------------------------------
// nutritionForBasis -- never converts, only selects between real
// extracted numbers; an unmade or invalid choice resolves to null,
// never a guess.
// ---------------------------------------------------------------------

test('nutritionForBasis: BASIS_AS_SOLD selects the as-sold figures unchanged', () => {
  const product = { caloriesPer100g: 360, proteinPer100g: 12, preparedCaloriesPer100g: 150, preparedProteinPer100g: 5 }
  assert.deepEqual(nutritionForBasis(product, BASIS_AS_SOLD), { caloriesPer100g: 360, proteinPer100g: 12 })
})

test('nutritionForBasis: BASIS_PREPARED selects the prepared figures unchanged -- never a computed dry-to-cooked ratio', () => {
  const product = { caloriesPer100g: 360, proteinPer100g: 12, preparedCaloriesPer100g: 150, preparedProteinPer100g: 5 }
  assert.deepEqual(nutritionForBasis(product, BASIS_PREPARED), { caloriesPer100g: 150, proteinPer100g: 5 })
})

test('nutritionForBasis: no basis chosen (null) resolves to null calories/protein -- blocks the save rather than defaulting to either real option', () => {
  const product = { caloriesPer100g: 360, proteinPer100g: 12, preparedCaloriesPer100g: 150, preparedProteinPer100g: 5 }
  assert.deepEqual(nutritionForBasis(product, null), { caloriesPer100g: null, proteinPer100g: null })
})

test('nutritionForBasis: an unrecognized basis value also resolves to null, never silently falling back to as_sold', () => {
  const product = { caloriesPer100g: 360, proteinPer100g: 12 }
  assert.deepEqual(nutritionForBasis(product, 'not_a_real_basis'), { caloriesPer100g: null, proteinPer100g: null })
})

test('nutritionForBasis: BASIS_PREPARED chosen but Open Food Facts has no prepared protein figure resolves protein to null, not 0 or the as-sold value', () => {
  const product = { caloriesPer100g: 360, proteinPer100g: 12, preparedCaloriesPer100g: 150, preparedProteinPer100g: null }
  assert.deepEqual(nutritionForBasis(product, BASIS_PREPARED), { caloriesPer100g: 150, proteinPer100g: null })
})

// ---------------------------------------------------------------------
// productNameWithBasis -- "the saved item must show the chosen basis."
// ---------------------------------------------------------------------

test('productNameWithBasis: appends the Hebrew as-sold label', () => {
  assert.equal(productNameWithBasis('Penne Rigate', BASIS_AS_SOLD), 'Penne Rigate (כפי שנמכר / יבש)')
})

test('productNameWithBasis: appends the Hebrew prepared label', () => {
  assert.equal(productNameWithBasis('Yum Yum Chicken Flavour', BASIS_PREPARED), 'Yum Yum Chicken Flavour (לאחר הכנה / מבושל)')
})

test('productNameWithBasis: an unrecognized basis leaves the name unchanged rather than appending a broken label', () => {
  assert.equal(productNameWithBasis('Penne Rigate', null), 'Penne Rigate')
  assert.equal(productNameWithBasis('Penne Rigate', 'nonsense'), 'Penne Rigate')
})

test('every basis value has exactly one Hebrew label, and the two are distinct', () => {
  assert.equal(typeof BASIS_LABELS[BASIS_AS_SOLD], 'string')
  assert.equal(typeof BASIS_LABELS[BASIS_PREPARED], 'string')
  assert.notEqual(BASIS_LABELS[BASIS_AS_SOLD], BASIS_LABELS[BASIS_PREPARED])
})

// ---------------------------------------------------------------------
// SCENARIO: the exact reported pasta bug, end to end at this module's
// boundary -- dry pasta with no prepared data must never be silently
// treated as if 200g of it were cooked pasta.
// ---------------------------------------------------------------------

test('SCENARIO: dry pasta (no prepared data) -- basis auto-resolves to as_sold, is labeled as such, and the real dry-basis calories are used for whatever grams were entered (no conversion attempted)', () => {
  // Representative dry-pasta-range figures (per 100g dry) -- Open Food
  // Facts pasta products checked live during this investigation exposed
  // only this as-sold shape, no `_prepared` fields.
  const dryPastaProduct = { name: 'Penne Rigate', caloriesPer100g: 360, proteinPer100g: 12, preparedCaloriesPer100g: null, preparedProteinPer100g: null }

  const basis = initialBasisFor(dryPastaProduct)
  assert.equal(basis, BASIS_AS_SOLD, 'no real prepared data exists, so this must auto-resolve rather than block on a pointless choice')

  const { caloriesPer100g, proteinPer100g } = nutritionForBasis(dryPastaProduct, basis)
  assert.equal(caloriesPer100g, 360)
  assert.equal(proteinPer100g, 12)

  const savedName = productNameWithBasis(dryPastaProduct.name, basis)
  assert.equal(savedName, 'Penne Rigate (כפי שנמכר / יבש)', 'the saved item must show it is on a dry/as-sold basis, since that is the only real data available')
})

test('SCENARIO: a product with ONLY real prepared data (the verified barcode 8852018101024 shape, "Yum Yum Chicken Flavour") -- auto-resolves to prepared (the one real number), labeled as such, no pointless choice forced', () => {
  const instantNoodleProduct = {
    name: 'Yum Yum Chicken Flavour',
    caloriesPer100g: null,
    proteinPer100g: null,
    preparedCaloriesPer100g: 76,
    preparedProteinPer100g: 1.3,
  }

  const basis = initialBasisFor(instantNoodleProduct)
  assert.equal(basis, BASIS_PREPARED, 'only one real number exists (prepared) -- must auto-resolve, not block on a choice with no real alternative')

  const resolved = nutritionForBasis(instantNoodleProduct, basis)
  assert.equal(resolved.caloriesPer100g, 76)
  assert.equal(resolved.proteinPer100g, 1.3)
  assert.equal(productNameWithBasis(instantNoodleProduct.name, basis), 'Yum Yum Chicken Flavour (לאחר הכנה / מבושל)')
})

test('SCENARIO: a product with BOTH real as-sold AND real prepared data -- a genuine choice exists; the save is blocked until it is made, and each option resolves to its own real (never converted) figures', () => {
  const bothBasesProduct = {
    name: 'Instant Rice',
    caloriesPer100g: 360,
    proteinPer100g: 7,
    preparedCaloriesPer100g: 130,
    preparedProteinPer100g: 2.5,
  }

  assert.equal(initialBasisFor(bothBasesProduct), null, 'two real, different numbers exist -- must require an explicit choice')

  const unchosen = nutritionForBasis(bothBasesProduct, null)
  assert.equal(unchosen.caloriesPer100g, null, 'before a choice is made, there must be nothing to calculate a preview or save from')

  const asSold = nutritionForBasis(bothBasesProduct, BASIS_AS_SOLD)
  assert.equal(asSold.caloriesPer100g, 360)
  assert.equal(productNameWithBasis(bothBasesProduct.name, BASIS_AS_SOLD), 'Instant Rice (כפי שנמכר / יבש)')

  const prepared = nutritionForBasis(bothBasesProduct, BASIS_PREPARED)
  assert.equal(prepared.caloriesPer100g, 130)
  assert.equal(productNameWithBasis(bothBasesProduct.name, BASIS_PREPARED), 'Instant Rice (לאחר הכנה / מבושל)')
})

// ---------------------------------------------------------------------
// "מבושל לפי האריזה" (cooked, per package) -- the correction to the
// earlier design: a barcode product must stay tied to its OWN package
// data, never a generic or branded-mismatched catalog entry (an Osem
// pasta's real cooked figures can differ from a generic USDA "cooked
// pasta" row). These values are NEVER auto-filled or looked up --
// needsManualCookedPackageEntry only decides whether the option is
// OFFERED; the actual numbers always come from
// isManualNutritionValid/parseManualNutrition (manualNutritionEntry.js)
// with requireProtein: true, i.e. from what the coach/trainee typed.
// ---------------------------------------------------------------------

// 1. Branded pasta with OFF dry data only.
test('needsManualCookedPackageEntry: true for branded pasta with only as-sold (dry) Open Food Facts data -- the real, common shape confirmed live for plain dry pasta, and equally true for a specific branded product like an Osem pasta', () => {
  const osemPastaAsSoldOnly = { caloriesPer100g: 371, proteinPer100g: 13, preparedCaloriesPer100g: null, preparedProteinPer100g: null }
  assert.equal(needsManualCookedPackageEntry(osemPastaAsSoldOnly), true)
})

test('needsManualCookedPackageEntry: false when Open Food Facts already provides real prepared-basis data -- a manual re-entry is never offered when a real OFF number already exists', () => {
  const productWithRealPreparedData = { caloriesPer100g: 371, preparedCaloriesPer100g: 130 }
  assert.equal(needsManualCookedPackageEntry(productWithRealPreparedData), false)
})

// 2. Manual cooked package values such as 158 kcal/100g -- the exact
// example given: the app must use precisely what was typed, never a
// converted or generic substitute.
test('SCENARIO: Osem pasta, OFF dry data only -- coach/trainee types the package\'s real cooked values (158 kcal/100g, 5.8g protein/100g) -- those EXACT figures are what resolve, never the OFF dry figures and never any generic/converted number', () => {
  const osemPastaAsSoldOnly = { name: 'Osem Pasta No.5', caloriesPer100g: 371, proteinPer100g: 13, preparedCaloriesPer100g: null, preparedProteinPer100g: null }
  assert.equal(needsManualCookedPackageEntry(osemPastaAsSoldOnly), true)

  const cookedPackageRaw = { caloriesRaw: '158', proteinRaw: '5.8' }
  assert.equal(isManualNutritionValid({ ...cookedPackageRaw, requireProtein: true }), true)

  const resolved = parseManualNutrition(cookedPackageRaw)
  assert.equal(resolved.caloriesPer100g, 158, 'must be exactly the typed package figure, not the OFF dry value (371) and not any converted/generic number')
  assert.equal(resolved.proteinPer100g, 5.8)

  // 4. The saved log shows the product name and the selected package basis.
  const savedName = productNameWithBasis(osemPastaAsSoldOnly.name, BASIS_COOKED_PACKAGE)
  assert.equal(savedName, 'Osem Pasta No.5 (מבושל לפי האריזה)')
})

// 3. Cooked protein is required.
test('REGRESSION: cooked-per-package protein is required -- typing only the package calories (158) without protein must not resolve to a usable/savable result', () => {
  const caloriesOnly = { caloriesRaw: '158', proteinRaw: '' }
  assert.equal(isManualNutritionValid({ ...caloriesOnly, requireProtein: true }), false, 'must be blocked -- protein is required for the cooked-per-package basis, never left as "unknown"')
})

// 4. The saved log shows the product name and the selected package basis
// (BASIS_LABELS coverage, standalone from the SCENARIO test above).
test('BASIS_COOKED_PACKAGE has its own distinct Hebrew label, different from both other bases', () => {
  assert.equal(BASIS_LABELS[BASIS_COOKED_PACKAGE], 'מבושל לפי האריזה')
  assert.notEqual(BASIS_LABELS[BASIS_COOKED_PACKAGE], BASIS_LABELS[BASIS_AS_SOLD])
  assert.notEqual(BASIS_LABELS[BASIS_COOKED_PACKAGE], BASIS_LABELS[BASIS_PREPARED])
})

test('nutritionForBasis: BASIS_COOKED_PACKAGE is not one of the two bases this function resolves from product data -- it deliberately falls through to null, since cooked-per-package values live only in the caller\'s own manual-entry state (BarcodeFoodEntry.vue\'s cookedPackageCalories/cookedPackageProtein refs), never in the product object itself', () => {
  const product = { caloriesPer100g: 371, proteinPer100g: 13 }
  assert.deepEqual(nutritionForBasis(product, BASIS_COOKED_PACKAGE), { caloriesPer100g: null, proteinPer100g: null })
})

// ---------------------------------------------------------------------
// Persistent per-user preference: nutritionBasisForPreferenceAction /
// cookedPackageFieldsFromPreference -- the repeat-scan confirmation
// ("Use saved cooked/package values" / "Use dry/as-sold values" /
// "Edit package values"), always shown when a preference row exists,
// never a silent default even for a saved as_sold choice.
// ---------------------------------------------------------------------

test('nutritionBasisForPreferenceAction: "use saved" resolves to whatever basis the saved preference actually holds -- cooked_package', () => {
  const savedCooked = { basis: BASIS_COOKED_PACKAGE, cooked_calories_per_100g: 158, cooked_protein_per_100g: 5.8 }
  assert.equal(nutritionBasisForPreferenceAction(PREFERENCE_ACTION_USE_SAVED, savedCooked), BASIS_COOKED_PACKAGE)
})

test('nutritionBasisForPreferenceAction: "use saved" resolves to as_sold when the saved preference was as_sold', () => {
  const savedAsSold = { basis: BASIS_AS_SOLD, cooked_calories_per_100g: null, cooked_protein_per_100g: null }
  assert.equal(nutritionBasisForPreferenceAction(PREFERENCE_ACTION_USE_SAVED, savedAsSold), BASIS_AS_SOLD)
})

test('nutritionBasisForPreferenceAction: "use dry/as-sold" always resolves to as_sold, regardless of what was saved -- the user can always override a saved cooked preference', () => {
  const savedCooked = { basis: BASIS_COOKED_PACKAGE, cooked_calories_per_100g: 158, cooked_protein_per_100g: 5.8 }
  assert.equal(nutritionBasisForPreferenceAction(PREFERENCE_ACTION_USE_AS_SOLD, savedCooked), BASIS_AS_SOLD)
})

test('nutritionBasisForPreferenceAction: "edit package values" always resolves to cooked_package, regardless of what was saved -- lets a user switch INTO editing cooked values even if as_sold was saved last', () => {
  const savedAsSold = { basis: BASIS_AS_SOLD, cooked_calories_per_100g: null, cooked_protein_per_100g: null }
  assert.equal(nutritionBasisForPreferenceAction(PREFERENCE_ACTION_EDIT_PACKAGE, savedAsSold), BASIS_COOKED_PACKAGE)
})

test('nutritionBasisForPreferenceAction: an unrecognized action resolves to null, never a silent default', () => {
  const savedCooked = { basis: BASIS_COOKED_PACKAGE, cooked_calories_per_100g: 158, cooked_protein_per_100g: 5.8 }
  assert.equal(nutritionBasisForPreferenceAction('not_a_real_action', savedCooked), null)
})

test('cookedPackageFieldsFromPreference: converts a saved cooked_package row\'s real numbers (158 kcal/100g, 5.8g protein) to strings for pre-filling the form, exactly as saved -- no retyping needed', () => {
  const savedCooked = { basis: BASIS_COOKED_PACKAGE, cooked_calories_per_100g: 158, cooked_protein_per_100g: 5.8 }
  assert.deepEqual(cookedPackageFieldsFromPreference(savedCooked), { caloriesRaw: '158', proteinRaw: '5.8' })
})

test('cookedPackageFieldsFromPreference: an as_sold preference (no cooked figures to pre-fill) resolves to empty strings, not "null" text or 0', () => {
  const savedAsSold = { basis: BASIS_AS_SOLD, cooked_calories_per_100g: null, cooked_protein_per_100g: null }
  assert.deepEqual(cookedPackageFieldsFromPreference(savedAsSold), { caloriesRaw: '', proteinRaw: '' })
})

test('cookedPackageFieldsFromPreference: no saved preference at all resolves to empty strings, does not throw', () => {
  assert.deepEqual(cookedPackageFieldsFromPreference(null), { caloriesRaw: '', proteinRaw: '' })
  assert.deepEqual(cookedPackageFieldsFromPreference(undefined), { caloriesRaw: '', proteinRaw: '' })
})

// SCENARIO: the exact reported correction, end to end -- a saved
// as_sold preference does NOT silently apply; the coach/trainee can
// still choose "edit package values" and the confirmation always shows
// all three real options.
test('SCENARIO: Osem pasta, a saved as_sold preference from last time -- the repeat scan still offers "edit package values", and choosing it starts from a real, empty (never guessed) cooked-entry form', () => {
  const savedAsSold = { basis: BASIS_AS_SOLD, cooked_calories_per_100g: null, cooked_protein_per_100g: null }

  const resultingBasis = nutritionBasisForPreferenceAction(PREFERENCE_ACTION_EDIT_PACKAGE, savedAsSold)
  assert.equal(resultingBasis, BASIS_COOKED_PACKAGE)

  const prefilled = cookedPackageFieldsFromPreference(savedAsSold)
  assert.deepEqual(prefilled, { caloriesRaw: '', proteinRaw: '' }, 'nothing to pre-fill from an as_sold preference -- the coach/trainee types real package values fresh, never a guess')
})

// SCENARIO: a saved cooked_package preference from last time -- "use
// saved" reuses the exact typed figures with zero retyping.
test('SCENARIO: Osem pasta, a saved cooked_package preference (158 kcal/100g, 5.8g protein) from last time -- "use saved" resolves to the exact same figures, pre-filled, no retyping', () => {
  const savedCooked = { basis: BASIS_COOKED_PACKAGE, cooked_calories_per_100g: 158, cooked_protein_per_100g: 5.8 }

  const resultingBasis = nutritionBasisForPreferenceAction(PREFERENCE_ACTION_USE_SAVED, savedCooked)
  assert.equal(resultingBasis, BASIS_COOKED_PACKAGE)

  const prefilled = cookedPackageFieldsFromPreference(savedCooked)
  assert.deepEqual(prefilled, { caloriesRaw: '158', proteinRaw: '5.8' })
})
