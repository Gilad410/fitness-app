// Category-based plausibility bounds for calories_per_100g/protein_per_100g
// -- pure, tested, and now committed to the repo (previously this lived
// only as scratchpad build tooling, never checked in). Deliberately
// generous: meant to catch a real matching/unit/decimal-point error, not
// to dispute normal food variation. A row outside its category's bounds
// is flagged for manual review, never silently dropped or silently kept.
//
// This category-bounds check is one part of the plausibility audit run
// during the post-deployment investigation (see
// 041_food_reference_catalog_post_deployment_corrections.sql for the
// separate "implied fat content" heuristic that actually caught the
// live חזה עוף צלוי mismatch -- that heuristic remains uncommitted
// scratchpad tooling, out of scope here). This bounds check, in the same
// pass, wrongly excluded a genuinely correct falafel record (USDA
// FoodData Central, Survey (FNDDS), fdcId 2707408, "Falafel" -- 514 kcal
// / 8.28g protein per 100g) because prepared_dish's kcal ceiling was set
// to 500. 514 kcal/100g for deep-fried chickpea patties is a
// well-corroborated, non-outlier figure for a fried prepared dish --
// bread_bakery already tolerates up to 550 and sweets_snacks up to 620
// -- so the ceiling was simply miscalibrated for fried dishes, not the
// falafel record. Approved fix: prepared_dish kcal ceiling raised from
// 500 to 550 (protein bounds unchanged). See
// supabase/audits/food_reference_catalog_expansion_proposal_2026-09-16.md
// for the full review.
export const PLAUSIBILITY_BOUNDS = {
  fruit: { kcal: [10, 350], protein: [0, 6] },
  vegetable: { kcal: [3, 400], protein: [0, 15] },
  grain_carb: { kcal: [50, 450], protein: [1, 20] },
  bread_bakery: { kcal: [150, 550], protein: [3, 20] },
  meat_poultry: { kcal: [60, 500], protein: [12, 42] },
  fish_seafood: { kcal: [50, 350], protein: [8, 35] },
  egg: { kcal: [60, 350], protein: [8, 35] },
  dairy: { kcal: [10, 920], protein: [0, 40] },
  plant_milk: { kcal: [5, 100], protein: [0, 6] },
  legume: { kcal: [60, 400], protein: [4, 45] },
  nuts_seeds_fats: { kcal: [350, 920], protein: [0, 35] },
  sweets_snacks: { kcal: [100, 620], protein: [0, 20] },
  sauce_condiment: { kcal: [0, 780], protein: [0, 16] },
  spice_herb: { kcal: [0, 500], protein: [0, 45] },
  beverage: { kcal: [0, 320], protein: [0, 10] },
  prepared_dish: { kcal: [40, 550], protein: [2, 35] }, // was [40, 500] -- raised to admit verified fried dishes (falafel: 514 kcal)
  soup_salad: { kcal: [5, 320], protein: [0, 20] },
  sandwich: { kcal: [100, 450], protein: [3, 25] },
  supplement: { kcal: [50, 450], protein: [0, 95] },
}

// Checks one (category, calories, protein) triple against its category's
// bounds. Returns { plausible, issues }: `plausible` is `true`/`false`,
// or `null` when the category itself isn't recognized (not itself an
// implausibility finding -- CATEGORIES in foodCatalogValidation.js is
// the source of truth for valid categories; this just can't judge one it
// doesn't have bounds for). `issues` is always a plain string array,
// empty when there's nothing to flag.
export function checkPlausibility(category, calories, protein) {
  const bounds = PLAUSIBILITY_BOUNDS[category]
  if (!bounds) {
    return { plausible: null, issues: [`unknown category "${category}" -- no plausibility bounds defined`] }
  }

  const issues = []
  if (typeof calories !== 'number' || !Number.isFinite(calories) || calories < bounds.kcal[0] || calories > bounds.kcal[1]) {
    issues.push(`calories ${calories} outside plausible range [${bounds.kcal[0]}, ${bounds.kcal[1]}] for category "${category}"`)
  }
  if (typeof protein !== 'number' || !Number.isFinite(protein) || protein < bounds.protein[0] || protein > bounds.protein[1]) {
    issues.push(`protein ${protein} outside plausible range [${bounds.protein[0]}, ${bounds.protein[1]}] for category "${category}"`)
  }
  return { plausible: issues.length === 0, issues }
}
