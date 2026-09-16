# Food Reference Catalog — Broad 50-100 Item Audit (2026-09-16)

**Read-only audit + one small reviewable batch (`044`). No Supabase changes, no migration applied, no merge, no deployment.**

## Method

`DEMO_KEY` is still rate-limited (checked again this pass, ~4h remaining) and no personal key was used. As with the prior passes, every item below is either already live, a real record from this session's original 1,010-candidate bulk verification, or explicitly marked "needs live verification" — nothing is invented. Only **direct, generic USDA records** are used throughout; every candidate was checked against `RESTAURANT_BRAND_PATTERN`/`RESTAURANT_WORD_PATTERN`/`FAST_FOOD_PATTERN`/`GROCERY_BRAND_PATTERN`, and nothing recipe-derived, supplement-classed, or obscure is included as an "add."

This pass specifically re-examined every one of the remaining (not-yet-addressed) `needs_manual_review.json` entries with the same numeric bounds-check rigor used for `043`, to see if any more real "add via recategorization" opportunities existed. **One did** (banana chips) — drafted below as `044`. Everything else in that remaining pool turned out to need either a live search or a bound-tuning policy decision (already out of scope), or is a genuine content/naming mismatch not worth adding as-is.

---

## Meat & Poultry — 10 audited

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| חזה עוף גולמי (ללא עור) | Chicken, breast, boneless, skinless, raw | 106/22.5 | already present & verified | fdcId 2646170, Foundation |
| בשר בקר טחון מבושל | Beef, ground, unspecified fat content, cooked | 240/25.1 | already present & verified | fdcId 172161, SR Legacy |
| סטייק אנטריקוט גולמי | Beef, ribeye, steak, boneless, choice, raw | 254/18.7 | already present & verified | fdcId 2646172, Foundation |
| כבש (טלה) צלוי | Lamb, loin, cooked, roasted | 309/22.6 | already present & verified | fdcId 172490, SR Legacy |
| הודו טחון מבושל | Turkey, ground, cooked | 203/27.4 | already present & verified | fdcId 171506, SR Legacy |
| עגל צלוי | Veal, loin, cooked, roasted | 175/26.3 | already present & verified | fdcId 175274, SR Legacy |
| חזה עוף צלוי | Chicken, broilers or fryers, breast, cooked, roasted | 165/31.0 | **needs correction** (already drafted in merged `041` — not yet applied) | fdcId 171477, SR Legacy |
| נקניקיה | Hot dog, beef | 310/11.7 | keep excluded | protein 11.7g is 0.3g under `meat_poultry`'s floor of 12 — no other category fits a hot dog better; a bound-tuning decision (out of scope this pass), not a recategorization |
| שניצל עוף | Fast foods, chicken, breaded and fried, boneless pieces, plain | 307/15.9 | keep excluded | industry-wide Fast-foods average, excluded by standing rule (confirmed decision from a prior turn) |
| קורנד בקר (בשר משומר) | Beef, corned beef hash, with potato, canned | 164/8.7 | keep excluded | a composite canned product (hash + potato), not plain corned beef — plain corned beef is already correctly live under a separate name (קורנביף משומר, fdcId 170602); adding this would be confusing, not useful |

## Fish & Seafood — 6 audited

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| סלמון גולמי | Fish, salmon, raw | 188/20.4 | already present & verified | fdcId 2706284, Survey (FNDDS) |
| טונה בשימורים | Fish, tuna, light, canned in water, drained | 90/19.0 | already present & verified | fdcId 334194, Foundation |
| דג בקלה מבושל | Fish, cod, Pacific, cooked | 84/20.4 | already present & verified | fdcId 175178, SR Legacy |
| שרימפס מבושל | Crustaceans, shrimp, mixed species, cooked | 119/22.8 | already present & verified | fdcId 171971, SR Legacy |
| צדפות (אוסטרות) גולמיות | Oysters, raw | 51/5.71 | keep excluded | protein floor for `fish_seafood` is 8 — oysters are a genuine low-protein seafood outlier; bound-tuning decision, out of scope this pass |
| שרימפס בציפוי פריך מטוגן | Fast foods, shrimp, breaded and fried | 308/7.84 | keep excluded | Fast-foods industry average |

