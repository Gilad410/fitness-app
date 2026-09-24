// Applies full-Hebrew transliteration overrides (brand names and product
// lines now transliterated into Hebrew script, not left in Latin), per
// Codex's finding of 116 remaining Latin-script names. Resolves the
// flagged identity conflict (7290019310655) by EXCLUSION, not a guess.
// Re-checks the ENTIRE list (not just the 116) for any remaining Latin
// script and for name collisions on the final fully-Hebrew names.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

const LATIN = /[A-Za-z]/
const overridesData = rd('out/FULL_HEBREW_OVERRIDES.json')
const { overrides, identityConflictExclusion } = overridesData

let preserved = rd('out/HEBREW_FINAL_PRESERVED.json')
let sourceProvided = rd('out/HEBREW_FINAL_SOURCE_PROVIDED.json')
const priorExclusions = rd('out/HEBREW_NAMING_EXCLUSIONS.json')

const newExclusions = []

// Apply overrides + identity-conflict exclusion
preserved = preserved.filter((r) => {
  if (identityConflictExclusion[r.barcode]) {
    newExclusions.push({ barcode: r.barcode, name: r.name, group: 'preserved', reason: identityConflictExclusion[r.barcode] })
    return false
  }
  return true
}).map((r) => (overrides[r.barcode] ? { ...r, hebrewName: overrides[r.barcode], nameSource: r.nameSource + '_transliterated' } : r))

sourceProvided = sourceProvided.filter((r) => {
  if (identityConflictExclusion[r.barcode]) {
    newExclusions.push({ barcode: r.barcode, name: r.name, group: 'source_provided', reason: identityConflictExclusion[r.barcode] })
    return false
  }
  return true
}).map((r) => (overrides[r.barcode] ? { ...r, hebrewName: overrides[r.barcode], nameSource: r.nameSource + '_transliterated' } : r))

// --- Verify zero Latin remains ANYWHERE (not just the flagged 116) ---
const stillLatin = [...preserved, ...sourceProvided].filter((r) => LATIN.test(r.hebrewName))
console.log('Remaining Latin-script names after full transliteration pass:', stillLatin.length)
for (const r of stillLatin) console.log(' -', r.barcode, '|', r.hebrewName)

// --- Re-check collisions on the FINAL fully-Hebrew names ---
const allFinal = [
  ...preserved.map((r) => ({ barcode: r.barcode, name: r.hebrewName, group: 'preserved' })),
  ...sourceProvided.map((r) => ({ barcode: r.barcode, name: r.hebrewName, group: 'source_provided' })),
]
const byName = new Map()
for (const r of allFinal) {
  const key = r.name.trim().toLowerCase()
  if (!byName.has(key)) byName.set(key, [])
  byName.get(key).push(r)
}
const collisionGroups = [...byName.entries()].filter(([, rows]) => rows.length > 1)
console.log('\nCollisions after transliteration:', collisionGroups.length, 'groups')
for (const [name, rows] of collisionGroups) console.log(' -', name, '|', rows.map((r) => r.barcode + '/' + r.group).join(', '))

const excludeForCollision = new Set()
for (const [name, rows] of collisionGroups) {
  const hasPreserved = rows.some((r) => r.group === 'preserved')
  if (hasPreserved) {
    for (const r of rows.filter((r) => r.group === 'source_provided')) {
      excludeForCollision.add(r.barcode)
      newExclusions.push({ barcode: r.barcode, name: r.name, group: r.group, reason: `התנגשות שם (לאחר תעתוק מלא לעברית) עם מוצר מאומת קיים: "${name}"` })
    }
  } else {
    for (const r of rows) {
      excludeForCollision.add(r.barcode)
      newExclusions.push({ barcode: r.barcode, name: r.name, group: r.group, reason: `התנגשות שם (לאחר תעתוק מלא לעברית) עם מוצר חדש אחר: "${name}" (${rows.filter((x) => x.barcode !== r.barcode).map((x) => x.barcode).join(',')})` })
    }
  }
}

const finalPreserved = preserved.filter((r) => !excludeForCollision.has(r.barcode))
const finalSourceProvided = sourceProvided.filter((r) => !excludeForCollision.has(r.barcode))

writeFileSync(path.join(here, 'out/HEBREW_FINAL_PRESERVED.json'), JSON.stringify(finalPreserved, null, 2))
writeFileSync(path.join(here, 'out/HEBREW_FINAL_SOURCE_PROVIDED.json'), JSON.stringify(finalSourceProvided, null, 2))
writeFileSync(path.join(here, 'out/HEBREW_NAMING_EXCLUSIONS.json'), JSON.stringify([...priorExclusions, ...newExclusions], null, 2))

console.log('\n=== FINAL TOTALS (after full transliteration) ===')
console.log('Preserved:', finalPreserved.length, '(was', preserved.length + (identityConflictExclusion['dummy'] ? 0 : 0), ')')
console.log('Source-provided:', finalSourceProvided.length)
console.log('Proposed for import:', finalPreserved.length + finalSourceProvided.length)
console.log('New exclusions this round:', newExclusions.length)
console.log('Total exclusions (all rounds):', priorExclusions.length + newExclusions.length)
console.log('Projected catalog total (504 +', finalPreserved.length + finalSourceProvided.length, '):', 504 + finalPreserved.length + finalSourceProvided.length)
