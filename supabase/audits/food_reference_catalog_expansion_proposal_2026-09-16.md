# Food Reference Catalog — Conservative Expansion Proposal (2026-09-16)

Review report for the conservative expansion plan. **Nothing in this pass has been applied to Supabase or deployed.** This documents what was drafted, what was computed as a labeled proposal only, and what remains excluded, per the 5 decisions given.

---

## 1. Falafel — approved, drafted as `042` (not applied)

- **Record:** USDA FoodData Central, Survey (FNDDS), fdcId **2707408**, "Falafel" — full token coverage, no restaurant/brand qualifier.
- **Values:** 514 kcal / 8.28g protein per 100g · category `prepared_dish` · basis `as_sold`.
- **URL:** `https://fdc.nal.usda.gov/food-details/2707408/nutrients`
- **Rule change (approved):** `prepared_dish` plausibility kcal ceiling raised **500 → 550** (protein bounds unchanged). This is the only reason the record was previously excluded — the record itself was never in question.

**Code drafted:**
- `src/features/nutrition/lib/foodCatalogPlausibility.js` — the category-bounds plausibility check, ported from previously-uncommitted scratchpad tooling into real, tested repo code (it had never been checked in before), with the ceiling change applied and documented inline.
- `src/features/nutrition/lib/foodCatalogPlausibility.test.mjs` — 10 tests, including a regression proving falafel is plausible only under the raised ceiling, and a test proving the ceiling isn't unlimited (700 kcal still flags).
- **Important scope note documented in the code/tests:** this bounds check is *not* the same check that caught the earlier live חזה עוף צלוי bug (79 kcal / 16.79g protein) — both of those values sit inside `meat_poultry`'s bounds. That bug was found by a separate "implied fat content" heuristic that still only exists as uncommitted scratchpad tooling. The two checks are complementary; this report doesn't overstate what the committed bounds check alone covers.
- `supabase/sql/042_food_reference_catalog_falafel_addition.sql` — draft-only single-row insert, same shape/idempotency (`on conflict ((lower(name))) do nothing`) as 040. **Not applied.**
- `src/features/nutrition/lib/foodCatalogRealData.test.mjs` extended with 6 new tests covering 042: exact values/category/basis/source, zero validation errors, the plausibility-ceiling regression, no accidental duplicate against the existing 039+040 catalog, and the idempotent-insert guard.

---

## 2. Standardized-recipe methodology — approved, code drafted; **no composite values applied**

**Drafted:** `src/features/nutrition/lib/recipeCalculator.js` + `recipeCalculator.test.mjs` (10 tests, generic fixtures only — not tied to any specific real dish).

What it does: takes a list of ingredients (each with its own `caloriesPer100g`/`proteinPer100g`/`sourceId`/`sourceName` and a pre-cook weight fraction), a single blended `yieldFraction` (fraction of raw mass retained after cooking — water loss is assumed to carry ~0 calories/protein, so losing it concentrates the rest), and returns:
- `caloriesPer100g` / `proteinPer100g` — the final computed estimate
- `label: "recipe-derived estimate"` — always present, so this can never be silently rendered or stored as if it were a direct USDA record
- `rawMixCaloriesPer100g` / `rawMixProteinPer100g` — the pre-yield-adjustment average, for transparency
- `yieldFraction` and the full `ingredients` breakdown (name, ratio, per-ingredient values, `sourceId`, `sourceName`) echoed back

It throws (refuses to compute) if any ingredient is missing a `sourceId`/`sourceName`, if weight fractions don't sum to 1 (±0.001), or if `yieldFraction` is outside `(0, 1]` — so a caller cannot produce a number without citing every input.

### Proposed calculation: Matbucha (מטבוחה) — *recipe-derived estimate, NOT a direct USDA record*

| Ingredient | Weight fraction | kcal/100g | Protein/100g | Source |
|---|---|---|---|---|
| Tomato, raw | 65% | 20 | 0.82 | fdcId 2709719 (FNDDS) |
| Red bell pepper, raw | 25% | 31.3256 | 0.895625 | fdcId 2258590 (Foundation) |
| Garlic, raw | 3% | 143 | 6.62 | fdcId 1104647 (Foundation) |
| Olive oil | 7% | 900 | 0 | fdcId 2710186 (FNDDS) |

