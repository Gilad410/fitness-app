// Dedup passes for a batch of accepted import candidates -- pure, no
// fs/network/Supabase. Three distinct, ordered passes, each catching a
// different real collision class:
//
//   1. dedupeByBarcode -- exact same barcode appearing twice (shouldn't
//      normally happen within one paginated/discovery run, but real
//      duplicates in a merged multi-source fetch are possible).
//   2. dedupeByPackageSize -- the SAME real product at a different
//      package size (e.g. a 1L and 2L carton of identical milk) --
//      different barcode, same name+brand+nutrition, per requirement:
//      "do not count ... package-size copies added merely to meet the
//      target."
//   3. dedupeByName -- the table's OWN pre-existing constraint
//      (`unique index on (lower(name))`, live since migration 004,
//      independent of source/barcode/049): two genuinely DIFFERENT
//      products (different barcode, sometimes different brand) can
//      share an identical bare name (e.g. two brands' "Honey"). Found
//      by testing draft migrations against a real Postgres engine
//      (PGlite), not just a SQL parser -- a parser has no notion of a
//      pre-existing index and would never have caught this.
//
// Each function returns { kept, removed } -- `removed` entries carry
// enough info (name/barcode/what it collided with) to report and
// manually review, never silently discarded with no trace.

export function dedupeByBarcode(candidates) {
  const seen = new Map()
  const kept = []
  const removed = []
  for (const c of candidates) {
    if (seen.has(c.barcode)) {
      removed.push({ name: c.name, barcode: c.barcode, reason: 'duplicate barcode within batch' })
      continue
    }
    seen.set(c.barcode, true)
    kept.push(c)
  }
  return { kept, removed }
}

export function dedupeByPackageSize(candidates) {
  const seen = new Map()
  const kept = []
  const removed = []
  for (const c of candidates) {
    const key = [c.name.trim().toLowerCase(), (c.brand || '').trim().toLowerCase(), c.caloriesPer100g, c.proteinPer100g].join('|')
    if (seen.has(key)) {
      removed.push({ name: c.name, barcode: c.barcode, reason: 'same name+brand+nutrition as an already-kept candidate (package-size variant)', groupKey: key })
      continue
    }
    seen.set(key, c.barcode)
    kept.push(c)
  }
  return { kept, removed }
}

export function dedupeByName(candidates) {
  const seen = new Map()
  const kept = []
  const removed = []
  for (const c of candidates) {
    const key = c.name.trim().toLowerCase()
    if (seen.has(key)) {
      removed.push({ name: c.name, brand: c.brand, barcode: c.barcode, reason: 'name collides with an already-kept candidate (violates the real unique-name index)', collidesWithBarcode: seen.get(key) })
      continue
    }
    seen.set(key, c.barcode)
    kept.push(c)
  }
  return { kept, removed }
}

// Checks candidates' normalized names against a Set of already-live
// catalog names (lowercased) -- requirement 6: never overwrite an
// existing row via unrestricted import; the caller skips these and
// reports them instead.
export function findLiveCatalogCollisions(candidates, liveNamesLowercased) {
  const kept = []
  const collisions = []
  for (const c of candidates) {
    const key = c.name.trim().toLowerCase()
    if (liveNamesLowercased.has(key)) {
      collisions.push({ name: c.name, barcode: c.barcode })
    } else {
      kept.push(c)
    }
  }
  return { kept, collisions }
}

// Runs all three within-batch dedup passes in the documented order,
// returning the final kept list plus every removal, labeled by which
// pass removed it.
export function dedupeImportBatch(candidates) {
  const byBarcode = dedupeByBarcode(candidates)
  const byPackage = dedupeByPackageSize(byBarcode.kept)
  const byName = dedupeByName(byPackage.kept)
  return {
    kept: byName.kept,
    barcodeDuplicates: byBarcode.removed,
    packageSizeDuplicates: byPackage.removed,
    nameCollisions: byName.removed,
  }
}
