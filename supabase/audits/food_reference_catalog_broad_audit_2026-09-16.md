# Food Reference Catalog — Broad Audit, Revised (2026-09-16)

**Read-only audit. No Supabase changes, no migration applied, no merge, no deployment.**

**Revision note:** this replaces the previous version of this report. Banana chips has been removed entirely from the proposed batch — it was a real, correctly-sourced finding, but not a priority for this pass, per explicit instruction. This revision instead focuses on genuinely common everyday foods people actually search for: pizza, sushi, noodles, common pasta types, complex pasta dishes (tomato sauce, bolognese, carbonara, pesto, tuna pasta), tomatoes and other everyday vegetables, and similar staples. **The proposed migration batch (`043`) is unchanged from before — this pass found no new item with a direct, authoritative generic USDA record to add.** Where a composite dish has no such record, it's marked `blocked` or `recipe-derived candidate` below, not guessed.

## Method

`DEMO_KEY` remains rate-limited this session, no personal key used. As before, every item below is either already live, a real record from the original 1,010-candidate bulk pass, or explicitly `blocked, needs live search` — nothing invented.

---

## Pizza

| Hebrew | USDA name | kcal/protein | Status | Reason |
|---|---|---|---|---|
| פיצה קפואה | Pizza, cheese, from frozen, thick crust | 268 / 10.4 | **already present & verified** | fdcId 2708613, Survey (FNDDS) — a real, generic, whole-pizza record. Plain "pizza" is genuinely well covered already. |
| פיצה גבינה | (only match: "Topping from cheese pizza") | 230 / 16.9 | keep excluded | fdcId 2705787 is explicitly just the topping portion, not the whole dish — correctly excluded, and redundant with the whole-pizza record above anyway |
| פיצה ירקות | (only match: "Topping from vegetable pizza") | 247 / 15.6 | keep excluded | fdcId 2705788, same topping-only issue |
| פיצה משפחתית (family-size) | no real match found | — | blocked, needs live search | the only candidate returned was an unrelated soy yogurt product — a bad search result, not a near-miss |
| פיצה פפרוני (עם תחליף בקר) | a specific "Pizza with pepperoni, stuffed crust" record surfaced as a near-miss | — | blocked, needs live search | promising lead, but its fdcId/values were never fetched (didn't clear strict matching at the time) — low priority since generic pizza is already covered |

**Bottom line: pizza itself is not a gap.** The remaining items above are redundant naming variants of a dish that's already correctly represented, not missing coverage.

## Sushi

| Item | Status | Reason |
|---|---|---|
| Any sushi roll variant (salmon/avocado, California, "sushi burger") | **blocked, needs live search** — unchanged from the prior review | No match in any Hebrew variant tried. Missing base ingredients confirmed still absent: nori (seaweed), rice vinegar, seasoned sushi rice. Raw fish itself (salmon, tuna) is already live and could support a future recipe-derived attempt once those 2-3 missing ingredients are found — not attempted this pass (no invented values). |

## Noodles & all common pasta types

| Hebrew | USDA name | kcal/protein | Status |
|---|---|---|---|
| פסטה גולמית (יבשה) | Pasta, dry, enriched | 371 / 13.0 | already present & verified (fdcId 169736) |
| פסטה מלאה גולמית (יבשה) | Pasta, whole-wheat, dry | 352 / 13.9 | already present & verified (fdcId 169738) |
| פסטה מבושלת | Pasta, fresh-refrigerated, plain, cooked | 131 / 5.15 | already present & verified (fdcId 169728) |
| פסטה מלאה מבושלת | Pasta, whole grain, cooked | 159 / 5.82 | already present & verified (fdcId 168916) |
| אטריות ביצים מבושלות | Noodles, egg, enriched, cooked | 138 / 4.54 | already present & verified (fdcId 169732) |
| אטריות אורז מבושלות | Rice noodles, cooked | 108 / 1.79 | already present & verified (fdcId 168914) |
| אטריות סובה מבושלות | Noodles, japanese, soba, cooked | 99 / 5.06 | already present & verified (fdcId 168907) |

**Bottom line: every common plain pasta/noodle type is already covered** (dry and cooked, plain and whole-wheat, egg/rice/soba noodles). No gap here.

## Complex pasta dishes

| Dish | Status | Reason |
|---|---|---|
| **Tuna pasta** | **already present & verified** | "פסטה עם טונה" → "Macaroni or pasta salad with tuna," fdcId 2708942, Survey (FNDDS), **200 kcal / 6.69g protein**. This one is fully covered — no action needed. |
| **Tomato sauce pasta** | blocked, needs live search (promising lead) | Only fully-matched record found is explicitly restaurant-qualified ("Pasta with tomato-based sauce, restaurant," fdcId 2708830) — correctly excluded per standing rule. A different, better-looking candidate, **"Pasta with tomato-based sauce and cheese"** (generic, not restaurant-qualified), surfaced as a near-miss but its fdcId/values were never fetched. **Top priority for the next live search** — likely resolvable without a recipe estimate. |
| **Bolognese** | blocked, needs live search or recipe-derived candidate | No dish-level match at all (closest results were just plain cooked pasta or a bottled spaghetti sauce). Base ingredients partially available (cooked ground beef is live; tomato, onion, garlic are live) but raw ground beef still isn't — a recipe-derived attempt is possible in principle, not attempted this pass. |
| **Carbonara** | blocked, needs live search or recipe-derived candidate | No dish-level match found. Base ingredients (egg, parmesan, pasta) are already live; bacon/guanciale is not. A recipe-derived attempt is possible in principle, not attempted this pass. |
| **Pesto pasta** | blocked, needs live search or recipe-derived candidate | No dish-level match — only the pesto sauce itself is live ("רוטב פסטו," fdcId 2710175, 580/8.61). Pasta + pesto sauce are both already live ingredients, making this the most straightforward recipe-derived candidate of the four if you'd like one drafted — not computed this pass (no ratio approved yet). |

None of the four "recipe-derived candidate" dishes above have had any value computed or proposed this pass — per instruction, a status label only, nothing invented.

## Tomatoes & other everyday vegetables

| Hebrew | USDA name | kcal/protein | Status | Reason |
|---|---|---|---|---|
| עגבניה | Tomatoes, raw | 20 / 0.82 | already present & verified | fdcId 2709719, Survey (FNDDS) |
| עגבניות משומרות בקופסה (פילטו) | Tomato, puree, canned | 40.8 / 1.58 | already present & verified | fdcId 2685582, Foundation |
| עגבניות מיובשות בשמש | Tomatoes, sun-dried | 258 / 14.1 | already present & verified | fdcId 168567, SR Legacy |
| ברוקולי | Broccoli, raw | 31 / 2.57 | already present & verified | fdcId 747447, Foundation |
| תפוח אדמה | Potatoes, raw, skin | 58 / 2.57 | already present & verified | fdcId 170032, SR Legacy |
| בצל | Onions, raw | 40 / 1.1 | already present & verified | fdcId 170000, SR Legacy |
| **עגבניות שרי (cherry tomatoes)** | (wrongly matched to "Cherries, raw") | — | **blocked, needs live search** | genuine gap — a very common everyday item with no correct match yet, not a preparation issue, a wrong-food match |
| **רסק עגבניות (tomato paste)** | never independently searched | — | **blocked, needs live search** | only appeared as part of a compound query ("ג'חנון עם רסק עגבניות") that failed for unrelated reasons — tomato paste on its own was never actually tried against the live API. Common everyday ingredient, worth prioritizing. |

**Bottom line: everyday vegetable staples are extremely well covered** (tomato in 3 forms, potato, onion, broccoli, and dozens more from earlier passes). The two real gaps — cherry tomatoes and tomato paste — are both genuine and worth prioritizing in the next live pass.

---

## Revised proposed batch

**Unchanged from the prior review — no new item qualified this pass:**

- `041` — 4 corrections + 2 deletions (already merged to `main`, still not applied to Supabase).
- `042` — falafel addition (drafted, not applied).
- `043` — בייגל wrong-match deletion + 6-item category-reassignment batch (drafted, not applied).

**Removed from the batch, per instruction:** banana chips (`044`) — the migration file and its 6 tests have been deleted from this branch entirely, not just deprioritized.

**No new migration was drafted this pass.** Every genuinely common food investigated (pizza, sushi, pasta/noodle types, tomato-sauce/bolognese/carbonara/pesto/tuna pasta, tomatoes, everyday vegetables) turned out to be either already well covered, or blocked on a live USDA search that can't be completed with `DEMO_KEY` still rate-limited and no personal key in use this turn.

## Priority list for the next live-verification pass (revised, in order)

1. **"Pasta with tomato-based sauce and cheese"** — promising non-restaurant lead, likely resolvable directly.
2. **Cherry tomatoes** — common, currently wrong-matched to cherries.
3. **Tomato paste** — common, never actually searched standalone.
4. Sushi base ingredients (nori, rice vinegar, seasoned sushi rice).
5. Bolognese / carbonara / pesto pasta — check for a direct dish-level FNDDS record before resorting to a recipe estimate.
6. (Carried over from before, unchanged priority) ground beef raw, breadcrumbs, phyllo dough, basmati rice, a plain "bagel" record, non-branded French fries, whole milk 3.5%, labneh, silan, margarine, matzah.

## Verification

- `node --test` across all 20 `*.test.mjs` files: **235/235 passing** (back to the pre-`044` count — the 6 banana-chips tests were removed along with the file).
- `npm run lint`: clean.
- No new SQL file this pass — nothing to re-validate with `pglast`.
- No USDA API key used.

## Exact file list (this revision)

```
supabase/sql/044_food_reference_catalog_banana_chips_recategorization.sql       (DELETED -- removed per instruction)
src/features/nutrition/lib/foodCatalogRealData.test.mjs                          (-65 lines: the 6 044 tests removed)
supabase/audits/food_reference_catalog_broad_audit_2026-09-16.md                (rewritten, this report)
```

No Supabase changes, no migration applied, no merge, no deployment occurred in this pass. The active proposed batch for your review remains exactly `041` (merged, not yet applied) + `042` + `043` (drafted, not applied) — nothing more.
