-- Protein Tracking + Food Reference Expansion milestone.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql, 002_progress_logs.sql, 003_nutrition.sql, and
-- 004_food_reference_catalog.sql.
--
-- Nutrition data source: USDA FoodData Central (SR Legacy / Foundation
-- Foods datasets), https://fdc.nal.usda.gov/ — a public, citable reference
-- database. Values below are the standard per-100g figures for the
-- described preparation (raw vs. cooked is noted in the Hebrew name where
-- it matters, e.g. "מבושל" = cooked). Two rows (חטיף במבה, ביסלי) are
-- specific well-known Israeli branded snacks with no USDA equivalent;
-- those use the manufacturer's published nutrition label instead, noted
-- inline. Recipe-variable composite dishes with no single reliable
-- standardized figure (e.g. שקשוקה, שווארמה, סביח, מלאווח, בורקס, קובה,
-- מג'דרה) were deliberately left out rather than estimated — accuracy over
-- catalog size, per product decision.

-- 1. Add protein to the shared reference catalog. Always known/curated,
-- so this stays NOT NULL (unlike the per-coach `foods` column below).
alter table public.food_reference_catalog
  add column protein_per_100g numeric(6, 1) not null default 0
  check (protein_per_100g >= 0);

-- Reseed with corrected + significantly expanded data. Safe to truncate:
-- this table is shared reference data nobody writes to from the app.
truncate table public.food_reference_catalog;

insert into public.food_reference_catalog (name, calories_per_100g, protein_per_100g) values
  -- Fruits (raw)
  ('תפוח', 52, 0.3),
  ('בננה', 89, 1.1),
  ('תפוז', 47, 0.9),
  ('ענבים', 69, 0.7),
  ('אבטיח', 30, 0.6),
  ('מלון', 34, 0.8),
  ('אגס', 57, 0.4),
  ('אפרסק', 39, 0.9),
  ('שזיף', 46, 0.7),
  ('תות שדה', 32, 0.7),
  ('קיווי', 61, 1.1),
  ('מנגו', 60, 0.8),
  ('אננס', 50, 0.5),
  ('רימון', 83, 1.7),
  ('לימון', 29, 1.1),
  ('אבוקדו', 160, 2.0),
  ('דובדבן', 63, 1.1),
  ('משמש', 48, 1.4),
  ('תמר', 277, 1.8),
  ('צימוקים', 299, 3.1),
  ('משמש מיובש', 241, 3.4),
  ('תאנים מיובשות', 249, 3.3),
  ('קוקוס', 354, 3.3),
  ('אשכולית', 42, 0.8),
  ('פטל', 52, 1.2),
  ('אוכמניות', 57, 0.7),
  ('שסק', 70, 0.6),
  ('ליצ''י', 66, 0.8),
  ('קלמנטינה', 47, 0.9),

  -- Vegetables
  ('עגבניה', 18, 0.9),
  ('מלפפון', 16, 0.7),
  ('גזר', 41, 0.9),
  ('בצל', 40, 1.1),
  ('פלפל אדום', 31, 1.0),
  ('פלפל ירוק', 20, 0.9),
  ('פלפל צהוב', 27, 1.0),
  ('חסה', 15, 1.4),
  ('כרוב', 25, 1.3),
  ('ברוקולי', 34, 2.8),
  ('כרובית', 25, 1.9),
  ('חציל', 25, 1.0),
  ('קישוא', 17, 1.2),
  ('תירס מבושל', 96, 3.4),
  ('תפוח אדמה', 77, 2.0),
  ('תפוח אדמה אפוי', 93, 2.5),
  ('בטטה', 86, 1.6),
  ('שום', 149, 6.4),
  ('פטריות', 22, 3.1),
  ('תרד', 23, 2.9),
  ('סלרי', 16, 0.7),
  ('דלעת מבושלת', 20, 0.7),
  ('כרישה', 61, 1.5),
  ('ארטישוק מבושל', 47, 3.3),
  ('אספרגוס מבושל', 22, 2.4),
  ('צנון', 16, 0.7),
  ('סלק מבושל', 44, 1.7),

  -- Grains / carbs
  ('אורז לבן מבושל', 130, 2.7),
  ('אורז מלא מבושל', 123, 2.6),
  ('אורז בסמטי מבושל', 121, 2.7),
  ('פסטה מבושלת', 131, 5.0),
  ('פסטה מלאה מבושלת', 124, 5.3),
  ('לחם לבן', 265, 9.0),
  ('לחם מלא', 247, 13.0),
  ('לחמנייה', 280, 9.0),
  ('פיתה', 275, 9.1),
  ('טורטייה', 218, 6.0),
  ('לחם שיפון', 259, 8.5),
  ('קוסקוס מבושל', 112, 3.8),
  ('בורגול מבושל', 83, 3.1),
  ('שיבולת שועל', 389, 16.9),
  ('קינואה מבושלת', 120, 4.4),
  ('קרקר', 421, 9.0),
  ('בייגלה', 380, 10.0),
  ('פריכיות אורז', 387, 8.2),
  ('דגני בוקר', 357, 7.5),
  ('קורנפלקס', 357, 7.5),
  ('גרנולה', 471, 10.0),
  ('דייסת סולת', 95, 2.6),
  ('וופל', 291, 7.9),
  ('פנקייק', 227, 6.4),

  -- Proteins (meat, fish, eggs)
  ('חזה עוף צלוי', 165, 31.0),
  ('שוק עוף צלוי', 209, 26.0),
  ('בשר בקר טחון מבושל', 250, 26.0),
  ('סטייק בקר צלוי', 205, 29.0),
  ('הודו טחון מבושל', 189, 22.0),
  ('סלמון מבושל', 208, 22.1),
  ('טונה בשימורים', 116, 25.5),
  ('דג אמנון מבושל', 128, 26.2),
  ('דג בקלה מבושל', 105, 23.0),
  ('שרימפס מבושל', 99, 24.0),
  ('ביצה קשה', 155, 12.6),
  ('ביצה מטוגנת', 196, 13.6),
  ('שניצל עוף', 250, 17.0),
  ('הודו צלוי', 135, 30.0),
  ('כבד עוף מבושל', 172, 24.5),
  ('נקניקיה', 300, 11.0),
  ('המבורגר בקר', 250, 25.0),
  ('קציצות בשר', 220, 20.0),
  ('בקר צלי (דלי)', 137, 21.0),
  ('פסטרמה', 147, 21.0),
  ('נקניק הודו', 104, 17.0),
  ('סלמון מעושן', 117, 18.3),
  ('כבד בקר מבושל', 175, 26.4),
  ('דג בורי מבושל', 122, 20.0),
  ('פילה סול מבושל', 89, 18.8),

  -- Legumes / plant protein
  ('חומוס מבושל', 164, 8.9),
  ('עדשים מבושלות', 116, 9.0),
  ('שעועית מבושלת', 127, 8.7),
  ('אפונה מבושלת', 84, 5.4),
  ('טופו', 76, 8.1),
  ('חומוס (ממרח)', 166, 7.9),
  ('אדממה מבושל', 122, 11.9),
  ('שעועית לבנה מבושלת', 139, 9.7),
  ('פול מבושל', 110, 7.6),
  ('פולי סויה מבושלים', 173, 16.6),

  -- Dairy
  ('חלב 3%', 61, 3.2),
  ('חלב 1%', 42, 3.4),
  ('יוגורט טבעי', 61, 3.5),
  ('יוגורט 3%', 62, 3.5),
  ('יוגורט יווני', 73, 10.0),
  ('קוטג'' 5%', 98, 11.1),
  ('גבינה לבנה 5%', 108, 9.0),
  ('גבינה צהובה', 402, 25.0),
  ('גבינת שמנת', 342, 6.2),
  ('לבן', 62, 3.5),
  ('חמאה', 717, 0.9),
  ('מוצרלה', 280, 22.2),
  ('פטה', 264, 14.2),
  ('פרמזן', 431, 38.5),
  ('שמנת מתוקה', 340, 2.1),
  ('חלב סויה', 33, 2.9),
  ('חלב שקדים', 17, 0.6),
  ('גבינה בולגרית', 265, 16.0),
  ('שמנת חמוצה', 198, 2.4),
  ('חלב עיזים', 69, 3.6),

  -- Nuts, seeds, fats
  ('שמן זית', 884, 0),
  ('חמאת בוטנים', 588, 25.0),
  ('שקדים', 579, 21.2),
  ('אגוזי מלך', 654, 15.2),
  ('בוטנים', 567, 25.8),
  ('טחינה', 595, 17.0),
  ('זיתים', 115, 0.8),
  ('זרעי חמניה', 584, 20.8),
  ('זרעי דלעת', 559, 30.2),
  ('קשיו', 553, 18.2),
  ('פיסטוקים', 560, 20.2),
  ('צנוברים', 673, 13.7),

  -- Snacks / sweets
  ('שוקולד חלב', 535, 7.7),
  ('שוקולד מריר', 546, 7.8),
  ('עוגיות', 480, 5.9),
  ('גלידה', 207, 3.5),
  ('חטיף במבה', 534, 13.0), -- manufacturer nutrition label (Osem)
  ('ביסלי', 450, 9.0), -- manufacturer nutrition label (Osem)
  ('צ''יפס', 312, 3.4), -- corrected: fried potato fries, not potato chips
  ('פופקורן', 387, 12.9),
  ('דבש', 304, 0.3),
  ('סוכר', 387, 0),
  ('מרשמלו', 318, 1.8),
  ('חטיף אנרגיה', 400, 15.0),
  ('עוגת שוקולד', 371, 5.0),
  ('עוגת גבינה', 321, 5.5),

  -- Standardized prepared dishes (reliable single reference value)
  ('פלאפל', 333, 13.3),
  ('פיצה גבינה', 266, 11.0),

  -- Soups / salads
  ('מרק ירקות', 44, 1.8),
  ('מרק עוף', 38, 2.9),
  ('סלט ירקות', 25, 1.2),

  -- Drinks
  ('קולה', 42, 0),
  ('מיץ תפוזים', 45, 0.7),
  ('מיץ תפוחים', 46, 0.1),
  ('מיץ ענבים', 60, 0.4),
  ('בירה', 43, 0.5),
  ('יין אדום', 85, 0.1),
  ('מים', 0, 0),
  ('תה ללא סוכר', 1, 0),
  ('קפה שחור', 2, 0.1),
  ('משקה איזוטוני', 24, 0);

-- 2. Add protein to the per-coach catalog. Nullable and unchecked by
-- default: existing rows created before protein tracking existed did not
-- capture it, and null here means "unknown", never a false zero. New
-- foods added through the app always supply a real value (required field).
alter table public.foods
  add column protein_per_100g numeric(6, 1)
  check (protein_per_100g is null or protein_per_100g >= 0);

-- One-time backfill: match existing coach foods to the reference catalog
-- by exact (case-insensitive) name and copy over a real protein value.
-- Anything that doesn't match stays null (unknown) until the coach
-- re-saves it through the app, which now always supplies protein.
update public.foods f
set protein_per_100g = r.protein_per_100g
from public.food_reference_catalog r
where lower(f.name) = lower(r.name);

-- 3. Add protein to logged entries, snapshotted at log time like
-- calories. Nullable for the same reason as `foods.protein_per_100g`:
-- an unmatched food's unknown protein must propagate as unknown, not 0.
alter table public.trainee_nutrition_logs
  add column protein numeric(6, 1)
  check (protein is null or protein >= 0);

-- Extend the existing calorie trigger to also compute protein. Null
-- foods.protein_per_100g naturally multiplies through to a null log
-- protein, so no special-casing is needed here.
create or replace function public.set_nutrition_log_calories()
returns trigger
language plpgsql
as $$
declare
  v_calories_per_100g numeric;
  v_protein_per_100g numeric;
begin
  select calories_per_100g, protein_per_100g
    into v_calories_per_100g, v_protein_per_100g
  from public.foods
  where id = new.food_id;

  new.calories = round(v_calories_per_100g * new.grams / 100.0, 1);
  new.protein = round(v_protein_per_100g * new.grams / 100.0, 1);
  return new;
end;
$$;

-- One-time backfill for logs created before protein tracking existed,
-- using each log's food's (now backfilled where possible) protein value.
update public.trainee_nutrition_logs tnl
set protein = round(f.protein_per_100g * tnl.grams / 100.0, 1)
from public.foods f
where f.id = tnl.food_id;
