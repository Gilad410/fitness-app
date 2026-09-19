import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTraineeBarcodeLogRpcParams } from './traineeBarcodeLogParams.js'

// ---------------------------------------------------------------------
// "A found barcode saves to the trainee log" -- the boundary this
// codebase can actually unit-test (Pinia stores that call supabase are
// never unit-tested here, see nutritionLogs.js/traineeNutrition.js's
// own addEntry()) is this exact mapping: BarcodeFoodEntry.vue's
// 'resolved' payload -> the RPC's p_barcode_* parameters
// trainee_log_nutrition_entry() (047) validates and inserts.
// ---------------------------------------------------------------------

test('buildTraineeBarcodeLogRpcParams: an Open-Food-Facts-found product maps every field to its p_barcode_* parameter', () => {
  const resolved = {
    barcode: '7622202268298',
    barcode_source: 'open_food_facts',
    barcode_product_name: 'Milka Alpenmilch',
    barcode_calories_per_100g: 534,
    barcode_protein_per_100g: 6.3,
    grams: 40,
  }
  const params = buildTraineeBarcodeLogRpcParams(resolved, '2026-09-19')
  assert.deepEqual(params, {
    p_barcode: '7622202268298',
    p_barcode_source: 'open_food_facts',
    p_barcode_product_name: 'Milka Alpenmilch',
    p_barcode_calories_per_100g: 534,
    p_barcode_protein_per_100g: 6.3,
    p_grams: 40,
    p_logged_at: '2026-09-19',
  })
})

test('buildTraineeBarcodeLogRpcParams: an unknown protein value maps to null, never 0 or undefined', () => {
  const resolved = {
    barcode: '4006381333931',
    barcode_source: 'manual',
    barcode_product_name: 'מוצר ללא שם',
    barcode_calories_per_100g: 300,
    barcode_protein_per_100g: null,
    grams: 100,
  }
  const params = buildTraineeBarcodeLogRpcParams(resolved, '2026-09-19')
  assert.equal(params.p_barcode_protein_per_100g, null)
})

test('buildTraineeBarcodeLogRpcParams: the loggedAt argument, not any date embedded in resolved, becomes p_logged_at', () => {
  const resolved = { barcode: '123', barcode_source: 'manual', barcode_product_name: 'x', barcode_calories_per_100g: 1, grams: 1 }
  const params = buildTraineeBarcodeLogRpcParams(resolved, '2026-01-05')
  assert.equal(params.p_logged_at, '2026-01-05')
})