## Eggs — 5 audited

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| ביצה קשה | Egg, whole, cooked, hard-boiled | 155/12.6 | already present & verified | fdcId 173424, SR Legacy |
| חביתה | Egg, whole, cooked, omelet | 154/10.6 | already present & verified | fdcId 172185, SR Legacy |
| חלמון ביצה | Egg, yolk, raw, fresh | 322/15.9 | already present & verified | fdcId 172184, SR Legacy |
| חלבון ביצה | Egg, white, raw, fresh | 52/10.9 | keep excluded | `egg` category's kcal floor is 60, 8 under — bound-tuning, out of scope. High-value once resolved (commonly tracked for protein). |
| חביתת ירקות | "Other vegetables as ingredient in omelet" | 39/3.24 | keep excluded | wrong/partial match — this is just the vegetable component, not the whole omelet dish; needs live verification for a real vegetable-omelet record |

## Dairy & Common Spreads — 8 audited

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| קוטג' 5% | Cheese, cottage, low fat | 82/11.0 | already present & verified | fdcId 2705756, Survey (FNDDS) |
| חלב 3% | Milk, whole, 3.25% milkfat | 60/3.27 | already present & verified | fdcId 746782, Foundation |
| פטה | Cheese, feta | 265/14.2 | already present & verified | fdcId 173420, SR Legacy |
| מוצרלה | Cheese, mozzarella, whole milk | 299/22.2 | **needs correction** (already drafted in merged `041` — not yet applied) | fdcId 170845, SR Legacy |
| יוגורט יווני 0% | Yogurt, Greek, plain, nonfat | 61/10.0 | **needs correction** (already drafted in merged `041` — not yet applied) | fdcId 330137, Foundation |
| חמאת בוטנים | Peanut butter | 598/22.2 | **needs correction** (already drafted in merged `041` — not yet applied) | fdcId 2707537, Survey (FNDDS) |
| חלב מלא (3.5%) | — | — | needs live verification | detail fetch was never completed this session (null values) — a very common everyday item, worth prioritizing |
| חלב שוקו | (currently a wrong match, 535 kcal — likely a concentrate/mix, not ready-to-drink) | 535/7.65 | keep excluded, needs live verification | kcal far exceeds a real ready-to-drink chocolate milk's typical ~80-90 kcal; the matched record is almost certainly the wrong prep state |

