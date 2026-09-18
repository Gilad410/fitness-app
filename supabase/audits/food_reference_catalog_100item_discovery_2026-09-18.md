# Food Reference Catalog — 100-Item Discovery Report (2026-09-18)

**Read-only discovery report. No Supabase changes, no migration applied, no merge, no deployment.**

## Sourcing note — FoodsDictionary was not used

You linked FoodsDictionary.co.il as a discovery/comparison source. I checked the linked page (a single product page, Entrecôte beef) — its footer states "all content on this site is the property of FoodsDictionary," an explicit copyright claim, with no license on record. Producing 100 candidates each with a FoodsDictionary page URL would mean visiting on the order of 100 individual pages on their site and extracting structured data from each — at that scale, that's systematic extraction of their proprietary database, not a spot-check, and it's exactly what your own instructions already flagged as needing permission we don't have. I raised this and you chose to proceed without FoodsDictionary. Everything below comes from two places only: my own general knowledge of common foods, and this session's own already-collected USDA search data — nothing is sourced from or compared against FoodsDictionary.

**USDA cross-checking is also unavailable this session** — the API host isn't reachable from this environment at all right now (beyond the earlier rate-limiting). So **nothing below carries a confirmed calories/protein value or FDC source ID** — that would mean inventing numbers, which I won't do. Every candidate is a **name + category + prep-state proposal**, explicitly pending live USDA verification before anything is drafted as SQL.

## Method

