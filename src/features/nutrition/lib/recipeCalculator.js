// Computes a transparent "recipe-derived estimate" for a composite dish
// (e.g. matbucha, shakshuka) from documented per-ingredient USDA source
// values, an explicit pre-cook weight-fraction recipe, and a single
// blended cooking-yield factor.
//
// This exists because a composite dish frequently has NO direct generic
// USDA record (no one measures "matbucha" -- only its ingredients), but
// the food_reference_catalog still needs a defensible number for it.
// Per explicit instruction, a value computed this way must never be
// presented or stored as if it were itself a direct USDA record: every
// caller must carry the returned object's `label` and full
// `ingredients`/`yieldFraction` breakdown wherever the number is shown,
// so a reviewer can see exactly which USDA rows and which assumed
// ratio/yield produced it.
//
// Math: each ingredient contributes calories/protein in proportion to
// its RAW (pre-cook) weight fraction of the mix -- a simple weighted
// average, nothing more. `yieldFraction` (0, 1] is the fraction of raw
// ingredient mass still present after cooking (water lost to
// evaporation/reduction is assumed to carry ~0 calories/protein, so
// losing it concentrates whatever nutrients remain into less final
// mass). concentration = 1 / yieldFraction is applied uniformly to the
// raw-mix average to get the final cooked value per 100g. This is a
// deliberate simplification (a real dish may lose moisture unevenly
// across its ingredients) -- callers must state their yieldFraction as
// an explicit, reviewable assumption, never a fact drawn from a source.
//
// Pure, no I/O -- same DI-testing convention as every other module in
// this directory (see recipeCalculator.test.mjs).

export const LABEL = 'recipe-derived estimate'

export function calculateRecipe({ name, ingredients, yieldFraction = 1 }) {
  if (!name || typeof name !== 'string') {
    throw new Error('calculateRecipe: name is required')
  }
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new Error('calculateRecipe: ingredients must be a non-empty array')
  }
  if (!(typeof yieldFraction === 'number' && yieldFraction > 0 && yieldFraction <= 1)) {
    throw new Error(`calculateRecipe: yieldFraction must be a number in (0, 1], got ${yieldFraction}`)
  }

  for (const ing of ingredients) {
    if (!ing.name || typeof ing.name !== 'string') {
      throw new Error('calculateRecipe: every ingredient needs a name')
    }
    if (!ing.sourceId || !ing.sourceName) {
      throw new Error(`calculateRecipe: ingredient "${ing.name}" is missing sourceId/sourceName -- every ingredient must cite its own USDA source`)
    }
    if (typeof ing.weightFraction !== 'number' || !Number.isFinite(ing.weightFraction) || ing.weightFraction < 0) {
      throw new Error(`calculateRecipe: ingredient "${ing.name}" has an invalid weightFraction`)
    }
    if (typeof ing.caloriesPer100g !== 'number' || typeof ing.proteinPer100g !== 'number') {
      throw new Error(`calculateRecipe: ingredient "${ing.name}" is missing caloriesPer100g/proteinPer100g`)
    }
  }

  const fractionSum = ingredients.reduce((sum, i) => sum + i.weightFraction, 0)
  if (Math.abs(fractionSum - 1) > 0.001) {
    throw new Error(`calculateRecipe: ingredient weightFractions must sum to 1 (±0.001), got ${fractionSum}`)
  }

  const rawCalories = ingredients.reduce((sum, i) => sum + i.weightFraction * i.caloriesPer100g, 0)
  const rawProtein = ingredients.reduce((sum, i) => sum + i.weightFraction * i.proteinPer100g, 0)
  const concentration = 1 / yieldFraction

  return {
    name,
    label: LABEL,
    caloriesPer100g: round2(rawCalories * concentration),
    proteinPer100g: round2(rawProtein * concentration),
    rawMixCaloriesPer100g: round2(rawCalories),
    rawMixProteinPer100g: round2(rawProtein),
    yieldFraction,
    ingredients: ingredients.map((i) => ({
      name: i.name,
      weightFraction: i.weightFraction,
      caloriesPer100g: i.caloriesPer100g,
      proteinPer100g: i.proteinPer100g,
      sourceId: i.sourceId,
      sourceName: i.sourceName,
    })),
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}
