// Dry-run orchestrator for the Open Food Facts (Israel) import. Reads
// the raw, preserved API responses under raw/ (v2 search pages) and
// raw_individual/ (individual-product lookups, used once the search
// endpoint's block was found -- see the dry-run report), maps +
// validates every product, dedupes against the live catalog, within
// the batch, and against each other, and writes:
//   out/dry_run_report.json  -- exact counts, reasons, nothing guessed
//   supabase/sql/050+..._openfoodfacts_israel_batchNNN.sql  -- draft
//     migration files, NOT run against Supabase by this script or by me.
//
// NO DATABASE WRITE OF ANY KIND HAPPENS HERE. No Supabase client is
// even imported. This script only reads local JSON files and writes
// local JSON/markdown/SQL files.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mapOffProductToCandidate } from '../../src/features/nutrition/lib/openFoodFactsCandidateMapping.js'
import { validateImportCandidate } from '../../src/features/nutrition/lib/foodCatalogImportValidation.js'
import { dedupeImportBatch, findLiveCatalogCollisions } from '../../src/features/nutrition/lib/foodCatalogImportDedup.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const rawDir = path.join(here, 'raw')
const rawIndividualDir = path.join(here, 'raw_individual')
const outDir = path.join(here, 'out')

// --- 1. Load raw pages (v2 search) + individual product lookups --------
let allProducts = []
let goodPages = 0
let badPages = []
for (const f of readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort()) {
  const filePath = path.join(rawDir, f)
  const retrievedAt = statSync(filePath).mtime.toISOString().slice(0, 10)
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!Array.isArray(parsed.products)) throw new Error('no products array')
    goodPages++
    for (const p of parsed.products) allProducts.push({ product: p, retrievedAt })
  } catch {
    badPages.push(f)
  }
}
let individualFetched = 0
if (existsSync(rawIndividualDir)) {
  for (const f of readdirSync(rawIndividualDir).filter((f) => f.endsWith('.json'))) {
    const filePath = path.join(rawIndividualDir, f)
    const retrievedAt = statSync(filePath).mtime.toISOString().slice(0, 10)
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
      if (parsed.status === 0 || !parsed.product) continue // OFF's own "not found" shape
      allProducts.push({ product: parsed.product, retrievedAt })
      individualFetched++
    } catch {
      /* skip unreadable file */
    }
  }
}

// --- 2. Load live-catalog dedup baseline --------------------------------
const liveCatalog = JSON.parse(readFileSync(path.join(outDir, 'live_catalog_names_504.json'), 'utf8'))
const liveNames = new Set(liveCatalog.names)

// --- 3. Map + validate every raw product --------------------------------
// Quarantine (per requirement: "quarantine products whose nutritional
// basis is ambiguous") is kept SEPARATE from hard structural rejects
// (missing name/barcode/energy/protein entirely) -- these are real,
// otherwise-complete products whose basis just can't be confirmed as
// per-100g, preserved here for future review rather than only counted.
const QUARANTINE_REASONS = [
  'no nutrition_data_per basis stated -- cannot confirm this is per-100g',
]
const mappingRejections = {}
const quarantinedAmbiguousBasis = []
const validationRejections = {}
const needsReviewList = []
const mappedCandidates = []

for (const { product, retrievedAt } of allProducts) {
  const mapped = mapOffProductToCandidate(product, { retrievedAt })
  if (mapped.rejected) {
    if (QUARANTINE_REASONS.includes(mapped.reason)) {
      quarantinedAmbiguousBasis.push({ barcode: mapped.code, name: product.product_name || product.product_name_he || null, reason: mapped.reason })
    } else {
      mappingRejections[mapped.reason] = (mappingRejections[mapped.reason] || 0) + 1
    }
    continue
  }
  const validated = validateImportCandidate(mapped.candidate)
  if (!validated.valid) {
    for (const e of validated.errors) {
      if (e.includes('measurement basis is')) {
        quarantinedAmbiguousBasis.push({ barcode: mapped.candidate.barcode, name: mapped.candidate.name, reason: e, statedBasis: mapped.candidate.measurementBasis })
      } else {
        validationRejections[e] = (validationRejections[e] || 0) + 1
      }
    }
    continue
  }
  if (validated.needsReview) {
    needsReviewList.push({ ...mapped.candidate, macroCheck: validated.macroCheck })
    continue // flagged for manual review, not auto-imported -- requirement 4/6
  }
  mappedCandidates.push(mapped.candidate)
}

// --- 4. Dedup -- against the live catalog, then within the batch ---------
// Uses the tested foodCatalogImportDedup.js module (not inline logic) --
// its within-batch name-collision pass is what caught a REAL bug this
// session: public.food_reference_catalog has carried
// `unique index on (lower(name))` since migration 004, independent of
// barcode. Found by testing these draft files against a real Postgres
// engine (PGlite), not just a parser: two genuinely different accepted
// products (different barcode, sometimes different brand) can share an
// identical bare name (e.g. two brands' "Honey"). Only the first of any
// collision is kept; the rest are reported for manual disambiguation
// (e.g. renaming with the brand appended), never silently imported to
// fail against a real constraint, silently dropped, or silently renamed.
const liveFiltered = findLiveCatalogCollisions(mappedCandidates, liveNames)
const liveCollisions = liveFiltered.collisions
const dedupResult = dedupeImportBatch(liveFiltered.kept)
const barcodeDuplicates = dedupResult.barcodeDuplicates
const packageSizeDuplicates = dedupResult.packageSizeDuplicates
const nameCollisionsWithinBatch = dedupResult.nameCollisions

