// Consolidates every Hebrew-naming decision into the final candidate list:
// - preserved-189: keep Hebrew name as-is, or use the prepared translation,
//   or exclude (4 cases) if no confident Hebrew name could be established.
// - source-provided-720: keep Hebrew name as-is (367), promote+fix OFF's
//   own nameHe (71), use the agent-prepared translation (274), or exclude
//   (8 cases) if no confident Hebrew name could be established.
// Then re-checks case-insensitive collisions on the FINAL Hebrew `name`
// value specifically (the English-name check does not catch collisions
// that only appear after translation).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

const HEB = /[֐-׿]/

const preserved976 = rd('out/PRESERVED_189_976.json')
const preserved24 = rd('out/PRESERVED_189_earlier24.json')
const preservedTranslations = rd('out/PRESERVED_HEBREW_TRANSLATIONS.json')

const finalPreserved = []
const excludedFromNaming = []

for (const r of [...preserved976, ...preserved24]) {
  if (HEB.test(r.name)) {
    finalPreserved.push({ ...r, hebrewName: r.name, nameSource: 'already_hebrew' })
  } else if (preservedTranslations.translations[r.barcode]) {
    finalPreserved.push({ ...r, hebrewName: preservedTranslations.translations[r.barcode], nameSource: 'translated' })
  } else if (preservedTranslations.excluded[r.barcode]) {
    excludedFromNaming.push({ barcode: r.barcode, name: r.name, group: 'preserved', reason: preservedTranslations.excluded[r.barcode] })
  } else {
    excludedFromNaming.push({ barcode: r.barcode, name: r.name, group: 'preserved', reason: 'לא נמצא תרגום עברי -- שגיאת עיבוד, יש לבדוק ידנית.' })
  }
}

const clean = rd('out/FINAL_READY_CANDIDATES.json')
const promoted = rd('out/PROMOTED_NAMEHE_FINAL.json')
const canPromote = rd('out/CAN_PROMOTE_NAMEHE.json')
const promoteBarcodes = new Set(canPromote.map((c) => c.barcode))
const sourceTranslations = rd('out/SOURCE_TRANSLATIONS_MERGED.json')

const finalSourceProvided = []
for (const c of clean) {
  if (HEB.test(c.name)) {
    finalSourceProvided.push({ ...c, hebrewName: c.name, nameSource: 'already_hebrew' })
  } else if (promoteBarcodes.has(c.barcode)) {
    const override = promoted.overrides[c.barcode]
    const original = canPromote.find((x) => x.barcode === c.barcode)
    finalSourceProvided.push({ ...c, hebrewName: override || original.nameHe, nameSource: override ? 'off_source_name_he_enhanced' : 'off_source_name_he' })
  } else if (sourceTranslations.translations[c.barcode]) {
    finalSourceProvided.push({ ...c, hebrewName: sourceTranslations.translations[c.barcode], nameSource: 'translated' })
  } else if (sourceTranslations.excluded[c.barcode]) {
    excludedFromNaming.push({ barcode: c.barcode, name: c.name, group: 'source_provided', reason: sourceTranslations.excluded[c.barcode] })
  } else {
    excludedFromNaming.push({ barcode: c.barcode, name: c.name, group: 'source_provided', reason: 'לא נמצא תרגום עברי -- שגיאת עיבוד, יש לבדוק ידנית.' })
  }
}

console.log('Final preserved (with Hebrew name):', finalPreserved.length, '| excluded from naming (preserved):', excludedFromNaming.filter((e) => e.group === 'preserved').length)
console.log('Final source-provided (with Hebrew name):', finalSourceProvided.length, '| excluded from naming (source):', excludedFromNaming.filter((e) => e.group === 'source_provided').length)

// --- Re-check case-insensitive collisions on the FINAL Hebrew name ---
const allFinal = [
  ...finalPreserved.map((r) => ({ barcode: r.barcode, name: r.hebrewName, group: 'preserved' })),
  ...finalSourceProvided.map((r) => ({ barcode: r.barcode, name: r.hebrewName, group: 'source_provided' })),
]
const byName = new Map()
for (const r of allFinal) {
  const key = r.name.trim().toLowerCase()
  if (!byName.has(key)) byName.set(key, [])
  byName.get(key).push(r)
}
const collisionGroups = [...byName.entries()].filter(([, rows]) => rows.length > 1)
console.log('\nNEW collisions found on final Hebrew names:', collisionGroups.length, 'groups')
for (const [name, rows] of collisionGroups) console.log(' -', name, '|', rows.map((r) => r.barcode + '/' + r.group).join(', '))

// Resolve: keep preserved side, exclude source_provided side; if both source_provided, exclude both
const newlyExcludedForCollision = []
const excludeBarcodesFinal = new Set()
for (const [name, rows] of collisionGroups) {
  const hasPreserved = rows.some((r) => r.group === 'preserved')
  if (hasPreserved) {
    for (const r of rows.filter((r) => r.group === 'source_provided')) {
      excludeBarcodesFinal.add(r.barcode)
      newlyExcludedForCollision.push({ barcode: r.barcode, name: r.name, group: r.group, reason: `התנגשות שם (לא תלוית רישיות) עם מוצר מאומת קיים ברשימה: "${name}" -- הוצא כדי לשמר את קבוצת ה-189 המאומתים ללא שינוי.` })
    }
  } else {
    for (const r of rows) {
      excludeBarcodesFinal.add(r.barcode)
      newlyExcludedForCollision.push({ barcode: r.barcode, name: r.name, group: r.group, reason: `התנגשות שם (לא תלוית רישיות) עם מוצר חדש אחר ברשימה: "${name}" (${rows.filter((x) => x.barcode !== r.barcode).map((x) => x.barcode).join(',')}) -- שני הצדדים הוצאו, נדרשת החלטה ידנית.` })
    }
  }
}

const finalPreservedClean = finalPreserved.filter((r) => !excludeBarcodesFinal.has(r.barcode))
const finalSourceProvidedClean = finalSourceProvided.filter((r) => !excludeBarcodesFinal.has(r.barcode))

console.log('\nAfter final-Hebrew-name collision resolution:')
console.log('  preserved:', finalPreservedClean.length, '(excluded for collision:', finalPreserved.length - finalPreservedClean.length, ')')
console.log('  source_provided:', finalSourceProvidedClean.length, '(excluded for collision:', finalSourceProvided.length - finalSourceProvidedClean.length, ')')

writeFileSync(path.join(here, 'out/HEBREW_FINAL_PRESERVED.json'), JSON.stringify(finalPreservedClean, null, 2))
writeFileSync(path.join(here, 'out/HEBREW_FINAL_SOURCE_PROVIDED.json'), JSON.stringify(finalSourceProvidedClean, null, 2))
writeFileSync(path.join(here, 'out/HEBREW_NAMING_EXCLUSIONS.json'), JSON.stringify([...excludedFromNaming, ...newlyExcludedForCollision], null, 2))

console.log('\n=== FINAL TOTALS ===')
console.log('Proposed for import:', finalPreservedClean.length + finalSourceProvidedClean.length, '(', finalPreservedClean.length, 'preserved +', finalSourceProvidedClean.length, 'source-provided)')
console.log('Excluded (naming + collision):', excludedFromNaming.length + newlyExcludedForCollision.length)
console.log('Projected catalog total (504 +', finalPreservedClean.length + finalSourceProvidedClean.length, '):', 504 + finalPreservedClean.length + finalSourceProvidedClean.length)
