-- Food Reference Catalog -- Wrong-Match & Category-Reassignment Fixes
-- (DRAFT, NOT yet applied).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 040 (independent of 041/042 either way -- disjoint row sets).
--
-- Scope, per explicit instruction: ONLY (a) the live בייגל wrong-match
-- bug, and (b) the 6 missing rows whose only blocker was a category
-- assignment (not a new-sourcing problem -- every value below is a
-- real, already live-USDA-verified record from this session's original
-- bulk pass, just filed under a category whose plausibility bounds
-- didn't fit it). Bound-TUNING fixes (egg white, oysters, TVP,
-- cornstarch -- each needs a bounds change, not a category change) are
-- explicitly OUT OF SCOPE for this pass and are not touched here. See
-- supabase/audits/food_reference_catalog_recategorization_2026-09-16.md
-- for the full review, including why the earlier "9 present-but-wrong"
-- / "9 missing-but-clean" counts in the prior report were each off by
-- 2-3 and the correct counts (7 and 6) used here.
--
-- Part 1: בייגל wrong-match fix.
-- Live בייגל ("bagel") is currently matched to fdcId 173150, "Snacks,
-- bagel chips, plain" (SR Legacy) -- bagel CHIPS are not the same food
-- as a whole bagel (same defect class as the חזה עוף צלוי bug: right
-- record, wrong prep-state/product for the name). No generic "Bagel,
-- plain" USDA record has been fetched this session (DEMO_KEY
-- rate-limited) -- rather than guess a value, the wrong row is deleted
-- and "plain bagel" stays a blocked, needs-live-search item (see the
-- report). Separately, a DIFFERENT, already-verified bagel-chips
-- record (fdcId 2708292, Survey (FNDDS) -- a distinct fdcId from the
-- one wrongly live under בייגל) is inserted under its own, correctly
-- categorized name in Part 2 below, so the food that WAS correctly
-- matched doesn't get thrown away, just correctly named/filed.
--
-- Transaction safety: wrapped in begin;/commit; (the pattern 039
-- settled on after three earlier failures, also used by 041) -- if the
-- guard at the end doesn't match what's expected, the whole
-- transaction rolls back with nothing partially applied.

begin;

delete from public.food_reference_catalog
where lower(name) = lower('בייגל');

-- Part 2: category-reassignment inserts. Every row below already
-- passed a full USDA match during the original session (full token
-- coverage, no restaurant/brand/fast-food qualifier) and was held back
-- ONLY because its plausibility bounds check failed under the WRONG
-- category. Re-verified this pass: every value below passes cleanly
-- under the corrected category (see foodCatalogPlausibility.js).
insert into public.food_reference_catalog
  (name, calories_per_100g, protein_per_100g, category, basis, source_name, source_id, source_url, source_checked_at)
values
  -- was implicitly excluded under grain_carb (kcal ceiling 450, 451 is
  -- 1 over); sweets_snacks (ceiling 620) fits cleanly. NOTE: "בייגלה"
  -- in everyday Israeli usage often means a small savory pretzel-ring
  -- snack, not necessarily American-style bagel chips -- confirm this
  -- is the intended food before applying; rename if not.
  ('בייגלה', 451, 12.3, 'sweets_snacks', 'as_sold',
   'USDA FoodData Central (Survey (FNDDS)) -- Bagel chips',
   '2708292', 'https://fdc.nal.usda.gov/food-details/2708292/nutrients', CURRENT_DATE),
  -- was excluded under fruit (kcal ceiling 350, 354 is 4 over);
  -- nuts_seeds_fats (ceiling 920) fits cleanly and matches how coconut
  -- is nutritionally used.
  ('קוקוס', 354, 3.33, 'nuts_seeds_fats', 'raw',
   'USDA FoodData Central (SR Legacy) -- Nuts, coconut meat, raw',
   '170169', 'https://fdc.nal.usda.gov/food-details/170169/nutrients', CURRENT_DATE),
  -- was excluded under sauce_condiment (protein ceiling 16, 20.7 is
  -- 4.7 over); nuts_seeds_fats (ceiling 35) fits cleanly -- same
  -- category tahini/peanut butter/cashew butter already correctly use.
  ('חמאת שקדים', 641, 20.7, 'nuts_seeds_fats', 'as_sold',
   'USDA FoodData Central (Survey (FNDDS)) -- Almond butter',
   '2707533', 'https://fdc.nal.usda.gov/food-details/2707533/nutrients', CURRENT_DATE),
  -- was excluded under sauce_condiment (protein ceiling 16, 25.9 is
  -- 9.9 over); nuts_seeds_fats fits cleanly. A distinct, reduced-fat
  -- variant alongside the regular חמאת בוטנים row (041) -- optional /
  -- lower priority; drop this row if a separate reduced-fat entry
  -- isn't wanted.
  ('ממרח חמאת בוטנים חלק', 520, 25.9, 'nuts_seeds_fats', 'as_sold',
   'USDA FoodData Central (SR Legacy) -- Peanut butter, smooth, reduced fat',
   '172458', 'https://fdc.nal.usda.gov/food-details/172458/nutrients', CURRENT_DATE),
  -- was excluded under grain_carb (kcal ceiling 450, 464 is 14 over);
  -- sweets_snacks (ceiling 620) fits cleanly.
  ('גרנולה', 464, 9.8, 'sweets_snacks', 'as_sold',
   'USDA FoodData Central (Survey (FNDDS)) -- Cookie, granola',
   '2707933', 'https://fdc.nal.usda.gov/food-details/2707933/nutrients', CURRENT_DATE),
  -- was excluded under grain_carb (kcal ceiling 450 / protein ceiling
  -- 20, both far over); nuts_seeds_fats (920 / 35) fits cleanly.
  ('קמח שקדים', 622.042, 26.24375, 'nuts_seeds_fats', 'raw',
   'USDA FoodData Central (Foundation) -- Flour, almond',
   '2261420', 'https://fdc.nal.usda.gov/food-details/2261420/nutrients', CURRENT_DATE)
on conflict ((lower(name))) do nothing;

-- Guard: confirms this migration's own intended effect -- narrowly
-- scoped to the exact rows it touches, not a whole-table assumption
-- (the lesson from 039's first guard failure).
do $$
declare
  v_bagel_remaining int;
  v_inserted int;
begin
  select count(*) into v_bagel_remaining
  from public.food_reference_catalog
  where lower(name) = lower('בייגל');

  if v_bagel_remaining > 0 then
    raise exception
      'Expected the wrong בייגל row to be deleted, but % still exist. Nothing committed.',
      v_bagel_remaining;
  end if;

  select count(*) into v_inserted
  from public.food_reference_catalog
  where lower(name) in (
    lower('בייגלה'), lower('קוקוס'), lower('חמאת שקדים'),
    lower('ממרח חמאת בוטנים חלק'), lower('גרנולה'), lower('קמח שקדים')
  )
  and source_checked_at = current_date;

  if v_inserted <> 6 then
    raise exception
      'Expected exactly 6 recategorized rows inserted, found %. Nothing committed.',
      v_inserted;
  end if;
end $$;

commit;