// --- 4b. Manual verification exclusions --------------------------------
// A tiny, hand-maintained list of barcodes pulled from the accepted
// batch because the 50-item manual review found a real, documented
// conflict against an external source (see
// manual_verification_exclusions.json for the exact reasoning per
// item) -- quarantined, not silently dropped: the file and its reasons
// are preserved for review, and any future re-run of this script
// re-applies the same exclusion until someone resolves it.
const manualExclusionsPath = path.join(here, 'manual_verification_exclusions.json')
const manualExclusions = existsSync(manualExclusionsPath) ? JSON.parse(readFileSync(manualExclusionsPath, 'utf8')) : []
const manualExclusionBarcodes = new Set(manualExclusions.map((e) => e.barcode))
const finalAccepted = dedupResult.kept.filter((c) => !manualExclusionBarcodes.has(c.barcode))
const manuallyExcludedCount = dedupResult.kept.length - finalAccepted.length

// --- 5. Report -------------------------------------------------------------
const report = {
  generatedAt: new Date().toISOString(),
  rawPages: { good: goodPages, bad: badPages.length, badFiles: badPages },
  individualProductsFetched: individualFetched,
  totalRawProductsConsidered: allProducts.length,
  liveCatalogBaseline: liveCatalog.count,
  rejectedAtMapping: { count: Object.values(mappingRejections).reduce((a, b) => a + b, 0), reasons: mappingRejections },
  quarantinedAmbiguousBasis: { count: quarantinedAmbiguousBasis.length, sample: quarantinedAmbiguousBasis.slice(0, 20) },
  rejectedAtValidation: { count: Object.values(validationRejections).reduce((a, b) => a + b, 0), reasons: validationRejections },
  needsReview: { count: needsReviewList.length, sample: needsReviewList.slice(0, 10).map((c) => ({ name: c.name, barcode: c.barcode, macroCheck: c.macroCheck })) },
  liveCatalogCollisions: { count: liveCollisions.length, items: liveCollisions },
  barcodeDuplicatesWithinBatch: { count: barcodeDuplicates.length, items: barcodeDuplicates },
  packageSizeDuplicates: { count: packageSizeDuplicates.length, sample: packageSizeDuplicates.slice(0, 20) },
  nameCollisionsWithinBatch: { count: nameCollisionsWithinBatch.length, items: nameCollisionsWithinBatch },
  manuallyExcludedAfterVerificationConflict: { count: manuallyExcludedCount, items: manualExclusions },
  finalAcceptedCount: finalAccepted.length,
  finalAcceptedWithCategory: finalAccepted.filter((c) => c.category).length,
  projectedFinalCatalogCount: liveCatalog.count + finalAccepted.length,
}

writeFileSync(path.join(outDir, 'dry_run_report.json'), JSON.stringify(report, null, 2))
writeFileSync(path.join(outDir, 'accepted_candidates.json'), JSON.stringify(finalAccepted, null, 2))
writeFileSync(path.join(outDir, 'needs_review_candidates.json'), JSON.stringify(needsReviewList, null, 2))
writeFileSync(path.join(outDir, 'quarantined_ambiguous_basis.json'), JSON.stringify(quarantinedAmbiguousBasis, null, 2))
writeFileSync(path.join(outDir, 'name_collisions_within_batch.json'), JSON.stringify(nameCollisionsWithinBatch, null, 2))

console.log(JSON.stringify(report, null, 2))

