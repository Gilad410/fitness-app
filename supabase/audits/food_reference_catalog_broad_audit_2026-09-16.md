# Food Reference Catalog — Broad Audit, Revised (2026-09-16)

**Read-only audit. No Supabase changes, no migration applied, no merge, no deployment.**

**Revision note:** replaces the previous version of this report. Banana chips has been **removed entirely** from the proposed batch — the migration file and its tests were deleted, not just deprioritized. This revision focuses on genuinely common everyday foods: pizza, sushi, noodles, common pasta types, complex pasta dishes (tomato sauce, bolognese, carbonara, pesto, tuna pasta), tomatoes, and other everyday vegetables. **No banana chips or other uncommon items appear anywhere in this report or the proposed batch.**

Every item below is placed into exactly one of four buckets, kept strictly separate per instruction:

1. **Already covered** — a real, direct, generic USDA record is already live.
2. **Blocked, pending a fresh live search** — no record captured yet, but the food is common enough that a real generic USDA record almost certainly exists; just needs an actual API call (`DEMO_KEY` still rate-limited this session, no personal key used).
3. **No safe generic USDA record** — already searched (as part of this session's exhaustive 1,010-candidate pass) and confirmed to have no matching composite-dish record; the only path forward, if any, is a recipe-derived estimate built from already-live ingredients, not a direct record.
4. Explicit confirmation of scope.

---

## 1. Already covered — no action needed

| Food | USDA name | kcal/protein | Source |
|---|---|---|---|
| Pizza (generic, cheese) | Pizza, cheese, from frozen, thick crust | 268 / 10.4 | fdcId 2708613, Survey (FNDDS) |
| Tuna pasta | Macaroni or pasta salad with tuna | 200 / 6.69 | fdcId 2708942, Survey (FNDDS) |
| Dry pasta, plain | Pasta, dry, enriched | 371 / 13.0 | fdcId 169736, SR Legacy |
| Dry pasta, whole-wheat | Pasta, whole-wheat, dry | 352 / 13.9 | fdcId 169738, SR Legacy |
| Cooked pasta, plain | Pasta, fresh-refrigerated, plain, cooked | 131 / 5.15 | fdcId 169728, SR Legacy |
| Cooked pasta, whole-wheat | Pasta, whole grain, cooked | 159 / 5.82 | fdcId 168916, SR Legacy |
| Egg noodles, cooked | Noodles, egg, enriched, cooked | 138 / 4.54 | fdcId 169732, SR Legacy |
| Rice noodles, cooked | Rice noodles, cooked | 108 / 1.79 | fdcId 168914, SR Legacy |
| Soba noodles, cooked | Noodles, japanese, soba, cooked | 99 / 5.06 | fdcId 168907, SR Legacy |
| Tomato, raw | Tomatoes, raw | 20 / 0.82 | fdcId 2709719, Survey (FNDDS) |
| Tomato puree, canned | Tomato, puree, canned | 40.8 / 1.58 | fdcId 2685582, Foundation |
| Sun-dried tomato | Tomatoes, sun-dried | 258 / 14.1 | fdcId 168567, SR Legacy |
| Broccoli, raw | Broccoli, raw | 31 / 2.57 | fdcId 747447, Foundation |
| Potato, raw | Potatoes, raw, skin | 58 / 2.57 | fdcId 170032, SR Legacy |
| Onion, raw | Onions, raw | 40 / 1.1 | fdcId 170000, SR Legacy |
| Pesto sauce (ingredient, not the dish) | Pesto sauce | 580 / 8.61 | fdcId 2710175, Survey (FNDDS) |

**Every common plain pasta/noodle type is fully covered** (dry+cooked, plain+whole-wheat, egg/rice/soba). **Pizza and tuna pasta are both fully covered.** Everyday vegetable staples are extensive (tomato in 3 forms, potato, onion, broccoli, and dozens more from earlier passes — not repeated here for length).

---

## 2. Blocked, pending a fresh live search — record very likely exists

| Food | What's known so far | Priority |
|---|---|---|
| **"Pasta with tomato-based sauce and cheese"** (tomato-sauce pasta) | A non-restaurant-qualified generic FNDDS record surfaced as a near-match during the original search, but its fdcId/values were never fetched (didn't clear strict token matching at the time). High confidence this resolves cleanly. | **1 (highest)** |
| **Cherry tomatoes** | Currently wrong-matched to "Cherries, raw" — a real match failure, not a missing-record problem. Cherry tomatoes are extremely common in FDC; a fresh/adjusted search should succeed easily. | 2 |
| **Tomato paste** | Never independently searched — only appeared inside one unrelated compound query that failed for other reasons. A standalone search hasn't actually been tried. | 3 |
| Sushi base ingredients: nori, rice vinegar, seasoned sushi rice | None of these 3 ingredients have been searched standalone this session. Common enough that generic records almost certainly exist. | 4 |
| Plain bagel, non-branded French fries, whole milk 3.5%, breadcrumbs, phyllo dough, basmati rice, margarine, labneh, silan, matzah, raw ground beef | Carried over from prior rounds, unchanged priority — all genuinely common, all still awaiting a live search. | 5 |

---

## 3. No safe generic USDA record — recipe-derived candidate or excluded

| Food | Status | Reason |
|---|---|---|
| **Sushi (as a composite dish — any roll variant)** | no safe generic record; ingredients tracked separately above | Searched exhaustively across every Hebrew variant this session — zero composite "sushi roll" records exist in USDA data (expected: USDA's databases are general/US-centric and don't tabulate assembled ethnic dishes like this). A recipe-derived estimate becomes possible only once the 3 missing base ingredients (bucket 2 above) are found — not attempted this pass, no value invented. |
| **Bolognese** | no safe generic record found; recipe-derived candidate | Already searched as part of the original 1,010-candidate pass — no dish-level match (closest results were just plain cooked pasta or a bottled sauce). Cooked ground beef, tomato, onion, garlic are already live; raw ground beef is not. Recipe-derived is possible in principle. **Not computed this pass — no ratio approved, nothing invented.** |
| **Carbonara** | no safe generic record found; recipe-derived candidate | Already searched, no dish-level match found. Egg, parmesan, and pasta are live; bacon/guanciale is not. **Not computed this pass.** |
| **Pesto pasta** | no safe generic record found; recipe-derived candidate | Already searched, no dish-level match — only the sauce itself (already live) was found. Pasta + pesto sauce are both already live, making this the most straightforward of the three if a recipe estimate is ever wanted. **Not computed this pass.** |
| Shawarma, cholent, maqluba, jachnun, malawach, chamin, chraimeh | no safe generic record, kept excluded (confirmed in prior rounds) | Unchanged — no match found in any variant, and each is too cooking-method/ingredient-variable for a defensible recipe estimate |
| פיצה גבינה / פיצה ירקות (cheese/veg pizza, named separately from the generic pizza above) | keep excluded | Their only matches are explicitly topping-only records (not the whole dish) — and redundant anyway since generic pizza is already covered |

---

## 4. Explicit scope confirmation

- **No banana chips, and no other uncommon/low-priority items, appear anywhere in this report or in the proposed migration batch.**
- **The proposed batch is unchanged and contains nothing new from this pass**: `041` (merged to `main`, not yet applied to Supabase) + `042` (falafel, drafted, not applied) + `043` (בייגל fix + 6-item recategorization, drafted, not applied). No new SQL file was created this pass — every genuinely common food investigated was either already covered (bucket 1) or is honestly blocked pending live USDA access (buckets 2–3), not something resolvable by re-mining already-collected data again.

## Verification

- `node --test` across all 20 `*.test.mjs` files: **235/235 passing**.
- `npm run lint`: clean.
- `npm run build`: succeeds.
- No new SQL file this pass — nothing new to validate with `pglast`.
- No USDA API key used.