- **Cooking-yield assumption:** 0.60 (≈40% of raw mass lost to simmering/reduction) — **my assumption, not sourced**, needs your approval or a documented alternative.
- **Raw-mix average:** 88.12 kcal / 0.96g protein per 100g
- **Computed estimate (post-yield):** **146.87 kcal / 1.59g protein per 100g**
- **Open questions:** (a) approve or adjust the 65/25/3/7 ratio and the 0.60 yield; (b) which `category`/`basis` to file it under (`sauce_condiment`, `vegetable`, or `soup_salad` all pass their plausibility bounds at this value — your call); (c) whether roasted rather than raw pepper is a better basis for a more authentic recipe (no roasted-red-pepper record currently in the catalog — would need a fresh live search).

### Proposed calculation: Shakshuka (שקשוקה) — *recipe-derived estimate, NOT a direct USDA record*

| Ingredient | Weight fraction | kcal/100g | Protein/100g | Source |
|---|---|---|---|---|
| Tomato, raw | 40% | 20 | 0.82 | fdcId 2709719 (FNDDS) |
| Red bell pepper, raw | 8% | 31.3256 | 0.895625 | fdcId 2258590 (Foundation) |
| Onion, raw | 6% | 40 | 1.1 | fdcId 170000 (SR Legacy) |
| Garlic, raw | 1% | 143 | 6.62 | fdcId 1104647 (Foundation) |
| Olive oil | 5% | 900 | 0 | fdcId 2710186 (FNDDS) |
| Egg, poached (proxy for egg cooked in sauce) | 40% | 143 | 12.51 | fdcId 172186 (SR Legacy) |

- **Cooking-yield assumption:** 0.80 (less reduction than matbucha — eggs are added late and don't lose much moisture) — **my assumption, not sourced**, needs your approval.
- **Raw-mix average:** 116.54 kcal / 5.54g protein per 100g
- **Computed estimate (post-yield):** **145.67 kcal / 6.92g protein per 100g**
- **Open questions:** (a) approve or adjust the ratios/yield; (b) is "egg, poached" an acceptable stand-in basis for "egg cooked directly in tomato sauce" (no closer USDA record exists), or should this be flagged `needs_review` instead of proceeding; (c) category — `prepared_dish` fits comfortably.

**No migration file was drafted for either dish.** Per instruction, that happens only once you approve the exact sources, ratios, yield assumptions, category, and final values above (or send back adjustments).

---

## 3. Schnitzel — kept excluded

Only match remains `Fast foods, chicken, breaded and fried, boneless pieces, plain` (fdcId 170718, SR Legacy, 307/15.92) — an industry-wide average, excluded by the same standing `FAST_FOOD_PATTERN` rule applied throughout this catalog. No code or data change made. No other schnitzel variant (turkey/veal/frozen) has any match at all.

## 4. Shawarma — kept excluded

No generic match in any Hebrew variant, confirmed again this pass. Per instruction, **"gyro" was not searched or used as a proxy** — it is logged here only as a possible research lead for a future live-verification pass, not acted on.

## 5. Next live-verification pass — priority list (not run this session; `DEMO_KEY` still rate-limited)

1. Ground/minced beef (בשר בקר טחון) — found to have **zero** verified generic record at all; needed for bolognese, meatballs, burgers.
2. A dedicated basmati rice record, if one genuinely exists (currently using generic long-grain rice, unlabeled as basmati).
3. Breadcrumbs (פירורי לחם) — needed for schnitzel/fries-adjacent recipes.
4. Phyllo/filo dough (בצק פילו) — blocks the bourekas recipe proposal.
5. Sushi rice (seasoned, cooked) and rice vinegar (חומץ אורז) — block the sushi recipe proposal.
6. A generic, non-branded French fries record (SR Legacy likely has one; only a branded Applebee's match was found so far).

---

## Verification

- `node --test` across all 20 `*.test.mjs` files in `src/`: **225/225 passing** (154 in the nutrition feature's own lib, including 10 new plausibility tests, 10 new recipe-calculator tests, and 6 new 042-specific tests).
- `npm run lint`: clean, no errors/warnings.
- `npm run build`: succeeds (pre-existing >500kB chunk-size advisory only, unrelated to this change).
- `042_food_reference_catalog_falafel_addition.sql` parses correctly under `pglast` (real Postgres grammar).
- No USDA API key (personal or otherwise) was used this session; `DEMO_KEY` remains rate-limited and was not retried for anything beyond a one-off status check.

## Branch

All of the above is committed to `food-catalog-expansion-proposal` (branched from `food-catalog-post-deployment-correction`, which still holds the not-yet-applied 041). **Not pushed, no PR opened, no Supabase or deployment change made.** Awaiting your review of: the falafel migration itself, the ceiling change, and — separately — the matbucha/shakshuka ratios/yields/category/basis before any composite-dish migration is drafted.
