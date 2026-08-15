-- Exercise Reference Catalog milestone -- lets a coach pick an exercise
-- name from an organized, muscle-category-grouped catalog instead of
-- typing every exercise name by hand, while still allowing a fully custom
-- name when the catalog doesn't have what they need.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 018_training_programs.sql.
--
-- Purely additive: ONE new table, no existing table/column/policy/data is
-- touched. public.trainee_workout_exercises.name stays exactly what it
-- already is -- a free-text, coach-owned column -- so every existing
-- program/workout/exercise row keeps working unchanged, and manually
-- typed exercise names (past or future) remain fully valid. This
-- migration only adds a place to look names up from; it does not require
-- anything to reference it.
--
-- Shared vs. coach-specific: shared (not coach-scoped), matching the
-- public.food_reference_catalog convention (004_food_reference_catalog.sql)
-- exactly -- "סקוואט" or "מתח" mean the same thing for every coach, so
-- there is nothing coach-specific to isolate, and a shared table avoids
-- every coach re-typing/maintaining an identical list. Same read-only-
-- from-the-app posture too: the app only ever SELECTs; the catalog itself
-- is seeded/maintained directly via the SQL Editor, not through any
-- coach-facing write path -- no insert/update/delete policy is defined
-- (RLS defaults to deny, so this is enforced, not just a convention).
--
-- Categories as a check constraint, not a separate lookup table: the
-- seven categories are a small, fixed, hand-picked set (matching the
-- shape of public.trainees.status / public.trainee_training_programs.
-- status -- text + check-in-list rather than a normalized side table). A
-- separate categories table would add a join and its own RLS for no real
-- benefit here, since the app only ever needs "the fixed list of 7 Hebrew
-- labels" to drive a select dropdown, which is just as easy to hold in
-- the frontend as a constant, validated server-side by this same
-- constraint.
--
-- How the frontend is expected to use this (structure only in this
-- migration -- no frontend change here):
--   1. Coach picks a category (one of the seven below) in a first
--      dropdown.
--   2. Second dropdown lists this table's rows where category = that
--      value, ordered by name -- filtered client-side after one fetch of
--      the whole (small, ~100-row) catalog, same pattern already used for
--      food_reference_catalog lookups.
--   3. Picking a row fills trainee_workout_exercises.name with that row's
--      name -- a plain string copy, exactly like foods.name is filled
--      from food_reference_catalog.name today. No foreign key is created
--      or needed.
--   4. An "custom exercise" option/free-text fallback lets the coach type
--      any name instead, writing straight into trainee_workout_exercises.
--      name like it already does today -- that path is completely
--      unaffected by this migration.

create table public.exercise_reference_catalog (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'רגליים',
    'יד קדמית',
    'בטן',
    'גב',
    'חזה',
    'יד אחורית',
    'כתפיים'
  )),
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

-- Powers "list this category's exercises, alphabetically" -- the only
-- query shape the picker needs.
create index exercise_reference_catalog_category_idx
  on public.exercise_reference_catalog (category, name);

-- Same shape as food_reference_catalog_name_idx: prevents duplicate/near-
-- duplicate seed rows (case-insensitive) and keeps every catalog name
-- unique across the whole table, not just within its own category.
create unique index exercise_reference_catalog_name_idx
  on public.exercise_reference_catalog (lower(name));

alter table public.exercise_reference_catalog enable row level security;

-- Shared reference data: any logged-in coach may read it, nobody writes to
-- it from the app (seed/maintain it directly via the SQL Editor) -- same
-- policy shape as food_reference_catalog_select_authenticated.
create policy exercise_reference_catalog_select_authenticated on public.exercise_reference_catalog
  for select
  using (auth.uid() is not null);

-- No insert/update/delete policy -- RLS defaults to deny, matching
-- food_reference_catalog's read-only-from-the-app posture.

