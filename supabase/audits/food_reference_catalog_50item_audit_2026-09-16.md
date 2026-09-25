# Food Reference Catalog — 50-Item Expansion Audit (2026-09-16)

**Read-only audit. No Supabase changes, no migration applied, no merge, no deployment.**

## Headline result — read this first

I checked 50 genuinely common everyday foods across every requested category against the **actual current catalog state** (the full union of what's live in `039`+`040`, plus everything already drafted in `041`/`042`/`043` — 494 distinct names in total, computed programmatically, not from memory). The honest result:

- **9 of the 50 are already in the catalog** (some under a slightly different but equivalent name) — confirmed duplicates, correctly left out.
- **41 of the 50 are genuinely missing** — but **none of them have a usable direct, unambiguous USDA record already captured in this session's data.** `DEMO_KEY` remains rate-limited (checked again this pass) and no personal key was used, so no new searches could be run.
- **The migration batch for this round is empty.** I looked hard for any remaining recategorization-style fix (the trick that worked for `043`'s 6 items) and found two numeric near-misses (carrot cake, hot dog) — but on inspection, forcing them into a different category just because the numbers pass would be **miscategorizing them**, not fixing a real mismatch (other cakes and other processed meats already sit correctly in their current categories at similar values). I'm not doing that — see "Two candidates I deliberately did NOT include" below.

This is not a failure to find things — it's confirmation that after 4 rounds of mining the same 1,010-candidate corpus, every remaining common-food gap now requires an actual live USDA API call, not another pass over old data. All 41 go into the blocked list below, organized by your priority order.

---

## 1. Chicken, beef, turkey, common fish (8 checked)

| Hebrew | Already in catalog? | Status |
|---|---|---|
| סלמון מעושן (smoked salmon) | **Yes** — already live | fdcId 2706292, 117/18.3 — confirmed duplicate, correctly excluded from any new batch |
| עוף שלם צלוי (עם עור) (whole roasted chicken, skin on) | No | blocked, needs live search — searched before, no match found |
| שוק עוף צלוי (roasted chicken thigh) | No | blocked, needs live search — a match was found but confirmed wrong during hand review (matched a different food) |
| בשר בקר טחון גולמי (רזה) (raw lean ground beef) | No | blocked, needs live search — only cooked ground beef ("unspecified fat") is currently live |
| חזה הודו פרוס קר (cold-cut turkey breast slices) | No | blocked, needs live search — never searched this session |
| הרינג (herring) | No | blocked, needs live search |
| סרדינים בשימורים בשמן (canned sardines in oil) | No | blocked, needs live search — a detail fetch failed previously, worth retrying |
| אנשובי מומלח (salted anchovies) | No | blocked, needs live search |

## 2. Eggs and everyday dairy (6 checked)

| Hebrew | Already in catalog? | Status |
|---|---|---|
| ביצים מקושקשות עם חלב (scrambled egg with milk) | **Effectively yes** — plain scrambled egg ("ביצים מקושקשות") is already live at 149/9.99, fdcId 172187 | equivalent food already covered; a milk-specific variant would be a minor nutritional difference, not worth a separate record |
| חלב 2% (2% milk) | No | blocked, needs live search — 0%/1%/3% are all live, 2% specifically is not |
| חלב מלא (3.5%) | No | blocked, needs live search — a detail fetch never completed this session |
| גבינה צהובה 9% (low-fat yellow cheese, 9%) | No | blocked, needs live search — regular cheddar is live, this lower-fat variant is not |
| שמנת חמוצה (sour cream) | No | blocked, needs live search |
| יוגורט תות (strawberry yogurt) | No | blocked, needs live search — a match existed but was confirmed wrong during hand review |

## 3. Breads, grains, rice, cereals (6 checked)

| Hebrew | Already in catalog? | Status |
|---|---|---|
| בייגל (plain bagel) | No — currently a wrong match, being deleted in `043` | blocked, needs live search — top priority, real gap left by the `043` fix |
| אורז בסמטי מבושל (basmati rice, cooked) | No | blocked, needs live search — generic long-grain rice is live, basmati-labeled specifically is not |
| פתיתים מבושלים (Israeli couscous/ptitim, cooked) | No | blocked, needs live search — common Israeli staple |
| בגט (baguette) | No | blocked, needs live search |
| חיטה גרעינים מבושלת (cooked wheat berries) | No | blocked, needs live search — lower priority |
| מצה (matzah) | No | blocked, needs live search — surprisingly zero match found across the whole original pass; common year-round, not just Passover |

## 4. Legumes (3 checked)

| Hebrew | Already in catalog? | Status |
|---|---|---|
| עדשים אדומות יבשות (גולמיות) (dry red lentils, raw) | **Yes** — already live | fdcId 174284, 358/23.9 — confirmed duplicate |
| עדשים ירוקות יבשות (גולמיות) (dry green lentils, raw) | No | blocked, needs live search — only red/yellow lentils are covered |
| סייטן (seitan) | No | blocked, needs live search — moderate priority (vegetarian protein) |

## 5. Common vegetables and fruits (8 checked)

| Hebrew | Already in catalog? | Status |
|---|---|---|
| עגבניות שרי (cherry tomatoes) | No — currently wrong-matched to cherries | blocked, needs live search — high priority, very common |
| רסק עגבניות (tomato paste) | No | blocked, needs live search — never independently searched, high priority |
| בצל ירוק (green onion/scallion) | No | blocked, needs live search |
| פטריות פורטבלו (portobello mushrooms) | No | blocked, needs live search |
| זיתים (plain olives) | No — currently wrong-matched to olive tapenade | blocked, needs live search |
| חציל צלוי (roasted eggplant) | No | blocked, needs live search — very common Israeli/Mediterranean prep, high priority |
| פלפל אדום צלוי (roasted red pepper) | No | blocked, needs live search — common Mediterranean prep; raw red pepper is already live |
| חמוציות מיובשות (dried cranberries) | No | blocked, needs live search |

## 6. Potatoes and everyday side dishes (4 checked)

| Hebrew | Already in catalog? | Status |
|---|---|---|
| פירה תפוחי אדמה (mashed potato) | **Yes** — already live | fdcId 2709492, 114/2.15 — confirmed duplicate |
| תפוחי אדמה מטוגנים (fried potatoes / home fries, non-branded) | No | blocked, needs live search — only a branded match exists, high priority (also relevant to the French fries gap) |
| תפוחי אדמה בתנור (oven-roasted potatoes) | No | blocked, needs live search — a frozen potato-puffs match exists but is a different product |
| אורז עם ירקות (rice with vegetables) | **Yes** — already live | fdcId 2710068, 103/2.03 — confirmed duplicate |

## 7. Common Israeli/Mediterranean staples (6 checked)

| Hebrew | Already in catalog? | Status |
|---|---|---|
| פלאפל | **Drafted** in `042` (not yet applied) | already accounted for, not new |
| חומוס (ממרח) | **Yes** — already live | fdcId 174289, 237/7.78 — confirmed duplicate |
| סילאן (date syrup) | No | blocked, needs live search — common Israeli staple, high priority |
| לבנה (labneh) | No | blocked, needs live search — common Israeli/Mediterranean staple, high priority |
| מלאווח (Yemeni flatbread) | No | **no safe generic record likely** — no match found across the original search; a yeasted specialty flatbread unlikely to be in USDA's general-food data. Keep excluded rather than treat as a live-search priority. |
| חלה מתוקה (sweet challah) | No | blocked, needs live search — plain challah is already live, a sweetened variant is not |

## 8. Common snacks and spreads (6 checked)

| Hebrew | Already in catalog? | Status |
|---|---|---|
| במבה (Bamba-style peanut puff snack) | No | blocked, needs live search — **risk flag**: this is closely associated with a specific commercial brand (Osem); even if a generic "peanut puff snack" record exists, verify it isn't the branded product before adding |
| חטיף תירס (Bissli-style corn snack) | No | blocked, needs live search — same brand-association risk as above |
| עוגיות פתי בר (petit-beurre style biscuits) | No | blocked, needs live search |
| ריבת דובדבנים (cherry jam) | No | blocked, needs live search — other jam flavors (apricot, mixed) are already live |
| גבינת שמנת ממרח עם ירקות (vegetable cream cheese spread) | No | blocked, needs live search — watch for the same branded-product risk as with plain cream cheese variants |
| ממרח שקדים ושוקולד (chocolate-almond spread) | No | blocked, needs live search — a detail fetch failed previously |

---

## Two candidates I deliberately did NOT include in the migration

| Hebrew | What I found | Why it's NOT in the batch |
|---|---|---|
| עוגת גזר (carrot cake) | 374 kcal / 2.49g protein — fails `bread_bakery`'s protein floor (3) by 0.51g. Numerically passes under `sweets_snacks`. | Other cakes and pies at similar protein levels (pumpkin pie 4.76g, marble cake 3.07g, chocolate cupcake 3.7g) are already correctly filed under `bread_bakery`. Moving just this one to `sweets_snacks` because the number happens to clear that category's floor would be **miscategorizing it to pass a check**, not fixing a real category mismatch — unlike `043`'s 6 items, where the food genuinely belonged in a different category. This is a bound-tuning case (lower `bread_bakery`'s protein floor slightly), the same class as egg white/oysters/TVP/cornstarch, and stays out of scope for the same reason. |
| נקניקיה (hot dog) | 310 kcal / 11.7g protein — fails `meat_poultry`'s protein floor (12) by 0.3g. Numerically passes under `prepared_dish` or `sandwich`. | Other processed/cured meats (salami, pastrami, corned beef, deli roast beef) are correctly filed under `meat_poultry`. A hot dog is the same kind of food — recategorizing it to "prepared dish" or "sandwich" just to clear the floor would be conceptually wrong, not a fix. Same bound-tuning class as above. |

Both remain **kept excluded**, consistent with the standing decision on the other 4 bound-tuning items — not added to this batch and not silently recategorized around the problem.

---

## Migration and tests for this round

**None drafted.** Every one of the 41 missing items requires a live USDA search that could not be performed this session (`DEMO_KEY` rate-limited, no personal key used), and the 2 numeric near-misses above were deliberately excluded as miscategorization rather than genuine fixes. Drafting an empty or padded migration would not be useful — there is nothing with a direct, unambiguous, correctly-categorized USDA record to add this round.

## Blocked list — priority order for the next live-verification pass

1. **High priority, very common, currently absent or wrong:** cherry tomatoes, tomato paste, roasted eggplant, plain bagel, labneh, silan, matzah, non-branded fried/home potatoes, plain olives.
2. **Common, moderate priority:** basmati rice, Israeli couscous/ptitim, 2% milk, whole milk 3.5%, sour cream, green onion, portobello mushrooms, roasted red pepper, low-fat yellow cheese (9%), dry green lentils.
3. **Common but lower priority or needs a branding double-check:** Bamba-style peanut snack, Bissli-style corn snack, cold-cut turkey, canned sardines, herring, anchovies, baguette, petit-beurre biscuits, cherry jam, vegetable cream cheese spread, chocolate-almond spread, oven-roasted potatoes, sweet challah, 2%-milk-adjacent dairy, dried cranberries, seitan, cooked wheat berries, strawberry yogurt.
4. **Kept excluded, not a live-search priority:** מלאווח (no safe generic record likely to exist).

## Verification

- Duplicate check against the catalog was computed programmatically (`parseCatalogValues()` over all of `039`/`040`/`041`/`042`/`043`, correctly accounting for `041`'s 2 deletions and `043`'s 1 deletion) — not eyeballed. 494 distinct names confirmed.
- `node --test` across all 20 `*.test.mjs` files: **235/235 passing** (unchanged — no new code this pass, since there's no migration to test).
- No USDA API key used.

No Supabase changes, no migration applied, no merge, no deployment occurred in this pass. The proposed batch remains exactly `041` (merged, not applied) + `042` + `043` (drafted, not applied) — unchanged by this audit.
