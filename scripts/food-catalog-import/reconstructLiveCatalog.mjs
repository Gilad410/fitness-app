// Reconstructs the exact set of names currently live in
// public.food_reference_catalog, WITHOUT any direct database access --
// same methodology already cross-validated multiple times this session
// against real Supabase preflight results (505 post-040, then 504 after
// your confirmed live application of 041 + corrected 042 + corrected
// 043 + 049). Used here as the dedup baseline for the Open Food Facts
// import: every OFF candidate's normalized name is checked against this
// real list before being accepted, per requirement 6 ("compare
// candidates against the existing catalog").
//
// Read-only: only reads local migration files, writes one JSON output
// file. No network, no Supabase connection, nothing committed.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseCatalogValues } from '../../src/features/nutrition/lib/foodCatalogValidation.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const sqlDir = path.resolve(here, '../../supabase/sql')
const read = (f) => readFileSync(path.join(sqlDir, f), 'utf8')

function extractDeletedNames(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker)
  const end = endMarker ? text.indexOf(endMarker, start) : text.length
  const block = text.slice(start, end === -1 ? text.length : end)
  return [...block.matchAll(/lower\('((?:[^'\\]|'')*)'\)/g)].map((m) => m[1].replace(/''/g, "'"))
}

// 1. Pre-039 base: everything live after 005's TRUNCATE+reseed, plus
// 006/007's additions (008 is UPDATE-only, no new names).
const preTruncateNames = new Set(
  [
    ...parseCatalogValues(read('005_food_reference_protein_and_expansion.sql')),
    ...parseCatalogValues(read('006_food_reference_catalog_expansion.sql')),
    ...parseCatalogValues(read('007_food_reference_catalog_corrections.sql')),
  ].map((r) => r.name.toLowerCase()),
)

// 2. 039 deletes 113 unverifiable rows from that base (corrections
// don't change which names exist, only their values).
const text039 = read('039_food_reference_catalog_metadata.sql')
const deleted039 = extractDeletedNames(text039, 'delete from public.food_reference_catalog')
for (const name of deleted039) preTruncateNames.delete(name.toLowerCase())

// 3. 040 inserts 269 new USDA-verified rows.
const inserted040 = parseCatalogValues(read('040_food_reference_catalog_usda_verified_expansion.sql')).map((r) =>
  r.name.toLowerCase(),
)
for (const name of inserted040) preTruncateNames.add(name)

// At this point: the confirmed-live-by-89416f2 baseline, 505 rows.
const post040 = new Set(preTruncateNames)

// 4. 041 (CONFIRMED applied): 4 corrections (no name change), 2
// deletions.
const text041 = read('041_food_reference_catalog_post_deployment_corrections.sql')
const deleted041 = extractDeletedNames(text041, 'delete from public.food_reference_catalog', '-- Guard:')
for (const name of deleted041) post040.delete(name.toLowerCase())

// 5. Corrected 042 (CONFIRMED applied): falafel already existed
// pre-039 (survived as one of the "16 no source" rows) -- its DO
// UPDATE converges the existing row's values, no new name added.
// (No set change needed here -- falafel is already in post040 via the
// pre-039 base, since it was never in 039's deletion list.)

// 6. Corrected 043 (CONFIRMED applied): deletes the wrong בייגל row,
// inserts/updates 6 names -- 4 collide with pre-existing rows (no new
// name), 2 are genuinely new.
post040.delete('בייגל'.toLowerCase())
for (const name of ['ממרח חמאת בוטנים חלק', 'קמח שקדים']) post040.add(name.toLowerCase())

const finalNames = [...post040].sort()

console.log(`Reconstructed live catalog: ${finalNames.length} names (confirmed live count: 504)`)
if (finalNames.length !== 504) {
  console.log('WARNING: reconstructed count does not match the confirmed live count of 504 -- do not trust this dedup baseline until reconciled.')
}

const outPath = path.resolve(here, 'out/live_catalog_names_504.json')
writeFileSync(outPath, JSON.stringify({ count: finalNames.length, names: finalNames }, null, 2))
console.log(`Wrote ${outPath}`)
