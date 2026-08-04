-- Food Reference Catalog Verified Corrections milestone.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 007_food_reference_catalog_corrections.sql.
--
-- Purpose: apply the results of a full, one-by-one web-verification audit
-- of all 349 rows in public.food_reference_catalog (the complete set
-- produced by 005 + 006 + 007). Every food was individually checked
-- against USDA FoodData Central, official manufacturer labels, Israeli
-- manufacturer sources, or (for recipe-dependent dishes) multiple credible
-- nutrition sources, using a documented midpoint-of-range methodology when
-- sources disagreed. A follow-up judgment-call review then resolved every
-- case that was low-confidence, internally conflicting, or otherwise
-- ambiguous (fat-% ambiguity, proxy-substituted dishes, single-source
-- outliers, source-quality conflicts) before any value below was approved.
--
-- This migration is purely corrective:
--   * does NOT truncate the table
--   * does NOT insert or delete any rows (catalog stays at 349 rows)
--   * only UPDATEs existing rows by name (safe to run whether or not the
--     row exists yet — a no-op if 005/006/007 haven't run)
--   * safe to run more than once (every UPDATE is idempotent)
--
-- Rows deliberately NOT touched here fall into three groups, all
-- intentional:
--   1. Already verified accurate (proposed value matched current exactly
--      or within rounding) — no row needed.
--   2. Judgment-call review recommended keeping the current value (e.g.
--      conflicting sources, fat-%/lean-% ambiguity, implausible proxy
--      substitution, or a weaker new source contradicting an
--      already-confirmed USDA figure).
--   3. No reliable source could be found after real effort, across either
--      verification pass — these 8 items keep their current value
--      unresolved: נקניק הודו, פסטה רוזה, יוגורט וניל, קובה חמוסתא, חמין,
--      לחמנייה עם חמאה וריבה, שווארמה הודו, עוף ברוטב עגבניות.

-- 1. Vegetables (005)
update public.food_reference_catalog set calories_per_100g = 15,  protein_per_100g = 0.7 where lower(name) = lower('מלפפון');
update public.food_reference_catalog set calories_per_100g = 22,  protein_per_100g = 0.8 where lower(name) = lower('פלפל ירוק');
update public.food_reference_catalog set calories_per_100g = 26,  protein_per_100g = 1.2 where lower(name) = lower('כרוב');
update public.food_reference_catalog set calories_per_100g = 58,  protein_per_100g = 2.9 where lower(name) = lower('ארטישוק מבושל');

-- 2. Grains / carbs (005), incl. the new טורטייה קמח row added by 007
update public.food_reference_catalog set calories_per_100g = 121, protein_per_100g = 3.1  where lower(name) = lower('אורז בסמטי מבושל');
update public.food_reference_catalog set calories_per_100g = 252, protein_per_100g = 12.5 where lower(name) = lower('לחם מלא');
update public.food_reference_catalog set calories_per_100g = 301, protein_per_100g = 10.5 where lower(name) = lower('לחמנייה');
update public.food_reference_catalog set calories_per_100g = 218, protein_per_100g = 5.9  where lower(name) = lower('טורטייה');
update public.food_reference_catalog set calories_per_100g = 314, protein_per_100g = 9.0  where lower(name) = lower('טורטייה קמח');
update public.food_reference_catalog set calories_per_100g = 415, protein_per_100g = 8.3  where lower(name) = lower('קרקר');
update public.food_reference_catalog set calories_per_100g = 380, protein_per_100g = 10.6 where lower(name) = lower('בייגלה');
update public.food_reference_catalog set calories_per_100g = 386, protein_per_100g = 7.6  where lower(name) = lower('פריכיות אורז');
update public.food_reference_catalog set calories_per_100g = 388, protein_per_100g = 6.4  where lower(name) = lower('דגני בוקר');
update public.food_reference_catalog set calories_per_100g = 480, protein_per_100g = 12.4 where lower(name) = lower('גרנולה');
update public.food_reference_catalog set calories_per_100g = 89,  protein_per_100g = 2.6  where lower(name) = lower('דייסת סולת');

-- 3. Meat / fish / eggs (005 proteins)
update public.food_reference_catalog set calories_per_100g = 217, protein_per_100g = 28.0 where lower(name) = lower('סטייק בקר צלוי');
update public.food_reference_catalog set calories_per_100g = 273, protein_per_100g = 23.0 where lower(name) = lower('שניצל עוף');
update public.food_reference_catalog set calories_per_100g = 300, protein_per_100g = 11.2 where lower(name) = lower('נקניקיה');
update public.food_reference_catalog set calories_per_100g = 244, protein_per_100g = 23.5 where lower(name) = lower('המבורגר בקר');
update public.food_reference_catalog set calories_per_100g = 206, protein_per_100g = 19.0 where lower(name) = lower('קציצות בשר');
update public.food_reference_catalog set calories_per_100g = 115, protein_per_100g = 19.0 where lower(name) = lower('בקר צלי (דלי)');
update public.food_reference_catalog set calories_per_100g = 150, protein_per_100g = 24.8 where lower(name) = lower('דג בורי מבושל');

-- 4. Legumes / nuts / seeds (005)
update public.food_reference_catalog set calories_per_100g = 592, protein_per_100g = 22.0 where lower(name) = lower('חמאת בוטנים');

-- 5. Dairy (005)
update public.food_reference_catalog set calories_per_100g = 61,  protein_per_100g = 3.3  where lower(name) = lower('חלב 3%');
update public.food_reference_catalog set calories_per_100g = 43,  protein_per_100g = 3.4  where lower(name) = lower('חלב 1%');
update public.food_reference_catalog set calories_per_100g = 67,  protein_per_100g = 5.3  where lower(name) = lower('יוגורט 3%');
update public.food_reference_catalog set calories_per_100g = 58,  protein_per_100g = 3.2  where lower(name) = lower('לבן');
update public.food_reference_catalog set calories_per_100g = 300, protein_per_100g = 22.2 where lower(name) = lower('מוצרלה');
update public.food_reference_catalog set calories_per_100g = 363, protein_per_100g = 2.2  where lower(name) = lower('שמנת מתוקה');
update public.food_reference_catalog set calories_per_100g = 35,  protein_per_100g = 3.5  where lower(name) = lower('חלב סויה');
update public.food_reference_catalog set calories_per_100g = 14,  protein_per_100g = 0.5  where lower(name) = lower('חלב שקדים');
update public.food_reference_catalog set calories_per_100g = 212, protein_per_100g = 2.6  where lower(name) = lower('שמנת חמוצה');

-- 6. Snacks / prepared dishes / soups / drinks (005)
update public.food_reference_catalog set calories_per_100g = 590, protein_per_100g = 7.0  where lower(name) = lower('שוקולד מריר');
update public.food_reference_catalog set calories_per_100g = 534, protein_per_100g = 17.0 where lower(name) = lower('חטיף במבה');
update public.food_reference_catalog set calories_per_100g = 500, protein_per_100g = 9.5  where lower(name) = lower('ביסלי');
update public.food_reference_catalog set calories_per_100g = 394, protein_per_100g = 5.1  where lower(name) = lower('עוגת שוקולד');
update public.food_reference_catalog set calories_per_100g = 370, protein_per_100g = 7.1  where lower(name) = lower('עוגת גבינה');
update public.food_reference_catalog set calories_per_100g = 51,  protein_per_100g = 3.4  where lower(name) = lower('מרק עוף');
update public.food_reference_catalog set calories_per_100g = 16,  protein_per_100g = 1.2  where lower(name) = lower('סלט ירקות');
update public.food_reference_catalog set calories_per_100g = 54,  protein_per_100g = 0.3  where lower(name) = lower('מיץ ענבים');

-- 7. Pasta dishes (006)
update public.food_reference_catalog set calories_per_100g = 133, protein_per_100g = 3.6 where lower(name) = lower('פסטה ברוטב עגבניות');
update public.food_reference_catalog set calories_per_100g = 179, protein_per_100g = 3.9 where lower(name) = lower('פסטה ברוטב שמנת');
update public.food_reference_catalog set calories_per_100g = 177, protein_per_100g = 9.5 where lower(name) = lower('פסטה בולונז');
update public.food_reference_catalog set calories_per_100g = 315, protein_per_100g = 9.2 where lower(name) = lower('פסטה פסטו');
update public.food_reference_catalog set calories_per_100g = 191, protein_per_100g = 8.1 where lower(name) = lower('פסטה קרבונרה');
update public.food_reference_catalog set calories_per_100g = 87,  protein_per_100g = 4.0 where lower(name) = lower('פסטה ארביאטה');
update public.food_reference_catalog set calories_per_100g = 200, protein_per_100g = 5.0 where lower(name) = lower('פסטה בשמן זית ושום');
update public.food_reference_catalog set calories_per_100g = 180, protein_per_100g = 6.9 where lower(name) = lower('פסטה עם טונה');
update public.food_reference_catalog set calories_per_100g = 160, protein_per_100g = 4.4 where lower(name) = lower('פסטה עם פטריות ושמנת');
update public.food_reference_catalog set calories_per_100g = 133, protein_per_100g = 3.6 where lower(name) = lower('פנה ברוטב עגבניות');
update public.food_reference_catalog set calories_per_100g = 177, protein_per_100g = 9.5 where lower(name) = lower('ספגטי בולונז');
update public.food_reference_catalog set calories_per_100g = 162, protein_per_100g = 8.9 where lower(name) = lower('לזניה בשר');
update public.food_reference_catalog set calories_per_100g = 139, protein_per_100g = 6.9 where lower(name) = lower('לזניה ירקות');
update public.food_reference_catalog set calories_per_100g = 136, protein_per_100g = 5.7 where lower(name) = lower('רביולי גבינה');
update public.food_reference_catalog set calories_per_100g = 162, protein_per_100g = 9.5 where lower(name) = lower('טורטליני בשר');
update public.food_reference_catalog set calories_per_100g = 113, protein_per_100g = 4.7 where lower(name) = lower('מקרוני וגבינה');
update public.food_reference_catalog set calories_per_100g = 183, protein_per_100g = 7.9 where lower(name) = lower('פסטה ברוטב רוזה עם עוף');

-- 8. Rice & potato dishes (006)
update public.food_reference_catalog set calories_per_100g = 113.5, protein_per_100g = 1.8 where lower(name) = lower('אורז צהוב');
update public.food_reference_catalog set calories_per_100g = 128,   protein_per_100g = 2.6 where lower(name) = lower('אורז עם ירקות');
update public.food_reference_catalog set calories_per_100g = 156.5, protein_per_100g = 6.7 where lower(name) = lower('אורז עם עדשים');
update public.food_reference_catalog set calories_per_100g = 147,   protein_per_100g = 2.6 where lower(name) = lower('אורז פרסי');
update public.food_reference_catalog set calories_per_100g = 107.5, protein_per_100g = 1.8 where lower(name) = lower('אטריות אורז מבושלות');
update public.food_reference_catalog set calories_per_100g = 107,   protein_per_100g = 2.5 where lower(name) = lower('אורז מלא עם ירקות');
update public.food_reference_catalog set calories_per_100g = 82,    protein_per_100g = 2.2 where lower(name) = lower('ריזוטו פטריות');
update public.food_reference_catalog set calories_per_100g = 117,   protein_per_100g = 5.6 where lower(name) = lower('ריזוטו עוף');
update public.food_reference_catalog set calories_per_100g = 164,   protein_per_100g = 4.5 where lower(name) = lower('אורז עם שעועית');
update public.food_reference_catalog set calories_per_100g = 138,   protein_per_100g = 2.7 where lower(name) = lower('אורז הודי בתבלינים');
update public.food_reference_catalog set calories_per_100g = 102,   protein_per_100g = 2.2 where lower(name) = lower('פירה תפוחי אדמה');
update public.food_reference_catalog set calories_per_100g = 110,   protein_per_100g = 2.2 where lower(name) = lower('תפוחי אדמה בתנור');
update public.food_reference_catalog set calories_per_100g = 281,   protein_per_100g = 2.9 where lower(name) = lower('תפוחי אדמה מטוגנים');
update public.food_reference_catalog set calories_per_100g = 76,    protein_per_100g = 1.4 where lower(name) = lower('בטטה מבושלת');
update public.food_reference_catalog set calories_per_100g = 119,   protein_per_100g = 1.5 where lower(name) = lower('פירה בטטה');
update public.food_reference_catalog set calories_per_100g = 155,   protein_per_100g = 3.5 where lower(name) = lower('קוגל תפוחי אדמה');

-- 9. Breads & baked goods (006)
update public.food_reference_catalog set calories_per_100g = 302, protein_per_100g = 8.9  where lower(name) = lower('חלה');
update public.food_reference_catalog set calories_per_100g = 260, protein_per_100g = 9.7  where lower(name) = lower('בגט');
update public.food_reference_catalog set calories_per_100g = 203, protein_per_100g = 6.5  where lower(name) = lower('לחם שיפון מלא');
update public.food_reference_catalog set calories_per_100g = 253, protein_per_100g = 8.0  where lower(name) = lower('פוקצ''ה');
update public.food_reference_catalog set calories_per_100g = 433, protein_per_100g = 7.8  where lower(name) = lower('קרואסון שוקולד');
update public.food_reference_catalog set calories_per_100g = 250, protein_per_100g = 6.0  where lower(name) = lower('בורקס תרד');
update public.food_reference_catalog set calories_per_100g = 408, protein_per_100g = 4.5  where lower(name) = lower('רוגלך שוקולד');
update public.food_reference_catalog set calories_per_100g = 278, protein_per_100g = 10.3 where lower(name) = lower('בייגל');
update public.food_reference_catalog set calories_per_100g = 387, protein_per_100g = 5.8  where lower(name) = lower('מאפין שוקולד');
update public.food_reference_catalog set calories_per_100g = 272, protein_per_100g = 9.5  where lower(name) = lower('לחמניית המבורגר');
update public.food_reference_catalog set calories_per_100g = 256, protein_per_100g = 8.5  where lower(name) = lower('חלה מתוקה');
update public.food_reference_catalog set calories_per_100g = 253, protein_per_100g = 8.9  where lower(name) = lower('לחם אחיד');
update public.food_reference_catalog set calories_per_100g = 264, protein_per_100g = 9.8  where lower(name) = lower('פיתה מלאה');

-- 10. Chicken / beef / turkey / fish dishes (006)
update public.food_reference_catalog set calories_per_100g = 239,   protein_per_100g = 27.3 where lower(name) = lower('עוף בתנור');
update public.food_reference_catalog set calories_per_100g = 203.5, protein_per_100g = 23.0 where lower(name) = lower('כרעיים עוף צלויות');
update public.food_reference_catalog set calories_per_100g = 176,   protein_per_100g = 22.5 where lower(name) = lower('שווארמה עוף');
update public.food_reference_catalog set calories_per_100g = 255,   protein_per_100g = 21.2 where lower(name) = lower('קבב בקר');
update public.food_reference_catalog set calories_per_100g = 214,   protein_per_100g = 25.8 where lower(name) = lower('סטייק אנטריקוט');
update public.food_reference_catalog set calories_per_100g = 200,   protein_per_100g = 29.1 where lower(name) = lower('סטייק פילה בקר');
update public.food_reference_catalog set calories_per_100g = 251.5, protein_per_100g = 30.1 where lower(name) = lower('צלי בקר');
update public.food_reference_catalog set calories_per_100g = 111,   protein_per_100g = 12.4 where lower(name) = lower('גולאש בקר');
update public.food_reference_catalog set calories_per_100g = 172,   protein_per_100g = 29.2 where lower(name) = lower('חזה עוף בציפוי פריך');
update public.food_reference_catalog set calories_per_100g = 248.5, protein_per_100g = 20.0 where lower(name) = lower('שניצל הודו');
update public.food_reference_catalog set calories_per_100g = 141.5, protein_per_100g = 13.0 where lower(name) = lower('כדורי בשר ברוטב');
update public.food_reference_catalog set calories_per_100g = 220,   protein_per_100g = 19.4 where lower(name) = lower('קורדון בלו עוף');
update public.food_reference_catalog set calories_per_100g = 206,   protein_per_100g = 22.1 where lower(name) = lower('דג סלמון בתנור');
update public.food_reference_catalog set calories_per_100g = 130,   protein_per_100g = 29.1 where lower(name) = lower('דג טונה טרי צלוי');
update public.food_reference_catalog set calories_per_100g = 105,   protein_per_100g = 22.8 where lower(name) = lower('פילה בקלה בתנור');
update public.food_reference_catalog set calories_per_100g = 168,   protein_per_100g = 23.8 where lower(name) = lower('דג פורל');
update public.food_reference_catalog set calories_per_100g = 172,   protein_per_100g = 25.8 where lower(name) = lower('כבד עוף מטוגן');

-- 11. Dairy / eggs / legumes (006)
update public.food_reference_catalog set calories_per_100g = 131,  protein_per_100g = 8.5  where lower(name) = lower('גבינה 9%');
update public.food_reference_catalog set calories_per_100g = 361,  protein_per_100g = 2.0  where lower(name) = lower('שמנת 38%');
update public.food_reference_catalog set calories_per_100g = 165,  protein_per_100g = 3.5  where lower(name) = lower('מעדן חלב');
update public.food_reference_catalog set calories_per_100g = 165,  protein_per_100g = 3.5  where lower(name) = lower('פודינג שוקולד');
update public.food_reference_catalog set calories_per_100g = 165,  protein_per_100g = 7.9  where lower(name) = lower('לבנה');
update public.food_reference_catalog set calories_per_100g = 131,  protein_per_100g = 10.7 where lower(name) = lower('ביצים מקושקשות');
update public.food_reference_catalog set calories_per_100g = 158,  protein_per_100g = 10.8 where lower(name) = lower('חביתת ירקות');
update public.food_reference_catalog set calories_per_100g = 130,  protein_per_100g = 8.4  where lower(name) = lower('תבשיל שעועית');
update public.food_reference_catalog set calories_per_100g = 89,   protein_per_100g = 4.6  where lower(name) = lower('מרק עדשים');
update public.food_reference_catalog set calories_per_100g = 172,  protein_per_100g = 8.7  where lower(name) = lower('חומוס עם פטרוזיליה ולימון');
update public.food_reference_catalog set calories_per_100g = 90.5, protein_per_100g = 5.7  where lower(name) = lower('שעועית ברוטב עגבניות');

-- 12. Breakfast foods & sandwiches (006)
update public.food_reference_catalog set calories_per_100g = 332, protein_per_100g = 13.0 where lower(name) = lower('טוסט גבינה צהובה');
update public.food_reference_catalog set calories_per_100g = 248, protein_per_100g = 12.5 where lower(name) = lower('טוסט חביתה');
update public.food_reference_catalog set calories_per_100g = 85,  protein_per_100g = 4.6  where lower(name) = lower('דייסת שיבולת שועל עם חלב');
update public.food_reference_catalog set calories_per_100g = 73,  protein_per_100g = 7.0  where lower(name) = lower('שייק חלבון');
update public.food_reference_catalog set calories_per_100g = 72,  protein_per_100g = 0.5  where lower(name) = lower('שייק פירות');
update public.food_reference_catalog set calories_per_100g = 187, protein_per_100g = 8.2  where lower(name) = lower('לביבות גבינה');
update public.food_reference_catalog set calories_per_100g = 299, protein_per_100g = 11.5 where lower(name) = lower('סנדוויץ'' גבינה צהובה');
update public.food_reference_catalog set calories_per_100g = 225, protein_per_100g = 10.4 where lower(name) = lower('סנדוויץ'' טונה');
update public.food_reference_catalog set calories_per_100g = 145, protein_per_100g = 7.5  where lower(name) = lower('סנדוויץ'' חומוס');
update public.food_reference_catalog set calories_per_100g = 262, protein_per_100g = 14.0 where lower(name) = lower('כריך שווארמה');
update public.food_reference_catalog set calories_per_100g = 248, protein_per_100g = 6.2  where lower(name) = lower('פיתה ממולאת פלאפל');
update public.food_reference_catalog set calories_per_100g = 164, protein_per_100g = 8.7  where lower(name) = lower('סנדוויץ'' חביתה');
update public.food_reference_catalog set calories_per_100g = 210, protein_per_100g = 8.4  where lower(name) = lower('כריך גבינה וירקות');
update public.food_reference_catalog set calories_per_100g = 246, protein_per_100g = 14.2 where lower(name) = lower('טוסט טונה');

-- 13. Israeli dishes & snacks (006)
update public.food_reference_catalog set calories_per_100g = 279, protein_per_100g = 25.2 where lower(name) = lower('שווארמה');
update public.food_reference_catalog set calories_per_100g = 351, protein_per_100g = 6.6  where lower(name) = lower('מלאווח');
update public.food_reference_catalog set calories_per_100g = 308, protein_per_100g = 8.2  where lower(name) = lower('בורקס');
update public.food_reference_catalog set calories_per_100g = 200, protein_per_100g = 7.0  where lower(name) = lower('סביח');
update public.food_reference_catalog set calories_per_100g = 166, protein_per_100g = 6.5  where lower(name) = lower('מג''דרה');
update public.food_reference_catalog set calories_per_100g = 180, protein_per_100g = 9.5  where lower(name) = lower('קובה');
update public.food_reference_catalog set calories_per_100g = 126, protein_per_100g = 6.8  where lower(name) = lower('שקשוקה');
update public.food_reference_catalog set calories_per_100g = 122, protein_per_100g = 5.8  where lower(name) = lower('מוסקה');
update public.food_reference_catalog set calories_per_100g = 390, protein_per_100g = 7.5  where lower(name) = lower('ג''חנון');
update public.food_reference_catalog set calories_per_100g = 153, protein_per_100g = 3.8  where lower(name) = lower('חצילים בטחינה');
update public.food_reference_catalog set calories_per_100g = 122, protein_per_100g = 7.7  where lower(name) = lower('כרוב ממולא');
update public.food_reference_catalog set calories_per_100g = 172, protein_per_100g = 5.6  where lower(name) = lower('פשטידת ירקות');
update public.food_reference_catalog set calories_per_100g = 230, protein_per_100g = 6.5  where lower(name) = lower('קוגל ירושלמי');
update public.food_reference_catalog set calories_per_100g = 280, protein_per_100g = 6.5  where lower(name) = lower('וופל בלגי');
update public.food_reference_catalog set calories_per_100g = 340, protein_per_100g = 6.5  where lower(name) = lower('ביסקוויטים');
update public.food_reference_catalog set calories_per_100g = 410, protein_per_100g = 3.5  where lower(name) = lower('חטיף שוקולד ממולא');
update public.food_reference_catalog set calories_per_100g = 160, protein_per_100g = 4.2  where lower(name) = lower('קרם קרמל');
update public.food_reference_catalog set calories_per_100g = 375, protein_per_100g = 5.5  where lower(name) = lower('בבקה שוקולד');
update public.food_reference_catalog set calories_per_100g = 341, protein_per_100g = 6.1  where lower(name) = lower('עוגת שמרים');
update public.food_reference_catalog set calories_per_100g = 392, protein_per_100g = 4.7  where lower(name) = lower('בראוני');
update public.food_reference_catalog set calories_per_100g = 272, protein_per_100g = 2.6  where lower(name) = lower('עוגת תפוחים');
update public.food_reference_catalog set calories_per_100g = 460, protein_per_100g = 8.0  where lower(name) = lower('חטיף דגנים');
update public.food_reference_catalog set calories_per_100g = 394, protein_per_100g = 0    where lower(name) = lower('סוכריות');

-- 14. Sauces, spreads & frozen/convenience foods (006)
update public.food_reference_catalog set calories_per_100g = 98.5,  protein_per_100g = 1.5  where lower(name) = lower('קטשופ');
update public.food_reference_catalog set calories_per_100g = 61,    protein_per_100g = 4.3  where lower(name) = lower('חרדל');
update public.food_reference_catalog set calories_per_100g = 298,   protein_per_100g = 0.5  where lower(name) = lower('סילאן');
update public.food_reference_catalog set calories_per_100g = 278,   protein_per_100g = 0.4  where lower(name) = lower('ריבה');
update public.food_reference_catalog set calories_per_100g = 525.5, protein_per_100g = 5.8  where lower(name) = lower('ממרח שוקולד');
update public.food_reference_catalog set calories_per_100g = 260.5, protein_per_100g = 0.7  where lower(name) = lower('מיונז לייט');
update public.food_reference_catalog set calories_per_100g = 51.5,  protein_per_100g = 1.6  where lower(name) = lower('רוטב עגבניות');
update public.food_reference_catalog set calories_per_100g = 146.1, protein_per_100g = 7.9  where lower(name) = lower('חרדל דיז''ון');
update public.food_reference_catalog set calories_per_100g = 263,   protein_per_100g = 11.6 where lower(name) = lower('פיצה קפואה');
update public.food_reference_catalog set calories_per_100g = 287,   protein_per_100g = 14.2 where lower(name) = lower('נאגטס עוף');
update public.food_reference_catalog set calories_per_100g = 101.5, protein_per_100g = 4.9  where lower(name) = lower('פסטה מוכנה קפואה');
update public.food_reference_catalog set calories_per_100g = 59.5,  protein_per_100g = 2.3  where lower(name) = lower('ירקות קפואים מוקפצים');
update public.food_reference_catalog set calories_per_100g = 289,   protein_per_100g = 5.3  where lower(name) = lower('בורקס קפוא');
update public.food_reference_catalog set calories_per_100g = 250,   protein_per_100g = 7.4  where lower(name) = lower('פלאפל קפוא');
update public.food_reference_catalog set calories_per_100g = 163,   protein_per_100g = 2.9  where lower(name) = lower('צ''יפס קפוא אפוי');
update public.food_reference_catalog set calories_per_100g = 216.5, protein_per_100g = 8.1  where lower(name) = lower('בלינצ''ס גבינה');
update public.food_reference_catalog set calories_per_100g = 286,   protein_per_100g = 14.2 where lower(name) = lower('כדורי בשר קפואים');