// --- 6. Draft migration file(s) -- NOT run, NOT committed -------------
function sqlEscape(str) {
  return String(str).replace(/'/g, "''")
}
function sqlText(value) {
  return value === null || value === undefined ? 'null' : `'${sqlEscape(value)}'`
}
function sqlNumber(value) {
  return value === null || value === undefined ? 'null' : String(value)
}

const CHUNK_SIZE = 200
const sqlDir = path.resolve(here, '../../supabase/sql')
const batches = []
for (let i = 0; i < finalAccepted.length; i += CHUNK_SIZE) batches.push(finalAccepted.slice(i, i + CHUNK_SIZE))

batches.forEach((batch, idx) => {
  const batchNum = idx + 1
  const migrationNumber = 50 + idx // 050, 051, ... -- continues after 049
  const fileName = `${String(migrationNumber).padStart(3, '0')}_food_reference_catalog_openfoodfacts_israel_batch${batchNum}.sql`
  const rows = batch
    .map(
      (c) =>
        `  (${sqlText(c.name)}, ${sqlNumber(c.caloriesPer100g)}, ${sqlNumber(c.proteinPer100g)}, ${sqlText('Open Food Facts')}, ${sqlText(c.barcode)}, ${sqlText(c.sourceUrl)}, ${sqlText(c.retrievedAt)}, ${sqlText(c.category)}, ${sqlText(c.source)}, ${sqlText(c.externalId)}, ${sqlText(c.barcode)}, ${sqlText(c.nameHe)}, ${sqlText(c.nameEn)}, ${sqlText(c.brand)}, ${sqlText('as_sold')}, ${sqlText('unverified')})`,
    )
    .join(',\n')

  const sql = `-- Food Reference Catalog -- Open Food Facts (Israel) Import, Batch ${batchNum} of ${batches.length}
-- (DRAFT, NOT yet applied -- generated by a dry run, not run against
-- Supabase by this script or by me).
--
-- Run this file manually, once, in the Supabase Dashboard -> SQL
-- Editor, after 049_food_reference_catalog_multi_source_infrastructure.sql
-- (confirmed applied). Independent of any other pending migration --
-- every row here is a genuinely NEW barcode-identified product, none
-- collide with the live catalog by name (checked against a real
-- reconstruction of the confirmed-live 504-row catalog) and none
-- collide with each other by name either (a real bug this session found
-- by testing against an actual Postgres engine, not just a parser --
-- two different real products sharing one bare name, e.g. two brands'
-- "Honey", would otherwise violate the table's own pre-existing unique
-- index on lower(name), live since migration 004 -- see
-- scripts/food-catalog-import/out/name_collisions_within_batch.json for
-- the full list of what was excluded and why).
--
-- Source: Open Food Facts (https://world.openfoodfacts.org). Barcodes
-- discovered via the Search-a-licious service
-- (search.openfoodfacts.org, countries_tags:"en:israel" -- an index
-- that is itself STALE, last indexed 2024-10-26 per its own
-- last_indexed_datetime field, and does not expose nutrition_data_per
-- at all); every row's actual nutrition data below was then fetched
-- individually and freshly from world.openfoodfacts.org's per-product
-- endpoint (/api/v2/product/{barcode}.json, confirmed NOT subject to
-- the block that affects /api/v2/search -- see the dry-run report),
-- which DOES carry nutrition_data_per, so every row's basis is real and
-- current, not carried over from the stale discovery index. Data
-- licensed under the Open Database License (ODbL) -- see
-- https://opendatacommons.org/licenses/odbl/1-0/ and
-- https://world.openfoodfacts.org/data -- attribution preserved
-- per-row via source_url/source_id below.
--
-- Every row: verification_status = 'unverified' (community_source, per
-- requirement 5 -- these are crowd-sourced label transcriptions, never
-- described as independently verified by this import). category (039)
-- is populated where Open Food Facts' own categories_tags matched a
-- known rule (see mapCategoriesTagsToInternalCategory in
-- openFoodFactsCandidateMapping.js), left NULL otherwise -- a real,
-- disclosed best-effort mapping, not a guess for rows with no match.
-- basis (039) is left NULL: this catalog's basis enum
-- (raw/cooked/grilled/.../as_sold) does not have values expressive
-- enough for OFF's own as-sold/as-prepared distinction without
-- conflating them, and no cooked value is ever inferred from a dry one
-- -- see the dry-run report's preparation-state section. preparation_state
-- (049) = 'as_sold' uniformly -- the nutrition label on a retail
-- package is definitionally the as-sold state for the barcode being
-- imported; no cooked/dry conversion is performed or implied. A
-- product offering a distinct, source-reported "as prepared" figure
-- (found rarely, e.g. a cocoa drink powder) is NOT imported as a
-- second row here -- 049's barcode uniqueness is per-barcode, not
-- per-(barcode, preparation_state), so a second row would collide;
-- capturing both states properly is a follow-up schema change, not
-- done in this batch.
--
-- Raw source responses preserved at
-- scripts/food-catalog-import/raw/ and raw_individual/ (not committed
-- -- see .gitignore and the dry-run report's attribution/redistribution
-- discussion) for reproducibility, per requirement 1.

begin;

insert into public.food_reference_catalog
  (name, calories_per_100g, protein_per_100g, source_name, source_id, source_url, source_checked_at, category,
   source, external_id, barcode, name_he, name_en, brand, preparation_state, verification_status)
values
${rows}
on conflict (barcode) where barcode is not null do nothing;

-- Guard: confirms this batch's own expected row count landed (a
-- pure idempotency check -- ON CONFLICT DO NOTHING above means a
-- second run of this exact file inserts 0 new rows, which is expected
-- and NOT a failure; this guard only fires if fewer than expected
-- exist counting first-run-or-already-applied, i.e. if something
-- besides a clean re-run interfered).
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.food_reference_catalog
  where source = 'openfoodfacts'
    and barcode in (${batch.map((c) => sqlText(c.barcode)).join(', ')});

  if v_count <> ${batch.length} then
    raise exception
      'Expected % Open Food Facts rows (batch ${batchNum}) to exist after this migration, found %. Nothing committed.',
      ${batch.length}, v_count;
  end if;
end $$;

commit;
`
  writeFileSync(path.join(sqlDir, fileName), sql)
  console.log(`Wrote draft migration: supabase/sql/${fileName} (${batch.length} rows)`)
})
