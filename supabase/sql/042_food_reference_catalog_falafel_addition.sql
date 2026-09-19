-- Food Reference Catalog -- Falafel Addition (DRAFT, NOT yet applied).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 040 (and 041, if/when that is applied -- this file is
-- independent of 041 either way, since it only touches a single row
-- 041 never references).
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
-- CORRECTED (2026-09-20): this file originally used
-- ON CONFLICT ((lower(name))) DO NOTHING, matching 040's pattern for a
-- genuinely NEW row. That was wrong here -- a real, pre-existing,
-- hand-entered "פלאפל" row already lives in the catalog (from 006, no
-- source citation, the original hand-typed 333 kcal figure), so
-- DO NOTHING would have silently discarded this migration's entire
-- purpose the moment it ran: the verified USDA record would never
-- actually land, and nobody running it would see any error telling
-- them so. Found via a live-status audit
-- (supabase/audits/food_reference_catalog_041_042_043_044_live_status_check.sql)
-- BEFORE this was ever run against Supabase. Changed to DO UPDATE,
-- explicitly setting every column this migration cares about from the
-- new, verified values -- so running this migration (the first real
-- run, or any later re-run) always converges the falafel row to the
-- verified USDA record, never silently leaves the old hand-entered
-- value in place. Still fully idempotent: a second run sets the same
-- row to the same values again, a no-op change, same guarantee the
-- original DO NOTHING version had, just achieved correctly.
--
-- Wrapped in begin;/commit; with a guard (added in this correction,
-- matching 041/043's own pattern) -- a bare single-statement INSERT
-- was an acceptable shortcut when this could only ever no-op or insert
-- cleanly; now that it can also overwrite an EXISTING row's values,
-- the same verify-or-roll-back discipline every other row-level
-- correction in this catalog already uses applies here too.

begin;

insert into public.food_reference_catalog
  (name, calories_per_100g, protein_per_100g, category, basis, source_name, source_id, source_url, source_checked_at)
values
  ('פלאפל', 514, 8.28, 'prepared_dish', 'as_sold', 'USDA FoodData Central (Survey (FNDDS)) -- Falafel', '2707408', 'https://fdc.nal.usda.gov/food-details/2707408/nutrients', CURRENT_DATE)
on conflict ((lower(name))) do update set
  calories_per_100g = excluded.calories_per_100g,
  protein_per_100g = excluded.protein_per_100g,
  category = excluded.category,
  basis = excluded.basis,
  source_name = excluded.source_name,
  source_id = excluded.source_id,
  source_url = excluded.source_url,
  source_checked_at = excluded.source_checked_at;

-- Guard: confirms the falafel row now carries the verified USDA record
-- -- whether it arrived via a fresh INSERT (no pre-existing row) or an
-- ON-CONFLICT-triggered UPDATE (the real, live case) -- narrowly scoped
-- to this one named row, not a whole-table assumption.
do $$
declare
  v_verified int;
begin
  select count(*) into v_verified
  from public.food_reference_catalog
  where lower(name) = lower('פלאפל')
    and source_id = '2707408';

  if v_verified <> 1 then
    raise exception
      'Expected the falafel row to carry source_id 2707408 after this migration, found %. Nothing committed.',
      v_verified;
  end if;
end $$;

commit;
