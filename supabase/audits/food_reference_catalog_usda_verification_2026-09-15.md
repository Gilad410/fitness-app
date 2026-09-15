# USDA FoodData Central Verification -- Full Audit Report (Final)

Generated this session across three verification rounds. Source: USDA 
FoodData Central API (live queries, real personal API key, deleted after 
every run -- never the shared DEMO_KEY), api.nal.usda.gov/fdc/v1. License: 
USDA FoodData Central data is U.S. Government work, public domain (no 
copyright restriction) per USDA's stated terms -- freely usable.

Round 3 note: a final pre-commit static scan (re-examining already-fetched 
descriptions, no new API calls) found 2 more wrong matches ("dry mix" powder 
products matched for prepared desserts/cookies) plus confirmed 1 from round 2 
("White grapefruit, raw" matched a juice record). The matcher was fixed for 
future runs ("juice" red-flagged; a "dry mix" phrase check added) but these 
3 specific items were NOT re-verified against a fresh API call this round -- 
moved to needs_review instead, per instruction, rather than re-querying.

## Exact final counts
- Candidates processed: 1010 (349 pre-existing catalog rows + 661 candidate new rows)
- **Final verified (in the migration files): 490**
- Needs manual review (human decision required, NOT included in the verified count or the migration files): 36
- Excluded (no reliable match found, or a match was found and hand-rejected as wrong; NOT included): 484

## Source coverage
- Foundation: 49
- SR Legacy: 263
- Survey (FNDDS): 178
- Branded: 0

Confidence tier:
- high: 95
- low: 185
- medium: 210

## Quality gate results (all re-checked against the final 490)
- Duplicate names (case-insensitive): 0
- Negative or non-numeric calories/protein: 0
- Invalid category/basis enum values: 0
- Rows missing source_id/source_url/checked-date: 0
- Restaurant-chain or "restaurant"-qualified records: 0
- Fast-food industry-wide-average records: 0 (all 3 moved to needs_review)
- **Duplicate USDA record used for 2+ different catalog names: 17 groups -- unresolved, your decision**

### Duplicate-fdcId groups (full list)
- fdcId 168191 "Dates, medjool" (277 kcal / 1.81g protein) <- תמר, תמר מדג'ול
- fdcId 169276 "Radishes, raw" (16 kcal / 0.68g protein) <- צנון, צנון טרי
- fdcId 2708474 "Cereal, corn flakes, flavored" (375 kcal / 4.77g protein) <- דגני בוקר, קורנפלקס
- fdcId 170204 "Beef, cured, pastrami" (147 kcal / 21.8g protein) <- פסטרמה, פסטרמה בקר
- fdcId 174197 "Fish, flatfish (flounder and sole species), cooked, dry heat" (86 kcal / 15.24g protein) <- פילה סול מבושל, סול (לימונית) מבושל
- fdcId 175124 "Fish, mullet, striped, cooked, dry heat" (150 kcal / 24.81g protein) <- דג בורי מבושל, דג מושט מבושל
- fdcId 175242 "Beans, kidney, red, mature seeds, cooked, boiled, with salt" (127 kcal / 8.67g protein) <- שעועית מבושלת, שעועית אדומה מבושלת
- fdcId 175254 "Lentils, mature seeds, cooked, boiled, with salt" (114 kcal / 9.02g protein) <- עדשים מבושלות, עדשים צהובות מבושלות
- fdcId 170273 "Chocolate, dark, 70-85% cacao solids" (598 kcal / 7.79g protein) <- שוקולד מריר, שוקולד מריר 70%
- fdcId 328637 "Cheese, cheddar" (408 kcal / 23.3g protein) <- גבינה צהובה, צ'דר
- fdcId 2709823 "Lettuce, salad with assorted vegetables excluding tomatoes and carrots, no dressing" (23 kcal / 1.19g protein) <- סלט ירקות, סלט חסה ועגבניות
- fdcId 174987 "Croissants, butter" (406 kcal / 8.2g protein) <- קרואסון, קרואסון חמאה
- fdcId 173435 "Cheese, goat, soft type" (264 kcal / 18.52g protein) <- גבינת עיזים, גבינת עז רכה
- fdcId 2707038 "Tuna salad sandwich wrap" (244 kcal / 10.6g protein) <- סנדוויץ' טונה, רול טורטייה עם טונה
- fdcId 168014 "Cookies, animal crackers (includes arrowroot, tea biscuits)" (446 kcal / 6.9g protein) <- ביסקוויטים, ביסקוויט פשוט (טי-בורד)
- fdcId 2710289 "Chocolate hazelnut spread" (539 kcal / 5.41g protein) <- נוטלה, ממרח שוקולד
- fdcId 168567 "Tomatoes, sun-dried" (258 kcal / 14.11g protein) <- עגבניות מיובשות בשמש, עגבניות מיובשות ולא כבושות

