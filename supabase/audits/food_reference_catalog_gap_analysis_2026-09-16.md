# Food Reference Catalog — Comprehensive Gap Analysis (2026-09-16)

**Read-only audit and proposal. No Supabase changes, no migrations, no merges, no deployment.**

## Method

`DEMO_KEY` remains rate-limited this session (~5.5h remaining at time of writing) and no personal key was used. Rather than wait, this audit mines the **1,010 real, already-verified candidates** from the original bulk USDA pass earlier in this session (490 live, 484 excluded with no valid match, 36 flagged `needs_review`) plus the current live `039`+`040` catalog state. Every value below is either already live, already fetched from a real USDA record this session, or explicitly marked as blocked pending a fresh live search — nothing is invented.

A new step this pass: every `needs_review` item was re-checked **numerically** against the actual category plausibility bounds (`foodCatalogPlausibility.js`) to find the *exact* reason it was held back — several turned out to be simple miscategorizations (a real, correct USDA value filed under the wrong category) rather than data problems, which changes the fix from "find a new source" to "just recategorize."

**Status key:** 1 = already present & verified · 2 = present, needs correction · 3 = missing, clean generic USDA match in hand · 4 = missing, recipe-derived estimate only · 5 = not safely addable this session (no source, or blocked on live search)

---

## 1. Proteins & Meat (`meat_poultry`)

**Status 1 (45 live):** raw/roasted chicken breast & thigh, ground beef (raw+cooked), ribeye/sirloin/tenderloin/chuck steaks (raw+cooked), lamb loin/leg/shoulder/ground, veal roasted, turkey whole/ground/breast, duck/goose roasted, beef liver/heart/tongue, chicken liver/gizzard, pastrami, corned beef canned, salami, deli roast beef, chicken wings (plain+fried), cordon bleu — comfortably covers the everyday staples.

**Status 2 — present, needs correction (4 rows, already drafted in `041`, pending your approval — not new work):**

| Hebrew | Current (wrong) | Corrected value | Source |
|---|---|---|---|
| חזה עוף צלוי | 79/16.79 (deli-sliced, fat-free) | **165/31.02** | fdcId 171477, SR Legacy |

*(מוצרלה, חמאת בוטנים, יוגורט יווני 0% are dairy/spread corrections — see §8.)*

**Status 3 — missing, clean match in hand, blocked only by a miscategorization (recommend recategorizing rather than searching further):**

| Hebrew / English | kcal/protein | Issue found | Fix |
|---|---|---|---|
| נקניקיה / Hot dog, beef | 310 / 11.7 | protein 11.7 is 0.3g under `meat_poultry`'s floor of 12 | marginal — accept as a documented exception, low priority |

**Status 5 — blocked, needs a fresh live search (no source in hand):** raw ground beef (lean/fat-specific variants — only the "unspecified fat" cooked variant is live), whole roasted chicken (with skin), plain cooked chicken thigh, merguez/beef sausage, kebab/kabab (beef, lamb, chicken — all composite, could become recipe-derived candidates once base ground-meat sources exist), schnitzel (**kept excluded per your prior decision** — only match is a Fast-foods industry average).

---

## 2. Fish (`fish_seafood`)

**Status 1 (29 live):** salmon (raw/baked/smoked), tuna (canned/fresh raw), tilapia, cod, sea bass, trout, mackerel, sole, halibut, carp, mullet, shrimp (raw/cooked), calamari fried, octopus, scallops, clams, crab, lobster, gefilte fish — very well covered.

**Status 3 — missing, clean match in hand, blocked only by a category-floor mismatch:**

| Hebrew / English | kcal/protein | Issue | Fix |
|---|---|---|---|
| צדפות (אוסטרות) גולמיות / Oysters, raw | 51 / 5.71 | protein floor for `fish_seafood` is 8 — oysters are a genuinely low-protein seafood outlier | document as a category exception, or add a slightly lower floor just for mollusks. Confidence: high (real record, fdcId 2706351, Survey FNDDS). Low priority (niche). |

