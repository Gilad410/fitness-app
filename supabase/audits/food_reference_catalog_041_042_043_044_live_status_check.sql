-- Read-only live-status check for migrations 041, 042, 043, and 044. Safe
-- to run any time, any number of times -- never writes anything. Checks
-- actual row VALUES, not just row presence, since presence alone cannot
-- distinguish "041 applied" from "041 never applied" for a row that
-- exists either way (e.g. חזה עוף צלוי exists regardless -- only its
-- calories/protein differ).
--
-- === 044: N/A -- no file exists, nothing to check ===
-- No 044 migration file exists in this repo. One was drafted
-- (044_food_reference_catalog_banana_chips_recategorization.sql, added by
-- commit 9dcc419) and explicitly deleted five minutes later, in the same
-- session, by commit f695ee9, whose own message states: "Per explicit
-- instruction: removed banana chips (044) entirely from the proposed
-- batch -- deleted the migration file and its 6 tests, not just
-- deprioritized... No Supabase changes, no migration applied, no merge,
-- no deployment." Confirmed via `ls supabase/sql/044*` (no matches) and
-- `git log --all --diff-filter=A --name-only -- 'supabase/sql/044*'`
-- (exactly one file ever added with that prefix, and it's the deleted
-- one). Its target row's name ("בננה מיובשת (צ'יפס בננה)", dried
-- banana/banana chips) does not collide with any other migration's
-- inserts either (checked 004-041; only "בננה" (fresh banana, unrelated)
-- and "עוגת בננה" (banana cake, unrelated) exist) -- so there is no
-- pre-existing row it could have silently no-op'd against even if it had
-- been run, unlike 042/043. There is therefore no live status to check
-- for 044: it isn't "applied" or "pending", it's retired. The
-- banana_chips_row_present column below is included only as a live,
-- positive confirmation of that conclusion (expected: 0, always -- 044
-- was deleted before its own draft ever named a value anyone could have
-- typed into the SQL Editor).

select
  -- === 041 ===
  -- Applied: 165 / 31.02. Not applied (current live value, per the
  -- original wrong USDA match): 79 / 16.79.
  (select calories_per_100g from public.food_reference_catalog where lower(name) = lower('חזה עוף צלוי')) as chicken_breast_calories,
  (select protein_per_100g from public.food_reference_catalog where lower(name) = lower('חזה עוף צלוי')) as chicken_breast_protein,
  -- Applied: both 0 (deleted). Not applied: both 1 (still live).
  (select count(*) from public.food_reference_catalog where lower(name) = lower('יוגורט אפרסק')) as chobani_peach_yogurt_still_present,
  (select count(*) from public.food_reference_catalog where lower(name) = lower('עוגיות ג''ינג''ר')) as archway_ginger_cookies_still_present,

  -- === 042 (corrected: DO UPDATE) ===
  -- Applied: source_id = '2707408' -- now true whether the row arrived
  -- via a fresh INSERT or (the real, live case) an ON-CONFLICT-triggered
  -- UPDATE against the pre-existing hand-entered row. Not applied: NULL.
  (select source_id from public.food_reference_catalog where lower(name) = lower('פלאפל')) as falafel_source_id,

  -- === 043 (corrected: DO UPDATE) ===
  -- Applied: 0 (deleted). Not applied: 1 (still live, wrong match).
  (select count(*) from public.food_reference_catalog where lower(name) = lower('בייגל')) as wrong_bagel_still_present,
  -- Applied: source_id set for all 6 names -- the 2 genuinely-new names
  -- (no pre-existing row) and the 4 that collide with pre-existing
  -- hand-entered rows now converge the same way, since DO UPDATE (not DO
  -- NOTHING) is used. Not applied: all 6 NULL/absent.
  (select source_id from public.food_reference_catalog where lower(name) = lower('ממרח חמאת בוטנים חלק')) as reduced_fat_peanut_butter_source_id,
  (select source_id from public.food_reference_catalog where lower(name) = lower('קמח שקדים')) as almond_flour_source_id,
  (select source_id from public.food_reference_catalog where lower(name) = lower('בייגלה')) as beigale_source_id,
  (select source_id from public.food_reference_catalog where lower(name) = lower('קוקוס')) as coconut_source_id,
  (select source_id from public.food_reference_catalog where lower(name) = lower('חמאת שקדים')) as almond_butter_source_id,
  (select source_id from public.food_reference_catalog where lower(name) = lower('גרנולה')) as granola_source_id,

  -- === 044: retired, never applied (see note above) ===
  (select count(*) from public.food_reference_catalog where lower(name) = lower('בננה מיובשת (צ''יפס בננה)')) as banana_chips_row_present;

-- How to read the result:
--   041 applied  <=> chicken_breast_calories = 165 (not 79)
--   042 applied  <=> falafel_source_id = '2707408' (not NULL)
--   043 applied  <=> wrong_bagel_still_present = 0 AND all 6 of
--     reduced_fat_peanut_butter_source_id / almond_flour_source_id /
--     beigale_source_id / coconut_source_id / almond_butter_source_id /
--     granola_source_id are NOT NULL
--   044          <=> N/A. banana_chips_row_present should read 0 no
--     matter what -- there is no migration file left that could have
--     put a row there, applied or not.
--
-- Note: the corrected 042/043 (DO UPDATE) no longer have a "ran but
-- silently no-op'd" state to detect the way the original DO NOTHING
-- drafts did -- source_id now lands whenever the migration is actually
-- executed, full stop. That diagnostic signature is kept only in the
-- git history / audit report for the record of what the original bug
-- looked like, not in this live check anymore (there is nothing partial
-- left for it to distinguish).
