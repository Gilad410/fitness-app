import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateBarcodeNutrition } from './barcodeCalculation.js'

test('calculateBarcodeNutrition: applies calories_per_100g * grams / 100 exactly', () => {
  const { calories } = calculateBarcodeNutrition({ caloriesPer100g: 250, proteinPer100g: 10, grams: 40 })
  assert.equal(calories, 100) // 250 * 40 / 100
})

test('calculateBarcodeNutrition: applies protein_per_100g * grams / 100 exactly', () => {
  const { protein } = calculateBarcodeNutrition({ caloriesPer100g: 250, proteinPer100g: 12.5, grams: 40 })
  assert.equal(protein, 5) // 12.5 * 40 / 100
})

test('calculateBarcodeNutrition: rounds to 1 decimal place, matching the server-side trigger', () => {
  const { calories, protein } = calculateBarcodeNutrition({ caloriesPer100g: 233, proteinPer100g: 7.3, grams: 33 })
  assert.equal(calories, 76.9) // 76.89 -> 76.9
  assert.equal(protein, 2.4) // 2.409 -> 2.4
})

test('calculateBarcodeNutrition: 100g is a pure passthrough of the per-100g values (rounded)', () => {
  const { calories, protein } = calculateBarcodeNutrition({ caloriesPer100g: 123.45, proteinPer100g: 6.78, grams: 100 })
  assert.equal(calories, 123.5)
  assert.equal(protein, 6.8)
})

test('calculateBarcodeNutrition: null protein stays null, never coerced to 0', () => {
  const { calories, protein } = calculateBarcodeNutrition({ caloriesPer100g: 250, proteinPer100g: null, grams: 40 })
  assert.equal(calories, 100)
  assert.equal(protein, null)
})

test('calculateBarcodeNutrition: throws on a non-finite/negative caloriesPer100g', () => {
  assert.throws(() => calculateBarcodeNutrition({ caloriesPer100g: -5, proteinPer100g: 1, grams: 40 }), /caloriesPer100g/)
  assert.throws(() => calculateBarcodeNutrition({ caloriesPer100g: NaN, proteinPer100g: 1, grams: 40 }), /caloriesPer100g/)
})

test('calculateBarcodeNutrition: throws on a negative proteinPer100g (but not on null)', () => {
  assert.throws(() => calculateBarcodeNutrition({ caloriesPer100g: 100, proteinPer100g: -1, grams: 40 }), /proteinPer100g/)
})

test('calculateBarcodeNutrition: throws on zero or negative grams', () => {
  assert.throws(() => calculateBarcodeNutrition({ caloriesPer100g: 100, proteinPer100g: 1, grams: 0 }), /grams/)
  assert.throws(() => calculateBarcodeNutrition({ caloriesPer100g: 100, proteinPer100g: 1, grams: -10 }), /grams/)
})

test('calculateBarcodeNutrition: throws on non-numeric grams (e.g. an unparsed form input)', () => {
  assert.throws(() => calculateBarcodeNutrition({ caloriesPer100g: 100, proteinPer100g: 1, grams: NaN }), /grams/)
})