## needs_review -- full list (all 36, none included in the verified count or migration files)
- קוקוס (fruit) -> "Nuts, coconut meat, raw" (fdcId 170169) [354, 3.33] -- None
- בייגלה (grain_carb) -> "Bagel chips" (fdcId 2708292) [451, 12.3] -- None
- גרנולה (grain_carb) -> "Cookie, granola" (fdcId 2707933) [464, 9.8] -- None
- שניצל עוף (meat_poultry) -> "Fast foods, chicken, breaded and fried, boneless pieces, plain" (fdcId 170718) [307, 15.92] -- industry-wide "fast foods" USDA average, not a named restaurant -- flagged for an explicit keep/drop decision
- נקניקיה (meat_poultry) -> "Hot dog, beef" (fdcId 2706167) [310, 11.7] -- None
- זיתים (nuts_seeds_fats) -> "Olive tapenade" (fdcId 2710092) [282, 0.73] -- None
- חטיף אנרגיה (sweets_snacks) -> "Formulated bar, MARS SNACKFOOD US, SNICKERS MARATHON Energy Bar, all flavors" (fdcId 173136) [386, 21.91] -- None
- פלאפל (prepared_dish) -> "Falafel" (fdcId 2707408) [514, 8.28] -- None
- עוף ברוטב עגבניות (meat_poultry) -> "Stuffed shells, with chicken, with tomato sauce" (fdcId 2708783) [136, 10.8] -- None
- כדורי בשר ברוטב (meat_poultry) -> "Spaghetti, with meatballs in tomato sauce, canned" (fdcId 172099) [100, 4.37] -- None
- חביתת ירקות (egg) -> "Other vegetables as ingredient in omelet" (fdcId 2710808) [39, 3.24] -- None
- חלבון ביצה (egg) -> "Egg, white, raw, fresh" (fdcId 172183) [52, 10.9] -- None
- תבשיל שעועית (prepared_dish) -> "Stew, pinto bean and hominy, badufsuki (Hopi)" (fdcId 169006) [32, 1.42] -- None
- קרם קרמל (sweets_snacks) -> "Flan, caramel custard, dry mix" (fdcId 169602) [348, 0] -- matched "Flan, caramel custard, dry mix" -- an unprepared powder mix, not the prepared dessert. Matcher fixed (dry-mix phrase check added) but not re-run this round.
- חמאת שקדים (sauce_condiment) -> "Almond butter" (fdcId 2707533) [641, 20.7] -- None
- בננה מיובשת (צ'יפס בננה) (fruit) -> "Banana chips" (fdcId 2709200) [519, 2.3] -- None
- דלעת אפויה (vegetable) -> "Seeds, pumpkin and squash seed kernels, roasted, without salt" (fdcId 170557) [574, 29.84] -- None
- עמילן תירס (קורנפלור) (grain_carb) -> "Cornstarch" (fdcId 169698) [381, 0.26] -- None
- קמח שקדים (grain_carb) -> "Flour, almond" (fdcId 2261420) [622.042, 26.24375] -- None
- עוגיות שוקולד צ'יפס (bread_bakery) -> "Cookies, chocolate chip, dry mix" (fdcId 174952) [497, 4.6] -- matched "Cookies, chocolate chip, dry mix" -- an unprepared powder mix, not baked cookies. Matcher fixed (dry-mix phrase check added) but not re-run this round.
- פשטידה מלוחה (קיש) גבינה (bread_bakery) -> "Cheese quiche, meatless" (fdcId 2708733) [None, None] -- close_but_not_exact_match
- עוגת גזר (bread_bakery) -> "Cake or cupcake, carrot" (fdcId 2707859) [374, 2.49] -- None
- פאי תפוחים (bread_bakery) -> "Pie, apple" (fdcId 2707995) [296, 2.7] -- None
- חלבון סויה טקסטורי (TVP) יבש (legume) -> "Textured vegetable protein, dry" (fdcId 2707451) [366, 51.1] -- None
- צדפות (אוסטרות) גולמיות (fish_seafood) -> "Oysters, raw" (fdcId 2706351) [51, 5.71] -- None
- חלב מלא (3.5%) (dairy) -> "Hot chocolate / cocoa, made with whole or reduced fat (2%) milk" (fdcId 2705473) [None, None] -- close_but_not_exact_match
- חטיף חלבון (בר חלבון) (sweets_snacks) -> "Formulated Bar, SOUTH BEACH protein bar" (fdcId 173158) [412, 30.34] -- None
- ממרח חמאת בוטנים חלק (sauce_condiment) -> "Peanut butter, smooth, reduced fat" (fdcId 172458) [520, 25.9] -- None
- ליקר קפה (beverage) -> "Liqueur, coffee flavored" (fdcId 2710625) [336, 0.1] -- None
- חלב שוקו (beverage) -> "Candies, milk chocolate" (fdcId 167587) [535, 7.65] -- None
- מרק ראמן (soup_salad) -> "Soup, ramen noodles, water added" (fdcId 2709152) [None, None] -- close_but_not_exact_match
- אורז מוקפץ עם ירקות (סיני) (prepared_dish) -> "Roll with meat and/or shrimp, vegetables and rice paper, not fried" (fdcId 2708704) [None, None] -- close_but_not_exact_match
- נאצ'וס עם גבינה (prepared_dish) -> "Fast foods, nachos, with cheese" (fdcId 170291) [343, 4.32] -- industry-wide "fast foods" USDA average, not a named restaurant -- flagged for an explicit keep/drop decision
- קורנד בקר (בשר משומר) (meat_poultry) -> "Beef, corned beef hash, with potato, canned" (fdcId 173332) [164, 8.73] -- None
- אשכולית לבנה (fruit) -> "Grapefruit juice, white, raw" (fdcId 173039) [39, 0.5] -- matched "Grapefruit juice, white, raw" -- juice, not the whole fruit. Matcher fixed (juice added as a red-flag word) but not re-run this round.
- שרימפס בציפוי פריך מטוגן (fish_seafood) -> "Fast foods, shrimp, breaded and fried" (fdcId 172037) [308, 7.84] -- None

## excluded -- full list, grouped by reason (all 484, none included)
### no_full_token_match (388)
- אורז בסמטי מבושל [grain_carb] (closest non-matching candidate: "Rice noodles, cooked")
- סטייק בקר צלוי [meat_poultry] (closest non-matching candidate: "Beef, sandwich steak")
- קציצות בשר [meat_poultry] (closest non-matching candidate: "Beef, bacon, cooked")
- גבינה בולגרית [dairy] (closest non-matching candidate: "Fish, salmon, king, chinook, smoked, brined (Alaska Native)")
- שמנת חמוצה [dairy]
- חטיף במבה [sweets_snacks] (closest non-matching candidate: "Babyfood, finger snacks, GERBER, GRADUATES, PUFFS, apple and cinnamon")
- צ'יפס [sweets_snacks]
- ביסלי [sweets_snacks] (closest non-matching candidate: "Snacks, banana chips")
- מרשמלו [sweets_snacks]
- קולה [beverage] (closest non-matching candidate: "Whiskey and cola")
- משקה איזוטוני [beverage] (closest non-matching candidate: "Sports drink, NFS")
- פסטה רוזה [prepared_dish] (closest non-matching candidate: "Vodka sauce with tomatoes and cream")
- פסטה בולונז [prepared_dish] (closest non-matching candidate: "Pasta, cooked")
- פסטה ברוטב שמנת [prepared_dish] (closest non-matching candidate: "Alfredo sauce")
- פסטה פסטו [prepared_dish] (closest non-matching candidate: "Pesto sauce")
- פסטה קרבונרה [prepared_dish] (closest non-matching candidate: "Pasta, cooked")
- פסטה ארביאטה [prepared_dish] (closest non-matching candidate: "Pasta with tomato-based sauce and cheese")
- פסטה בשמן זית ושום [prepared_dish] (closest non-matching candidate: "Olive oil")
- פסטה עם פטריות ושמנת [prepared_dish] (closest non-matching candidate: "Pasta with cream sauce, restaurant")
- פנה ברוטב עגבניות [prepared_dish] (closest non-matching candidate: "Pasta with tomato-based sauce and cheese")
- ספגטי בולונז [prepared_dish] (closest non-matching candidate: "Spaghetti sauce")
- טורטליני בשר [prepared_dish] (closest non-matching candidate: "Tortellini, meat-filled, no sauce")
- רביולי גבינה [prepared_dish] (closest non-matching candidate: "Ravioli, cheese-filled, canned")
- פסטה ברוטב רוזה עם עוף [prepared_dish] (closest non-matching candidate: "Stew, chicken, with pasta")
- אורז צהוב [grain_carb] (closest non-matching candidate: "Yellow rice, cooked, fat added")
- אורז פרסי [grain_carb] (closest non-matching candidate: "Rice pilaf")
- ריזוטו פטריות [grain_carb] (closest non-matching candidate: "Fried mushrooms")
- ריזוטו עוף [grain_carb] (closest non-matching candidate: "Chicken, chicken roll, roasted")
- אורז הודי בתבלינים [grain_carb] (closest non-matching candidate: "Rice pilaf")
- תפוחי אדמה בתנור [grain_carb] (closest non-matching candidate: "Potato puffs, frozen, oven-heated")
- לביבות תפוחי אדמה [grain_carb] (closest non-matching candidate: "Potato pancake")
- קציצות תפוחי אדמה [grain_carb] (closest non-matching candidate: "Potato patty")
- קוגל תפוחי אדמה [grain_carb] (closest non-matching candidate: "Potato patty")
- בגט [bread_bakery] (closest non-matching candidate: "Bread, fruit")
- לחם קל [bread_bakery] (closest non-matching candidate: "Bread, reduced-calorie, oatmeal")
- לחם שיפון מלא [bread_bakery] (closest non-matching candidate: "Bread, rye")
- פוקצ'ה [bread_bakery] (closest non-matching candidate: "Focaccia, Italian, plain")
- בורקס גבינה [bread_bakery] (closest non-matching candidate: "Cheese pastry puffs")
- בורקס תפוחי אדמה [bread_bakery] (closest non-matching candidate: "Pastry, puff")
- בורקס תרד [bread_bakery] (closest non-matching candidate: "Pastry, puff")
- רוגלך שוקולד [bread_bakery] (closest non-matching candidate: "Cookie, rugelach")
- חלה מתוקה [bread_bakery] (closest non-matching candidate: "Bread, egg, Challah")
- עוף בתנור [meat_poultry] (closest non-matching candidate: "Chicken breast, roll, oven-roasted")
- שווארמה עוף [meat_poultry] (closest non-matching candidate: "Chicken, chicken roll, roasted")
- שווארמה הודו [meat_poultry] (closest non-matching candidate: "Bologna, turkey")
- קבב עוף [meat_poultry] (closest non-matching candidate: "Chicken fillet, grilled")
- קבב בקר [meat_poultry] (closest non-matching candidate: "Scallops, grilled")
- גולאש בקר [meat_poultry] (closest non-matching candidate: "Stew, beef")
- שניצל הודו [meat_poultry] (closest non-matching candidate: "Turkey sticks, breaded, battered, fried")
- חזה עוף בציפוי פריך [meat_poultry] (closest non-matching candidate: "Fast Foods, Fried Chicken, Breast, meat and skin and breading")
- דג סלמון בתנור [fish_seafood] (closest non-matching candidate: "Fish, salmon, baked or broiled")
- דג טונה טרי צלוי [fish_seafood] (closest non-matching candidate: "Fish, tuna, fresh, bluefin, raw")
- דג דניס [fish_seafood] (closest non-matching candidate: "Fish, sea bass, mixed species, raw")
- גבינה 9% [dairy] (closest non-matching candidate: "Cheese, cottage, low fat")
- גבינה 26% [dairy] (closest non-matching candidate: "Cream cheese, full fat, block")
- שמנת 38% [dairy]
- מעדן חלב [dairy] (closest non-matching candidate: "Babyfood, dessert, banana pudding, strained")
- קרם פרש [dairy] (closest non-matching candidate: "Creme brulee")
- לבנה [dairy] (closest non-matching candidate: "Babyfood, apple yogurt dessert, strained")
- חומוס עם פטרוזיליה ולימון [prepared_dish] (closest non-matching candidate: "Parsley, fresh")
- עדשים כתומות מבושלות [prepared_dish] (closest non-matching candidate: "Lentils, pink or red, raw")
- טוסט גבינה צהובה [prepared_dish] (closest non-matching candidate: "Grilled cheese sandwich, NFS")
- טוסט חביתה [prepared_dish] (closest non-matching candidate: "Bread, egg, toasted")
- לחמנייה עם חמאה וריבה [prepared_dish] (closest non-matching candidate: "Jam")
- דייסת שיבולת שועל עם חלב [prepared_dish] (closest non-matching candidate: "Rice, cooked, with milk")
- מוזלי [prepared_dish]
- לביבות גבינה [prepared_dish] (closest non-matching candidate: "Fritter, corn")
- סנדוויץ' חומוס [sandwich] (closest non-matching candidate: "Hummus, commercial")
- פיתה ממולאת פלאפל [sandwich] (closest non-matching candidate: "Falafel sandwich")
- כריך שווארמה [sandwich] (closest non-matching candidate: "Crackers, sandwich")
- טוסט טונה [sandwich] (closest non-matching candidate: "Baby Toddler yogurt melts")
- שווארמה [prepared_dish] (closest non-matching candidate: "Lamb, chop")
- מלאווח [prepared_dish] (closest non-matching candidate: "Crackers, flatbread")
- סביח [prepared_dish] (closest non-matching candidate: "Fried eggplant")
- בורקס [prepared_dish] (closest non-matching candidate: "Cheese pastry puffs")
- מג'דרה [prepared_dish] (closest non-matching candidate: "Lentil curry with rice")
- שקשוקה [prepared_dish] (closest non-matching candidate: "Egg omelet or scrambled egg, with tomatoes, fat added")
- קובה חמוסתא [prepared_dish] (closest non-matching candidate: "Soup, hot and sour")
- קובה [prepared_dish] (closest non-matching candidate: "Dumpling, no meat")
- מוסקה [prepared_dish] (closest non-matching candidate: "Eggplant dip")
- חמין [prepared_dish] (closest non-matching candidate: "Beans, liquid from stewed kidney beans")
- ג'חנון [prepared_dish] (closest non-matching candidate: "Pastry, puff")
- חצילים בטחינה [prepared_dish] (closest non-matching candidate: "Eggplant dip")
- סחוג [prepared_dish] (closest non-matching candidate: "Hot pepper sauce")
- קוגל ירושלמי [prepared_dish] (closest non-matching candidate: "Jerusalem-artichokes, raw")
- פשטידת ירקות [prepared_dish] (closest non-matching candidate: "Tuna casserole with vegetables and mushroom sauce, no noodles")
- וופל בלגי [sweets_snacks] (closest non-matching candidate: "Waffle, plain")
- בבקה שוקולד [sweets_snacks] (closest non-matching candidate: "Doughnut, chocolate, with chocolate icing")
- חטיף שוקולד ממולא [sweets_snacks] (closest non-matching candidate: "Chocolate candy, cream filled")
- עוגת שמרים [sweets_snacks] (closest non-matching candidate: "Bread, pan dulce, sweet yeast bread")
- בראוני [sweets_snacks] (closest non-matching candidate: "Cookie, butterscotch, brownie")
- סילאן [sauce_condiment] (closest non-matching candidate: "Date")
- מיונז לייט [sauce_condiment] (closest non-matching candidate: "Mayonnaise, reduced fat,  with olive oil")
- חרדל דיז'ון [sauce_condiment]
- מיונז שום [sauce_condiment] (closest non-matching candidate: "Mayonnaise, regular")
- פסטה מוכנה קפואה [prepared_dish] (closest non-matching candidate: "Toddler meal, pasta")
- שניצל עוף קפוא [prepared_dish] (closest non-matching candidate: "Chicken tenders, breaded, frozen, prepared")
- ירקות קפואים מוקפצים [prepared_dish] (closest non-matching candidate: "Asian stir fry vegetables, cooked, no added fat")
- בורקס קפוא [prepared_dish] (closest non-matching candidate: "Puff pastry, frozen, ready-to-bake")
- פלאפל קפוא [prepared_dish] (closest non-matching candidate: "Falafel")
- בלינצ'ס גבינה [prepared_dish] (closest non-matching candidate: "Cheese, processed cheese food")
- צ'יפס קפוא אפוי [prepared_dish] (closest non-matching candidate: "Potato tots, frozen, NS as to fried or baked")
- כדורי בשר קפואים [prepared_dish] (closest non-matching candidate: "Meatballs, frozen, Italian style")
- פיצה משפחתית [prepared_dish] (closest non-matching candidate: "SILK Vanilla soy yogurt (family size)")
- פומלה [fruit]
- דובדבן חמוץ [fruit] (closest non-matching candidate: "Cherry juice, tart")
- דומדמנית אדומה [fruit]
- דומדמנית שחורה [fruit]
- חמוציות מיובשות [fruit]
- אפרסקים בקופסת שימורים [fruit] (closest non-matching candidate: "Peaches, canned, heavy syrup, drained")
- משמש משומר בקופסה [fruit] (closest non-matching candidate: "Apricots, canned, heavy syrup, drained")
- קוקטייל פירות משומר [fruit] (closest non-matching candidate: "Fruit cocktail, canned, heavy syrup, drained")
- צנונית ירוקה (דייקון) [vegetable] (closest non-matching candidate: "Radishes, raw")
- עגבניות שרי [vegetable] (closest non-matching candidate: "Cherries, raw")
- בצל מטוגן (מטוגן פריך) [vegetable] (closest non-matching candidate: "Fried onion rings")
- פלפל אדום צלוי [vegetable] (closest non-matching candidate: "Peppers, bell, red, raw")
- שום כבוש [vegetable] (closest non-matching candidate: "Pickles, NFS")
- פטריות פורטבלו [vegetable] (closest non-matching candidate: "Mushrooms, raw")
- פטריות מוקפצות בשמן [vegetable] (closest non-matching candidate: "Chicken wing, sauteed")
- ברוקולי מאודה [vegetable] (closest non-matching candidate: "Oysters, steamed")
- כרובית אפויה [vegetable] (closest non-matching candidate: "Fried cauliflower")
- קישוא מוקפץ [vegetable] (closest non-matching candidate: "Chicken wing, sauteed")
- לבבות ארטישוק משומרים [vegetable] (closest non-matching candidate: "Hearts of palm, canned")
- תירס גמדי (בייבי קורן) [vegetable] (closest non-matching candidate: "Arugula, baby, raw")
- נבטי סויה [vegetable] (closest non-matching candidate: "Soybeans, mature seeds, sprouted, raw")
- אורז שחור מבושל [grain_carb] (closest non-matching candidate: "Rice noodles, cooked")
- אורז ג'סמין מבושל [grain_carb] (closest non-matching candidate: "Rice noodles, cooked")
- אורז ארבוריו (לריזוטו) גולמי [grain_carb] (closest non-matching candidate: "Wild rice, raw")
- אורז בסמטי גולמי [grain_carb] (closest non-matching candidate: "Rice, white, glutinous, unenriched, uncooked")
- קוסקוס גולמי [grain_carb] (closest non-matching candidate: "Couscous, cooked")
- שיבולת שועל מבושלת (דייסה) [grain_carb] (closest non-matching candidate: "Cereals, WHEATENA, cooked with water")
- כוסמת גולמית [grain_carb] (closest non-matching candidate: "Buckwheat groats")
- קינואה גולמית [grain_carb] (closest non-matching candidate: "Quinoa, uncooked")
- שעורים (גריסים) מבושלים [grain_carb] (closest non-matching candidate: "Barley, pearled, cooked")
- סורגום מבושל [grain_carb] (closest non-matching candidate: "Sorghum grain")
- אטריות סלרי (מוקפצות) [grain_carb] (closest non-matching candidate: "Celeriac, cooked, boiled, drained, with salt")
- אטריות אודון מבושלות [grain_carb] (closest non-matching candidate: "Noodles, cooked")
- גנוקי תפוחי אדמה מבושל [grain_carb] (closest non-matching candidate: "Gnocchi, potato")
- פתיתים מבושלים (אטריות פתיתים) [grain_carb] (closest non-matching candidate: "Barley, pearled, cooked")
- קרקר אורז מלא [grain_carb] (closest non-matching candidate: "Crackers, cheese, whole grain")
- לחם קל בפרוסות דקות [grain_carb] (closest non-matching candidate: "Turkey, light meat, breaded, baked or fried, skin eaten")
- לחם כוסמין מלא [bread_bakery] (closest non-matching candidate: "Flour, spelt, whole grain")
- לחמניית בריוש [bread_bakery] (closest non-matching candidate: "Brioche")
- צ'יאבטה [bread_bakery] (closest non-matching candidate: "Bread, fruit")
- מצה [bread_bakery]
- פיתה עיראקית (לאפה) [bread_bakery] (closest non-matching candidate: "Pita chips")
- סופגניה (ללא מילוי) [bread_bakery] (closest non-matching candidate: "Jellies")
- לחמנייה מתוקה (קייזר) [bread_bakery] (closest non-matching candidate: "Rolls, hard (includes kaiser)")
- בייגל שיפון [bread_bakery] (closest non-matching candidate: "Bread, rye")
- אוזני המן [bread_bakery] (closest non-matching candidate: "Poppy seed dressing")
- פיצה פוקאצ'ה [bread_bakery] (closest non-matching candidate: "Focaccia, Italian, plain")
- סופגניה במילוי ריבה [bread_bakery] (closest non-matching candidate: "Jellies")
- ואפל בלגי במילוי קרמל [bread_bakery] (closest non-matching candidate: "Chocolate candy, caramel filled")
- עוגת דבש [bread_bakery] (closest non-matching candidate: "Cake, fruit cake")
- מקרון (עוגיית שקדים) [bread_bakery]
- קנולי [bread_bakery] (closest non-matching candidate: "Pastry, Italian, with cheese")
- עדשים ירוקות יבשות (גולמיות) [legume] (closest non-matching candidate: "Lentils, dry")
- שעועית קנלוני מבושלת [legume] (closest non-matching candidate: "Beans, cannellini, dry")
- פול מיובש מבושל [legume] (closest non-matching candidate: "Fava beans, cooked")
- סייטן (חלבון חיטה) [legume] (closest non-matching candidate: "Meat substitute, cereal- and vegetable protein-based, fried")
- נקניקיית סויה (טבעוני) [legume] (closest non-matching candidate: "Vegan mayonnaise")
- פלאפל אפוי (לא מטוגן) [legume] (closest non-matching candidate: "Falafel")
- מסבחה (חומוס גרגירים) [legume] (closest non-matching candidate: "Tahini")
- אדממה גולמי (בתרמיל) [legume] (closest non-matching candidate: "Drumstick pods, raw")
- חזה עוף מבושל (ברוטב/מבושל במים) [meat_poultry] (closest non-matching candidate: "Chicken, feet, boiled")
- חזה עוף מטוגן בציפוי [meat_poultry] (closest non-matching candidate: "Fast Foods, Fried Chicken, Breast, meat and skin and breading")
- כרעיים עוף גולמיות [meat_poultry] (closest non-matching candidate: "Chicken drumstick, fried, coated, prepared skinless, coating eaten, from raw")
- עוף שלם גולמי (עם עור) [meat_poultry] (closest non-matching candidate: "Turkey, whole, meat and skin, raw")
- עוף שלם צלוי (עם עור) [meat_poultry] (closest non-matching candidate: "Chicken, roasting, meat and skin, cooked, roasted")
- סטייק אסאדו מבושל [meat_poultry] (closest non-matching candidate: "Beef, chuck, short ribs, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, braised")
- צלעות טלה (קרם דה קוט) צלויות [meat_poultry] (closest non-matching candidate: "Lamb, chop")
- שניצל עגל [meat_poultry] (closest non-matching candidate: "Veal Marsala")
- ברווז ללא עור צלוי [meat_poultry] (closest non-matching candidate: "Duck, roasted, skin eaten")
- בשר יעל (בקר) קפוא מוכן [meat_poultry] (closest non-matching candidate: "Beef, cured, breakfast strips, cooked")
- קבב טלה [meat_poultry] (closest non-matching candidate: "Lamb, chop")
- נקניק מרגז [meat_poultry] (closest non-matching candidate: "Sausage, smoked link sausage, pork")
- חזה ברווז מעושן [meat_poultry] (closest non-matching candidate: "Duck, wild, breast, meat only, raw")
- קובה בשר (עמוד שדרה) גולמית [meat_poultry] (closest non-matching candidate: "Flavored rice mixture")
- דניס (בקיע זהוב) גולמי [fish_seafood] (closest non-matching candidate: "Fish, sea bass, mixed species, raw")
- דג חרב (מרלין) צלוי [fish_seafood] (closest non-matching candidate: "Fish, swordfish")
- קוויאר (ביצי דגים) [fish_seafood] (closest non-matching candidate: "Fish, roe, mixed species, raw")
- דג מקרל מעושן [fish_seafood] (closest non-matching candidate: "Fish, mackerel, canned")
- דג פורל מעושן [fish_seafood] (closest non-matching candidate: "Fish, trout, fried")
- דג פילה טונה בגריל [fish_seafood] (closest non-matching candidate: "CRACKER BARREL, grilled sirloin steak")
- דג מושט מטוגן [fish_seafood] (closest non-matching candidate: "Fish, mullet")
- פילה בורי גולמי [fish_seafood] (closest non-matching candidate: "Fish, mullet, striped, raw")
- סושי (רול סלמון וקטן) [fish_seafood] (closest non-matching candidate: "Sushi roll, avocado")
- פילה סלמון מטוגן [fish_seafood] (closest non-matching candidate: "Fish, salmon, fried")
- ביצת שליו (מבושלת) [egg] (closest non-matching candidate: "Quail egg, canned")
- ביצה מקושקשת עם חלב [egg] (closest non-matching candidate: "Egg, whole, cooked, scrambled")
- חלב אבקה [dairy] (closest non-matching candidate: "Beverages, Eggnog-flavor mix, powder, prepared with whole milk")
- יוגורט יווני 10% [dairy] (closest non-matching candidate: "Yogurt, Greek, low fat milk, fruit")
- קוטג' 3% [dairy] (closest non-matching candidate: "Cheese, cottage, low fat")
- קוטג' 9% [dairy] (closest non-matching candidate: "Cheese, cottage, low fat")
- קוטג' 0% [dairy] (closest non-matching candidate: "Cheese, cottage, low fat")
- גבינה צהובה דלת שומן (9%) [dairy] (closest non-matching candidate: "Cheese, cottage, low fat")
- אמנטל [dairy] (closest non-matching candidate: "Cheese, Swiss")
- גבינת עמק (צהובה 22%) [dairy] (closest non-matching candidate: "Cheese, parmesan, hard")
- מסקרפונה [dairy] (closest non-matching candidate: "Cheese, processed cheese food")
- הלומי (עגלים) [dairy] (closest non-matching candidate: "Cheese, processed cheese food")
- שמנת קצפת מוקצפת [dairy] (closest non-matching candidate: "Cream, whipped")
- גלידה פרוותית (ללא חלב) [dairy] (closest non-matching candidate: "Coffee, Iced Latte, with non-dairy milk")
- שרבט לימון [dairy] (closest non-matching candidate: "Sorbet")
- קרם קטלנה [dairy]
- חלב קנבוס [plant_milk] (closest non-matching candidate: "Seeds, hemp seed, hulled")
- קשיו קלוי ומלוח [nuts_seeds_fats] (closest non-matching candidate: "Cashews, salted")
- תערובת אגוזים ופירות יבשים [nuts_seeds_fats] (closest non-matching candidate: "Trail mix with nuts and fruit")
- חמאת לוז (נוגט טבעי) [nuts_seeds_fats] (closest non-matching candidate: "Hazelnuts")
- קוקוס מגורד מיובש [nuts_seeds_fats] (closest non-matching candidate: "Nuts, coconut meat, dried (desiccated), sweetened, shredded")
- גומי דובי (סוכריות ג'לי) [sweets_snacks] (closest non-matching candidate: "Bear")
- וופל עם שוקולד (חטיף) [sweets_snacks] (closest non-matching candidate: "Cereal or granola bar, coated with non-chocolate coating")
- חטיף תמרים ואגוזים [sweets_snacks] (closest non-matching candidate: "Breakfast bar, date, with yogurt coating")
- פרינגלס (צ'יפס תפוחי אדמה בקופסה) [sweets_snacks] (closest non-matching candidate: "WENDY'S, Double Stack, with cheese")
- אפרופו [sweets_snacks] (closest non-matching candidate: "Snacks, corn cakes")
- וופלים בציפוי שוקולד (עלית) [sweets_snacks] (closest non-matching candidate: "Cookie, chocolate wafer")
- קרמבו [sweets_snacks] (closest non-matching candidate: "Cookie, marshmallow, chocolate-covered")
- חלבה [sweets_snacks] (closest non-matching candidate: "Sesame dressing")
- ג'לי (מעדן ג'לטין) [sweets_snacks] (closest non-matching candidate: "Gelatin dessert with fruit")
- רוטב ברביקיו [sauce_condiment] (closest non-matching candidate: "Chicken, broiler, rotisserie, BBQ, skin")
- רוטב טבסקו (חריף) [sauce_condiment] (closest non-matching candidate: "Sauce, ready-to-serve, pepper, TABASCO")
- אמבה (רוטב מנגו חמוץ) [sauce_condiment] (closest non-matching candidate: "Pickles, NFS")
- סחוג ירוק (חריף) [sauce_condiment] (closest non-matching candidate: "Relish, corn")
- שוקולד חם (אבקה ממותקת) [sweets_snacks] (closest non-matching candidate: "Cocoa mix, NESTLE, Rich Chocolate Hot Cocoa Mix")
- רוטב שמן זית ולימון (ויניגרט) [sauce_condiment] (closest non-matching candidate: "Olive oil")
- חומץ יין לבן [sauce_condiment] (closest non-matching candidate: "Vinegar, red wine")
- מרינדה שום ועשבי תיבול [sauce_condiment] (closest non-matching candidate: "Korean dressing or marinade")
- מיסו (משחת סויה מותססת) [sauce_condiment] (closest non-matching candidate: "Miso")
- רוטב חריף שרירה [sauce_condiment] (closest non-matching candidate: "Chili hot dog, no bun")
- ריבת דובדבנים [sauce_condiment] (closest non-matching candidate: "Jam")
- קרם קרמל (רוטב קרמל) [sauce_condiment] (closest non-matching candidate: "Caramel dip, regular")
- ממרח לוטוס (עוגיות ביסקוף) [sauce_condiment] (closest non-matching candidate: "SPECULOOS COOKIE SPREAD, CINNAMON BISCUIT")
- פלפל שחור גרוס [spice_herb] (closest non-matching candidate: "Spices, pepper, black")
- פפריקה מתוקה [spice_herb] (closest non-matching candidate: "Spices, paprika")
- כמון טחון [spice_herb] (closest non-matching candidate: "Spices, cumin seed")
- זעתר (תערובת תבלינים) [spice_herb] (closest non-matching candidate: "Spices, pumpkin pie spice")
- בהראט (תערובת תבלינים) [spice_herb] (closest non-matching candidate: "Spices, pumpkin pie spice")
- נענע טרייה [spice_herb] (closest non-matching candidate: "Candy, mint")
- צ'ילי אדום טרי [spice_herb] (closest non-matching candidate: "Peppers, hot chili, red, raw")
- שמרים (אבקת אפייה) [spice_herb] (closest non-matching candidate: "Yeast")
- מיץ לימונדה [beverage]
- סמוזי פירות יער [beverage] (closest non-matching candidate: "Fruit juice smoothie, BOLTHOUSE FARMS, BERRY BOOST")
- קפה הפוך (עם חלב 3%) [beverage] (closest non-matching candidate: "Coffee, Cappuccino, with non-dairy milk")
- קפה שחור ממותק בסוכר [beverage] (closest non-matching candidate: "Coffee, macchiato, sweetened")
- תה עם חלב וסוכר [beverage] (closest non-matching candidate: "Tea, hot, with milk")
- יין רוזה [beverage] (closest non-matching candidate: "Wine spritzer")
- יין מבעבע (שמפניה) [beverage] (closest non-matching candidate: "Wine, sparkling")
- וויסקי [beverage]
- ערק [beverage]
- שייק פרוטאין מוכן (שוקולד) [beverage] (closest non-matching candidate: "Nutritional drink or shake, high protein, ready-to-drink, NFS")
- סחלב (משקה חם מתובל) [beverage] (closest non-matching candidate: "Spices, pumpkin pie spice")
- סחוט לימון-מים (משקה) [beverage] (closest non-matching candidate: "Beverages, tea, instant, lemon, sweetened, prepared with water")
- מרק טוםיאם [soup_salad] (closest non-matching candidate: "Tom Collins")
- מרק קרם תירס [soup_salad] (closest non-matching candidate: "Soup, cream of vegetable")
- מרק שעועית לבנה [soup_salad] (closest non-matching candidate: "Soup, bean")
- מרק ירקות שורש [soup_salad] (closest non-matching candidate: "Soup, vegetable")
- סלט קפרזה [soup_salad] (closest non-matching candidate: "Salad dressing, NFS, for salads")
- סלט קינואה [soup_salad] (closest non-matching candidate: "Quinoa, cooked")
- סלט חצילים קלויים [soup_salad] (closest non-matching candidate: "Eggplant dip")
- סלט פתוש (פתה לבנונית) [soup_salad] (closest non-matching candidate: "Salad dressing, NFS, for salads")
- רול טורטייה עם עוף וירקות [sandwich] (closest non-matching candidate: "Vegetable sandwich wrap")
- בגט טונה [sandwich] (closest non-matching candidate: "Tuna salad sandwich on white")
- כריך סלמון מעושן [sandwich] (closest non-matching candidate: "Salmon cake sandwich")
- בגט גבינות [sandwich] (closest non-matching candidate: "Cheese sandwich, NFS")
- בורקס עם ביצה וגבינה [sandwich] (closest non-matching candidate: "Egg omelet or scrambled egg, with cheese, made with butter")
- פנקייק עם גבינה (בלינצס) [sandwich] (closest non-matching candidate: "Cheese, processed cheese food")
- מאפה ממולא טונה [sandwich] (closest non-matching candidate: "Pastry, cheese-filled")
- פיתה ממולאת שווארמה עוף [sandwich] (closest non-matching candidate: "Pita chips")
- המבורגר טבעוני [sandwich] (closest non-matching candidate: "BURGER KING, Original Chicken Sandwich")
- חריימה (דג ברוטב חריף) [prepared_dish] (closest non-matching candidate: "Stew, fish")
- מרק חמוצה (עם בשר) [prepared_dish] (closest non-matching candidate: "Soup, vegetable beef, canned, condensed")
- כריך קלאב (הודו, חסה, עגבניה) [sandwich] (closest non-matching candidate: "Club sandwich on white")
- קובה סלק (מרק אדום) [prepared_dish] (closest non-matching candidate: "Beets, pickled")
- צ'ולנט [prepared_dish] (closest non-matching candidate: "Stew, chicken")
- קוסקוס עם ירקות ובשר [prepared_dish] (closest non-matching candidate: "Dressing with meat and vegetables")
- מנשה (חציל ממולא בשר) [prepared_dish] (closest non-matching candidate: "Eggplant and meat casserole")
- קציצות עדשים [prepared_dish] (closest non-matching candidate: "Lentil curry")
- עוף ברוטב שום ולימון [prepared_dish] (closest non-matching candidate: "Restaurant, Chinese, lemon chicken")
- קציצות קינואה [prepared_dish] (closest non-matching candidate: "Quinoa, cooked")
- תבשיל דלעת ועדשים [prepared_dish] (closest non-matching candidate: "Stew, chicken")
- דגים ממולאים (גפילטע) [prepared_dish] (closest non-matching candidate: "Gefilte fish")
- קארי אדום תאילנדי עם עוף [prepared_dish] (closest non-matching candidate: "Chicken curry")
- סושי בורגר (חלבון עם אורז) [prepared_dish] (closest non-matching candidate: "Burrito bowl, chicken, with rice")
- בוריטו פאחיטה עוף [prepared_dish] (closest non-matching candidate: "Fajita, chicken")
- לזניה טבעונית [prepared_dish] (closest non-matching candidate: "Lasagna with meat")
- פיצה פפרוני (תחליף בקר) [prepared_dish] (closest non-matching candidate: "Pizza with pepperoni, stuffed crust")
- פוקאצ'ה עם עגבניות ושמן זית [prepared_dish] (closest non-matching candidate: "Olive oil")
- פילאף עדשים [prepared_dish] (closest non-matching candidate: "Rice pilaf")
- קובה בורגול (קובה נביה) [prepared_dish] (closest non-matching candidate: "Bulgur, cooked")
- מוסקה יווני (בטטה ובשר) [prepared_dish] (closest non-matching candidate: "Yogurt, Greek, with oats")
- מלוואח עם ביצה וסלט [prepared_dish] (closest non-matching candidate: "Potato salad with egg")
- ריזוטו ים (פירות ים) [prepared_dish] (closest non-matching candidate: "Paella with seafood")
- שקשוקה ירוקה (עם תרד) [prepared_dish] (closest non-matching candidate: "Spinach, creamed")
- חביתה ספרדית (עם תפוחי אדמה) [prepared_dish] (closest non-matching candidate: "Egg omelet or scrambled egg, with potatoes and/or onions, no added fat")
- שקשוקה עם נקניקיות [prepared_dish] (closest non-matching candidate: "Sausage, smoked link sausage, pork")
- קרפ מתוק [prepared_dish] (closest non-matching candidate: "Crepe, NFS")
- שווארמה טלה [prepared_dish] (closest non-matching candidate: "Lamb, chop")
- מיקס גריל (מעורב ירושלמי) [prepared_dish] (closest non-matching candidate: "Jerusalem-artichokes, raw")
- קרפ מלוח (עם גבינה וירקות) [prepared_dish] (closest non-matching candidate: "Crepe, NFS")
- חציל בטחינה (ממרח) [prepared_dish] (closest non-matching candidate: "Tahini")
- מוטבל חצילים חריף (זעלוק) [prepared_dish] (closest non-matching candidate: "Eggplant dip")
- ג'חנון עם רסק עגבניות [prepared_dish] (closest non-matching candidate: "Cheese, parmesan, grated")
- BCAA אבקה [supplement] (closest non-matching candidate: "Baobab powder")
- קיווי צהוב [fruit] (closest non-matching candidate: "Kiwi fruit, raw")
- קרמבולה מיובשת [fruit] (closest non-matching candidate: "Starfruit, raw")
- שזיף חצילי (איטלקי) [fruit] (closest non-matching candidate: "Plums, dried (prunes), uncooked")
- ליצ'י משומר [fruit] (closest non-matching candidate: "Asparagus, canned, drained solids")
- קליפת תפוז מסוכרת [fruit] (closest non-matching candidate: "Orange peel, raw")
- תפוח אדמה סגול [vegetable] (closest non-matching candidate: "Passion-fruit juice, purple, raw")
- פרי כוכב (קרמבולה) מיובש [fruit] (closest non-matching candidate: "Dried, fruit, NFS")
- תרד בייבי [vegetable] (closest non-matching candidate: "Spinach, baby")
- קייל אפוי (צ'יפס קייל) [vegetable] (closest non-matching candidate: "Potato chips, baked, flavored")
- פלפל חריף (ג'לפניו) כבוש [vegetable] (closest non-matching candidate: "Pickles, NFS")
- שעועית אדמה (חלוט) [vegetable] (closest non-matching candidate: "Broadbeans (fava beans), mature seeds, cooked, boiled, with salt")
- אורז אדום מבושל [grain_carb] (closest non-matching candidate: "Rice noodles, cooked")
- חמוצים מעורבים (טורשי) [vegetable] (closest non-matching candidate: "Vegetables, pickled")
- פריקה מבושלת [grain_carb] (closest non-matching candidate: "Dove, cooked, NS as to cooking method")
- שיפון (גרעינים) מבושל [grain_carb] (closest non-matching candidate: "Bread, rye")
- חיטה (גרעינים) מבושלת [grain_carb] (closest non-matching candidate: "Wheat, khorasan, cooked")
- אטריות פנה מלאה מבושלות [grain_carb] (closest non-matching candidate: "Whole wheat cereal, cooked")
- אטריות פוסילי מבושלות [grain_carb] (closest non-matching candidate: "Pasta, cooked")
- אטריות אורז חומות מבושלות [grain_carb] (closest non-matching candidate: "Rice noodles, cooked")
- לחם אורז (ללא חיטה) [bread_bakery] (closest non-matching candidate: "Schar, Gluten-Free, Wheat-Free, Classic White Bread")
- קבב הודו [meat_poultry] (closest non-matching candidate: "Bologna, turkey")
- בס צ'ילני (מרלוזה) מבושל [fish_seafood] (closest non-matching candidate: "Sea bass, Chilean, frozen, wild caught")
- אמנון גולמי בקליפה [fish_seafood] (closest non-matching candidate: "Fish, tilapia, raw")
- דג פורל מעושן קר [fish_seafood] (closest non-matching candidate: "Fish, trout, fried")
- צוואר בקר (אוסבוקו) מבושל [meat_poultry] (closest non-matching candidate: "Veal, foreshank, osso buco, separable lean and fat, cooked, braised")
- לבנה מיובשת (כדורי לבנה בשמן) [dairy] (closest non-matching candidate: "Cheese ball")
- גבינת קוארק [dairy] (closest non-matching candidate: "Cheese, processed cheese food")
- חלב עז מרוכז [dairy] (closest non-matching candidate: "Goat milk")
- זרעי מלון (קלויים) [nuts_seeds_fats] (closest non-matching candidate: "Seeds, breadfruit seeds, roasted")
- שקדי מלך (שקדים מרים) [nuts_seeds_fats] (closest non-matching candidate: "Bitter melon, cooked")
- רוטב חמאת בוטנים תאילנדי [sauce_condiment] (closest non-matching candidate: "Hot Thai sauce")
- רוטב חרדל דבש [sauce_condiment] (closest non-matching candidate: "Honey mustard dip")
- רוטב חומוס טחינה [sauce_condiment] (closest non-matching candidate: "Tahini")
- מיץ ליים סחוט [beverage] (closest non-matching candidate: "Lime juice, raw")
- סלט אבוקדו וביצה [soup_salad] (closest non-matching candidate: "Potato salad with egg")
- סלט טונה וחומוס [soup_salad] (closest non-matching candidate: "Fish, tuna salad")
- מרק גזר וג'ינג'ר [soup_salad] (closest non-matching candidate: "SMART SOUP, Vietnamese Carrot Lemongrass")
- עוף בציפוי קורנפלקס [prepared_dish] (closest non-matching candidate: "Pie Crust, Cookie-type, Chocolate, Ready Crust")
- קציצות טופו [prepared_dish] (closest non-matching candidate: "Tofu yogurt")
- דג בציפוי פריך אפוי [prepared_dish] (closest non-matching candidate: "DENNY'S, fish fillet, battered or breaded, fried")
- תפוז דם (בלאד) [fruit] (closest non-matching candidate: "Orange, raw")
- קובה עדשים (טבעוני) [prepared_dish] (closest non-matching candidate: "Vegan mayonnaise")
- שמיר (הירק) מבושל [vegetable] (closest non-matching candidate: "Pasta, vegetable, cooked")
- חמאת דלעת (מחית) [vegetable] (closest non-matching candidate: "Bread, pumpkin")
- אטריות שעועית ירוקה (מש) מבושלות [grain_carb] (closest non-matching candidate: "Mung beans, cooked")
- גרעיני חיטה מלאה (פריכיות) [grain_carb] (closest non-matching candidate: "Crackers, standard snack-type, with whole wheat")
- לחמנייה איטלקית (רוזטה) [bread_bakery] (closest non-matching candidate: "Roll, multigrain")
- פיתה יוונית [bread_bakery] (closest non-matching candidate: "Pita chips")
- חזה עוף גריל (שווארמה טבעונית מסטיילד) [meat_poultry] (closest non-matching candidate: "Chicken breast, grilled with sauce, skin eaten")
- קבב עוף גולמי (תערובת גולמית) [meat_poultry] (closest non-matching candidate: "Chicken, ground, raw")
- דג בורי מטוגן [fish_seafood] (closest non-matching candidate: "Fish, mullet")
- בשר טלה מוקפץ (סטיר פריי) [meat_poultry] (closest non-matching candidate: "Mushrooms, shiitake, stir-fried")
- שמנת 15% [dairy] (closest non-matching candidate: "Beef, ground, 85% lean meat / 15% fat, loaf, cooked, baked")
- פילה דניס אפוי [fish_seafood] (closest non-matching candidate: "Vegetarian fillets")
- ריקוטה דלת שומן [dairy] (closest non-matching candidate: "Cheese, cottage, low fat")
- גבינת שמנת טבעונית (על בסיס קשיו) [dairy] (closest non-matching candidate: "Cheese spread, cream cheese base")
- שקדים כבושים (מומלחים בציר) [nuts_seeds_fats] (closest non-matching candidate: "Lamb, New Zealand, imported, brains, cooked, soaked and fried")
- קרם בורולה (קרם ברולה) [sweets_snacks]
- בוטנים בקליפה קלויים [nuts_seeds_fats] (closest non-matching candidate: "Peanuts, honey roasted")
- עוגיות אצבעות ליידי (ביסקוטי) [sweets_snacks] (closest non-matching candidate: "Cookie, ladyfinger")
- בלינצס תפוחים [sweets_snacks] (closest non-matching candidate: "Apple, candied")
- רוטב חמאת שום [sauce_condiment] (closest non-matching candidate: "Garlic sauce")
- רוטב שמנת פטריות [sauce_condiment] (closest non-matching candidate: "Beef with mushroom sauce")
- קובה בורגול ממולאת בשר מטוגנת [prepared_dish] (closest non-matching candidate: "Bulgur, cooked")
- משקה שקדים ממותק (אורז שקדים) [beverage] (closest non-matching candidate: "Beverages, almond milk, sweetened, vanilla flavor, ready-to-drink")
- עוף שיפודים על האש [prepared_dish] (closest non-matching candidate: "Chicken fillet, grilled")
- דג על האש בתיבול לימון [prepared_dish] (closest non-matching candidate: "Fish sandwich, grilled")
- קבב טלה על האש [prepared_dish] (closest non-matching candidate: "Lamb, chop")
- עולש בלגי (אנדיב) מבושל [vegetable] (closest non-matching candidate: "Endive, raw")
- פסטה עם ברוקולי ושום [prepared_dish] (closest non-matching candidate: "Fried broccoli")
- ליים כבוש [vegetable] (closest non-matching candidate: "Pickles, NFS")
- פריקה גולמית [grain_carb] (closest non-matching candidate: "Quinoa, uncooked")
- לחם שיפון קל (עם קימל) [bread_bakery] (closest non-matching candidate: "Bread, rye")
- שומר צלוי [vegetable] (closest non-matching candidate: "Fennel bulb, cooked")
- עוף אפוי בעשבי תיבול [meat_poultry] (closest non-matching candidate: "Chicken, chicken roll, roasted")
- דג לברק אפוי בתנור [fish_seafood] (closest non-matching candidate: "Fish, bass, baked or broiled")
- גבינת פילדלפיה (שמנת רגילה) [dairy] (closest non-matching candidate: "Cheese, cream")
- קרמל מלוח (ריבועים) [sweets_snacks] (closest non-matching candidate: "Candies, caramels")
- רוטב פפריקה מעושנת [sauce_condiment] (closest non-matching candidate: "Spices, paprika")
- מרק ירקות שורש עם עדשים [soup_salad] (closest non-matching candidate: "Soup, lentil")
- מיץ תפוחים תעשייתי (ללא תוספת סוכר) [beverage] (closest non-matching candidate: "Apple juice, 100%, with calcium added")
- סלט חומוס ופטרוזיליה [soup_salad] (closest non-matching candidate: "Parsley, fresh")
- פיתה ממולאת חומוס וסלט [sandwich] (closest non-matching candidate: "Pita chips")
- קובה במיה (מרק) [prepared_dish] (closest non-matching candidate: "Fried okra")
- עוף צלוי במילוי אורז [prepared_dish] (closest non-matching candidate: "Chicken or turkey with stuffing")
- אבקת חלבון ביצה [supplement] (closest non-matching candidate: "Egg, white, dried, powder, stabilized, glucose reduced")

### no_search_results (51)
- דלעת חלוט (ריבועים) [vegetable]
- בצל ירוק (שאלוט) [vegetable]
- חציל צלוי (על האש) [vegetable]
- נבטי חיטה/כוסמת [vegetable]
- קמח תירס (מאיז) [grain_carb]
- אטריות זכוכית מבושלות (ורמיצ'לי אורז) [grain_carb]
- בשר בקר טחון גולמי (רזה) [meat_poultry]
- בשר בקר טחון גולמי (שמן) [meat_poultry]
- בקר מיובש (בשר מעושן) [meat_poultry]
- שוק הודו צלוי [meat_poultry]
- נקניק חזירי (טורקי) [meat_poultry]
- פסטרמה עוף [meat_poultry]
- פרגית (עוף) צלויה [meat_poultry]
- טונה בשימורים בשמן מסונן [fish_seafood]
- הרינג (דג מלוח) [fish_seafood]
- אנשובי מומלח [fish_seafood]
- קוד (בקלה מיובש-מלוח) [fish_seafood]
- סורימי (מקלות סרטן) [fish_seafood]
- סשימי סלמון [fish_seafood]
- סושי (רול קליפורניה) [fish_seafood]
- ביצת עוף גולמית [egg]
- ביצת עוף מבושלת רכה [egg]
- ביצת ברווז (מבושלת) [egg]
- חלב 2% [dairy]
- יוגורט סקיר (0%) [dairy]
- ברי [dairy]
- גבינת שמנת ממרח עם ירקות [dairy]
- מרגרינה [dairy]
- גלידת וניל [dairy]
- גלידת פיסטוק [dairy]
- גלידה קלה (דיאט) [dairy]
- גבינת מוצרלה טרייה (בולה) [dairy]
- חלב קוקוס משומר (סמיך) [plant_milk]
- חלב קוקוס (משקה) [plant_milk]
- חלב שיבולת שועל [plant_milk]
- אגוזי לוז (פיליברט) [nuts_seeds_fats]
- חלב אורז [plant_milk]
- שומן אווז/עוף (שמאלץ) [nuts_seeds_fats]
- חטיף אנרגיה עם שיבולת שועל [sweets_snacks]
- מים מוגזים [beverage]
- קפה שחור (שחור/אספרסו) [beverage]
- בירה כהה [beverage]
- משקה איזוטוני (ספורט) [beverage]
- מרק דלעת [soup_salad]
- מקלובה [prepared_dish]
- בליני (פנקייק קטן) [prepared_dish]
- קבב מעורב (עוף ובקר) [prepared_dish]
- אבקת חלבון צמחי (אפונה/אורז) [supplement]
- בטטה סגולה (אוקינאוואן) [vegetable]
- צנוברית (עגבנייה קוקטייל) [vegetable]
- שקדי מרינדה (שקדים בתיבול) [nuts_seeds_fats]

### missing_nutrient_in_detail (26)
- לחם אחיד [bread_bakery]
- קרקר מלוח (סודה) [bread_bakery]
- חומוס שום [legume]
- המבורגר צמחי (על בסיס קטניות) [legume]
- חומוס פיקנטי [legume]
- נקניקיית עוף [meat_poultry]
- חלב מרוכז ממותק [dairy]
- ממרח שקדים ושוקולד [nuts_seeds_fats]
- חטיף שוקולד עם עוגיות (טוויקס-סגנון) [sweets_snacks]
- במבה אגוזי לוז [sweets_snacks]
- תפוצ'יפס (צ'יפס גלים) [sweets_snacks]
- קליק (חטיף שוקולד ופצפוצי אורז) [sweets_snacks]
- פרויטס (סוכריות פירות) [sweets_snacks]
- עוגיות פתי בר [sweets_snacks]
- רוטב פאג'יטה (תבלין) [sauce_condiment]
- רוטב צ'ילי מתוק [sauce_condiment]
- פאנטה תפוזים [beverage]
- קולה זירו (דיאט) [beverage]
- ג'ל אנרגיה לספורט [supplement]
- קזאין (חלבון איטי) [supplement]
- עוגת אורז (מוצרל) קטנה [bread_bakery]
- אבקת חלבון מי גבינה (וניל) [supplement]
- חזה עוף מעושן [meat_poultry]
- קליק פירות יער (חטיף אנרגיה) [sweets_snacks]
- ופל שוקולד עם וניל [sweets_snacks]
- פריכיות תירס מלא [grain_carb]

### content_gate (14)
- שוק עוף צלוי [meat_poultry]
- פיצה גבינה [prepared_dish]
- פסטה ברוטב עגבניות [prepared_dish]
- תפוחי אדמה מטוגנים [grain_carb]
- כרעיים עוף צלויות [meat_poultry]
- יוגורט תות [dairy]
- רוטב עגבניות [sauce_condiment]
- נאגטס עוף [prepared_dish]
- טורטייה תירס [grain_carb]
- שוק עוף מטוגן [meat_poultry]
- יוגורט תות שדה דל שומן [dairy]
- המבורגר עם גבינה (צ'יזבורגר) [sandwich]
- עוף מתוק וחמוץ (סיני) [prepared_dish]
- פיצה ירקות [prepared_dish]

### detail_fetch_failed (4)
- סרדינים בשימורים בשמן [fish_seafood]
- קלמארי גולמי [fish_seafood]
- מולים (בלאדי ים) מבושלים [fish_seafood]
- חמאה מומסת (מזוקקת/גהי) [dairy]

### exception (1)
- חלב קשיו [plant_milk]

## Audit corrections to the 349 pre-existing catalog rows
- Corrected: 158
- Removed: 113

### Corrected values -- old -> new (full list)
| Name | Old kcal | New kcal | Old protein | New protein | Source |
|---|---|---|---|---|---|
| תפוז | 47.0 | 50 | 0.9 | 0.92 | USDA FDC fdcId 2709171 (Orange, raw) |
| תפוח | 52.0 | 61 | 0.3 | 0.17 | USDA FDC fdcId 2709215 (Apple, raw) |
| ענבים | 69.0 | 83 | 0.7 | 0.9 | USDA FDC fdcId 2709237 (Grapes, raw) |
| אפרסק | 39.0 | 46 | 0.9 | 0.91 | USDA FDC fdcId 2709249 (Peach, raw) |
| אננס | 50.0 | 60.1113 | 0.5 | 0.4609375 | USDA FDC fdcId 2346398 (Pineapple, raw) |
| קיווי | 61.0 | 58 | 1.1 | 1.06 | USDA FDC fdcId 327046 (Kiwifruit, green, raw) |
| תאנים מיובשות | 249.0 | 277 | 3.3 | 3.3 | USDA FDC fdcId 2709204 (Fig, dried) |
| צימוקים | 299.0 | 301 | 3.1 | 3.28 | USDA FDC fdcId 168164 (Raisins, golden, seedless) |
| פטל | 52.0 | 57.3375 | 1.2 | 1.008125 | USDA FDC fdcId 2346410 (Raspberries, raw) |
| אוכמניות | 57.0 | 63.8563 | 0.7 | 0.703125 | USDA FDC fdcId 2346411 (Blueberries, raw) |
| קלמנטינה | 47.0 | 47 | 0.9 | 0.85 | USDA FDC fdcId 168195 (Clementines, raw) |
| עגבניה | 18.0 | 20 | 0.9 | 0.82 | USDA FDC fdcId 2709719 (Tomatoes, raw) |
| מלפפון | 15.0 | 16 | 0.7 | 0.62 | USDA FDC fdcId 2709784 (Cucumber, raw) |
| חסה | 15.0 | 20 | 1.4 | 0.92 | USDA FDC fdcId 2709789 (Lettuce, raw) |
| פלפל אדום | 31.0 | 31.3256 | 1.0 | 0.895625 | USDA FDC fdcId 2258590 (Peppers, bell, red, raw) |
| כרוב | 26.0 | 25 | 1.2 | 1.28 | USDA FDC fdcId 169975 (Cabbage, raw) |
| פלפל ירוק | 22.0 | 22.9291 | 0.8 | 0.715 | USDA FDC fdcId 2258588 (Peppers, bell, green, raw) |
| פלפל צהוב | 27.0 | 30.7743 | 1.0 | 0.819375 | USDA FDC fdcId 2258589 (Peppers, bell, yellow, raw) |
| תירס מבושל | 96.0 | 97 | 3.4 | 3.34 | USDA FDC fdcId 168540 (Corn, sweet, white, cooked, boiled, drained, with salt) |
| קישוא | 17.0 | 21 | 1.2 | 2.71 | USDA FDC fdcId 168565 (Squash, zucchini, baby, raw) |
| כרובית | 25.0 | 27.5923 | 1.9 | 1.640625 | USDA FDC fdcId 2685573 (Cauliflower, raw) |
| תפוח אדמה | 77.0 | 58 | 2.0 | 2.57 | USDA FDC fdcId 170032 (Potatoes, raw, skin) |
| תפוח אדמה אפוי | 93.0 | 93 | 2.5 | 1.95 | USDA FDC fdcId 2709383 (Potato, baked, NFS) |
| בטטה | 86.0 | 42 | 1.6 | 2.49 | USDA FDC fdcId 169303 (Sweet potato leaves, raw) |
| שום | 149.0 | 143 | 6.4 | 6.62 | USDA FDC fdcId 1104647 (Garlic, raw) |
| דלעת מבושלת | 20.0 | 18 | 0.7 | 0.72 | USDA FDC fdcId 170526 (Pumpkin, cooked, boiled, drained, with salt) |
| סלרי | 16.0 | 16.6973 | 0.7 | 0.4921875 | USDA FDC fdcId 2346405 (Celery, raw) |
| ברוקולי | 34.0 | 31 | 2.8 | 2.57 | USDA FDC fdcId 747447 (Broccoli, raw) |
| ארטישוק מבושל | 58.0 | 51 | 2.9 | 2.89 | USDA FDC fdcId 169311 (Artichokes, (globe or french), cooked, boiled, drained, with salt) |
| אורז לבן מבושל | 130.0 | 96 | 2.7 | 2.01 | USDA FDC fdcId 2708422 (Rice, white, cooked, glutinous) |
| אורז מלא מבושל | 123.0 | 124 | 2.6 | 2.45 | USDA FDC fdcId 2710789 (Rice, brown, cooked, as ingredient) |
| לחם לבן | 265.0 | 267 | 9.0 | 9.43 | USDA FDC fdcId 2707598 (Bread, white) |
| פסטה מבושלת | 131.0 | 131 | 5.0 | 5.15 | USDA FDC fdcId 169728 (Pasta, fresh-refrigerated, plain, cooked) |
| לחם מלא | 252.0 | 254 | 12.5 | 12.3 | USDA FDC fdcId 2707709 (Bread, whole wheat) |
| פסטה מלאה מבושלת | 124.0 | 159 | 5.3 | 5.82 | USDA FDC fdcId 168916 (Pasta, whole grain, 51% whole wheat, remaining unenriched semolina, cooked) |
| לחמנייה | 301.0 | 307 | 10.5 | 9.5 | USDA FDC fdcId 175027 (Rolls, dinner, egg) |
| טורטייה | 218.0 | 218 | 5.9 | 5.7 | USDA FDC fdcId 2707823 (Tortilla, corn) |
| שיבולת שועל | 389.0 | 379 | 16.9 | 13.2 | USDA FDC fdcId 2708489 (Oats, raw) |
| קרקר | 415.0 | 418 | 8.3 | 9.46 | USDA FDC fdcId 2708167 (Crackers, saltine) |
| פריכיות אורז | 386.0 | 387 | 7.6 | 8.2 | USDA FDC fdcId 170250 (Snacks, rice cakes, brown rice, plain, unsalted) |
| דגני בוקר | 388.0 | 375 | 6.4 | 4.77 | USDA FDC fdcId 2708474 (Cereal, corn flakes, flavored) |
| קורנפלקס | 357.0 | 375 | 7.5 | 4.77 | USDA FDC fdcId 2708474 (Cereal, corn flakes, flavored) |
| וופל | 291.0 | 373 | 7.9 | 8.7 | USDA FDC fdcId 2708325 (Waffle, plain) |
| דייסת סולת | 89.0 | 53 | 2.6 | 1.82 | USDA FDC fdcId 173917 (Cereals, farina, enriched, cooked with water, with salt) |
| פנקייק | 227.0 | 282 | 6.4 | 7.41 | USDA FDC fdcId 2708304 (Pancakes, plain) |
| חזה עוף צלוי | 165.0 | 79 | 31.0 | 16.79 | USDA FDC fdcId 172963 (Chicken breast, oven-roasted, fat-free, sliced) |
| סלמון מבושל | 208.0 | 274 | 22.1 | 25.4 | USDA FDC fdcId 2706286 (Fish, salmon, baked or broiled) |
| הודו טחון מבושל | 189.0 | 203 | 22.0 | 27.37 | USDA FDC fdcId 171506 (Turkey, Ground, cooked) |
| בשר בקר טחון מבושל | 250.0 | 240 | 26.0 | 25.07 | USDA FDC fdcId 172161 (Beef, ground, unspecified fat content, cooked) |
| דג בקלה מבושל | 105.0 | 84 | 23.0 | 20.42 | USDA FDC fdcId 175178 (Fish, cod, Pacific, cooked) |
| דג אמנון מבושל | 128.0 | 128 | 26.2 | 26.15 | USDA FDC fdcId 175177 (Fish, tilapia, cooked, dry heat) |
| שרימפס מבושל | 99.0 | 119 | 24.0 | 22.78 | USDA FDC fdcId 171971 (Crustaceans, shrimp, mixed species, cooked, moist heat (may contain additives to retain moisture)) |
| הודו צלוי | 135.0 | 203 | 30.0 | 26.9 | USDA FDC fdcId 2706124 (Turkey, drumstick, roasted, skin eaten) |
| כבד עוף מבושל | 172.0 | 167 | 24.5 | 24.46 | USDA FDC fdcId 171061 (Chicken, liver, all classes, cooked, simmered) |
| המבורגר בקר | 244.0 | 295 | 23.5 | 23.05 | USDA FDC fdcId 169447 (Beef, ground, patties, frozen, cooked, broiled) |
| בקר צלי (דלי) | 115.0 | 115 | 19.0 | 18.62 | USDA FDC fdcId 174570 (Roast beef, deli style, prepackaged, sliced) |
| פסטרמה | 147.0 | 147 | 21.0 | 21.8 | USDA FDC fdcId 170204 (Beef, cured, pastrami) |
| נקניק הודו | 104.0 | 158 | 17.0 | 15.05 | USDA FDC fdcId 174604 (Sausage, Italian, turkey, smoked) |
| פילה סול מבושל | 89.0 | 86 | 18.8 | 15.24 | USDA FDC fdcId 174197 (Fish, flatfish (flounder and sole species), cooked, dry heat) |
| כבד בקר מבושל | 175.0 | 191 | 26.4 | 29.08 | USDA FDC fdcId 168626 (Beef, variety meats and by-products, liver, cooked, braised) |
| עדשים מבושלות | 116.0 | 114 | 9.0 | 9.02 | USDA FDC fdcId 175254 (Lentils, mature seeds, cooked, boiled, with salt) |
| טופו | 76.0 | 144 | 8.1 | 17.27 | USDA FDC fdcId 172475 (Tofu, raw, firm, prepared with calcium sulfate) |
| אדממה מבושל | 122.0 | 140 | 11.9 | 11.5 | USDA FDC fdcId 2707436 (Edamame, cooked) |
| חומוס (ממרח) | 166.0 | 237 | 7.9 | 7.78 | USDA FDC fdcId 174289 (Hummus, commercial) |
| פולי סויה מבושלים | 173.0 | 172 | 16.6 | 18.21 | USDA FDC fdcId 174271 (Soybeans, mature cooked, boiled, without salt) |
| יוגורט 3% | 67.0 | 61 | 5.3 | 3.47 | USDA FDC fdcId 171284 (Yogurt, plain, whole milk) |
| יוגורט טבעי | 61.0 | 50.0015 | 3.5 | 4.22675 | USDA FDC fdcId 2647437 (Yogurt, plain, nonfat) |
| יוגורט יווני | 73.0 | 73 | 10.0 | 9.95 | USDA FDC fdcId 170903 (Yogurt, Greek, plain, lowfat) |
| קוטג' 5% | 98.0 | 82 | 11.1 | 11 | USDA FDC fdcId 2705756 (Cheese, cottage, low fat) |
| גבינה לבנה 5% | 98.0 | 148 | 9.0 | 11 | USDA FDC fdcId 2705749 (Cottage cheese, farmer's) |
| לבן | 58.0 | 40 | 3.2 | 3.31 | USDA FDC fdcId 170874 (Milk, buttermilk, fluid, cultured, lowfat) |
| גבינת שמנת | 342.0 | 350 | 6.2 | 6.15 | USDA FDC fdcId 173418 (Cheese, cream) |
| מוצרלה | 300.0 | 141 | 22.2 | 31.7 | USDA FDC fdcId 169051 (Cheese, mozzarella, nonfat) |
| טונה בשימורים | 116.0 | 90 | 25.5 | 19 | USDA FDC fdcId 334194 (Fish, tuna, light, canned in water, drained solids) |
| חמאה | 717.0 | 717 | 0.9 | 0.85 | USDA FDC fdcId 173410 (Butter, salted) |
| פטה | 264.0 | 265 | 14.2 | 14.21 | USDA FDC fdcId 173420 (Cheese, feta) |
| פרמזן | 431.0 | 420 | 38.5 | 28.42 | USDA FDC fdcId 171247 (Cheese, parmesan, grated) |
| שמנת מתוקה | 363.0 | 195 | 2.2 | 2.96 | USDA FDC fdcId 170857 (Cream, fluid, light (coffee cream or table cream)) |
| חלב סויה | 35.0 | 64 | 3.5 | 3.35 | USDA FDC fdcId 2705406 (Soy milk, chocolate) |
| חלב שקדים | 14.0 | 15 | 0.5 | 0.55 | USDA FDC fdcId 2705409 (Almond milk, unsweetened) |
| שמן זית | 884.0 | 900 | 0.0 | 0 | USDA FDC fdcId 2710186 (Olive oil) |
| חמאת בוטנים | 592.0 | 520 | 22.0 | 25.9 | USDA FDC fdcId 172458 (Peanut butter, smooth, reduced fat) |
| בוטנים | 567.0 | 588.332 | 25.8 | 23.205 | USDA FDC fdcId 2515376 (Peanuts, raw) |
| שקדים | 579.0 | 625.75 | 21.2 | 21.45038 | USDA FDC fdcId 2346393 (Nuts, almonds, whole, raw) |
| אגוזי מלך | 654.0 | 729.556 | 15.2 | 14.5644 | USDA FDC fdcId 2346394 (Nuts, walnuts, English, halves, raw) |
| חלב 3% | 61.0 | 60 | 3.3 | 3.27 | USDA FDC fdcId 746782 (Milk, whole, 3.25% milkfat, with added vitamin D) |
| טחינה | 595.0 | 586 | 17.0 | 18.08 | USDA FDC fdcId 170191 (Seeds, sesame butter, paste) |
| זרעי חמניה | 584.0 | 567 | 20.8 | 18.4 | USDA FDC fdcId 2707584 (Sunflower seeds, flavored) |
| זרעי דלעת | 559.0 | 567 | 30.2 | 29.5 | USDA FDC fdcId 2707580 (Pumpkin seeds, salted) |
| קשיו | 553.0 | 564.664 | 18.2 | 17.4423 | USDA FDC fdcId 2515374 (Nuts, cashew nuts, raw) |
| שוקולד מריר | 590.0 | 598 | 7.0 | 7.79 | USDA FDC fdcId 170273 (Chocolate, dark, 70-85% cacao solids) |
| עוגיות | 480.0 | 514 | 5.9 | 5.37 | USDA FDC fdcId 174967 (Cookies, shortbread, commercially prepared, plain) |
| סוכר | 387.0 | 401 | 0.0 | 0 | USDA FDC fdcId 2710258 (Sugar, white, granulated or lump) |
| עוגת שוקולד | 394.0 | 399 | 5.1 | 3.63 | USDA FDC fdcId 2707873 (Snack cake, chocolate) |
| עוגת גבינה | 370.0 | 394 | 7.1 | 5.72 | USDA FDC fdcId 2707863 (Cheesecake, chocolate) |
| גבינה צהובה | 402.0 | 408 | 25.0 | 23.3 | USDA FDC fdcId 328637 (Cheese, cheddar) |
| מרק ירקות | 44.0 | 27 | 1.8 | 0.84 | USDA FDC fdcId 2710113 (Soup, vegetable) |
| סלט ירקות | 16.0 | 23 | 1.2 | 1.19 | USDA FDC fdcId 2709823 (Lettuce, salad with assorted vegetables excluding tomatoes and carrots, no dressing) |
| מרק עוף | 51.0 | 198 | 3.4 | 14.6 | USDA FDC fdcId 171563 (Soup, chicken broth cubes, dry) |
| מיץ תפוחים | 46.0 | 48 | 0.1 | 0.09 | USDA FDC fdcId 2709320 (Apple juice, 100%) |
| מיץ תפוזים | 45.0 | 54 | 0.7 | 0.2 | USDA FDC fdcId 169044 (Beverages, Orange juice drink) |
| מיץ ענבים | 54.0 | 66 | 0.3 | 0.18 | USDA FDC fdcId 2709325 (Grape juice, 100%) |
| תה ללא סוכר | 1.0 | 1 | 0.0 | 0.22 | USDA FDC fdcId 2710523 (Tea, iced, brewed, green, unsweetened) |
| קפה שחור | 2.0 | 1 | 0.1 | 0.12 | USDA FDC fdcId 2710375 (Coffee, brewed) |
| פסטה עם טונה | 180.0 | 200 | 6.9 | 6.69 | USDA FDC fdcId 2708942 (Macaroni or pasta salad with tuna) |
| לזניה בשר | 162.0 | 139 | 8.9 | 7.45 | USDA FDC fdcId 2708750 (Lasagna with meat) |
| מקרוני וגבינה | 113.0 | 82 | 4.7 | 3.38 | USDA FDC fdcId 173325 (Macaroni and Cheese, canned entree) |
| אורז עם ירקות | 128.0 | 103 | 2.6 | 2.03 | USDA FDC fdcId 2710068 (Vegetable curry with rice) |
| אורז עם עדשים | 156.5 | 118 | 6.7 | 3.28 | USDA FDC fdcId 2707432 (Lentil curry with rice) |
| אורז מלא עם ירקות | 107.0 | 119 | 2.5 | 2.4 | USDA FDC fdcId 2709070 (Rice, brown, with other vegetables, fat added) |
| אטריות אורז מבושלות | 107.5 | 108 | 1.8 | 1.79 | USDA FDC fdcId 168914 (Rice noodles, cooked) |
| אורז עם שעועית | 164.0 | 164 | 4.5 | 6.5 | USDA FDC fdcId 2708990 (Beans and white rice) |
| פירה תפוחי אדמה | 102.0 | 114 | 2.2 | 2.15 | USDA FDC fdcId 2709492 (Potato, mashed, NFS) |
| תפוחי אדמה מבושלים בקליפה | 87.0 | 78 | 1.9 | 2.86 | USDA FDC fdcId 170519 (Potatoes, boiled, cooked in skin, skin, with salt) |
| פירה בטטה | 119.0 | 101 | 1.5 | 1.98 | USDA FDC fdcId 169305 (Sweet potato, canned, mashed) |
| חלה | 302.0 | 287 | 8.9 | 9.5 | USDA FDC fdcId 2707624 (Bread, egg, Challah) |
| לחם דגנים | 253.0 | 265 | 10.5 | 13.4 | USDA FDC fdcId 2707777 (Bread, multigrain) |
| קרואסון שוקולד | 433.0 | 421 | 7.8 | 7.4 | USDA FDC fdcId 2707680 (Croissant, chocolate) |
| מאפין שוקולד | 387.0 | 395 | 5.8 | 6.54 | USDA FDC fdcId 2707833 (Muffin, chocolate) |
| בייגל | 278.0 | 451 | 10.3 | 12.34 | USDA FDC fdcId 173150 (Snacks, bagel chips, plain) |
| לחמניית המבורגר | 272.0 | 273 | 9.5 | 11.2 | USDA FDC fdcId 2708724 (Bao bun) |
| פיתה מלאה | 264.0 | 262 | 9.8 | 9.8 | USDA FDC fdcId 174916 (Bread, pita, whole-wheat) |
| עוף בגריל | 190.0 | 151 | 27.0 | 22.3 | USDA FDC fdcId 2706090 (Chicken fillet, grilled) |
| כנפיים עוף | 290.0 | 252 | 26.9 | 23.6 | USDA FDC fdcId 2706057 (Chicken wing, baked, broiled, or roasted, from raw) |
| סטייק אנטריקוט | 214.0 | 259 | 25.8 | 24.24 | USDA FDC fdcId 173055 (Beef, ribeye cap steak, boneless, separable lean only, trimmed to 0" fat, choice, cooked, grilled) |
| צלי בקר | 251.5 | 251 | 30.1 | 28.4 | USDA FDC fdcId 2705848 (Beef, pot roast) |
| סטייק פילה בקר | 200.0 | 217 | 29.1 | 30.21 | USDA FDC fdcId 170238 (Beef, loin, tenderloin steak, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled) |
| קורדון בלו עוף | 220.0 | 210 | 19.4 | 22.6 | USDA FDC fdcId 2706441 (Chicken or turkey cordon bleu) |
| פילה בקלה בתנור | 105.0 | 126 | 22.8 | 19 | USDA FDC fdcId 2706241 (Fish, cod, baked or broiled) |
| דג פורל | 168.0 | 148 | 23.8 | 20.77 | USDA FDC fdcId 175153 (Fish, trout, mixed species, raw) |
| יוגורט דל שומן | 45.0 | 63 | 4.5 | 5.25 | USDA FDC fdcId 170886 (Yogurt, plain, low fat) |
| יוגורט וניל | 95.0 | 85 | 3.5 | 4.93 | USDA FDC fdcId 170888 (Yogurt, vanilla, low fat.) |
| פודינג שוקולד | 165.0 | 142 | 3.5 | 2.09 | USDA FDC fdcId 2705679 (Pudding, chocolate, NFS) |
| גבינת עיזים | 364.0 | 264 | 21.6 | 18.52 | USDA FDC fdcId 173435 (Cheese, goat, soft type) |
| חביתה | 154.0 | 154 | 10.9 | 10.57 | USDA FDC fdcId 172185 (Egg, whole, cooked, omelet) |
| ביצה עלומה | 143.0 | 143 | 12.6 | 12.51 | USDA FDC fdcId 172186 (Egg, whole, cooked, poached) |
| חביתת גבינה | 190.0 | 132 | 12.5 | 11.3 | USDA FDC fdcId 2707290 (Egg white, omelet, scrambled, or fried, with cheese) |
| ביצים מקושקשות | 131.0 | 149 | 10.7 | 9.99 | USDA FDC fdcId 172187 (Egg, whole, cooked, scrambled) |
| מרק עדשים | 89.0 | 60 | 4.6 | 3.82 | USDA FDC fdcId 2707462 (Soup, lentil) |
| שעועית ברוטב עגבניות | 90.5 | 94 | 5.7 | 5.15 | USDA FDC fdcId 173733 (Beans, baked, canned, with pork and tomato sauce) |
| ריקוטה | 174.0 | 157 | 11.3 | 7.81 | USDA FDC fdcId 746766 (Cheese, ricotta, whole milk) |
| שייק פירות | 72.0 | 53 | 0.5 | 2.61 | USDA FDC fdcId 2709338 (Fruit smoothie, light) |
| שייק חלבון | 73.0 | 61 | 7.0 | 6.59 | USDA FDC fdcId 2710726 (Nutritional drink or shake, high protein, ready-to-drink, NFS) |
| סנדוויץ' טונה | 225.0 | 244 | 10.4 | 10.6 | USDA FDC fdcId 2707038 (Tuna salad sandwich wrap) |
| סנדוויץ' גבינה צהובה | 299.0 | 325 | 11.5 | 15.1 | USDA FDC fdcId 2705797 (Cheese sandwich, cheddar cheese, on white bread) |
| סנדוויץ' חביתה | 164.0 | 166 | 8.7 | 9.41 | USDA FDC fdcId 2707334 (Egg white sandwich) |
| כריך גבינה וירקות | 210.0 | 146 | 8.4 | 6.46 | USDA FDC fdcId 2709135 (Vegetable sandwich on wheat, with cheese) |
| כרוב ממולא | 122.0 | 207 | 7.7 | 9.56 | USDA FDC fdcId 2710142 (Stuffed cabbage, with meat, Puerto Rican style) |
| ביסקוויטים | 340.0 | 446 | 6.5 | 6.9 | USDA FDC fdcId 168014 (Cookies, animal crackers (includes arrowroot, tea biscuits)) |
| טירמיסו | 283.0 | 353 | 4.9 | 5.65 | USDA FDC fdcId 2705702 (Tiramisu) |
| עוגת תפוחים | 272.0 | 376 | 2.6 | 2.41 | USDA FDC fdcId 2707855 (Cake or cupcake, apple) |
| חטיף דגנים | 460.0 | 471 | 8.0 | 10.1 | USDA FDC fdcId 2708101 (Cereal or Granola bar, NFS) |
| קטשופ | 98.5 | 109 | 1.5 | 1.08 | USDA FDC fdcId 2709733 (Ketchup) |
| ריבה | 278.0 | 212 | 0.4 | 0 | USDA FDC fdcId 170280 (Jams, preserves, marmalades, sweetened with fruit juice) |
| נוטלה | 539.0 | 539 | 6.3 | 5.41 | USDA FDC fdcId 2710289 (Chocolate hazelnut spread) |
| ממרח שוקולד | 525.5 | 539 | 5.8 | 5.41 | USDA FDC fdcId 2710289 (Chocolate hazelnut spread) |
| פיצה קפואה | 263.0 | 268 | 11.6 | 10.4 | USDA FDC fdcId 2708613 (Pizza, cheese, from frozen, thick crust) |
| טורטייה קמח | 314.0 | 306 | 9.0 | 8.2 | USDA FDC fdcId 2707824 (Tortilla, flour) |

### Removed -- old value, reason (full list)
| Name | Old kcal | Old protein | Reason |
|---|---|---|---|
| אורז בסמטי מבושל | 121.0 | 3.1 | no reliable USDA match found (no_full_token_match) |
| סטייק בקר צלוי | 217.0 | 28.0 | no reliable USDA match found (no_full_token_match) |
| שוק עוף צלוי | 209.0 | 26.0 | no reliable USDA match found (content_gate: matched the same USDA record as a different, non-synonymous catalog name (hand-verified wrong match during stratified review)) |
| קציצות בשר | 206.0 | 19.0 | no reliable USDA match found (no_full_token_match) |
| גבינה בולגרית | 265.0 | 16.0 | no reliable USDA match found (no_full_token_match) |
| שמנת חמוצה | 212.0 | 2.6 | no reliable USDA match found (no_full_token_match) |
| חטיף במבה | 534.0 | 17.0 | no reliable USDA match found (no_full_token_match) |
| צ'יפס | 312.0 | 3.4 | no reliable USDA match found (no_full_token_match) |
| ביסלי | 500.0 | 9.5 | no reliable USDA match found (no_full_token_match) |
| מרשמלו | 318.0 | 1.8 | no reliable USDA match found (no_full_token_match) |
| פיצה גבינה | 266.0 | 11.0 | no reliable USDA match found (content_gate: matched USDA record is only the topping portion of the dish, not the whole food) |
| קולה | 42.0 | 0.0 | no reliable USDA match found (no_full_token_match) |
| משקה איזוטוני | 24.0 | 0.0 | no reliable USDA match found (no_full_token_match) |
| פסטה ברוטב עגבניות | 133.0 | 3.6 | no reliable USDA match found (content_gate: matched USDA record is qualified "restaurant" -- not a generic food) |
| פסטה רוזה | 165.0 | 4.5 | no reliable USDA match found (no_full_token_match) |
| פסטה בולונז | 177.0 | 9.5 | no reliable USDA match found (no_full_token_match) |
| פסטה ברוטב שמנת | 179.0 | 3.9 | no reliable USDA match found (no_full_token_match) |
| פסטה פסטו | 315.0 | 9.2 | no reliable USDA match found (no_full_token_match) |
| פסטה קרבונרה | 191.0 | 8.1 | no reliable USDA match found (no_full_token_match) |
| פסטה ארביאטה | 87.0 | 4.0 | no reliable USDA match found (no_full_token_match) |
| פסטה בשמן זית ושום | 200.0 | 5.0 | no reliable USDA match found (no_full_token_match) |
| פסטה עם פטריות ושמנת | 160.0 | 4.4 | no reliable USDA match found (no_full_token_match) |
| פנה ברוטב עגבניות | 133.0 | 3.6 | no reliable USDA match found (no_full_token_match) |
| ספגטי בולונז | 177.0 | 9.5 | no reliable USDA match found (no_full_token_match) |
| טורטליני בשר | 162.0 | 9.5 | no reliable USDA match found (no_full_token_match) |
| רביולי גבינה | 136.0 | 5.7 | no reliable USDA match found (no_full_token_match) |
| פסטה ברוטב רוזה עם עוף | 183.0 | 7.9 | no reliable USDA match found (no_full_token_match) |
| אורז צהוב | 113.5 | 1.8 | no reliable USDA match found (no_full_token_match) |
| אורז פרסי | 147.0 | 2.6 | no reliable USDA match found (no_full_token_match) |
| ריזוטו פטריות | 82.0 | 2.2 | no reliable USDA match found (no_full_token_match) |
| ריזוטו עוף | 117.0 | 5.6 | no reliable USDA match found (no_full_token_match) |
| אורז הודי בתבלינים | 138.0 | 2.7 | no reliable USDA match found (no_full_token_match) |
| תפוחי אדמה בתנור | 110.0 | 2.2 | no reliable USDA match found (no_full_token_match) |
| לביבות תפוחי אדמה | 268.0 | 6.1 | no reliable USDA match found (no_full_token_match) |
| קציצות תפוחי אדמה | 190.0 | 3.5 | no reliable USDA match found (no_full_token_match) |
| תפוחי אדמה מטוגנים | 281.0 | 2.9 | no reliable USDA match found (content_gate: matched USDA record names a specific restaurant chain -- not a generic food (instruction: keep restaurant foods out of this pass)) |
| קוגל תפוחי אדמה | 155.0 | 3.5 | no reliable USDA match found (no_full_token_match) |
| בגט | 260.0 | 9.7 | no reliable USDA match found (no_full_token_match) |
| לחם קל | 240.0 | 7.5 | no reliable USDA match found (no_full_token_match) |
| לחם שיפון מלא | 203.0 | 6.5 | no reliable USDA match found (no_full_token_match) |
| פוקצ'ה | 253.0 | 8.0 | no reliable USDA match found (no_full_token_match) |
| בורקס גבינה | 300.0 | 7.5 | no reliable USDA match found (no_full_token_match) |
| בורקס תפוחי אדמה | 280.0 | 5.0 | no reliable USDA match found (no_full_token_match) |
| בורקס תרד | 250.0 | 6.0 | no reliable USDA match found (no_full_token_match) |
| רוגלך שוקולד | 408.0 | 4.5 | no reliable USDA match found (no_full_token_match) |
| חלה מתוקה | 256.0 | 8.5 | no reliable USDA match found (no_full_token_match) |
| עוף בתנור | 239.0 | 27.3 | no reliable USDA match found (no_full_token_match) |
| לחם אחיד | 253.0 | 8.9 | no reliable USDA match found (missing_nutrient_in_detail) |
| כרעיים עוף צלויות | 203.5 | 23.0 | no reliable USDA match found (content_gate: matched the same USDA record as a different, non-synonymous catalog name (hand-verified wrong match during stratified review)) |
| שווארמה עוף | 176.0 | 22.5 | no reliable USDA match found (no_full_token_match) |
| שווארמה הודו | 195.0 | 23.0 | no reliable USDA match found (no_full_token_match) |
| קבב עוף | 220.0 | 20.0 | no reliable USDA match found (no_full_token_match) |
| קבב בקר | 255.0 | 21.2 | no reliable USDA match found (no_full_token_match) |
| גולאש בקר | 111.0 | 12.4 | no reliable USDA match found (no_full_token_match) |
| שניצל הודו | 248.5 | 20.0 | no reliable USDA match found (no_full_token_match) |
| חזה עוף בציפוי פריך | 172.0 | 29.2 | no reliable USDA match found (no_full_token_match) |
| דג סלמון בתנור | 206.0 | 22.1 | no reliable USDA match found (no_full_token_match) |
| דג טונה טרי צלוי | 130.0 | 29.1 | no reliable USDA match found (no_full_token_match) |
| דג דניס | 96.0 | 20.0 | no reliable USDA match found (no_full_token_match) |
| גבינה 9% | 131.0 | 8.5 | no reliable USDA match found (no_full_token_match) |
| גבינה 26% | 300.0 | 21.0 | no reliable USDA match found (no_full_token_match) |
| שמנת 38% | 361.0 | 2.0 | no reliable USDA match found (no_full_token_match) |
| מעדן חלב | 165.0 | 3.5 | no reliable USDA match found (no_full_token_match) |
| יוגורט תות | 85.0 | 3.3 | no reliable USDA match found (content_gate: matched the same USDA record as a different, non-synonymous catalog name (hand-verified wrong match during stratified review)) |
| קרם פרש | 290.0 | 3.0 | no reliable USDA match found (no_full_token_match) |
| לבנה | 165.0 | 7.9 | no reliable USDA match found (no_full_token_match) |
| חומוס עם פטרוזיליה ולימון | 172.0 | 8.7 | no reliable USDA match found (no_full_token_match) |
| עדשים כתומות מבושלות | 116.0 | 9.0 | no reliable USDA match found (no_full_token_match) |
| טוסט גבינה צהובה | 332.0 | 13.0 | no reliable USDA match found (no_full_token_match) |
| טוסט חביתה | 248.0 | 12.5 | no reliable USDA match found (no_full_token_match) |
| לחמנייה עם חמאה וריבה | 310.0 | 7.5 | no reliable USDA match found (no_full_token_match) |
| דייסת שיבולת שועל עם חלב | 85.0 | 4.6 | no reliable USDA match found (no_full_token_match) |
| מוזלי | 375.0 | 9.5 | no reliable USDA match found (no_full_token_match) |
| לביבות גבינה | 187.0 | 8.2 | no reliable USDA match found (no_full_token_match) |
| סנדוויץ' חומוס | 145.0 | 7.5 | no reliable USDA match found (no_full_token_match) |
| פיתה ממולאת פלאפל | 248.0 | 6.2 | no reliable USDA match found (no_full_token_match) |
| כריך שווארמה | 262.0 | 14.0 | no reliable USDA match found (no_full_token_match) |
| טוסט טונה | 246.0 | 14.2 | no reliable USDA match found (no_full_token_match) |
| שווארמה | 279.0 | 25.2 | no reliable USDA match found (no_full_token_match) |
| מלאווח | 351.0 | 6.6 | no reliable USDA match found (no_full_token_match) |
| סביח | 200.0 | 7.0 | no reliable USDA match found (no_full_token_match) |
| בורקס | 308.0 | 8.2 | no reliable USDA match found (no_full_token_match) |
| מג'דרה | 166.0 | 6.5 | no reliable USDA match found (no_full_token_match) |
| שקשוקה | 126.0 | 6.8 | no reliable USDA match found (no_full_token_match) |
| קובה חמוסתא | 70.0 | 4.0 | no reliable USDA match found (no_full_token_match) |
| קובה | 180.0 | 9.5 | no reliable USDA match found (no_full_token_match) |
| מוסקה | 122.0 | 5.8 | no reliable USDA match found (no_full_token_match) |
| חמין | 160.0 | 8.0 | no reliable USDA match found (no_full_token_match) |
| ג'חנון | 390.0 | 7.5 | no reliable USDA match found (no_full_token_match) |
| חצילים בטחינה | 153.0 | 3.8 | no reliable USDA match found (no_full_token_match) |
| סחוג | 40.0 | 2.0 | no reliable USDA match found (no_full_token_match) |
| קוגל ירושלמי | 230.0 | 6.5 | no reliable USDA match found (no_full_token_match) |
| פשטידת ירקות | 172.0 | 5.6 | no reliable USDA match found (no_full_token_match) |
| וופל בלגי | 280.0 | 6.5 | no reliable USDA match found (no_full_token_match) |
| בבקה שוקולד | 375.0 | 5.5 | no reliable USDA match found (no_full_token_match) |
| חטיף שוקולד ממולא | 410.0 | 3.5 | no reliable USDA match found (no_full_token_match) |
| עוגת שמרים | 341.0 | 6.1 | no reliable USDA match found (no_full_token_match) |
| בראוני | 392.0 | 4.7 | no reliable USDA match found (no_full_token_match) |
| סילאן | 298.0 | 0.5 | no reliable USDA match found (no_full_token_match) |
| מיונז לייט | 260.5 | 0.7 | no reliable USDA match found (no_full_token_match) |
| חרדל דיז'ון | 146.1 | 7.9 | no reliable USDA match found (no_full_token_match) |
| מיונז שום | 650.0 | 1.2 | no reliable USDA match found (no_full_token_match) |
| רוטב עגבניות | 51.5 | 1.6 | no reliable USDA match found (content_gate: matched USDA record is qualified "restaurant" -- not a generic food) |
| פסטה מוכנה קפואה | 101.5 | 4.9 | no reliable USDA match found (no_full_token_match) |
| שניצל עוף קפוא | 210.0 | 15.0 | no reliable USDA match found (no_full_token_match) |
| נאגטס עוף | 287.0 | 14.2 | no reliable USDA match found (content_gate: matched USDA record names a specific restaurant chain -- not a generic food (instruction: keep restaurant foods out of this pass)) |
| ירקות קפואים מוקפצים | 59.5 | 2.3 | no reliable USDA match found (no_full_token_match) |
| בורקס קפוא | 289.0 | 5.3 | no reliable USDA match found (no_full_token_match) |
| פלאפל קפוא | 250.0 | 7.4 | no reliable USDA match found (no_full_token_match) |
| בלינצ'ס גבינה | 216.5 | 8.1 | no reliable USDA match found (no_full_token_match) |
| צ'יפס קפוא אפוי | 163.0 | 2.9 | no reliable USDA match found (no_full_token_match) |
| כדורי בשר קפואים | 286.0 | 14.2 | no reliable USDA match found (no_full_token_match) |
| פיצה משפחתית | 260.0 | 10.5 | no reliable USDA match found (no_full_token_match) |