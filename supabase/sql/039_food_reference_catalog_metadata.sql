-- Food Reference Catalog Metadata + Verified Corrections milestone.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 038_trainee_nutrition_log_retention.sql.
--
-- Corrected re-run (three times): three prior attempts at this
-- migration failed in the SQL Editor:
--   1. `ERROR 42703: column v.source_url does not exist` -- the UPDATE's
--      SET clause referenced v.source_url, but the VALUES(...) list
--      feeding v never included a source_url column. Fixed by adding
--      source_url to both the VALUES tuples and the `as v(...)` alias.
--   2. `P0001: 15 row(s) ... are missing category/basis/source_* after
--      the correction pass` -- a guard that tried tightening
--      category/basis/source_* to NOT NULL failed because the LIVE
--      table has rows outside this migration's own known 349 (221
--      corrected + 113 deleted), left over with nulls. Fixed by NOT
--      tightening those columns to NOT NULL in this migration at all
--      (see the note near this file's end for the full reasoning) --
--      this migration only ever touches the 334 rows it explicitly
--      names, never anything else, and never fails because of rows it
--      doesn't recognize.
--   3. `ERROR 42703: column "category" does not exist` at the
--      then-first statement in the file -- an earlier fix for #2 added
--      a PREFLIGHT `select` referencing category/basis/source_* BEFORE
--      this file's own `begin;`/ALTER TABLE, which is what actually
--      creates those columns. Run as one pasted script (as this file is
--      meant to be), that select was the very first statement and
--      failed immediately, before the real transaction below ever
--      started -- so nothing was applied, but nothing else ran either.
--      Fixed by removing that query from this file entirely: a
--      schema-agnostic preflight check (references only columns that
--      have existed since 004, so it can never hit this problem) now
--      lives in its own separate file,
--      supabase/audits/food_reference_catalog_039_preflight_check.sql
--      -- run that FIRST, independently, any time; and a second,
--      safe-by-construction report of any still-missing metadata is
--      produced by THIS file itself, automatically, as its last
--      statement (after the ALTER TABLE has already run) -- see its end.
-- All three failures were safe: the whole file is explicitly wrapped in
-- `begin;` / `commit;` (below), so each failed attempt that got past the
-- top of the file rolled back cleanly with nothing partially applied --
-- confirmed safe to just re-run this corrected file from the top;
-- nothing needs to be undone first. The explicit wrapper also means any
-- FUTURE failure (not just these three) can never leave a partial
-- DELETE/UPDATE/ALTER applied, independent of whatever multi-statement
-- transaction behavior the SQL Editor itself does or doesn't provide by
-- default.
--
-- Supersedes an earlier, memory-based draft of this same milestone (never
-- applied to Supabase, never committed) with a properly source-verified
-- one: every calories/protein value that changes below, and every new
-- product in 040_food_reference_catalog_usda_verified_expansion.sql, was checked
-- against a live USDA FoodData Central API response in this session (not
-- LLM memory, not an estimate) -- see the accompanying audit report for
-- full methodology, the matching algorithm, and every individual
-- correction with its old/new value, source and reason.
--
-- Summary of what this file does:
--   * 113 pre-existing row(s) DELETED -- no reliable
--     structured source could be matched for them in this pass (composite
--     dishes and branded snacks mostly). Safe: this table has no foreign
--     key from any log or coach-owned row (see 003_nutrition.sql).
--   * 221 pre-existing rows corrected/backfilled in place --
--     calories_per_100g/protein_per_100g updated to the verified USDA
--     figure wherever it differs from the live value, plus category,
--     basis and full source attribution for every one of them.
--   * New nullable columns: category, basis, source_name, source_id
--     (the USDA fdcId), source_url (a live, working per-food FDC link),
--     source_checked_at (the date this session verified it). Stay
--     NULLABLE -- deliberately NOT tightened to NOT NULL by this file
--     (see the note near this file's end, right before its commit;).
--     Every one of the 221 corrected rows gets a real,
--     non-null value in all six columns regardless (the 113
--     deleted rows are removed entirely, not left behind with nulls);
--     the choice not to enforce NOT NULL is purely about not asserting
--     anything about OTHER rows this migration doesn't know about.
--
-- 269 further new verified products are added by
-- 040_food_reference_catalog_usda_verified_expansion.sql, which must run after
-- this file (it needs these columns to exist).

begin;

-- Remove existing rows that could NOT be verified against a reliable
-- structured source in this pass (see the audit report for why each
-- one failed) -- per explicit instruction, an unverifiable value is
-- removed rather than kept as a guess. Safe: this table has no foreign
-- key from trainee_nutrition_logs or public.foods (see 003_nutrition.sql
-- -- the reference catalog only ever prefills a NEW coach food at
-- creation time; nothing snapshots against it later).
delete from public.food_reference_catalog
where lower(name) in (
  lower('אורז בסמטי מבושל'),
  lower('סטייק בקר צלוי'),
  lower('שוק עוף צלוי'),
  lower('קציצות בשר'),
  lower('גבינה בולגרית'),
  lower('שמנת חמוצה'),
  lower('חטיף במבה'),
  lower('צ''יפס'),
  lower('ביסלי'),
  lower('מרשמלו'),
  lower('פיצה גבינה'),
  lower('קולה'),
  lower('משקה איזוטוני'),
  lower('פסטה ברוטב עגבניות'),
  lower('פסטה רוזה'),
  lower('פסטה בולונז'),
  lower('פסטה ברוטב שמנת'),
  lower('פסטה פסטו'),
  lower('פסטה קרבונרה'),
  lower('פסטה ארביאטה'),
  lower('פסטה בשמן זית ושום'),
  lower('פסטה עם פטריות ושמנת'),
  lower('פנה ברוטב עגבניות'),
  lower('ספגטי בולונז'),
  lower('טורטליני בשר'),
  lower('רביולי גבינה'),
  lower('פסטה ברוטב רוזה עם עוף'),
  lower('אורז צהוב'),
  lower('אורז פרסי'),
  lower('ריזוטו פטריות'),
  lower('ריזוטו עוף'),
  lower('אורז הודי בתבלינים'),
  lower('תפוחי אדמה בתנור'),
  lower('לביבות תפוחי אדמה'),
  lower('קציצות תפוחי אדמה'),
  lower('תפוחי אדמה מטוגנים'),
  lower('קוגל תפוחי אדמה'),
  lower('בגט'),
  lower('לחם קל'),
  lower('לחם שיפון מלא'),
  lower('פוקצ''ה'),
  lower('בורקס גבינה'),
  lower('בורקס תפוחי אדמה'),
  lower('בורקס תרד'),
  lower('רוגלך שוקולד'),
  lower('חלה מתוקה'),
  lower('עוף בתנור'),
  lower('לחם אחיד'),
  lower('כרעיים עוף צלויות'),
  lower('שווארמה עוף'),
  lower('שווארמה הודו'),
  lower('קבב עוף'),
  lower('קבב בקר'),
  lower('גולאש בקר'),
  lower('שניצל הודו'),
  lower('חזה עוף בציפוי פריך'),
  lower('דג סלמון בתנור'),
  lower('דג טונה טרי צלוי'),
  lower('דג דניס'),
  lower('גבינה 9%'),
  lower('גבינה 26%'),
  lower('שמנת 38%'),
  lower('מעדן חלב'),
  lower('יוגורט תות'),
  lower('קרם פרש'),
  lower('לבנה'),
  lower('חומוס עם פטרוזיליה ולימון'),
  lower('עדשים כתומות מבושלות'),
  lower('טוסט גבינה צהובה'),
  lower('טוסט חביתה'),
  lower('לחמנייה עם חמאה וריבה'),
  lower('דייסת שיבולת שועל עם חלב'),
  lower('מוזלי'),
  lower('לביבות גבינה'),
  lower('סנדוויץ'' חומוס'),
  lower('פיתה ממולאת פלאפל'),
  lower('כריך שווארמה'),
  lower('טוסט טונה'),
  lower('שווארמה'),
  lower('מלאווח'),
  lower('סביח'),
  lower('בורקס'),
  lower('מג''דרה'),
  lower('שקשוקה'),
  lower('קובה חמוסתא'),
  lower('קובה'),
  lower('מוסקה'),
  lower('חמין'),
  lower('ג''חנון'),
  lower('חצילים בטחינה'),
  lower('סחוג'),
  lower('קוגל ירושלמי'),
  lower('פשטידת ירקות'),
  lower('וופל בלגי'),
  lower('בבקה שוקולד'),
  lower('חטיף שוקולד ממולא'),
  lower('עוגת שמרים'),
  lower('בראוני'),
  lower('סילאן'),
  lower('מיונז לייט'),
  lower('חרדל דיז''ון'),
  lower('מיונז שום'),
  lower('רוטב עגבניות'),
  lower('פסטה מוכנה קפואה'),
  lower('שניצל עוף קפוא'),
  lower('נאגטס עוף'),
  lower('ירקות קפואים מוקפצים'),
  lower('בורקס קפוא'),
  lower('פלאפל קפוא'),
  lower('בלינצ''ס גבינה'),
  lower('צ''יפס קפוא אפוי'),
  lower('כדורי בשר קפואים'),
  lower('פיצה משפחתית')
);

-- IF NOT EXISTS on every column (defensive): if a prior attempt somehow
-- left one of these columns behind despite the begin;/commit; wrapper,
-- adding it again is a no-op (a notice, not an error) instead of
-- ERROR 42701 ("column already exists") aborting this run too.
alter table public.food_reference_catalog
  add column if not exists category text
    check (category in (
      'fruit', 'vegetable', 'grain_carb', 'bread_bakery', 'meat_poultry',
      'fish_seafood', 'egg', 'dairy', 'plant_milk', 'legume',
      'nuts_seeds_fats', 'sweets_snacks', 'sauce_condiment', 'spice_herb',
      'beverage', 'prepared_dish', 'soup_salad', 'sandwich', 'supplement'
    )),
  add column if not exists basis text
    check (basis in (
      'raw', 'cooked', 'grilled', 'roasted', 'fried', 'boiled', 'baked',
      'steamed', 'dried', 'canned_drained', 'as_sold'
    )),
  add column if not exists source_name text check (char_length(trim(source_name)) > 0),
  add column if not exists source_id text check (char_length(trim(source_id)) > 0),
  add column if not exists source_url text check (char_length(trim(source_url)) > 0),
  add column if not exists source_checked_at date;

-- Correct calories/protein where the live migration-008 value differs
-- from the verified USDA figure, and backfill category/basis/source_*
-- for every surviving pre-existing row -- see the audit report for the
-- full old-value/new-value/reason table.
update public.food_reference_catalog as f set
  calories_per_100g = v.calories_per_100g,
  protein_per_100g = v.protein_per_100g,
  category = v.category,
  basis = v.basis,
  source_name = v.source_name,
  source_id = v.source_id,
  source_url = v.source_url,
  source_checked_at = CURRENT_DATE
from (values
  ('תפוז', 50, 0.92, 'fruit', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Orange, raw', '2709171', 'https://fdc.nal.usda.gov/food-details/2709171/nutrients'),
  ('תפוח', 61, 0.17, 'fruit', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Apple, raw', '2709215', 'https://fdc.nal.usda.gov/food-details/2709215/nutrients'),
  ('ענבים', 83, 0.9, 'fruit', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Grapes, raw', '2709237', 'https://fdc.nal.usda.gov/food-details/2709237/nutrients'),
  ('אבטיח', 30, 0.61, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Watermelon, raw', '167765', 'https://fdc.nal.usda.gov/food-details/167765/nutrients'),
  ('בננה', 89, 1.09, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Bananas, raw', '173944', 'https://fdc.nal.usda.gov/food-details/173944/nutrients'),
  ('אגס', 57, 0.36, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Pears, raw', '169118', 'https://fdc.nal.usda.gov/food-details/169118/nutrients'),
  ('אפרסק', 46, 0.91, 'fruit', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Peach, raw', '2709249', 'https://fdc.nal.usda.gov/food-details/2709249/nutrients'),
  ('שזיף', 46, 0.7, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Plums, raw', '169949', 'https://fdc.nal.usda.gov/food-details/169949/nutrients'),
  ('תות שדה', 32, 0.67, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Strawberries, raw', '167762', 'https://fdc.nal.usda.gov/food-details/167762/nutrients'),
  ('מנגו', 60, 0.82, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Mangos, raw', '169910', 'https://fdc.nal.usda.gov/food-details/169910/nutrients'),
  ('מלון', 34, 0.82, 'fruit', 'raw', 'USDA FoodData Central (Foundation) -- Melons, cantaloupe, raw', '746770', 'https://fdc.nal.usda.gov/food-details/746770/nutrients'),
  ('רימון', 83, 1.67, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Pomegranates, raw', '169134', 'https://fdc.nal.usda.gov/food-details/169134/nutrients'),
  ('אננס', 60.1113, 0.4609375, 'fruit', 'raw', 'USDA FoodData Central (Foundation) -- Pineapple, raw', '2346398', 'https://fdc.nal.usda.gov/food-details/2346398/nutrients'),
  ('לימון', 29, 1.1, 'fruit', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Lemon, raw', '2709168', 'https://fdc.nal.usda.gov/food-details/2709168/nutrients'),
  ('אבוקדו', 160, 2, 'fruit', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Avocado, raw', '2709223', 'https://fdc.nal.usda.gov/food-details/2709223/nutrients'),
  ('קיווי', 58, 1.06, 'fruit', 'raw', 'USDA FoodData Central (Foundation) -- Kiwifruit, green, raw', '327046', 'https://fdc.nal.usda.gov/food-details/327046/nutrients'),
  ('דובדבן', 63, 1.06, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Cherries, sweet, raw', '171719', 'https://fdc.nal.usda.gov/food-details/171719/nutrients'),
  ('משמש', 48, 1.4, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Apricots, raw', '171697', 'https://fdc.nal.usda.gov/food-details/171697/nutrients'),
  ('תמר', 277, 1.81, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Dates, medjool', '168191', 'https://fdc.nal.usda.gov/food-details/168191/nutrients'),
  ('משמש מיובש', 241, 3.39, 'fruit', 'dried', 'USDA FoodData Central (Survey (FNDDS)) -- Apricot, dried', '2709197', 'https://fdc.nal.usda.gov/food-details/2709197/nutrients'),
  ('תאנים מיובשות', 277, 3.3, 'fruit', 'dried', 'USDA FoodData Central (Survey (FNDDS)) -- Fig, dried', '2709204', 'https://fdc.nal.usda.gov/food-details/2709204/nutrients'),
  ('צימוקים', 301, 3.28, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Raisins, golden, seedless', '168164', 'https://fdc.nal.usda.gov/food-details/168164/nutrients'),
  ('אשכולית', 42, 0.77, 'fruit', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Grapefruit, raw', '2709165', 'https://fdc.nal.usda.gov/food-details/2709165/nutrients'),
  ('פטל', 57.3375, 1.008125, 'fruit', 'raw', 'USDA FoodData Central (Foundation) -- Raspberries, raw', '2346410', 'https://fdc.nal.usda.gov/food-details/2346410/nutrients'),
  ('ליצ''י', 66, 0.83, 'fruit', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Lychee', '2709240', 'https://fdc.nal.usda.gov/food-details/2709240/nutrients'),
  ('שסק', 47, 0.43, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Loquats, raw', '169908', 'https://fdc.nal.usda.gov/food-details/169908/nutrients'),
  ('אוכמניות', 63.8563, 0.703125, 'fruit', 'raw', 'USDA FoodData Central (Foundation) -- Blueberries, raw', '2346411', 'https://fdc.nal.usda.gov/food-details/2346411/nutrients'),
  ('קלמנטינה', 47, 0.85, 'fruit', 'raw', 'USDA FoodData Central (SR Legacy) -- Clementines, raw', '168195', 'https://fdc.nal.usda.gov/food-details/168195/nutrients'),
  ('עגבניה', 20, 0.82, 'vegetable', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Tomatoes, raw', '2709719', 'https://fdc.nal.usda.gov/food-details/2709719/nutrients'),
  ('מלפפון', 16, 0.62, 'vegetable', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Cucumber, raw', '2709784', 'https://fdc.nal.usda.gov/food-details/2709784/nutrients'),
  ('גזר', 41, 0.93, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Carrots, raw', '170393', 'https://fdc.nal.usda.gov/food-details/170393/nutrients'),
  ('בצל', 40, 1.1, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Onions, raw', '170000', 'https://fdc.nal.usda.gov/food-details/170000/nutrients'),
  ('חסה', 20, 0.92, 'vegetable', 'raw', 'USDA FoodData Central (Survey (FNDDS)) -- Lettuce, raw', '2709789', 'https://fdc.nal.usda.gov/food-details/2709789/nutrients'),
  ('פלפל אדום', 31.3256, 0.895625, 'vegetable', 'raw', 'USDA FoodData Central (Foundation) -- Peppers, bell, red, raw', '2258590', 'https://fdc.nal.usda.gov/food-details/2258590/nutrients'),
  ('כרוב', 25, 1.28, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Cabbage, raw', '169975', 'https://fdc.nal.usda.gov/food-details/169975/nutrients'),
  ('פלפל ירוק', 22.9291, 0.715, 'vegetable', 'raw', 'USDA FoodData Central (Foundation) -- Peppers, bell, green, raw', '2258588', 'https://fdc.nal.usda.gov/food-details/2258588/nutrients'),
  ('פלפל צהוב', 30.7743, 0.819375, 'vegetable', 'raw', 'USDA FoodData Central (Foundation) -- Peppers, bell, yellow, raw', '2258589', 'https://fdc.nal.usda.gov/food-details/2258589/nutrients'),
  ('תירס מבושל', 97, 3.34, 'vegetable', 'cooked', 'USDA FoodData Central (SR Legacy) -- Corn, sweet, white, cooked, boiled, drained, with salt', '168540', 'https://fdc.nal.usda.gov/food-details/168540/nutrients'),
  ('קישוא', 21, 2.71, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Squash, zucchini, baby, raw', '168565', 'https://fdc.nal.usda.gov/food-details/168565/nutrients'),
  ('חציל', 25, 0.98, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Eggplant, raw', '169228', 'https://fdc.nal.usda.gov/food-details/169228/nutrients'),
  ('כרובית', 27.5923, 1.640625, 'vegetable', 'raw', 'USDA FoodData Central (Foundation) -- Cauliflower, raw', '2685573', 'https://fdc.nal.usda.gov/food-details/2685573/nutrients'),
  ('תפוח אדמה', 58, 2.57, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Potatoes, raw, skin', '170032', 'https://fdc.nal.usda.gov/food-details/170032/nutrients'),
  ('תפוח אדמה אפוי', 93, 1.95, 'vegetable', 'baked', 'USDA FoodData Central (Survey (FNDDS)) -- Potato, baked, NFS', '2709383', 'https://fdc.nal.usda.gov/food-details/2709383/nutrients'),
  ('בטטה', 42, 2.49, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Sweet potato leaves, raw', '169303', 'https://fdc.nal.usda.gov/food-details/169303/nutrients'),
  ('שום', 143, 6.62, 'vegetable', 'raw', 'USDA FoodData Central (Foundation) -- Garlic, raw', '1104647', 'https://fdc.nal.usda.gov/food-details/1104647/nutrients'),
  ('פטריות', 22, 3.09, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Mushrooms, white, raw', '169251', 'https://fdc.nal.usda.gov/food-details/169251/nutrients'),
  ('תרד', 23, 2.86, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Spinach, raw', '168462', 'https://fdc.nal.usda.gov/food-details/168462/nutrients'),
  ('דלעת מבושלת', 18, 0.72, 'vegetable', 'cooked', 'USDA FoodData Central (SR Legacy) -- Pumpkin, cooked, boiled, drained, with salt', '170526', 'https://fdc.nal.usda.gov/food-details/170526/nutrients'),
  ('סלרי', 16.6973, 0.4921875, 'vegetable', 'raw', 'USDA FoodData Central (Foundation) -- Celery, raw', '2346405', 'https://fdc.nal.usda.gov/food-details/2346405/nutrients'),
  ('כרישה', 61, 1.5, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Leeks, (bulb and lower leaf-portion), raw', '169246', 'https://fdc.nal.usda.gov/food-details/169246/nutrients'),
  ('ברוקולי', 31, 2.57, 'vegetable', 'raw', 'USDA FoodData Central (Foundation) -- Broccoli, raw', '747447', 'https://fdc.nal.usda.gov/food-details/747447/nutrients'),
  ('ארטישוק מבושל', 51, 2.89, 'vegetable', 'cooked', 'USDA FoodData Central (SR Legacy) -- Artichokes, (globe or french), cooked, boiled, drained, with salt', '169311', 'https://fdc.nal.usda.gov/food-details/169311/nutrients'),
  ('אספרגוס מבושל', 22, 2.4, 'vegetable', 'cooked', 'USDA FoodData Central (SR Legacy) -- Asparagus, cooked, boiled, drained', '168390', 'https://fdc.nal.usda.gov/food-details/168390/nutrients'),
  ('צנון', 16, 0.68, 'vegetable', 'raw', 'USDA FoodData Central (SR Legacy) -- Radishes, raw', '169276', 'https://fdc.nal.usda.gov/food-details/169276/nutrients'),
  ('אורז לבן מבושל', 96, 2.01, 'grain_carb', 'cooked', 'USDA FoodData Central (Survey (FNDDS)) -- Rice, white, cooked, glutinous', '2708422', 'https://fdc.nal.usda.gov/food-details/2708422/nutrients'),
  ('סלק מבושל', 44, 1.68, 'vegetable', 'cooked', 'USDA FoodData Central (SR Legacy) -- Beets, cooked, boiled, drained', '169146', 'https://fdc.nal.usda.gov/food-details/169146/nutrients'),
  ('אורז מלא מבושל', 124, 2.45, 'grain_carb', 'cooked', 'USDA FoodData Central (Survey (FNDDS)) -- Rice, brown, cooked, as ingredient', '2710789', 'https://fdc.nal.usda.gov/food-details/2710789/nutrients'),
  ('לחם לבן', 267, 9.43, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Bread, white', '2707598', 'https://fdc.nal.usda.gov/food-details/2707598/nutrients'),
  ('פסטה מבושלת', 131, 5.15, 'grain_carb', 'cooked', 'USDA FoodData Central (SR Legacy) -- Pasta, fresh-refrigerated, plain, cooked', '169728', 'https://fdc.nal.usda.gov/food-details/169728/nutrients'),
  ('לחם מלא', 254, 12.3, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Bread, whole wheat', '2707709', 'https://fdc.nal.usda.gov/food-details/2707709/nutrients'),
  ('פסטה מלאה מבושלת', 159, 5.82, 'grain_carb', 'cooked', 'USDA FoodData Central (SR Legacy) -- Pasta, whole grain, 51% whole wheat, remaining unenriched semolina, cooked', '168916', 'https://fdc.nal.usda.gov/food-details/168916/nutrients'),
  ('לחמנייה', 307, 9.5, 'grain_carb', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Rolls, dinner, egg', '175027', 'https://fdc.nal.usda.gov/food-details/175027/nutrients'),
  ('פיתה', 275, 9.1, 'grain_carb', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Bread, pita, white, enriched', '174915', 'https://fdc.nal.usda.gov/food-details/174915/nutrients'),
  ('טורטייה', 218, 5.7, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Tortilla, corn', '2707823', 'https://fdc.nal.usda.gov/food-details/2707823/nutrients'),
  ('לחם שיפון', 259, 8.5, 'grain_carb', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Bread, rye', '172684', 'https://fdc.nal.usda.gov/food-details/172684/nutrients'),
  ('קוסקוס מבושל', 112, 3.79, 'grain_carb', 'cooked', 'USDA FoodData Central (SR Legacy) -- Couscous, cooked', '169700', 'https://fdc.nal.usda.gov/food-details/169700/nutrients'),
  ('בורגול מבושל', 83, 3.08, 'grain_carb', 'cooked', 'USDA FoodData Central (SR Legacy) -- Bulgur, cooked', '170287', 'https://fdc.nal.usda.gov/food-details/170287/nutrients'),
  ('שיבולת שועל', 379, 13.2, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Oats, raw', '2708489', 'https://fdc.nal.usda.gov/food-details/2708489/nutrients'),
  ('קינואה מבושלת', 120, 4.4, 'grain_carb', 'cooked', 'USDA FoodData Central (SR Legacy) -- Quinoa, cooked', '168917', 'https://fdc.nal.usda.gov/food-details/168917/nutrients'),
  ('קרקר', 418, 9.46, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Crackers, saltine', '2708167', 'https://fdc.nal.usda.gov/food-details/2708167/nutrients'),
  ('פריכיות אורז', 387, 8.2, 'grain_carb', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Snacks, rice cakes, brown rice, plain, unsalted', '170250', 'https://fdc.nal.usda.gov/food-details/170250/nutrients'),
  ('דגני בוקר', 375, 4.77, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Cereal, corn flakes, flavored', '2708474', 'https://fdc.nal.usda.gov/food-details/2708474/nutrients'),
  ('קורנפלקס', 375, 4.77, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Cereal, corn flakes, flavored', '2708474', 'https://fdc.nal.usda.gov/food-details/2708474/nutrients'),
  ('וופל', 373, 8.7, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Waffle, plain', '2708325', 'https://fdc.nal.usda.gov/food-details/2708325/nutrients'),
  ('דייסת סולת', 53, 1.82, 'grain_carb', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Cereals, farina, enriched, cooked with water, with salt', '173917', 'https://fdc.nal.usda.gov/food-details/173917/nutrients'),
  ('פנקייק', 282, 7.41, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Pancakes, plain', '2708304', 'https://fdc.nal.usda.gov/food-details/2708304/nutrients'),
  ('חזה עוף צלוי', 79, 16.79, 'meat_poultry', 'roasted', 'USDA FoodData Central (SR Legacy) -- Chicken breast, oven-roasted, fat-free, sliced', '172963', 'https://fdc.nal.usda.gov/food-details/172963/nutrients'),
  ('סלמון מבושל', 274, 25.4, 'fish_seafood', 'cooked', 'USDA FoodData Central (Survey (FNDDS)) -- Fish, salmon, baked or broiled', '2706286', 'https://fdc.nal.usda.gov/food-details/2706286/nutrients'),
  ('הודו טחון מבושל', 203, 27.37, 'meat_poultry', 'cooked', 'USDA FoodData Central (SR Legacy) -- Turkey, Ground, cooked', '171506', 'https://fdc.nal.usda.gov/food-details/171506/nutrients'),
  ('בשר בקר טחון מבושל', 240, 25.07, 'meat_poultry', 'cooked', 'USDA FoodData Central (SR Legacy) -- Beef, ground, unspecified fat content, cooked', '172161', 'https://fdc.nal.usda.gov/food-details/172161/nutrients'),
  ('דג בקלה מבושל', 84, 20.42, 'fish_seafood', 'cooked', 'USDA FoodData Central (SR Legacy) -- Fish, cod, Pacific, cooked', '175178', 'https://fdc.nal.usda.gov/food-details/175178/nutrients'),
  ('דג אמנון מבושל', 128, 26.15, 'fish_seafood', 'cooked', 'USDA FoodData Central (SR Legacy) -- Fish, tilapia, cooked, dry heat', '175177', 'https://fdc.nal.usda.gov/food-details/175177/nutrients'),
  ('ביצה קשה', 155, 12.58, 'egg', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Egg, whole, cooked, hard-boiled', '173424', 'https://fdc.nal.usda.gov/food-details/173424/nutrients'),
  ('שרימפס מבושל', 119, 22.78, 'fish_seafood', 'cooked', 'USDA FoodData Central (SR Legacy) -- Crustaceans, shrimp, mixed species, cooked, moist heat (may contain additives to retain moisture)', '171971', 'https://fdc.nal.usda.gov/food-details/171971/nutrients'),
  ('ביצה מטוגנת', 196, 13.61, 'egg', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Egg, whole, cooked, fried', '173423', 'https://fdc.nal.usda.gov/food-details/173423/nutrients'),
  ('הודו צלוי', 203, 26.9, 'meat_poultry', 'roasted', 'USDA FoodData Central (Survey (FNDDS)) -- Turkey, drumstick, roasted, skin eaten', '2706124', 'https://fdc.nal.usda.gov/food-details/2706124/nutrients'),
  ('כבד עוף מבושל', 167, 24.46, 'meat_poultry', 'cooked', 'USDA FoodData Central (SR Legacy) -- Chicken, liver, all classes, cooked, simmered', '171061', 'https://fdc.nal.usda.gov/food-details/171061/nutrients'),
  ('המבורגר בקר', 295, 23.05, 'meat_poultry', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Beef, ground, patties, frozen, cooked, broiled', '169447', 'https://fdc.nal.usda.gov/food-details/169447/nutrients'),
  ('בקר צלי (דלי)', 115, 18.62, 'meat_poultry', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Roast beef, deli style, prepackaged, sliced', '174570', 'https://fdc.nal.usda.gov/food-details/174570/nutrients'),
  ('פסטרמה', 147, 21.8, 'meat_poultry', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Beef, cured, pastrami', '170204', 'https://fdc.nal.usda.gov/food-details/170204/nutrients'),
  ('סלמון מעושן', 117, 18.3, 'fish_seafood', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Fish, salmon, smoked', '2706292', 'https://fdc.nal.usda.gov/food-details/2706292/nutrients'),
  ('נקניק הודו', 158, 15.05, 'meat_poultry', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Sausage, Italian, turkey, smoked', '174604', 'https://fdc.nal.usda.gov/food-details/174604/nutrients'),
  ('פילה סול מבושל', 86, 15.24, 'fish_seafood', 'cooked', 'USDA FoodData Central (SR Legacy) -- Fish, flatfish (flounder and sole species), cooked, dry heat', '174197', 'https://fdc.nal.usda.gov/food-details/174197/nutrients'),
  ('דג בורי מבושל', 150, 24.81, 'fish_seafood', 'cooked', 'USDA FoodData Central (SR Legacy) -- Fish, mullet, striped, cooked, dry heat', '175124', 'https://fdc.nal.usda.gov/food-details/175124/nutrients'),
  ('כבד בקר מבושל', 191, 29.08, 'meat_poultry', 'cooked', 'USDA FoodData Central (SR Legacy) -- Beef, variety meats and by-products, liver, cooked, braised', '168626', 'https://fdc.nal.usda.gov/food-details/168626/nutrients'),
  ('חומוס מבושל', 164, 8.86, 'legume', 'cooked', 'USDA FoodData Central (SR Legacy) -- Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, with salt', '173799', 'https://fdc.nal.usda.gov/food-details/173799/nutrients'),
  ('שעועית מבושלת', 127, 8.67, 'legume', 'cooked', 'USDA FoodData Central (SR Legacy) -- Beans, kidney, red, mature seeds, cooked, boiled, with salt', '175242', 'https://fdc.nal.usda.gov/food-details/175242/nutrients'),
  ('עדשים מבושלות', 114, 9.02, 'legume', 'cooked', 'USDA FoodData Central (SR Legacy) -- Lentils, mature seeds, cooked, boiled, with salt', '175254', 'https://fdc.nal.usda.gov/food-details/175254/nutrients'),
  ('אפונה מבושלת', 84, 5.36, 'legume', 'cooked', 'USDA FoodData Central (SR Legacy) -- Peas, green, cooked, boiled, drained, with salt', '170102', 'https://fdc.nal.usda.gov/food-details/170102/nutrients'),
  ('טופו', 144, 17.27, 'legume', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Tofu, raw, firm, prepared with calcium sulfate', '172475', 'https://fdc.nal.usda.gov/food-details/172475/nutrients'),
  ('אדממה מבושל', 140, 11.5, 'legume', 'cooked', 'USDA FoodData Central (Survey (FNDDS)) -- Edamame, cooked', '2707436', 'https://fdc.nal.usda.gov/food-details/2707436/nutrients'),
  ('חומוס (ממרח)', 237, 7.78, 'legume', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Hummus, commercial', '174289', 'https://fdc.nal.usda.gov/food-details/174289/nutrients'),
  ('שעועית לבנה מבושלת', 139, 9.73, 'legume', 'cooked', 'USDA FoodData Central (SR Legacy) -- Beans, white, mature seeds, cooked, boiled, with salt', '175249', 'https://fdc.nal.usda.gov/food-details/175249/nutrients'),
  ('פול מבושל', 110, 7.6, 'legume', 'cooked', 'USDA FoodData Central (SR Legacy) -- Broadbeans (fava beans), mature seeds, cooked, boiled, with salt', '173798', 'https://fdc.nal.usda.gov/food-details/173798/nutrients'),
  ('פולי סויה מבושלים', 172, 18.21, 'legume', 'cooked', 'USDA FoodData Central (SR Legacy) -- Soybeans, mature cooked, boiled, without salt', '174271', 'https://fdc.nal.usda.gov/food-details/174271/nutrients'),
  ('חלב 1%', 43, 3.38, 'dairy', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Milk, low fat (1%)', '2705387', 'https://fdc.nal.usda.gov/food-details/2705387/nutrients'),
  ('יוגורט 3%', 61, 3.47, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Yogurt, plain, whole milk', '171284', 'https://fdc.nal.usda.gov/food-details/171284/nutrients'),
  ('יוגורט טבעי', 50.0015, 4.22675, 'dairy', 'as_sold', 'USDA FoodData Central (Foundation) -- Yogurt, plain, nonfat', '2647437', 'https://fdc.nal.usda.gov/food-details/2647437/nutrients'),
  ('יוגורט יווני', 73, 9.95, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Yogurt, Greek, plain, lowfat', '170903', 'https://fdc.nal.usda.gov/food-details/170903/nutrients'),
  ('קוטג'' 5%', 82, 11, 'dairy', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Cheese, cottage, low fat', '2705756', 'https://fdc.nal.usda.gov/food-details/2705756/nutrients'),
  ('גבינה לבנה 5%', 148, 11, 'dairy', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Cottage cheese, farmer''s', '2705749', 'https://fdc.nal.usda.gov/food-details/2705749/nutrients'),
  ('לבן', 40, 3.31, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Milk, buttermilk, fluid, cultured, lowfat', '170874', 'https://fdc.nal.usda.gov/food-details/170874/nutrients'),
  ('גבינת שמנת', 350, 6.15, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Cheese, cream', '173418', 'https://fdc.nal.usda.gov/food-details/173418/nutrients'),
  ('מוצרלה', 141, 31.7, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Cheese, mozzarella, nonfat', '169051', 'https://fdc.nal.usda.gov/food-details/169051/nutrients'),
  ('טונה בשימורים', 90, 19, 'fish_seafood', 'canned_drained', 'USDA FoodData Central (Foundation) -- Fish, tuna, light, canned in water, drained solids', '334194', 'https://fdc.nal.usda.gov/food-details/334194/nutrients'),
  ('חמאה', 717, 0.85, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Butter, salted', '173410', 'https://fdc.nal.usda.gov/food-details/173410/nutrients'),
  ('פטה', 265, 14.21, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Cheese, feta', '173420', 'https://fdc.nal.usda.gov/food-details/173420/nutrients'),
  ('פרמזן', 420, 28.42, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Cheese, parmesan, grated', '171247', 'https://fdc.nal.usda.gov/food-details/171247/nutrients'),
  ('שמנת מתוקה', 195, 2.96, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Cream, fluid, light (coffee cream or table cream)', '170857', 'https://fdc.nal.usda.gov/food-details/170857/nutrients'),
  ('חלב סויה', 64, 3.35, 'dairy', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Soy milk, chocolate', '2705406', 'https://fdc.nal.usda.gov/food-details/2705406/nutrients'),
  ('חלב שקדים', 15, 0.55, 'dairy', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Almond milk, unsweetened', '2705409', 'https://fdc.nal.usda.gov/food-details/2705409/nutrients'),
  ('שמן זית', 900, 0, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Olive oil', '2710186', 'https://fdc.nal.usda.gov/food-details/2710186/nutrients'),
  ('חלב עיזים', 69, 3.56, 'dairy', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Goat milk', '2705395', 'https://fdc.nal.usda.gov/food-details/2705395/nutrients'),
  ('חמאת בוטנים', 520, 25.9, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Peanut butter, smooth, reduced fat', '172458', 'https://fdc.nal.usda.gov/food-details/172458/nutrients'),
  ('בוטנים', 588.332, 23.205, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (Foundation) -- Peanuts, raw', '2515376', 'https://fdc.nal.usda.gov/food-details/2515376/nutrients'),
  ('שקדים', 625.75, 21.45038, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (Foundation) -- Nuts, almonds, whole, raw', '2346393', 'https://fdc.nal.usda.gov/food-details/2346393/nutrients'),
  ('אגוזי מלך', 729.556, 14.5644, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (Foundation) -- Nuts, walnuts, English, halves, raw', '2346394', 'https://fdc.nal.usda.gov/food-details/2346394/nutrients'),
  ('חלב 3%', 60, 3.27, 'dairy', 'as_sold', 'USDA FoodData Central (Foundation) -- Milk, whole, 3.25% milkfat, with added vitamin D', '746782', 'https://fdc.nal.usda.gov/food-details/746782/nutrients'),
  ('טחינה', 586, 18.08, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Seeds, sesame butter, paste', '170191', 'https://fdc.nal.usda.gov/food-details/170191/nutrients'),
  ('זרעי חמניה', 567, 18.4, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Sunflower seeds, flavored', '2707584', 'https://fdc.nal.usda.gov/food-details/2707584/nutrients'),
  ('זרעי דלעת', 567, 29.5, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Pumpkin seeds, salted', '2707580', 'https://fdc.nal.usda.gov/food-details/2707580/nutrients'),
  ('צנוברים', 673, 13.7, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Pine nuts', '2707526', 'https://fdc.nal.usda.gov/food-details/2707526/nutrients'),
  ('שוקולד חלב', 535, 7.65, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Candies, milk chocolate', '167587', 'https://fdc.nal.usda.gov/food-details/167587/nutrients'),
  ('פיסטוקים', 560, 20.16, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Nuts, pistachio nuts, raw', '170184', 'https://fdc.nal.usda.gov/food-details/170184/nutrients'),
  ('קשיו', 564.664, 17.4423, 'nuts_seeds_fats', 'as_sold', 'USDA FoodData Central (Foundation) -- Nuts, cashew nuts, raw', '2515374', 'https://fdc.nal.usda.gov/food-details/2515374/nutrients'),
  ('שוקולד מריר', 598, 7.79, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Chocolate, dark, 70-85% cacao solids', '170273', 'https://fdc.nal.usda.gov/food-details/170273/nutrients'),
  ('גלידה', 207, 3.5, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Ice creams, vanilla', '167575', 'https://fdc.nal.usda.gov/food-details/167575/nutrients'),
  ('עוגיות', 514, 5.37, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Cookies, shortbread, commercially prepared, plain', '174967', 'https://fdc.nal.usda.gov/food-details/174967/nutrients'),
  ('דבש', 304, 0.3, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Honey', '169640', 'https://fdc.nal.usda.gov/food-details/169640/nutrients'),
  ('פופקורן', 387, 12.94, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Snacks, popcorn, air-popped', '167959', 'https://fdc.nal.usda.gov/food-details/167959/nutrients'),
  ('סוכר', 401, 0, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Sugar, white, granulated or lump', '2710258', 'https://fdc.nal.usda.gov/food-details/2710258/nutrients'),
  ('עוגת שוקולד', 399, 3.63, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Snack cake, chocolate', '2707873', 'https://fdc.nal.usda.gov/food-details/2707873/nutrients'),
  ('עוגת גבינה', 394, 5.72, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Cheesecake, chocolate', '2707863', 'https://fdc.nal.usda.gov/food-details/2707863/nutrients'),
  ('גבינה צהובה', 408, 23.3, 'dairy', 'as_sold', 'USDA FoodData Central (Foundation) -- Cheese, cheddar', '328637', 'https://fdc.nal.usda.gov/food-details/328637/nutrients'),
  ('מרק ירקות', 27, 0.84, 'soup_salad', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Soup, vegetable', '2710113', 'https://fdc.nal.usda.gov/food-details/2710113/nutrients'),
  ('סלט ירקות', 23, 1.19, 'soup_salad', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Lettuce, salad with assorted vegetables excluding tomatoes and carrots, no dressing', '2709823', 'https://fdc.nal.usda.gov/food-details/2709823/nutrients'),
  ('מרק עוף', 198, 14.6, 'soup_salad', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Soup, chicken broth cubes, dry', '171563', 'https://fdc.nal.usda.gov/food-details/171563/nutrients'),
  ('מיץ תפוחים', 48, 0.09, 'beverage', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Apple juice, 100%', '2709320', 'https://fdc.nal.usda.gov/food-details/2709320/nutrients'),
  ('מיץ תפוזים', 54, 0.2, 'beverage', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Beverages, Orange juice drink', '169044', 'https://fdc.nal.usda.gov/food-details/169044/nutrients'),
  ('מיץ ענבים', 66, 0.18, 'beverage', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Grape juice, 100%', '2709325', 'https://fdc.nal.usda.gov/food-details/2709325/nutrients'),
  ('יין אדום', 85, 0.07, 'beverage', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Alcoholic beverage, wine, table, red', '173190', 'https://fdc.nal.usda.gov/food-details/173190/nutrients'),
  ('בירה', 43, 0.46, 'beverage', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Alcoholic beverage, beer, regular, all', '168746', 'https://fdc.nal.usda.gov/food-details/168746/nutrients'),
  ('מים', 0, 0, 'beverage', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Water, tap', '2710707', 'https://fdc.nal.usda.gov/food-details/2710707/nutrients'),
  ('תה ללא סוכר', 1, 0.22, 'beverage', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Tea, iced, brewed, green, unsweetened', '2710523', 'https://fdc.nal.usda.gov/food-details/2710523/nutrients'),
  ('קפה שחור', 1, 0.12, 'beverage', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Coffee, brewed', '2710375', 'https://fdc.nal.usda.gov/food-details/2710375/nutrients'),
  ('פסטה עם טונה', 200, 6.69, 'prepared_dish', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Macaroni or pasta salad with tuna', '2708942', 'https://fdc.nal.usda.gov/food-details/2708942/nutrients'),
  ('לזניה בשר', 139, 7.45, 'prepared_dish', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Lasagna with meat', '2708750', 'https://fdc.nal.usda.gov/food-details/2708750/nutrients'),
  ('לזניה ירקות', 139, 6.87, 'prepared_dish', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Lasagna, Vegetable, frozen, baked', '172106', 'https://fdc.nal.usda.gov/food-details/172106/nutrients'),
  ('מקרוני וגבינה', 82, 3.38, 'prepared_dish', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Macaroni and Cheese, canned entree', '173325', 'https://fdc.nal.usda.gov/food-details/173325/nutrients'),
  ('אורז עם ירקות', 103, 2.03, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Vegetable curry with rice', '2710068', 'https://fdc.nal.usda.gov/food-details/2710068/nutrients'),
  ('אורז עם עדשים', 118, 3.28, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Lentil curry with rice', '2707432', 'https://fdc.nal.usda.gov/food-details/2707432/nutrients'),
  ('אורז מלא עם ירקות', 119, 2.4, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Rice, brown, with other vegetables, fat added', '2709070', 'https://fdc.nal.usda.gov/food-details/2709070/nutrients'),
  ('אטריות אורז מבושלות', 108, 1.79, 'grain_carb', 'cooked', 'USDA FoodData Central (SR Legacy) -- Rice noodles, cooked', '168914', 'https://fdc.nal.usda.gov/food-details/168914/nutrients'),
  ('אורז עם שעועית', 164, 6.5, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Beans and white rice', '2708990', 'https://fdc.nal.usda.gov/food-details/2708990/nutrients'),
  ('פירה תפוחי אדמה', 114, 2.15, 'grain_carb', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Potato, mashed, NFS', '2709492', 'https://fdc.nal.usda.gov/food-details/2709492/nutrients'),
  ('תפוחי אדמה מבושלים בקליפה', 78, 2.86, 'grain_carb', 'cooked', 'USDA FoodData Central (SR Legacy) -- Potatoes, boiled, cooked in skin, skin, with salt', '170519', 'https://fdc.nal.usda.gov/food-details/170519/nutrients'),
  ('בטטה מבושלת', 76, 1.37, 'grain_carb', 'cooked', 'USDA FoodData Central (SR Legacy) -- Sweet potato, cooked, boiled, without skin', '168484', 'https://fdc.nal.usda.gov/food-details/168484/nutrients'),
  ('פירה בטטה', 101, 1.98, 'grain_carb', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Sweet potato, canned, mashed', '169305', 'https://fdc.nal.usda.gov/food-details/169305/nutrients'),
  ('חלה', 287, 9.5, 'bread_bakery', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Bread, egg, Challah', '2707624', 'https://fdc.nal.usda.gov/food-details/2707624/nutrients'),
  ('לחם דגנים', 265, 13.4, 'bread_bakery', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Bread, multigrain', '2707777', 'https://fdc.nal.usda.gov/food-details/2707777/nutrients'),
  ('קרואסון', 406, 8.2, 'bread_bakery', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Croissants, butter', '174987', 'https://fdc.nal.usda.gov/food-details/174987/nutrients'),
  ('קרואסון שוקולד', 421, 7.4, 'bread_bakery', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Croissant, chocolate', '2707680', 'https://fdc.nal.usda.gov/food-details/2707680/nutrients'),
  ('מאפין שוקולד', 395, 6.54, 'bread_bakery', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Muffin, chocolate', '2707833', 'https://fdc.nal.usda.gov/food-details/2707833/nutrients'),
  ('בייגל', 451, 12.34, 'bread_bakery', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Snacks, bagel chips, plain', '173150', 'https://fdc.nal.usda.gov/food-details/173150/nutrients'),
  ('לחמניית המבורגר', 273, 11.2, 'bread_bakery', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Bao bun', '2708724', 'https://fdc.nal.usda.gov/food-details/2708724/nutrients'),
  ('פיתה מלאה', 262, 9.8, 'bread_bakery', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Bread, pita, whole-wheat', '174916', 'https://fdc.nal.usda.gov/food-details/174916/nutrients'),
  ('עוף בגריל', 151, 22.3, 'meat_poultry', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Chicken fillet, grilled', '2706090', 'https://fdc.nal.usda.gov/food-details/2706090/nutrients'),
  ('כנפיים עוף', 252, 23.6, 'meat_poultry', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Chicken wing, baked, broiled, or roasted, from raw', '2706057', 'https://fdc.nal.usda.gov/food-details/2706057/nutrients'),
  ('סטייק אנטריקוט', 259, 24.24, 'meat_poultry', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Beef, ribeye cap steak, boneless, separable lean only, trimmed to 0" fat, choice, cooked, grilled', '173055', 'https://fdc.nal.usda.gov/food-details/173055/nutrients'),
  ('צלי בקר', 251, 28.4, 'meat_poultry', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Beef, pot roast', '2705848', 'https://fdc.nal.usda.gov/food-details/2705848/nutrients'),
  ('סטייק פילה בקר', 217, 30.21, 'meat_poultry', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Beef, loin, tenderloin steak, boneless, separable lean and fat, trimmed to 0" fat, choice, cooked, grilled', '170238', 'https://fdc.nal.usda.gov/food-details/170238/nutrients'),
  ('קורדון בלו עוף', 210, 22.6, 'meat_poultry', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Chicken or turkey cordon bleu', '2706441', 'https://fdc.nal.usda.gov/food-details/2706441/nutrients'),
  ('פילה בקלה בתנור', 126, 19, 'fish_seafood', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Fish, cod, baked or broiled', '2706241', 'https://fdc.nal.usda.gov/food-details/2706241/nutrients'),
  ('דג מושט מבושל', 150, 24.81, 'fish_seafood', 'cooked', 'USDA FoodData Central (SR Legacy) -- Fish, mullet, striped, cooked, dry heat', '175124', 'https://fdc.nal.usda.gov/food-details/175124/nutrients'),
  ('דג פורל', 148, 20.77, 'fish_seafood', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Fish, trout, mixed species, raw', '175153', 'https://fdc.nal.usda.gov/food-details/175153/nutrients'),
  ('כבד עוף מטוגן', 172, 25.78, 'meat_poultry', 'fried', 'USDA FoodData Central (SR Legacy) -- Chicken, liver, all classes, cooked, pan-fried', '174491', 'https://fdc.nal.usda.gov/food-details/174491/nutrients'),
  ('יוגורט דל שומן', 63, 5.25, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Yogurt, plain, low fat', '170886', 'https://fdc.nal.usda.gov/food-details/170886/nutrients'),
  ('יוגורט וניל', 85, 4.93, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Yogurt, vanilla, low fat.', '170888', 'https://fdc.nal.usda.gov/food-details/170888/nutrients'),
  ('פודינג שוקולד', 142, 2.09, 'dairy', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Pudding, chocolate, NFS', '2705679', 'https://fdc.nal.usda.gov/food-details/2705679/nutrients'),
  ('חלב 0%', 35, 3.4, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Milk, fluid, nonfat, calcium fortified (fat free or skim)', '169868', 'https://fdc.nal.usda.gov/food-details/169868/nutrients'),
  ('גבינת עיזים', 264, 18.52, 'dairy', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Cheese, goat, soft type', '173435', 'https://fdc.nal.usda.gov/food-details/173435/nutrients'),
  ('חביתה', 154, 10.57, 'egg', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Egg, whole, cooked, omelet', '172185', 'https://fdc.nal.usda.gov/food-details/172185/nutrients'),
  ('ביצה עלומה', 143, 12.51, 'egg', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Egg, whole, cooked, poached', '172186', 'https://fdc.nal.usda.gov/food-details/172186/nutrients'),
  ('חביתת גבינה', 132, 11.3, 'egg', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Egg white, omelet, scrambled, or fried, with cheese', '2707290', 'https://fdc.nal.usda.gov/food-details/2707290/nutrients'),
  ('ביצים מקושקשות', 149, 9.99, 'egg', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Egg, whole, cooked, scrambled', '172187', 'https://fdc.nal.usda.gov/food-details/172187/nutrients'),
  ('מרק עדשים', 60, 3.82, 'prepared_dish', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Soup, lentil', '2707462', 'https://fdc.nal.usda.gov/food-details/2707462/nutrients'),
  ('חלמון ביצה', 322, 15.86, 'egg', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Egg, yolk, raw, fresh', '172184', 'https://fdc.nal.usda.gov/food-details/172184/nutrients'),
  ('שעועית ברוטב עגבניות', 94, 5.15, 'prepared_dish', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Beans, baked, canned, with pork and tomato sauce', '173733', 'https://fdc.nal.usda.gov/food-details/173733/nutrients'),
  ('ריקוטה', 157, 7.81, 'dairy', 'as_sold', 'USDA FoodData Central (Foundation) -- Cheese, ricotta, whole milk', '746766', 'https://fdc.nal.usda.gov/food-details/746766/nutrients'),
  ('שייק פירות', 53, 2.61, 'beverage', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Fruit smoothie, light', '2709338', 'https://fdc.nal.usda.gov/food-details/2709338/nutrients'),
  ('שייק חלבון', 61, 6.59, 'beverage', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Nutritional drink or shake, high protein, ready-to-drink, NFS', '2710726', 'https://fdc.nal.usda.gov/food-details/2710726/nutrients'),
  ('סנדוויץ'' טונה', 244, 10.6, 'sandwich', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Tuna salad sandwich wrap', '2707038', 'https://fdc.nal.usda.gov/food-details/2707038/nutrients'),
  ('סנדוויץ'' גבינה צהובה', 325, 15.1, 'sandwich', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Cheese sandwich, cheddar cheese, on white bread', '2705797', 'https://fdc.nal.usda.gov/food-details/2705797/nutrients'),
  ('סנדוויץ'' חביתה', 166, 9.41, 'sandwich', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Egg white sandwich', '2707334', 'https://fdc.nal.usda.gov/food-details/2707334/nutrients'),
  ('כריך גבינה וירקות', 146, 6.46, 'sandwich', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Vegetable sandwich on wheat, with cheese', '2709135', 'https://fdc.nal.usda.gov/food-details/2709135/nutrients'),
  ('כרוב ממולא', 207, 9.56, 'prepared_dish', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Stuffed cabbage, with meat, Puerto Rican style', '2710142', 'https://fdc.nal.usda.gov/food-details/2710142/nutrients'),
  ('ביסקוויטים', 446, 6.9, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Cookies, animal crackers (includes arrowroot, tea biscuits)', '168014', 'https://fdc.nal.usda.gov/food-details/168014/nutrients'),
  ('טירמיסו', 353, 5.65, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Tiramisu', '2705702', 'https://fdc.nal.usda.gov/food-details/2705702/nutrients'),
  ('עוגת תפוחים', 376, 2.41, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Cake or cupcake, apple', '2707855', 'https://fdc.nal.usda.gov/food-details/2707855/nutrients'),
  ('סוכריות', 394, 0, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Candies, hard', '167990', 'https://fdc.nal.usda.gov/food-details/167990/nutrients'),
  ('חטיף דגנים', 471, 10.1, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Cereal or Granola bar, NFS', '2708101', 'https://fdc.nal.usda.gov/food-details/2708101/nutrients'),
  ('קטשופ', 109, 1.08, 'sauce_condiment', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Ketchup', '2709733', 'https://fdc.nal.usda.gov/food-details/2709733/nutrients'),
  ('שוקולד לבן', 539, 5.87, 'sweets_snacks', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Candies, white chocolate', '167571', 'https://fdc.nal.usda.gov/food-details/167571/nutrients'),
  ('ריבה', 212, 0, 'sauce_condiment', 'as_sold', 'USDA FoodData Central (SR Legacy) -- Jams, preserves, marmalades, sweetened with fruit juice', '170280', 'https://fdc.nal.usda.gov/food-details/170280/nutrients'),
  ('נוטלה', 539, 5.41, 'sauce_condiment', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Chocolate hazelnut spread', '2710289', 'https://fdc.nal.usda.gov/food-details/2710289/nutrients'),
  ('ממרח שוקולד', 539, 5.41, 'sauce_condiment', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Chocolate hazelnut spread', '2710289', 'https://fdc.nal.usda.gov/food-details/2710289/nutrients'),
  ('רוטב סויה', 53, 8.14, 'sauce_condiment', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Soy sauce', '2707442', 'https://fdc.nal.usda.gov/food-details/2707442/nutrients'),
  ('מיונז', 680, 0.96, 'sauce_condiment', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Mayonnaise, regular', '2710204', 'https://fdc.nal.usda.gov/food-details/2710204/nutrients'),
  ('פיצה קפואה', 268, 10.4, 'prepared_dish', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Pizza, cheese, from frozen, thick crust', '2708613', 'https://fdc.nal.usda.gov/food-details/2708613/nutrients'),
  ('טורטייה קמח', 306, 8.2, 'bread_bakery', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Tortilla, flour', '2707824', 'https://fdc.nal.usda.gov/food-details/2707824/nutrients'),
  ('חרדל', 61, 4.25, 'sauce_condiment', 'as_sold', 'USDA FoodData Central (Foundation) -- Mustard, prepared, yellow', '326698', 'https://fdc.nal.usda.gov/food-details/326698/nutrients')
) as v(name, calories_per_100g, protein_per_100g, category, basis, source_name, source_id, source_url)
where lower(f.name) = lower(v.name);

-- NOT tightened to NOT NULL in this migration (deliberate). A first
-- attempt at tightening failed: P0001, 15 row(s) already in the live table --
-- outside this migration's own 221-corrected / 113-deleted name lists
-- (349 total, derived from this repo's 005/006/007 history) -- still
-- had null category/basis/source_* after the DELETE+UPDATE above. That
-- means the live table currently holds rows this migration doesn't
-- recognize: added by hand directly in the SQL Editor at some point
-- (the food_reference_catalog table's own established maintenance
-- pattern -- see 004_food_reference_catalog.sql's own comment), a
-- naming drift from this repo's migration history, or similar.
--
-- Per instruction, this migration must not delete or overwrite data it
-- doesn't recognize, and must not fail/roll back the verified
-- corrections above just because of rows outside its own scope. So:
-- category/basis/source_name/source_id/source_url/source_checked_at
-- stay nullable (their CHECK constraints above already tolerate null --
-- standard SQL: `x in (...)` and comparisons against NULL evaluate to
-- NULL, which a CHECK constraint treats as satisfied, not violated).
-- Tightening to NOT NULL is deferred to a future migration, once the
-- report below (or
-- supabase/audits/food_reference_catalog_039_preflight_check.sql, run
-- any time) has been individually reviewed and every row either
-- classified, corrected, or knowingly left as legacy/unclassified --
-- exactly the same "nullable until a coach/migration supplies a real
-- value" pattern this table already uses for protein_per_100g (005).
-- Safe-by-construction report (not a check, never aborts anything --
-- a plain select can't raise on finding nulls the way the old guard's
-- `raise exception` did): every row STILL missing category/basis/
-- source_* after the correction above, now that the columns
-- definitely exist (the ALTER TABLE already ran, successfully, earlier
-- in this same transaction). Supabase's SQL Editor shows the result of
-- the last query in a multi-statement run, so this is deliberately the
-- last thing before commit; -- you'll see this result set right after
-- running the file. Empty result = every row in the table now has full
-- source metadata; a non-empty result is exactly the
-- supabase/audits/food_reference_catalog_039_preflight_check.sql
-- situation, now with real names, right after this migration lands.
select id, name, calories_per_100g, protein_per_100g,
  category, basis, source_name, source_id, source_url, source_checked_at
from public.food_reference_catalog
where category is null or basis is null or source_name is null
   or source_id is null or source_url is null or source_checked_at is null
order by name;

commit;
