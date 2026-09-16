-- Food Reference Catalog Post-Migration Verification (READ-ONLY).
--
-- Run this in the Supabase SQL Editor after 039 + 040. No writes, no
-- transaction needed, safe to run any number of times.
--
-- Expected results are noted inline. Anything that doesn't match is
-- worth flagging back before deploying anything that reads this table.

-- 1. Exact final row count (expected: 349 pre-existing - 113 deleted by
--    039 + 269 inserted by 040 = 505, PLUS however many rows were
--    already outside this migration's known 349 (the ones the 039
--    preflight/report found -- untouched by 039/040 either way).
select count(*) as final_row_count
from public.food_reference_catalog;

-- 2. Exact count of USDA-verified products from this pass -- every row
--    039 corrected or 040 inserted sets source_checked_at to today, so
--    this is the precise "verified this session" count (expected: 490).
select count(*) as usda_verified_count
from public.food_reference_catalog
where source_checked_at = current_date
  and source_name like 'USDA FoodData Central%';

-- 3. Rows OUTSIDE the 490 verified this session (expected: final_row_count
--    - 490 -- these are the pre-existing rows 039 left untouched because
--    they weren't in its known name list; needs_review/excluded items
--    were never inserted at all, so they contribute 0 here by
--    construction, not by filtering).
select count(*) as rows_outside_this_verification_pass
from public.food_reference_catalog
where source_checked_at is distinct from current_date
   or source_name not like 'USDA FoodData Central%'
   or source_name is null;

-- 4. Duplicate names (case-insensitive) -- expected: 0 rows. The unique
--    index (food_reference_catalog_name_idx) already enforces this at
--    the database level, so this should always be empty; included as a
--    direct confirmation.
select lower(name) as duplicate_name, count(*)
from public.food_reference_catalog
group by lower(name)
having count(*) > 1;

-- 5. Duplicate USDA source_id used by 2+ DIFFERENT product names among
--    this session's 490 -- NOT a database constraint (no unique index on
--    source_id), a data-quality question. Expected: 17 groups, already
--    disclosed in the audit report as an open item for your review (not
--    a new finding if this count matches).
select source_id, source_name, array_agg(name order by name) as names, count(*)
from public.food_reference_catalog
where source_checked_at = current_date
group by source_id, source_name
having count(*) > 1
order by count(*) desc;

-- 6. Negative or null calories/protein among this session's 490 rows --
--    expected: 0 rows (the CHECK constraints on calories_per_100g >= 0
--    and protein_per_100g >= 0 already block this at the database
--    level; this is a direct confirmation, not a new gate).
select id, name, calories_per_100g, protein_per_100g
from public.food_reference_catalog
where source_checked_at = current_date
  and (calories_per_100g is null or calories_per_100g < 0
       or protein_per_100g is null or protein_per_100g < 0);

-- 7. Missing source metadata among this session's 490 rows -- expected:
--    0 rows (039/040 set these directly on every row they touch).
select id, name
from public.food_reference_catalog
where source_checked_at = current_date
  and (category is null or basis is null or source_name is null
       or source_id is null or source_url is null);

-- 8. Restaurant-chain, "restaurant"-qualified, or "Fast foods"
--    industry-average records among this session's 490 rows -- expected:
--    0 rows (excluded during matching; this session's own audit already
--    scanned for this against the local files, this confirms the live
--    data matches).
select id, name, source_name
from public.food_reference_catalog
where source_checked_at = current_date
  and (
    source_name ~* 'MCDONALD|KFC|SUBWAY|DENNY|WENDY|BURGER KING|POPEYES|TACO BELL|PIZZA HUT|STARBUCKS|DUNKIN|ARBY|HARDEE|SONIC DRIVE|CHICK-FIL-A|IHOP|APPLEBEE|CHILI''S|OLIVE GARDEN|RED LOBSTER|OUTBACK|DAIRY QUEEN|DOMINO|PAPA JOHN|LONG JOHN|JACK IN THE BOX|CARL''S JR|EL POLLO|WHATABURGER|WAFFLE HOUSE|CRACKER BARREL|BOSTON MARKET|PANERA|CHIPOTLE|FIVE GUYS|SHAKE SHACK'
    or source_name ~* '\yrestaurant\y'
    or source_name ~* '(^|-- )fast[- ]?foods?,'
  );
