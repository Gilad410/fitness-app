# Food Reference Catalog — Wrong-Match & Category-Reassignment Fixes (2026-09-16)

Review report. **Code/reporting pass only — no Supabase changes, no migration applied, no merge, no deployment.**

## Correction to the prior report's counts

The previous gap-analysis report's summary line said "9 present-but-wrong rows" and "9 missing-but-clean-USDA rows." Re-checking against the detailed body of that same report (and re-verifying numerically this pass), the correct counts are **7** and **6** respectively — the "9"s were an arithmetic slip in that summary line, not a real count of 9 distinct items. This report uses the correct, itemized counts below rather than perpetuating the error.

- **7 present-but-wrong rows**: the 6 already covered by drafted-but-unapplied `041` (unchanged, restated here for completeness) + 1 new finding (בייגל).
- **6 missing-but-clean-USDA rows needing only recategorization**: drafted below as `043`.
- The 4 items that also appeared in the prior report's category-fix discussion (egg white, oysters, TVP, cornstarch) are **bound-tuning fixes, not recategorization fixes** — none of them can be fixed by moving to a different existing category (no other category fits any of them better). Per this turn's explicit scope ("category-reassignment... fixes"), they are **not included in `043`** and remain pending a separate policy decision.

---

## Part 1: the 7 present-but-wrong rows

| Hebrew | Status | Before (wrong) | After (correct) | Source |
|---|---|---|---|---|
| חזה עוף צלוי | in `041`, unapplied | 79 kcal / 16.79g (deli-sliced, fat-free) | **165 / 31.02** | fdcId 171477, SR Legacy |
| מוצרלה | in `041`, unapplied | 141 / 31.7 (nonfat) | **299 / 22.17** (whole milk) | fdcId 170845, SR Legacy |
| חמאת בוטנים | in `041`, unapplied | 520 / 25.9 (reduced fat) | **598 / 22.2** (regular) | fdcId 2707537, Survey (FNDDS) |
| יוגורט יווני 0% | in `041`, unapplied | 93 / 7.64, CHOBANI mango (branded) | **61 / 10**, plain nonfat | fdcId 330137, Foundation |
| יוגורט אפרסק | in `041`, unapplied | CHOBANI peach (branded) | **DELETE** — no clean generic replacement found | — |
| עוגיות ג'ינג'ר | in `041`, unapplied | Archway (branded) | **DELETE** — no clean generic replacement found | — |
| **בייגל** | **new this pass, drafted in `043`** | fdcId 173150, "Snacks, bagel chips, plain" (451/12.34) — **bagel chips ≠ a whole bagel**, same defect class as חזה עוף צלוי | **DELETE** — no generic "Bagel, plain" record has been fetched this session (blocked on live search, not guessed) | — |

`041` itself is unchanged by this pass — it was already drafted, tested, and committed on the parent branch, still awaiting your approval. `043` (below) is new and disjoint from it (no row overlap).

---

## Part 2: the 6 missing-but-clean-USDA rows (recategorization only) — drafted as `043`

Every row below already had a full, clean USDA match (correct food, no restaurant/brand/fast-food qualifier) from the original session — it was excluded only because its plausibility bounds check failed under the **wrong** category. No new sourcing was needed; only the category assignment changes.

| Hebrew / English | kcal / protein | Old category (why it failed) | New category (why it passes) | Source |
|---|---|---|---|---|
| בייגלה / Bagel chips | 451 / 12.3 | `grain_carb` — kcal ceiling 450, 1 over | `sweets_snacks` — ceiling 620, fits | fdcId 2708292, Survey (FNDDS) |
| קוקוס / Coconut meat, raw | 354 / 3.33 | `fruit` — kcal ceiling 350, 4 over | `nuts_seeds_fats` — ceiling 920, fits | fdcId 170169, SR Legacy |
| חמאת שקדים / Almond butter | 641 / 20.7 | `sauce_condiment` — protein ceiling 16, 4.7 over | `nuts_seeds_fats` — ceiling 35, fits (same category tahini/peanut/cashew butter already use) | fdcId 2707533, Survey (FNDDS) |
| ממרח חמאת בוטנים חלק / Peanut butter, smooth, reduced fat | 520 / 25.9 | `sauce_condiment` — protein ceiling 16, 9.9 over | `nuts_seeds_fats` — fits | fdcId 172458, SR Legacy |
| גרנולה / Granola cookie | 464 / 9.8 | `grain_carb` — kcal ceiling 450, 14 over | `sweets_snacks` — fits | fdcId 2707933, Survey (FNDDS) |
| קמח שקדים / Almond flour | 622.042 / 26.24375 | `grain_carb` — both bounds far exceeded | `nuts_seeds_fats` — fits cleanly | fdcId 2261420, Foundation |