insert into public.exercise_reference_catalog (category, name) values
  -- רגליים
  ('רגליים', 'סקוואט'),
  ('רגליים', 'סקוואט גובלט'),
  ('רגליים', 'סקוואט בולגרי'),
  ('רגליים', 'סקוואט סומו'),
  ('רגליים', 'לחיצת רגליים'),
  ('רגליים', 'מכרעים (לאנג'')'),
  ('רגליים', 'לאנג'' הליכה'),
  ('רגליים', 'דדליפט רומני'),
  ('רגליים', 'הארכת ברך במכונה'),
  ('רגליים', 'כפיפת ברך שכיבה'),
  ('רגליים', 'כפיפת ברך ישיבה'),
  ('רגליים', 'הרמת עקבים בעמידה'),
  ('רגליים', 'הרמת עקבים בישיבה'),
  ('רגליים', 'היפ תראסט'),
  ('רגליים', 'גשר ישבן'),
  ('רגליים', 'הרחקת ירך במכונה'),
  ('רגליים', 'קירוב ירך במכונה'),
  ('רגליים', 'עלייה על ספסל (סטפ אפ)'),

  -- יד קדמית (ביצפס)
  ('יד קדמית', 'כפיפת מרפקים במוט'),
  ('יד קדמית', 'כפיפת מרפקים במוט EZ'),
  ('יד קדמית', 'כפיפת מרפקים בהאלטרים'),
  ('יד קדמית', 'כפיפת מרפקים בפטיש'),
  ('יד קדמית', 'כפיפת מרפקים בכבל'),
  ('יד קדמית', 'כפיפת מרפקים בספסל שיפוע'),
  ('יד קדמית', 'כפיפת מרפקים בספסל סקוט'),
  ('יד קדמית', 'כפיפת מרפקים מרוכזת'),
  ('יד קדמית', 'כפיפת מרפקים 21'),
  ('יד קדמית', 'כפיפת מרפקים במכונה'),
  ('יד קדמית', 'כפיפת מרפקים בפולי תחתון'),
  ('יד קדמית', 'כפיפת מרפקים בגומיה'),
  ('יד קדמית', 'כפיפת שורש כף היד'),

  -- בטן
  ('בטן', 'כפיפות בטן'),
  ('בטן', 'כפיפות בטן מלאות'),
  ('בטן', 'הרמת רגליים תלויה'),
  ('בטן', 'הרמת ברכיים תלויה'),
  ('בטן', 'פלאנק'),
  ('בטן', 'פלאנק צידי'),
  ('בטן', 'כפיפות בטן באלכסון'),
  ('בטן', 'גלגלת בטן'),
  ('בטן', 'כפיפות בטן במכונה'),
  ('בטן', 'כפיפות בטן בכבל'),
  ('בטן', 'הרמת רגליים בשכיבה'),
  ('בטן', 'הרמת רגליים בישיבה'),
  ('בטן', 'רוסיאן טוויסט'),
  ('בטן', 'בייסיקל קראנץ'''),
  ('בטן', 'דד באג'),

  -- גב
  ('גב', 'מתח'),
  ('גב', 'מתח אחיזה הפוכה'),
  ('גב', 'משיכת פולי עליון'),
  ('גב', 'משיכת פולי עליון אחיזה צרה'),
  ('גב', 'חתירה בכבל ישיבה'),
  ('גב', 'חתירה במוט'),
  ('גב', 'חתירה בהאלטר'),
  ('גב', 'חתירה במכונה'),
  ('גב', 'חתירת T'),
  ('גב', 'דדליפט'),
  ('גב', 'פולאובר בכבל'),
  ('גב', 'גב תחתון (הייפראקסטנשן)'),
  ('גב', 'גוד מורנינג'),

  -- חזה
  ('חזה', 'לחיצת חזה במוט'),
  ('חזה', 'לחיצת חזה בהאלטרים'),
  ('חזה', 'לחיצת חזה בשיפוע (מוט)'),
  ('חזה', 'לחיצת חזה בשיפוע (האלטרים)'),
  ('חזה', 'לחיצת חזה בשיפוע הפוך'),
  ('חזה', 'פרפר בהאלטרים'),
  ('חזה', 'פרפר בכבלים'),
  ('חזה', 'מכונת פרפר (פק דק)'),
  ('חזה', 'שכיבות סמיכה'),
  ('חזה', 'לחיצת חזה במכונה'),
  ('חזה', 'מקבילים לחזה (דיפס)'),
  ('חזה', 'הצלבות בכבל (קייבל קרוסאובר)'),
  ('חזה', 'לחיצת חזה בגומיה'),

  -- יד אחורית (טרייספס)
  ('יד אחורית', 'פשיטת מרפק בכבל (מוט)'),
  ('יד אחורית', 'פשיטת מרפק בחבל'),
  ('יד אחורית', 'פשיטת מרפקים שכיבה (סקאל קראשר)'),
  ('יד אחורית', 'דחיקה מעל הראש בכבל'),
  ('יד אחורית', 'דחיקה מעל הראש בהאלטר'),
  ('יד אחורית', 'דיפס בספסל'),
  ('יד אחורית', 'דיפס במקבילים'),
  ('יד אחורית', 'קיקבק טרייספס בהאלטר'),
  ('יד אחורית', 'קיקבק טרייספס בכבל'),
  ('יד אחורית', 'לחיצת חזה אחיזה צרה'),
  ('יד אחורית', 'פשיטת מרפק בגומיה'),
  ('יד אחורית', 'פשיטת מרפק במכונה'),

  -- כתפיים
  ('כתפיים', 'לחיצת כתפיים במוט'),
  ('כתפיים', 'לחיצת כתפיים בהאלטרים'),
  ('כתפיים', 'לחיצת כתפיים במכונה'),
  ('כתפיים', 'לחיצת ארנולד'),
  ('כתפיים', 'הרחקת כתפיים לצדדים בהאלטרים'),
  ('כתפיים', 'הרחקת כתפיים לצדדים בכבל'),
  ('כתפיים', 'הרחקת כתפיים לצדדים במכונה'),
  ('כתפיים', 'הרמת כתפיים קדימה בהאלטרים'),
  ('כתפיים', 'הרמת כתפיים קדימה בכבל'),
  ('כתפיים', 'פרפר הפוך במכונה'),
  ('כתפיים', 'הרחקת כתפיים לאחור בהאלטרים'),
  ('כתפיים', 'משיכת חבל לפנים (פייס פול)'),
  ('כתפיים', 'חתירה אנכית במוט'),
  ('כתפיים', 'משיכת כתפיים (שראגס)');

-- No changes to public.trainee_workout_exercises or any other existing
-- table in this migration. No storage changes.
