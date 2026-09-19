import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractCaloriesPer100g, extractProteinPer100g, extractProductName } from './barcodeNutrientExtraction.js'

// ---------------------------------------------------------------------
// Calories
// ---------------------------------------------------------------------

test('extractCaloriesPer100g: reads energy-kcal_100g directly when present', () => {
  assert.equal(extractCaloriesPer100g({ 'energy-kcal_100g': 375 }), 375)
})

test('extractCaloriesPer100g: converts energy_100g (kJ) to kcal when the kcal field is absent -- real unit conversion, not invented', () => {
  // 1569 kJ/100g is a real Milka-chocolate-range value; 1569 / 4.184 = 375.0
  assert.equal(extractCaloriesPer100g({ energy_100g: 1569 }), 375)
})

test('extractCaloriesPer100g: prefers the direct kcal field over the kJ field when both are present', () => {
  assert.equal(extractCaloriesPer100g({ 'energy-kcal_100g': 375, energy_100g: 9999 }), 375)
})

test('extractCaloriesPer100g: scales energy-kcal_serving to per-100g using a real serving_quantity', () => {
  // 100 kcal per 25g serving -> 400 kcal/100g
  assert.equal(extractCaloriesPer100g({ 'energy-kcal_serving': 100 }, 25), 400)
})

test('extractCaloriesPer100g: scales energy_serving (kJ) to per-100g via kJ->kcal conversion, using a real serving_quantity', () => {
  // 418.4 kJ per 50g serving -> 100 kcal per 50g -> 200 kcal/100g
  assert.equal(extractCaloriesPer100g({ energy_serving: 418.4 }, 50), 200)
})

test('extractCaloriesPer100g: ignores per-serving fields when serving_quantity is missing (cannot scale without it, does not guess)', () => {
  assert.equal(extractCaloriesPer100g({ 'energy-kcal_serving': 100 }, null), null)
})

test('extractCaloriesPer100g: ignores per-serving fields when serving_quantity is zero or negative (nonsensical, does not divide by it)', () => {
  assert.equal(extractCaloriesPer100g({ 'energy-kcal_serving': 100 }, 0), null)
  assert.equal(extractCaloriesPer100g({ 'energy-kcal_serving': 100 }, -5), null)
})

test('extractCaloriesPer100g: returns null when genuinely nothing is available anywhere -- never invents a value', () => {
  assert.equal(extractCaloriesPer100g({}, null), null)
  assert.equal(extractCaloriesPer100g({ carbohydrates_100g: 40 }, null), null)
})

test('extractCaloriesPer100g: defaults nutriments to {} and serving quantity to null when omitted', () => {
  assert.equal(extractCaloriesPer100g(), null)
})

// ---------------------------------------------------------------------
// Protein
// ---------------------------------------------------------------------

test('extractProteinPer100g: reads proteins_100g directly when present', () => {
  assert.equal(extractProteinPer100g({ proteins_100g: 8.2 }), 8.2)
})

test('extractProteinPer100g: scales proteins_serving to per-100g using a real serving_quantity', () => {
  // 2g protein per 25g serving -> 8 g/100g
  assert.equal(extractProteinPer100g({ proteins_serving: 2 }, 25), 8)
})

test('extractProteinPer100g: ignores proteins_serving when serving_quantity is missing', () => {
  assert.equal(extractProteinPer100g({ proteins_serving: 2 }, null), null)
})

test('extractProteinPer100g: returns null when genuinely nothing is available -- never invents a value', () => {
  assert.equal(extractProteinPer100g({}, 25), null)
})

// ---------------------------------------------------------------------
// Product name
// ---------------------------------------------------------------------

test('extractProductName: prefers product_name when present', () => {
  assert.equal(extractProductName({ product_name: 'Milka Alpenmilch', product_name_en: 'Milka Alpine Milk' }), 'Milka Alpenmilch')
})

test('extractProductName: falls back to product_name_en when product_name is empty/whitespace', () => {
  assert.equal(extractProductName({ product_name: '  ', product_name_en: 'Milka Alpine Milk' }), 'Milka Alpine Milk')
})

test('extractProductName: falls back to generic_name, then generic_name_en, in priority order', () => {
  assert.equal(extractProductName({ generic_name: 'Milk chocolate' }), 'Milk chocolate')
  assert.equal(extractProductName({ generic_name_en: 'Milk chocolate (en)' }), 'Milk chocolate (en)')
})

test('extractProductName: returns null when no name field has a usable value anywhere', () => {
  assert.equal(extractProductName({}), null)
  assert.equal(extractProductName({ product_name: '', product_name_en: null }), null)
})

test('extractProductName: trims whitespace from whichever field is used', () => {
  assert.equal(extractProductName({ product_name: '  Milka  ' }), 'Milka')
})