## Grains, Rice, Potatoes & Bread — 8 audited

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| אורז לבן מבושל | Rice, white, cooked, glutinous | 96/2.0 | already present & verified | fdcId 2708422, Survey (FNDDS) |
| תפוח אדמה אפוי | Potato, baked, NFS | 93/2.0 | already present & verified | fdcId 2709383, Survey (FNDDS) |
| לחם מלא | Bread, whole wheat | 254/12.3 | already present & verified | fdcId 2707709, Survey (FNDDS) |
| פיתה | Bread, pita, white, enriched | 275/9.1 | already present & verified | fdcId 174915, SR Legacy |
| קינואה מבושלת | Quinoa, cooked | 120/4.4 | already present & verified | fdcId 168917, SR Legacy |
| בייגל | (currently wrong: matched to bagel chips) | — | **DELETE, drafted in `043`** — no replacement value guessed | needs live verification for a real "Bagel, plain" record |
| בננה מיובשת (צ'יפס בננה) | Banana chips | 519/2.3 | **add, drafted this pass as `044`** | `fruit`'s kcal ceiling (350) doesn't fit a fried/oiled snack — `sweets_snacks` (ceiling 620) does. fdcId 2709200, Survey (FNDDS). Full name used deliberately (not bare "dried banana") to avoid the same naming ambiguity flagged for בייגלה. |
| קמח שקדים | Flour, almond | 622/26.2 | **recategorize, drafted in `043`** | grain_carb → nuts_seeds_fats |

## Pasta & Noodles — 4 audited (already comprehensively covered, restated briefly)

Dry/cooked pasta (plain + whole-wheat), egg noodles, rice noodles, soba noodles — all already present & verified, no action needed. Sauced composite dishes remain out of scope (recipe-derived only, not attempted this pass).

## Legumes — 5 audited

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| חומוס מבושל | Chickpeas, cooked, boiled, with salt | 164/8.9 | already present & verified | fdcId 173799, SR Legacy |
| עדשים מבושלות | Lentils, cooked, boiled, with salt | 114/9.0 | already present & verified | fdcId 175254, SR Legacy |
| טופו | Tofu, raw, firm | 144/17.3 | already present & verified | fdcId 172475, SR Legacy |
| שעועית לבנה מבושלת | Beans, white, cooked, boiled, with salt | 139/9.7 | already present & verified | fdcId 175249, SR Legacy |
| חלבון סויה טקסטורי (TVP) יבש | Textured vegetable protein, dry | 366/51.1 | keep excluded | `legume`'s protein ceiling (45) doesn't fit a dehydrated/concentrated protein product — bound-tuning decision, out of scope this pass |

## Vegetables — 6 audited (near-complete coverage, only real gaps listed)

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| עגבניה | Tomatoes, raw | 20/0.82 | already present & verified | fdcId 2709719, Survey (FNDDS) |
| ברוקולי | Broccoli, raw | 31/2.57 | already present & verified | fdcId 747447, Foundation |
| תפוח אדמה | Potatoes, raw, skin | 58/2.57 | already present & verified | fdcId 170032, SR Legacy |
| עגבניות שרי | (matched wrongly to "Cherries, raw") | — | keep excluded, needs live verification | wrong-food match, not a preparation issue — genuine gap, common everyday item |
| זיתים | (matched wrongly to "Olive tapenade") | 282/0.73 | keep excluded, needs live verification | tapenade is a different product (spread with capers/anchovies), materially wrong nutrition profile for plain olives |
| דלעת אפויה | (matched wrongly to "Seeds, pumpkin and squash seed kernels, roasted") | 574/29.84 | keep excluded, needs live verification | matched the seeds, not the roasted flesh — wrong food entirely |

## Fruits — 5 audited

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| תפוח | Apple, raw | 61/0.17 | already present & verified | fdcId 2709215, Survey (FNDDS) |
| בננה | Bananas, raw | 89/1.09 | already present & verified | fdcId 173944, SR Legacy |
| אבוקדו | Avocado, raw | 160/2.0 | already present & verified | fdcId 2709223, Survey (FNDDS) |
| קוקוס | Nuts, coconut meat, raw | 354/3.33 | **recategorize, drafted in `043`** | fruit → nuts_seeds_fats |
| אשכולית לבנה | (matched wrongly to grapefruit juice, not whole fruit) | 39/0.5 | keep excluded, needs live verification | prep-state mismatch (juice vs. whole fruit) |

## Snacks (`sweets_snacks`) — 6 audited

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| פופקורן | Snacks, popcorn, air-popped | 387/12.9 | already present & verified | fdcId 167959, SR Legacy |
| דבש | Honey | 304/0.3 | already present & verified | fdcId 169640, SR Legacy |
| עוגיות | Cookies, shortbread, commercially prepared, plain | 514/5.4 | already present & verified | fdcId 174967, SR Legacy |
| עוגיות ג'ינג'ר | Archway Home Style Cookies, Reduced Fat Ginger Snaps (branded) | 424/4.7 | **DELETE, already drafted in merged `041` — not yet applied** | branded (Archway), no clean generic replacement found |
| גרנולה | Cookie, granola | 464/9.8 | **recategorize, drafted in `043`** | grain_carb → sweets_snacks |
| בננה מיובשת (צ'יפס בננה) | Banana chips | 519/2.3 | **add, drafted this pass as `044`** | see Grains section above |

## Oils (`nuts_seeds_fats`) — 4 audited (fully covered)

שמן זית (olive, 900/0, fdcId 2710186), שמן קנולה (canola, 900/0, fdcId 2710188), שמן חמניות (sunflower, 900/0, fdcId 2710192), שמן קוקוס (coconut, 892/0, fdcId 171412) — all already present & verified. No gaps found in common everyday cooking oils.

## Common Israeli Foods — 8 audited

| Hebrew | USDA name | kcal/protein | Status | Confidence / reason |
|---|---|---|---|---|
| חומוס (ממרח) | Hummus, commercial | 237/7.8 | already present & verified | fdcId 174289, SR Legacy |
| טחינה | Seeds, sesame butter, paste | 586/18.1 | already present & verified | fdcId 170191, SR Legacy |
| פיתה | Bread, pita, white, enriched | 275/9.1 | already present & verified | fdcId 174915, SR Legacy |
| סלט ירקות (ישראלי) | Lettuce, salad with assorted vegetables | 23/1.19 | already present & verified | fdcId 2709823, Survey (FNDDS) |
| פלאפל | Falafel | 514/8.28 | **add, drafted in `042` — not yet applied** | fdcId 2707408, Survey (FNDDS) |
| מטבוחה | — | — | recipe-derived estimate only, not migrated | proposed 146.87 kcal/1.59g, clearly labeled, pending your ratio/yield approval |
| שקשוקה | — | — | recipe-derived estimate only, not migrated | proposed 145.67 kcal/6.92g, clearly labeled; a promising direct FNDDS candidate exists but its exact values were never captured — still blocked |
| שווארמה | — | — | keep excluded (confirmed decision from a prior turn) | no match in any variant; method-dependent, not recipe-decomposable with confidence |

---

## Summary

- **~58 items audited** across the 12 requested categories.
- **~40 already present & verified**, no action needed — confirms strong existing coverage.
- **7 already-known corrections/additions pending your approval from prior rounds** (`041`'s 4 corrections + `042`'s falafel + `043`'s בייגל deletion + `043`'s 6-item recategorization batch) — restated here for completeness, not new work.
- **1 genuinely new finding this pass**: בננה מיובשת (צ'יפס בננה) / banana chips — drafted as `044`.
- **~10 items kept excluded** with a precise, individually-verified reason (wrong match, branded, Fast-foods average, or a bound-tuning issue out of scope).
- **~8 items flagged "needs live verification"** — real gaps worth prioritizing next: cherry tomatoes, plain olives, roasted pumpkin, white grapefruit (whole fruit), whole milk 3.5%, chocolate milk, plain bagel, vegetable omelet.

## Code drafted

- `supabase/sql/044_food_reference_catalog_banana_chips_recategorization.sql` — new, draft-only single-row insert (same `ON CONFLICT DO NOTHING` pattern as `040`/`042`). **Not applied.**
- `src/features/nutrition/lib/foodCatalogRealData.test.mjs` — extended with 6 new tests for `044`: exact name/values/category/basis/source, plausibility pass under the new category and fail under the old one, zero validation errors, no duplicate name, idempotent insert.

## Verification

- `node --test` across all 20 `*.test.mjs` files: **241/241 passing** (6 new for `044`).
- `npm run lint`: clean.
- `npm run build`: succeeds (pre-existing chunk-size advisory only).
- `044`'s SQL verified parseable under `pglast`.
- No USDA API key used.

## Exact file list (this pass)

```
supabase/sql/044_food_reference_catalog_banana_chips_recategorization.sql       (new, draft migration, NOT applied)
src/features/nutrition/lib/foodCatalogRealData.test.mjs                          (+~65 lines: 6 new 044 tests)
supabase/audits/food_reference_catalog_broad_audit_2026-09-16.md                (this report)
```

No Supabase changes, no migration applied, no merge, no deployment occurred in this pass.