Checked candidates against the **actual current catalog** (494-name set, computed programmatically from `039`/`040`/`041`/`042`/`043`, same method as the last audit) to rule out duplicates. Then curated down to 100 genuinely common everyday foods from a much larger pool (414 candidates surfaced across this session's own prior USDA searches, most already confirmed to have no clean generic match yet), prioritizing your stated order: Israeli foods, meats, poultry, fish, dairy, breads, grains, vegetables, fruits, snacks, common cooked foods.

---

## 1. Candidates ready for review (72) — genuinely common, generic, no obvious branding/composite-dish risk

### Meat & poultry (16)
שניצל עוף (chicken schnitzel — a non-Fast-Foods, home-style record if one exists) · שניצל הודו (turkey schnitzel) · שניצל עגל (veal schnitzel) · שווארמה עוף (chicken shawarma) · שווארמה הודו (turkey shawarma) · קבב עוף (chicken kebab) · קבב בקר (beef kebab) · קבב טלה (lamb kebab) · עוף שלם צלוי עם עור (whole roasted chicken, skin on) · עוף בתנור (oven-baked chicken) · חזה עוף מעושן (smoked chicken breast) · נקניקיה (hot dog) · נקניק מרגז (merguez sausage) · פרגית צלויה (grilled small chicken/thigh) · בשר בקר טחון גולמי רזה (raw lean ground beef) · סטייק בקר צלוי (cooked grilled beef steak)

### Fish (5)
דניס גולמי (raw dorade/sea bream) · דג סלמון בתנור (oven-baked salmon) · הרינג (herring) · סרדינים בשימורים בשמן (canned sardines in oil) · פילה סלמון מטוגן (pan-fried salmon fillet)

### Dairy (12)
קוטג' 9% · קוטג' 0% · גבינה צהובה 9% · גבינה 26% · חלב 2% · חלב מלא 3.5% · שמנת חמוצה (sour cream) · שמנת 15% (light cooking cream) · שמנת 38% (heavy cream) · מרגרינה · לבנה · הלומי

### Breads, grains, rice, cereals (14)
מצה (matzah) · חלה מתוקה (sweet challah) · פיתה עיראקית / לאפה · בגט (baguette) · אורז בסמטי מבושל · אורז בסמטי גולמי · פתיתים מבושלים (Israeli couscous/ptitim) · קוסקוס גולמי (raw couscous) · קינואה גולמית (raw quinoa) · עמילן תירס / קורנפלור (cornstarch) · תפוחי אדמה מטוגנים (fried potatoes, non-branded) · תפוחי אדמה בתנור (oven-roasted potatoes) · לביבות תפוחי אדמה (potato latkes) · שיבולת שועל מבושלת / דייסה (cooked oatmeal)

### Legumes (4)
עדשים ירוקות יבשות (dry green lentils, raw) · פול מיובש מבושל (dried fava beans, cooked) · סייטן (seitan) · חלבון סויה טקסטורי יבש (dry TVP — as a distinct dry/raw ingredient, separate from the already-known bound-tuning issue on the previously-found record)

### Vegetables (10)
עגבניות שרי (cherry tomatoes) · רסק עגבניות (tomato paste) · בצל ירוק (green onion/scallion) · פטריות פורטבלו (portobello mushrooms) · זיתים (plain olives) · חציל צלוי (roasted eggplant) · פלפל אדום צלוי (roasted red pepper) · צנונית ירוקה / דייקון (daikon radish) · תרד בייבי (baby spinach) · כרובית אפויה (roasted cauliflower)

### Fruits (5)
חמוציות מיובשות (dried cranberries) · פומלה (pomelo) · אשכולית לבנה (whole white grapefruit, not juice) · דומדמנית אדומה (red currant) · קיווי צהוב (golden kiwi)

### Snacks & spreads, generic only (6)
ריבת דובדבנים (cherry jam) · ממרח שקדים ושוקולד (chocolate-almond spread) · גבינת שמנת ממרח עם ירקות (vegetable cream cheese spread) · עוגיות פתי בר (petit-beurre style biscuits) · בראוני (brownie, generic) · חלבה (halva — a genuinely generic confection, not a single brand, common across the Middle East)

---

## 2. Duplicates — already effectively in the catalog, excluded from the list above

| Candidate considered | Already covered by |
|---|---|
| ביצה מקושקשת עם חלב (scrambled egg with milk) | ביצים מקושקשות (plain scrambled egg) already live — same food, minor variant |
| חלבון ביצה (egg white) | not a name-duplicate, but already tracked separately as a known bound-tuning item, not re-added here to avoid contradicting that existing finding |
| חומוס שום (garlic hummus) | חומוס (ממרח) already live — a flavored variant, not a distinct food worth a separate catalog row |
| דג בקלה מבושל / cod | already live in multiple forms (raw + Pacific cooked) — not re-proposed |

## 3. Uncertain items — branding risk or composite/recipe-only, kept out of the "ready" list

| Item | Concern |
|---|---|
| במבה / חטיף במבה / במבה אגוזי לוז (Bamba) | Closely tied to a specific commercial brand (Osem) even in everyday Hebrew usage — verify a genuinely generic "peanut puff snack" USDA record exists before treating this as generic |
| ביסלי (Bissli) | Same brand-association risk |
| קליק / קליק פירות יער (Klik) | Same — a specific Elite-brand chocolate-wafer product |
| קרמבו (Krembo) | Originated as a brand name but is now used generically in Israeli Hebrew for the whole marshmallow-on-biscuit category — genuinely ambiguous; needs a judgment call, not a default "generic" assumption |
| תפוצ'יפס (Tapuchips) | Specific brand name for a potato-chip product line |
| פרינגלס (Pringles) | Explicitly branded, excluded outright, not a candidate |
| מוסקה, מקלובה, חמין, צ'ולנט, קובה (all variants), ג'חנון, מלאווח, סביח, שקשוקה, שווארמה (as a dish) | Composite Israeli/Mediterranean dishes — **already established in prior rounds this session** to have no direct generic USDA record; recipe-derived only, or not safely addable at all (shawarma). Not re-proposed as new "ready" candidates — restated here only so this list doesn't silently omit them without explanation. |
| לחם אחיד ("unified bread," a specific historical Israeli subsidized-bread standard) | Likely too specific/regulatory a concept to have a distinct generic USDA nutrition record — needs a sanity check before searching |

---

## 4. Verification status — applies to every item above

**Nothing in this report has been checked against USDA FoodData Central or any other authoritative source.** The API is unreachable from this session right now (not just rate-limited). Every item in bucket 1 is a **proposed search target**, not a verified candidate — before any of them can be drafted into SQL, each needs: a live USDA search, confirmation of a direct/generic (non-restaurant, non-branded, non-Fast-Foods) match, and a plausibility check under the correct category. None of that has happened yet for any item in this report.

## Explicit exclusions honored

- No sushi, no pasta dishes (per your standing instruction from the prior round).
- No banana chips.
- No branded or restaurant items in bucket 1 (bucket 3 exists specifically to isolate branding-risk items so they don't leak into the "ready" list).
- No Fast-foods averages.
- No supplements.
- No recipe-derived values — nothing in this report has any computed value at all, since nothing was cross-checked against a source.

## What's needed to move this forward

A live USDA search pass (via `DEMO_KEY` once its rate limit resets, or a personal key) against the 72 "ready for review" names, plus a genericness judgment call on the 7 brand-adjacent snack items in bucket 3. No SQL, no Supabase change, and no migration file has been drafted this round — there is nothing verified yet to draft.
