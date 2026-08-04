-- Food Reference Catalog Corrections milestone.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 001_trainees.sql .. 006_food_reference_catalog_expansion.sql.
--
-- Purpose: fix a handful of values in public.food_reference_catalog found
-- during a source-verification audit of all 348 rows from 005 + 006.
-- Only high-confidence, source-backed corrections are included here —
-- ambiguous, recipe-dependent, or unsourced items (e.g. composite dishes,
-- branded snacks without a confirmed current label) were deliberately left
-- untouched pending better data.
--
-- This migration is purely corrective:
--   * does NOT truncate the table
--   * only UPDATEs existing rows by name (safe to run whether or not the
--     row exists yet — a no-op if 005/006 haven't run) and INSERTs one new
--     row, guarded the same way as 006 (ON CONFLICT on the existing
--     case-insensitive unique name index)
--   * safe to run more than once (UPDATEs are idempotent; INSERT is
--     conflict-safe)

-- שסק (loquat): USDA loquat, raw (NDB 09174) = 47 kcal, 0.43g protein.
-- Previous value (70 / 0.6) overstated calories by roughly 50%.
update public.food_reference_catalog
set calories_per_100g = 47,
    protein_per_100g = 0.4
where lower(name) = lower('שסק');

-- כנפיים עוף (chicken wings): USDA "chicken, broilers or fryers, wing,
-- meat and skin, roasted" = 290 kcal, 26.86g protein. Previous value
-- (203 / 19.0) understated both.
update public.food_reference_catalog
set calories_per_100g = 290,
    protein_per_100g = 26.9
where lower(name) = lower('כנפיים עוף');

-- דג מושט (mullet): USDA "fish, mullet, striped, cooked, dry heat" =
-- 150 kcal, 24.81g protein. Also renamed to include the cooked-state
-- qualifier, matching every other fish entry's naming convention.
update public.food_reference_catalog
set name = 'דג מושט מבושל',
    calories_per_100g = 150,
    protein_per_100g = 24.8
where lower(name) = lower('דג מושט');

-- עדשים כתומות מבושלות (cooked red lentils): USDA cooked-lentils
-- reference = 116 kcal, 9.0g protein — red lentils don't differ
-- meaningfully from brown/green once cooked. Matches 005's
-- עדשים מבושלות exactly; the previous discount (100 / 7.0) wasn't
-- supported by any source.
update public.food_reference_catalog
set calories_per_100g = 116,
    protein_per_100g = 9.0
where lower(name) = lower('עדשים כתומות מבושלות');

-- לביבות תפוחי אדמה (potato pancakes / latkes): USDA-referenced
-- homemade potato pancake data = 268 kcal, 6.08g protein. Previous
-- value (210 / 3.8) understated both.
update public.food_reference_catalog
set calories_per_100g = 268,
    protein_per_100g = 6.1
where lower(name) = lower('לביבות תפוחי אדמה');

-- לחם אחיד (Israeli standard subsidized bread): Israeli commercial
-- "לחם אחיד פרוס" labels (Angel Bakery, Shufersal), consistent with the
-- Ministry of Health's published <=250 kcal/100g standard-bread cap.
update public.food_reference_catalog
set calories_per_100g = 250,
    protein_per_100g = 9.4
where lower(name) = lower('לחם אחיד');

-- גבינה לבנה 5% (white cheese 5%): Tnuva's official product listing =
-- 98 kcal, 9.0g protein. Protein was already correct; only calories move.
update public.food_reference_catalog
set calories_per_100g = 98,
    protein_per_100g = 9.0
where lower(name) = lower('גבינה לבנה 5%');

-- טורטייה קמח (flour tortilla): new entry. USDA "tortillas, ready-to-bake
-- or -fry, flour, refrigerated" = 324 kcal, 8.2g protein. Added alongside
-- the existing טורטייה entry (which matches corn-tortilla data almost
-- exactly, 218 / 6.0) rather than changing it, since both tortilla types
-- are genuinely in use and were previously conflated under one name.
insert into public.food_reference_catalog (name, calories_per_100g, protein_per_100g) values
  ('טורטייה קמח', 324, 8.2)
on conflict ((lower(name))) do nothing;
