import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASIS_AS_SOLD,
  BASIS_PREPARED,
  BASIS_LABELS,
  hasDistinctPreparedBasis,
  nutritionForBasis,
  initialBasisFor,
  productNameWithBasis,
} from './barcodeNutritionBasis.js'

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
