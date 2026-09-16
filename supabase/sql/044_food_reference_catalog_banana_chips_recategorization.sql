-- Food Reference Catalog -- Banana Chips Recategorization (DRAFT, NOT
-- yet applied).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 040 (independent of 041/042/043 either way -- disjoint row).
--
-- Same defect class as 043's 6-row batch: a clean, already-verified
-- USDA record held back only because its category's plausibility
-- bounds didn't fit it, found during a broader 50-100-item audit pass
-- (see supabase/audits/food_reference_catalog_broad_audit_2026-09-16.md).
-- was excluded under `fruit` (kcal ceiling 350; 519 is 169 over --
-- dried/fried banana chips are far more calorie-dense than fresh
-- banana); `sweets_snacks` (ceiling 620) fits cleanly, consistent with
-- how other dried/processed high-calorie snack foods (e.g. the already
-- corrected bagel chips, granola in 043) are categorized.
--
-- Naming note (same rigor applied to the בייגלה finding in 043): the
-- plain name "בננה מיובשת" alone reads as simple air-dried banana
-- slices, a materially different (lower-calorie) product from actual
-- fried/oiled banana chips. Using the fuller, honest name below avoids
-- that ambiguity rather than repeating it.

insert into public.food_reference_catalog
  (name, calories_per_100g, protein_per_100g, category, basis, source_name, source_id, source_url, source_checked_at)
values
  ('בננה מיובשת (צ''יפס בננה)', 519, 2.3, 'sweets_snacks', 'dried',
   'USDA FoodData Central (Survey (FNDDS)) -- Banana chips',
   '2709200', 'https://fdc.nal.usda.gov/food-details/2709200/nutrients', CURRENT_DATE)
on conflict ((lower(name))) do nothing;
