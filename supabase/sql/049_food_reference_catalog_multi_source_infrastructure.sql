-- Food Reference Catalog -- Multi-Source Import Infrastructure
-- (DRAFT, NOT yet applied).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL
-- Editor, after 040_food_reference_catalog_usda_verified_expansion.sql
-- (confirmed applied -- see commit 89416f2's documented verification:
-- 505 rows). Does NOT actually depend on 041, 042, or 043 -- none of
-- those touch the schema (they only correct/insert/delete specific
-- rows by name), so this migration's ALTER TABLE/CHECK/index
-- statements are safe to run whether or not any of them have been
-- applied yet. This matters because 041, despite being reviewed,
-- tested, and merged into git (PR #2), turned out NOT to have actually
-- been run against Supabase when this was drafted -- the real
-- preflight for THIS migration returned 505 live rows, not the 503 an
-- earlier draft of this comment assumed; see "The 503 vs. 505
-- discrepancy" in the accompanying audit report
-- (food_reference_catalog_multi_source_audit_2026-09-20.md) for the
-- full investigation. Independent of the barcode-food-logging branch's
-- own 045-048 (already merged to main) -- numbered 049 specifically
-- because 048 is the highest migration number that exists ANYWHERE
-- right now (verified against both this branch's own supabase/sql/ and
-- main's, post-merge) -- not 044, which is what this branch's own
-- local sequence would otherwise suggest, to avoid a future numbering
-- collision when this branch eventually merges.
--
-- Purpose: PURELY ADDITIVE schema/validation infrastructure for a
-- future catalog expansion to >=1,500 verified foods from >=2 sources
-- (USDA FoodData Central, already in use since 005/039/040; a second
-- source such as Open Food Facts, not yet used for this catalog). This
-- migration does NOT insert, update, or delete a single existing row --
-- see the read-only safety report at the end. No food data import
-- happens in this migration; that is deliberately a separate, later
-- step.
--
-- Every new column is NULLABLE with no default that could silently
-- fabricate a value for an existing row -- the 505 rows currently live
-- (see the audit report accompanying this migration) keep exactly
-- their current calories_per_100g/protein_per_100g and simply have
-- NULL in every new column until a future pass backfills them
-- (mirroring exactly how 039 added category/basis/source_* as nullable
-- columns over the then-existing rows, never forcing a value).

begin;

alter table public.food_reference_catalog
  -- Machine-readable source identifier, distinct from the existing
  -- free-text source_name (039) -- e.g. 'usda_fdc', 'openfoodfacts',
  -- 'manual_legacy' (for rows that predate any structured sourcing at
  -- all, including the ~505 existing rows once backfilled). Powers the
  -- (source, external_id) dedup key in requirement 7, which
  -- source_name's free-text citation string cannot reliably do.
  add column if not exists source text,

  -- The source database's own stable identifier for this exact record
  -- (e.g. a USDA FDC id, an Open Food Facts product id for a
  -- barcode-less generic food). Distinct from `barcode` below --
  -- external_id identifies the SOURCE RECORD; barcode identifies the
  -- physical PRODUCT, and only branded/packaged items have one.
  -- Existing rows' source_id (039/040, already populated for the
  -- USDA-verified subset) is NOT renamed or removed -- external_id is
  -- the new, going-forward canonical field; a later, separate backfill
  -- (not this migration) can copy source_id -> external_id for the
  -- rows that already have it, once reviewed.
  add column if not exists external_id text,

  -- Only set for a specific packaged/branded product (a barcode scan
  -- match, e.g. via Open Food Facts) -- null for a generic/generic-USDA
  -- food, exactly like coach_barcode_products.barcode and
  -- trainee_nutrition_logs.barcode (045/046) already treat barcode as
  -- "present only for a real packaged product," never a required field.
  add column if not exists barcode text,

  -- Hebrew/English name split -- the existing `name` column (004)
  -- remains the one column every existing query/search
  -- (foodReferenceCatalogStore.search(), used identically by both the
  -- coach's FoodQuantityPicker.vue and the trainee's
  -- TraineeNutritionView.vue) actually reads; name_he/name_en are
  -- additive metadata for a future bilingual search, never a
  -- replacement -- existing search behavior is unaffected by this
  -- migration.
  add column if not exists name_he text,
  add column if not exists name_en text,

  -- Only meaningful for a branded/packaged product (barcode is not
  -- null) -- null for a generic food, same "only when it applies"
  -- shape as barcode itself.
  add column if not exists brand text,

  -- Explicit preparation state -- overlaps in MEANING with the
  -- existing `basis` column (039: 'raw'/'cooked'/'grilled'/'roasted'/
  -- 'fried'/'boiled'/'baked'/'steamed'/'dried'/'canned_drained'/
  -- 'as_sold') but is intentionally a SEPARATE, unconstrained text
  -- column rather than folded into `basis` -- a future multi-source
  -- import (e.g. Open Food Facts' own "as sold" vs "prepared" fields,
  -- see barcodeNutritionBasis.js's real, live-verified investigation
  -- into that exact distinction for barcode products) may need finer
  -- or source-specific preparation labels than the 11-value `basis`
  -- enum was designed to hold. Existing rows' `basis` is untouched;
  -- preparation_state starts NULL everywhere.
  add column if not exists preparation_state text,

  -- 'unverified' (default -- covers every existing row, since none of
  -- them have been through the NEW review pipeline this infrastructure
  -- is for) / 'verified' (passed validation + plausibility +
  -- macro-consistency review) / 'needs_review' (a real, flagged
  -- inconsistency -- e.g. the calorie/macro cross-check in requirement
  -- 6 -- pending a human decision, never auto-resolved) / 'rejected'
  -- (reviewed and explicitly excluded, kept for audit trail rather
  -- than silently deleted).
  add column if not exists verification_status text
    default 'unverified'
    check (verification_status in ('unverified', 'verified', 'needs_review', 'rejected')),

  add column if not exists last_verified_at timestamptz;

-- Validation safeguards (requirement 5), added to the EXISTING
-- calories_per_100g/protein_per_100g columns -- proven safe against
-- every one of the 505 currently-live rows before being added (not
-- assumed): a full parse of every actually-applied migration (004-040
-- -- 041 has NOT been applied, see this file's own header) found a
-- live maximum of exactly 900.0 kcal/100g (a pure-fat/oil row) and
-- 31.7g protein/100g, and a live minimum of 0 for both (18 rows are
-- genuinely, correctly 0g protein -- oils, sugar, water, candy, jam,
-- chewing gum, condiments, salt, tea, vodka -- foods where zero is a
-- real fact, not a missing-data artifact). Both new bounds are
-- inclusive of the observed extremes, so no existing row is rejected.
alter table public.food_reference_catalog
  add constraint food_reference_catalog_calories_bounds
    check (calories_per_100g >= 0 and calories_per_100g <= 900),
  add constraint food_reference_catalog_protein_bounds
    check (protein_per_100g >= 0 and protein_per_100g <= 100);

-- Prevents a duplicate SOURCE RECORD from being imported twice (the
-- same USDA fdcId, or the same barcode, inserted again) while
-- deliberately allowing legitimate raw/cooked and branded variations
-- to coexist as separate rows (requirement 7) -- those are different
-- external_id/barcode values by construction, since they are different
-- real-world records, not the same one duplicated. Partial (WHERE
-- external_id/barcode is not null) so the 505 existing rows, which
-- have neither set yet, are entirely unaffected -- this is why a
-- plain (not partial) unique index would have been unsafe to add here
-- without a backfill first.
create unique index if not exists food_reference_catalog_source_external_id_idx
  on public.food_reference_catalog (source, external_id)
  where external_id is not null;

create unique index if not exists food_reference_catalog_barcode_idx
  on public.food_reference_catalog (barcode)
  where barcode is not null;

-- No RLS policy change -- food_reference_catalog_select_authenticated
-- (004) already covers every new column (a `select *`-shaped policy
-- has no per-column scope to extend), and nobody writes to this table
-- from the app in either the old or new shape (both this table's own
-- header comment, 004, and every coach/trainee frontend code path
-- confirm read-only client access) -- so RLS is unaffected by this
-- migration and needs no new policy.

-- Safe-by-construction report (read-only, cannot abort this
-- migration -- same discipline as 039's own end-of-file report):
-- confirms every existing row survived untouched (same row count
-- before and after is the caller's own job to compare via the
-- preflight/post-migration checks; this report instead confirms the
-- shape of what's now possible) and that the new bounds reject nothing
-- currently live.
select
  count(*) as total_rows,
  count(*) filter (where calories_per_100g < 0 or calories_per_100g > 900) as rows_violating_new_calorie_bounds,
  count(*) filter (where protein_per_100g < 0 or protein_per_100g > 100) as rows_violating_new_protein_bounds,
  count(*) filter (where source is not null) as rows_with_new_source_set,
  count(*) filter (where external_id is not null) as rows_with_new_external_id_set,
  count(*) filter (where verification_status = 'unverified') as rows_still_unverified
from public.food_reference_catalog;

commit;