**Status 5 — blocked, needs a fresh search:** herring, anchovies, canned sardines in oil, sushi-grade fish concepts (see §9 — sushi), fried fish in breading (non-branded).

---

## 3. Grains, Rice, Potatoes & Bread (`grain_carb` + `bread_bakery`)

**Status 1 (49 grain_carb + 28 bread_bakery live):** white/brown/black rice (raw+cooked), rice pilaf, quinoa, couscous, bulgur, oats, buckwheat, millet, teff, amaranth, corn flakes, white/whole-wheat/rye flour, potato (raw/baked/mashed/boiled-in-skin), sweet potato, white/whole-wheat/rye/multigrain/gluten-free/sourdough bread, challah, pita (white+whole wheat), flour+corn tortillas, dinner rolls, hamburger buns, croissants, crackers — very well covered.

**Status 2 — present, needs correction (new finding this pass):**

| Hebrew | Problem | Recommended fix |
|---|---|---|
| בייגל (bagel) | Currently matched to `Snacks, bagel chips, plain` (fdcId 173150, 451/12.34) — **bagel chips are not the same food as a whole bagel.** Same class of prep-state mismatch as the חזה עוף צלוי bug. | Needs a fresh live search for a real "Bagel, plain, enriched" record — blocked (status 5) until `DEMO_KEY` resets. |

**Status 3 — missing, clean match in hand, blocked only by miscategorization:**

| Hebrew / English | kcal/protein | Issue | Fix |
|---|---|---|---|
| בייגלה / Bagel chips | 451 / 12.3 (fdcId 2708292, Survey FNDDS — a **different, valid** record from the one wrongly live under בייגל above) | filed under `grain_carb` (ceiling 450), 1 kcal over | recategorize to `sweets_snacks` (ceiling 620) — fits cleanly, and correctly distinguishes "bagel chips" as its own snack food from "bagel" |
| גרנולה / Granola cookie | 464 / 9.8 (fdcId 2707933) | filed under `grain_carb` (ceiling 450), 14 over | recategorize to `sweets_snacks` (ceiling 620) — fits cleanly |
| קמח שקדים / Almond flour | 622 / 26.2 (fdcId 2261420, Foundation) | filed under `grain_carb` (ceiling 450/20), way over on both | recategorize to `nuts_seeds_fats` (bounds [350,920]/[0,35]) — fits cleanly, common low-carb baking ingredient |
| עמילן תירס / Cornstarch | 381 / 0.26 (fdcId 169698) | protein floor for `grain_carb` is 1 — cornstarch is genuinely near-zero-protein | document as an exception (no better category fits) |

