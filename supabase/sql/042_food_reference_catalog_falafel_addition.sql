-- Food Reference Catalog -- Falafel Addition (DRAFT, NOT yet applied).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 040 (and 041, if/when that is applied -- this file is
-- independent of 041 either way, since it only inserts a new row and
-- 041 only touches 4 pre-existing ones).
--
-- Context: falafel was matched to a clean, primary-source USDA record
-- during the original bulk verification pass (full token coverage, no
-- restaurant/brand/fast-food qualifier), but was excluded at the time
-- because it fell outside the prepared_dish category's plausibility
-- bounds (kcal ceiling was 500; falafel is 514). A follow-up review
-- confirmed the record itself is correct -- 514 kcal/100g is a
-- well-corroborated, non-outlier figure for a deep-fried prepared dish
-- (bread_bakery already tolerates up to 550, sweets_snacks up to 620) --
-- so the fix is to the prepared_dish plausibility ceiling, not the
-- data. See
-- src/features/nutrition/lib/foodCatalogPlausibility.js (prepared_dish
-- kcal ceiling raised 500 -> 550) and
-- supabase/audits/food_reference_catalog_expansion_proposal_2026-09-16.md
-- for the full review. Approved for inclusion.
--
-- Same insert shape and ON CONFLICT DO NOTHING pattern as 040 (a single
-- new row is already atomic as one statement -- no explicit
-- begin;/commit; needed here, unlike 041's multi-statement
-- UPDATE+DELETE+guard).

insert into public.food_reference_catalog
  (name, calories_per_100g, protein_per_100g, category, basis, source_name, source_id, source_url, source_checked_at)
values
  ('פלאפל', 514, 8.28, 'prepared_dish', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Falafel', '2707408', 'https://fdc.nal.usda.gov/food-details/2707408/nutrients', CURRENT_DATE)
on conflict ((lower(name))) do nothing;
