import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateRecipe, LABEL } from './recipeCalculator.js'

const ING_A = { name: 'A', weightFraction: 0.5, caloriesPer100g: 100, proteinPer100g: 10, sourceId: '1', sourceName: 'USDA FoodData Central -- A' }
const ING_B = { name: 'B', weightFraction: 0.5, caloriesPer100g: 200, proteinPer100g: 20, sourceId: '2', sourceName: 'USDA FoodData Central -- B' }

test('calculateRecipe: a 50/50 mix with yieldFraction 1 is a plain weighted average', () => {
  const result = calculateRecipe({ name: 'Test Mix', ingredients: [ING_A, ING_B], yieldFraction: 1 })
  assert.equal(result.caloriesPer100g, 150)
  assert.equal(result.proteinPer100g, 15)
  assert.equal(result.rawMixCaloriesPer100g, 150)
  assert.equal(result.rawMixProteinPer100g, 15)
})

test('calculateRecipe: label is always "recipe-derived estimate", never a claim of a direct USDA record', () => {
  const result = calculateRecipe({ name: 'Test Mix', ingredients: [ING_A, ING_B] })
  assert.equal(result.label, 'recipe-derived estimate')
  assert.equal(LABEL, 'recipe-derived estimate')
})

test('calculateRecipe: a yieldFraction < 1 concentrates the result proportionally (water loss assumed ~0 calories)', () => {
  const result = calculateRecipe({ name: 'Reduced Mix', ingredients: [ING_A, ING_B], yieldFraction: 0.5 })
  // raw-mix average is 150 kcal/100g; losing half the mass to water
  // concentrates it to 2x.
  assert.equal(result.rawMixCaloriesPer100g, 150)
  assert.equal(result.caloriesPer100g, 300)
  assert.equal(result.proteinPer100g, 30)
})

test('calculateRecipe: echoes every ingredient back with its own source, for full transparency', () => {
  const result = calculateRecipe({ name: 'Test Mix', ingredients: [ING_A, ING_B] })
  assert.equal(result.ingredients.length, 2)
  assert.deepEqual(result.ingredients[0], {
    name: 'A', weightFraction: 0.5, caloriesPer100g: 100, proteinPer100g: 10, sourceId: '1', sourceName: 'USDA FoodData Central -- A',
  })
})

test('calculateRecipe: throws if weightFractions do not sum to 1', () => {
  const bad = { ...ING_B, weightFraction: 0.6 }
  assert.throws(() => calculateRecipe({ name: 'x', ingredients: [ING_A, bad] }), /must sum to 1/)
})

test('calculateRecipe: tolerates floating-point sums within ±0.001', () => {
  const a = { ...ING_A, weightFraction: 1 / 3 }
  const b = { ...ING_A, name: 'B', weightFraction: 1 / 3 }
  const c = { ...ING_A, name: 'C', weightFraction: 1 / 3 }
  assert.doesNotThrow(() => calculateRecipe({ name: 'x', ingredients: [a, b, c] }))
})

test('calculateRecipe: throws on an empty ingredients array', () => {
  assert.throws(() => calculateRecipe({ name: 'x', ingredients: [] }), /non-empty array/)
})

test('calculateRecipe: throws when an ingredient is missing sourceId/sourceName (every ingredient must cite its own USDA source)', () => {
  const noSource = { name: 'C', weightFraction: 1, caloriesPer100g: 50, proteinPer100g: 5 }
  assert.throws(() => calculateRecipe({ name: 'x', ingredients: [noSource] }), /missing sourceId\/sourceName/)
})

test('calculateRecipe: throws on a yieldFraction of 0 or above 1', () => {
  assert.throws(() => calculateRecipe({ name: 'x', ingredients: [{ ...ING_A, weightFraction: 1 }], yieldFraction: 0 }), /\(0, 1\]/)
  assert.throws(() => calculateRecipe({ name: 'x', ingredients: [{ ...ING_A, weightFraction: 1 }], yieldFraction: 1.2 }), /\(0, 1\]/)
})

test('calculateRecipe: throws when name is missing', () => {
  assert.throws(() => calculateRecipe({ ingredients: [{ ...ING_A, weightFraction: 1 }] }), /name is required/)
})