**Status 5 — blocked, needs a fresh search (priority list from last review, restated):** basmati rice (specifically labeled), a generic non-branded French fries record, breadcrumbs, phyllo/filo dough, matzah (מצה — surprisingly zero match at all), Israeli couscous/ptitim (פתיתים), focaccia (a close-looking candidate exists — `Focaccia, Italian, plain` — but didn't clear strict token matching; worth a manual look next pass).

---

## 4. Pasta & Noodles (`grain_carb`, filtered)

**Status 1 (9 live) — already comprehensively covered, no action needed:** dry pasta (plain + whole-wheat), cooked pasta (plain + whole-wheat), egg noodles, rice noodles, soba noodles, macaroni & cheese (canned), macaroni/pasta salad with tuna.

**Status 4 candidate (not newly investigated, carried over):** sauced pasta dishes (bolognese, carbonara, pesto, alfredo, arrabbiata) have no generic single-record match and would need a recipe-derived approach once ground beef and cream-sauce base ingredients are confirmed — not attempted this pass.

**Status 5:** Israeli couscous/ptitim (see §3), fresh filled pasta (ravioli/tortellini) — only branded/restaurant-qualified matches found.

---

## 5. Legumes (`legume`)

**Status 1 (20 live) — excellent coverage:** chickpeas (raw+cooked+hummus), lentils (red/yellow, cooked), split peas, fava beans, soybeans, edamame, tofu, tempeh, kidney/white/pinto/black beans (cooked), green mung beans (cooked), white beans (raw).

**Status 3 — missing, clean match, blocked by category ceiling only:**

| Hebrew / English | kcal/protein | Issue | Fix |
|---|---|---|---|
| חלבון סויה טקסטורי (TVP) יבש / Textured vegetable protein, dry | 366 / 51.1 (fdcId 2707451, Survey FNDDS) | protein ceiling for `legume` is 45 — a dehydrated/concentrated protein product naturally exceeds fresh-legume protein levels | document as an exception for the "dry/concentrated protein" case, or file under a different category if one fits better. Genuinely useful for a fitness app. |

**Status 5:** dry green lentils (only red/yellow cooked live), seitan.

---

## 6. Vegetables (`vegetable`)

**Status 1 (63 live) — the single best-covered category:** tomato, cucumber, onion (white+red), all bell peppers, garlic, carrot, potato, sweet potato, broccoli, cauliflower, all lettuce types, spinach (raw/cooked/frozen), kale, cabbage (white+red, raw+cooked+sauerkraut), zucchini, eggplant, mushrooms (white+shiitake), leek, celery, beets, radish, asparagus, artichoke, corn, peas, fennel, kohlrabi, arugula, chard, endive, bok choy, green beans, dill pickles, sun-dried tomatoes.

**Status 5 — genuinely missing, no match found (real, common gaps worth prioritizing in the next live pass):** cherry tomatoes (עגבניות שרי — matched wrongly to "cherries, raw"!), green onion/scallion, portobello mushrooms, roasted eggplant, roasted red pepper, plain black/green olives (only a stuffed-olive and an unrelated "tapenade" record exist), pickled mixed vegetables (טורשי), baby spinach.

---

## 7. Fruits (`fruit`)

**Status 1 (48 live) — essentially complete for everyday fruit:** apple, banana, orange, mandarin, clementine, grapefruit, lemon, lime, grape, watermelon, melon, pineapple, mango, papaya, kiwi, avocado, pear, peach, apricot, plum, cherry, fig, date (incl. medjool), pomegranate, strawberry, blueberry, raspberry, mulberry, jackfruit, guava, passion fruit, starfruit, quince, loquat, lychee, dried variants of most of the above, raisins.

**Status 3 — missing, clean match, blocked only by category ceiling:**

| Hebrew / English | kcal/protein | Issue | Fix |
|---|---|---|---|
| קוקוס / Coconut meat, raw | 354 / 3.33 (fdcId 170169, SR Legacy) | `fruit`'s kcal ceiling is 350 — 4 kcal over | recategorize to `nuts_seeds_fats` (ceiling 920) — fits cleanly and matches how coconut is nutritionally used |

**Status 5:** pomelo, red/black currants, dried cranberries.

---

## 8. Dairy, Eggs & Common Spreads (`dairy` + `egg` + `nuts_seeds_fats`/`sauce_condiment` for spreads)

**Status 1 (37 dairy + 7 egg + 29 nuts_seeds_fats live):** milk (0%/1%/3%, soy, almond, goat, buttermilk/leben), yogurt (plain 3%/low-fat/vanilla/nonfat/Greek — the 2 branded ones are §2 below), kefir, cottage cheese 5%, cream cheese (regular+light), feta, cheddar, gouda, blue cheese, camembert, parmesan, ricotta, goat cheese, butter, cooking cream, coffee creamer, ice cream/frozen yogurt/pudding, all 4 egg preparations (fried/poached/hard-boiled/scrambled/omelet), egg yolk, tahini, hummus, peanut/almond/cashew butter, all common nuts, chia/flax/pumpkin/sunflower/sesame seeds, all common cooking oils.

**Status 2 — present, needs correction (already drafted in `041`, pending your approval):**

| Hebrew | Current (wrong) | Corrected value / action |
|---|---|---|
| מוצרלה | 141/31.7 (nonfat) | **299/22.17** (whole milk) — fdcId 170845 |
| חמאת בוטנים | 520/25.9 (reduced fat) | **598/22.2** (regular) — fdcId 2707537 |
| יוגורט יווני 0% | 93/7.64, CHOBANI mango | **61/10**, plain nonfat — fdcId 330137 |
| יוגורט אפרסק | CHOBANI peach | **DELETE** — no clean generic replacement |
| עוגיות ג'ינג'ר | Archway brand | **DELETE** — no clean generic replacement |

**Status 3 — missing, clean match in hand, blocked only by category assignment:**

| Hebrew / English | kcal/protein | Issue | Fix |
|---|---|---|---|
| חלבון ביצה / Egg white, raw | 52 / 10.9 (fdcId 172183, SR Legacy) | `egg`'s kcal floor is 60 — 8 kcal under | lower the `egg` category's floor slightly (~50), or document as an exception. **High-value addition** — egg whites are a very commonly logged food in a fitness/nutrition app specifically. |
| חמאת שקדים / Almond butter | 641 / 20.7 (fdcId 2707533, Survey FNDDS) | filed under `sauce_condiment` (protein ceiling 16) instead of `nuts_seeds_fats` (ceiling 35, where tahini/peanut butter/cashew butter already correctly live) | recategorize |
| ממרח חמאת בוטנים חלק / Peanut butter, smooth, reduced fat | 520 / 25.9 (fdcId 172458) | same `sauce_condiment` miscategorization; also near-duplicate of the corrected חמאת בוטנים row — optional, lower priority | recategorize to `nuts_seeds_fats` if you want a separate "reduced-fat" variant alongside the regular one |

**Status 5 — blocked, needs a fresh search:** labneh (לבנה — very common Israeli/Mediterranean spread, zero match), halloumi (הלומי), margarine (מרגרינה — `no_search_results`), sour cream (שמנת חמוצה), whipped cream, silan/date syrup (סילאן — very common Israeli spread, closest match was just "Date," not the syrup), plain cottage cheese at other fat percentages (9%/0%), mascarpone, quark.

**Status 4 candidate — labneh as a recipe-derived estimate:** labneh is strained yogurt (whey removed, concentrating protein/fat) — this is exactly the same "yield-loss concentration" model `recipeCalculator.js` already implements for matbucha/shakshuka. Not computed this pass (no ratios approved yet), but flagged as a good candidate for the same tool: take an existing verified yogurt row (e.g. `יוגורט יווני`, fdcId 170903, 73/9.95) with a proposed straining-yield fraction, rather than inventing a value from scratch.

---

## 9. Common Israeli/Mediterranean Prepared Dishes (`prepared_dish` + `soup_salad` + `sandwich`)

**Status 1 (20 prepared_dish + 13 soup_salad live) — real coverage exists:** stuffed cabbage, lasagna (meat+veg), mac & cheese, lentil soup, chicken curry, pad thai, frozen cheese pizza, chili con carne, fried rice with chicken, French onion soup, vegetable/miso soup, chicken broth, cream of mushroom soup, Israeli salad (2 name variants), Greek salad, tabbouleh, coleslaw, tuna salad, Caesar salad, egg-and-potato salad.

**Status 4 — recipe-derived estimates (carried from last review, unchanged, still pending your ratio/yield approval — not applied):**

| Dish | Estimate | Status |
|---|---|---|
| מטבוחה / Matbucha | 146.87 kcal / 1.59g protein per 100g | proposed, awaiting ratio/yield sign-off |
| שקשוקה / Shakshuka | 145.67 kcal / 6.92g protein per 100g | proposed, awaiting ratio/yield sign-off — **see note below, may not need to be recipe-derived at all** |

**New finding — reconsider שקשוקה as a possible status-3 item, not status-4:** the closest excluded candidate for שקשוקה was `Egg omelet or scrambled egg, with tomatoes, fat added` — a genuine, generic Survey (FNDDS) composite-dish record that conceptually **is** shakshuka (eggs cooked with tomatoes), just phrased differently in USDA's taxonomy. It failed strict token matching, not because it's a bad match. **Recommend a manual, human-reviewed look at this exact record in the next live pass** before committing to the recipe-derived estimate above — if it holds up, it would be a much stronger, direct-USDA-record status-3 addition instead.

**New status-4 candidate — Sabich (סביח):** a decomposable sandwich (pita + fried eggplant + hard-boiled egg + hummus + Israeli salad + amba + tahini) — every one of those base ingredients is already live and verified in the catalog except fried eggplant (only raw eggplant is live) and amba (no match). Worth a recipe-derived attempt once those two gaps are filled.

**Status 5 — not safely addable this session (either no source exists, or the dish is too cooking-method-dependent for a defensible ratio-based recipe):**

| Dish | Reason |
|---|---|
| שווארמה / Shawarma | **kept excluded per your prior instruction** — no match, method-dependent (rotisserie fat rendering), "gyro" not searched |
| צ'ולנט / Cholent | no match; too many variable slow-cook ingredients (meat, beans, barley, potato, egg) for a defensible fixed ratio |
| מקלובה / Maqluba | no match; complex layered rice/meat/vegetable dish, same issue |
| ג'חנון / Jachnun, מלאווח / Malawach | no match; yeasted-dough Yemeni breads with no documented generic ratio |
| חמין / Chamin | no match, same class as cholent |
| חריימה / Chraimeh (spicy fish stew) | no match |
| Falafel in pita (פיתה ממולאת פלאפל) | already correctly excluded in `039`'s delete list — the standalone falafel component (§ already covered by `042`) plus pita (already live) could be composed on the frontend rather than needing its own catalog row |

---

## Summary counts (this report)

- **~340 items already live and verified** across the 9 categories sampled (compact "Status 1" lists above name the representative staples; full detail is the existing 039+040 catalog).
- **9 items present but need correction** — 5 already drafted in `041` (pending your approval), 1 new finding (בייגל, blocked pending fresh search).
- **9 items missing with a clean USDA match already in hand**, blocked only by a category/bounds mismatch, not a data problem — recommend a small batch of category-reassignment + bound-tuning decisions rather than new searches.
- **3 items proposed as recipe-derived estimates** (matbucha, shakshuka — carried over; sabich — new candidate, blocked on 2 missing base ingredients).
- **~25 items explicitly identified as blocked pending a fresh live search** (French fries, ground beef raw, breadcrumbs, phyllo, basmati rice, cherry tomatoes, labneh, silan, margarine, halloumi, matzah, plain olives, and others named above).
- **7 items confirmed not safely addable** with any current or foreseeable USDA-only approach (shawarma, cholent, maqluba, jachnun, malawach, chamin, chraimeh).

## Explicit decisions needed from you

1. **Category-reassignment batch** (all backed by real, already-verified USDA values — no new sourcing needed): coconut, almond butter, peanut butter (reduced-fat variant), almond flour, bagel chips, granola → `nuts_seeds_fats`/`sweets_snacks` as detailed in each section. Approve as a batch, or individually?
2. **Bound-tuning decisions**: lower `egg`'s kcal floor to admit egg white (52 kcal); document exceptions for oysters (fish protein floor), TVP (legume protein ceiling), cornstarch (grain protein floor) — or handle each as a one-off documented exception instead of moving the general bound?
3. **שקשוקה**: hold the recipe-derived estimate, or prioritize a manual look at the `Egg omelet or scrambled egg, with tomatoes, fat added` record first (possible direct-match upgrade)?
4. **בייגל correction**: confirm this should go on the next live-search priority list (it's a real, live, wrong-prep-state bug, same class as חזה עוף צלוי).
5. **Priority order for the next live-verification pass**, given everything found this session: ground beef (raw), breadcrumbs, phyllo dough, basmati rice, non-branded French fries, cherry tomatoes, labneh base research, silan, margarine, matzah, the real bagel record, plain olives, and the שקשוקה omelet-record cross-check above.

No Supabase changes, no migration, no merge, no deployment occurred in this pass.
