-- Food Reference Catalog Post-Deployment Corrections milestone.
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL Editor,
-- after 040_food_reference_catalog_usda_verified_expansion.sql.
--
-- Context: after 039/040 were applied and the site deployed, the live
-- value for חזה עוף צלוי (79 kcal / 16.79g protein) was reported as
-- nutritionally implausible for "roasted chicken breast". Investigated
-- by fetching its exact stored source_url (fdcId 172963) live: the
-- matcher had picked "Chicken breast, oven-roasted, fat-free, sliced" --
-- a lean, pre-sliced deli product, not the plain roasted breast the
-- Hebrew name means. A read-only plausibility audit of all 490 verified
-- rows (implied-fat-content check, plus a new automated scan for named
-- commercial brands in source_name -- added to foodCatalogValidation.js
-- as GROCERY_BRAND_PATTERN after this investigation) found 5 more rows
-- with the same class of error, individually reviewed and resolved
-- below. This migration corrects 4 confirmed wrong matches with freshly
-- live-verified USDA replacement values, removes 2 rows whose only
-- close USDA match names a specific commercial brand (CHOBANI, Archway
-- -- not a generic food, and no clean non-branded alternative exists),
-- and deliberately leaves a 7th, lower-confidence row (יוגורט טבעי)
-- untouched rather than guessing -- flagged for a human decision, not
-- silently corrected.
--
-- Per explicit instruction, the current production values for these 6
-- rows (7 counting יוגורט טבעי, left alone) must be treated as
-- unreliable until this migration is reviewed and applied.
--
-- Transaction safety: wrapped in begin;/commit; (the same pattern
-- 039 settled on after three earlier failures) -- if anything below
-- doesn't match what's expected, the whole transaction rolls back with
-- nothing partially applied. This migration is narrowly scoped to 6
-- specific named rows (unlike 039's earlier mistake of asserting
-- something about the WHOLE table), so the row-count guard at the end
-- is safe and meaningful: it is checking this migration's own intended
-- effect, not making assumptions about unrelated data.
--
-- Summary:
--   * 4 rows corrected to verified USDA values: חזה עוף צלוי, מוצרלה,
--     חמאת בוטנים, יוגורט יווני 0% -- category/basis unchanged, only
--     calories/protein/source_* updated to the newly-verified record.
--   * 2 rows DELETED: יוגורט אפרסק, עוגיות ג'ינג'ר -- the closest USDA
--     match for each names a specific commercial brand (CHOBANI,
--     Archway respectively), not a generic food, and no clean
--     non-branded/non-babyfood alternative was found. Safe: this table
--     has no foreign key from trainee_nutrition_logs or public.foods
--     (see 003_nutrition.sql) -- removing a reference-catalog row never
--     touches any historical log.
--   * 1 row deliberately left UNCHANGED: יוגורט טבעי (currently 50.0015
--     kcal / 4.22675g protein, "Yogurt, plain, nonfat", fdcId 2647437).
--     A more representative candidate exists (fdcId 171284, "Yogurt,
--     plain, whole milk", 61/3.47) but this catalog already has a
--     separate יוגורט דל שומן (low-fat) entry, and "natural/plain"
--     doesn't unambiguously mean either fat level -- a judgment call,
--     not a clear error like the other 4, so left for your decision
--     rather than guessed. No SQL touches this row.

begin;

-- Correct the 4 confirmed wrong matches to freshly live-verified USDA
-- values. category/basis are unchanged (same conceptual food and
-- preparation state -- only the specific matched product/cut changed).
update public.food_reference_catalog as f set
  calories_per_100g = v.calories_per_100g,
  protein_per_100g = v.protein_per_100g,
  source_name = v.source_name,
  source_id = v.source_id,
  source_url = v.source_url,
  source_checked_at = current_date
from (values
  -- was: 79 kcal / 16.79g, fdcId 172963, "Chicken breast, oven-roasted,
  -- fat-free, sliced" -- a lean deli product, not plain roasted breast.
  ('חזה עוף צלוי', 165, 31.02,
   'USDA FoodData Central (SR Legacy) -- Chicken, broilers or fryers, breast, meat only, cooked, roasted',
   '171477', 'https://fdc.nal.usda.gov/food-details/171477/nutrients'),
  -- was: 141 kcal / 31.7g, fdcId 169051, "Cheese, mozzarella, nonfat" --
  -- generic mozzarella should default to the regular/whole-milk variant.
  ('מוצרלה', 299, 22.17,
   'USDA FoodData Central (SR Legacy) -- Cheese, mozzarella, whole milk',
   '170845', 'https://fdc.nal.usda.gov/food-details/170845/nutrients'),
  -- was: 520 kcal / 25.9g, fdcId 172458, "Peanut butter, smooth,
  -- reduced fat" -- generic peanut butter should default to regular.
  ('חמאת בוטנים', 598, 22.2,
   'USDA FoodData Central (Survey (FNDDS)) -- Peanut butter',
   '2707537', 'https://fdc.nal.usda.gov/food-details/2707537/nutrients'),
  -- was: 93 kcal / 7.64g, fdcId 172199, "Yogurt, Greek, 2% fat, mango,
  -- CHOBANI" -- a branded, mango-flavored, 2%-fat product for a query
  -- that explicitly asked for plain 0% (nonfat) Greek yogurt. Found by
  -- the new GROCERY_BRAND_PATTERN scan, not the original manual review.
  ('יוגורט יווני 0%', 61, 10,
   'USDA FoodData Central (Foundation) -- Yogurt, Greek, plain, nonfat',
   '330137', 'https://fdc.nal.usda.gov/food-details/330137/nutrients')
) as v(name, calories_per_100g, protein_per_100g, source_name, source_id, source_url)
where lower(f.name) = lower(v.name);

-- Remove the 2 rows whose only close USDA match names a specific
-- commercial brand -- not a generic food, and (per the live searches
-- run during investigation) no clean non-branded, non-babyfood
-- alternative exists for either.
delete from public.food_reference_catalog
where lower(name) in (
  lower('יוגורט אפרסק'),          -- was fdcId 171311, "Yogurt, Greek, nonfat, peach, CHOBANI"
  lower('עוגיות ג''ינג''ר')        -- was fdcId 175077, "Archway Home Style Cookies, Reduced Fat Ginger Snaps"
);

-- Guard: confirms this migration's own intended effect actually
-- happened -- narrowly scoped to the 6 named rows above, not an
-- assumption about the rest of the table (unlike 039's first guard
-- attempt, which failed for exactly that reason). Rolls back the whole
-- transaction if either count is off, e.g. a name-matching mismatch
-- (a real risk with Hebrew text and apostrophes/gershayim, as this
-- session's own history shows).
do $$
declare
  v_corrected int;
  v_deleted_remaining int;
begin
  select count(*) into v_corrected
  from public.food_reference_catalog
  where lower(name) in (lower('חזה עוף צלוי'), lower('מוצרלה'), lower('חמאת בוטנים'), lower('יוגורט יווני 0%'))
    and source_id in ('171477', '170845', '2707537', '330137');

  if v_corrected <> 4 then
    raise exception
      'Expected exactly 4 rows corrected with their new source_id, found %. Nothing committed.',
      v_corrected;
  end if;

  select count(*) into v_deleted_remaining
  from public.food_reference_catalog
  where lower(name) in (lower('יוגורט אפרסק'), lower('עוגיות ג''ינג''ר'));

  if v_deleted_remaining > 0 then
    raise exception
      'Expected both branded rows to be deleted, but % still exist. Nothing committed.',
      v_deleted_remaining;
  end if;
end $$;

commit;