**Naming caveat (not a data problem, a translation one):** "בייגלה" in everyday Israeli usage often refers to a small savory pretzel-ring snack, not necessarily American-style bagel chips. The USDA record itself (fdcId 2708292, "Bagel chips") is correct for what it is — please confirm this is the food you want under that Hebrew name before applying; happy to rename if not.

**License:** all values are USDA FoodData Central data, a U.S. government work, public domain under 17 U.S.C. §105 — free to use, no attribution legally required (already cited in `source_name` as good practice).

---

## Part 3: shakshuka re-evaluation — blocked, could not complete this pass

You asked to re-evaluate שקשוקה against the direct FNDDS record (`Egg omelet or scrambled egg, with tomatoes, fat added`) before defaulting to the recipe-derived estimate. I checked: **only the record's description string was ever captured**, from the original matcher's "closest candidate" diagnostic on the excluded item — its `fdcId` and exact kcal/protein were never fetched, because that only happens for an *accepted* match, and this one failed strict token matching at the time. `DEMO_KEY` is still rate-limited and no personal key is available this turn, so I cannot fetch its real values without inventing them.

**Shakshuka's status is unchanged**: it remains a recipe-derived-estimate candidate (145.67 kcal / 6.92g protein per 100g, from the prior report, still pending ratio/yield approval), clearly labeled `"recipe-derived estimate"`, not a direct USDA record. The direct-match re-evaluation goes on the next live-verification pass priority list.

---

## Code drafted

- `supabase/sql/043_food_reference_catalog_category_fixes.sql` — new, draft-only migration. Deletes the wrong בייגל row, inserts the 6 recategorized rows, wrapped in `begin;`/`commit;` with a guard scoped only to the rows it touches (same pattern as `039`/`041`). Explicitly does **not** touch the 4 bound-tuning items. **Not applied.**
- `src/features/nutrition/lib/foodCatalogRealData.test.mjs` — extended with 10 new tests covering `043`: exact delete/insert counts, exact values/category/basis/source for all 6 rows, a plausibility check proving each row passes under its *new* category, a companion check proving each row would have **failed** under its *old* category (proof there was a real problem, not just a relabel), zero validation errors, no duplicate names, delete-before-insert ordering, transaction safety, idempotent insert, and an explicit assertion that the 4 out-of-scope bound-tuning items are *not* referenced anywhere in `043`.
- No changes were needed to `foodCatalogValidation.js` or `foodCatalogPlausibility.js` — both `sweets_snacks` and `nuts_seeds_fats` already exist as valid categories with the bounds used above; this pass only reassigns rows to categories that already exist.

## Verification

- `node --test` across all 20 `*.test.mjs` files: **235/235 passing** (10 new tests for `043`, all green).
- `npm run lint`: clean.
- `npm run build`: succeeds (pre-existing chunk-size advisory only).
- `043`'s SQL verified parseable under `pglast` (5 statements: `begin`, `delete`, `insert`, `do` block, `commit`).
- All 6 recategorized rows independently re-verified against the real `checkPlausibility()` function (not just asserted): pass under the new category, fail under the old one.
- No USDA API key used.

## Still blocked / unchanged (per instruction, kept pending)

- The 4 bound-tuning items (egg white, oysters, TVP, cornstarch) — separate decision, not touched.
- All ~25 items on the prior report's "needs a fresh live search" list (French fries, ground beef raw, breadcrumbs, phyllo, basmati rice, labneh, silan, margarine, matzah, cherry tomatoes, a real "bagel, plain" record, the shakshuka direct-record fdcId, etc.) — unchanged, still blocked on live API access.
- Matbucha and shakshuka recipe-derived estimates — unchanged from the prior report, still clearly labeled `"recipe-derived estimate"`, still pending your ratio/yield approval.
- Sabich, and the 7 dishes confirmed not safely addable (shawarma, cholent, maqluba, jachnun, malawach, chamin, chraimeh) — unchanged.

No Supabase changes, migration application, merge, or deployment occurred in this pass. Committed locally to `food-catalog-expansion-proposal` (not pushed).
