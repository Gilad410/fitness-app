// Builds the final deliverables for the source-based import workflow:
// summary table + full product-level table (CSV) covering every barcode
// across preserved-189, source-provided-ready, exceptions, and the
// beyond-original-pool bonus candidates. Prepares files for review only --
// does not write to production, does not modify the 504.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

const preserved976 = rd('out/PRESERVED_189_976.json')
const preserved24 = rd('out/PRESERVED_189_earlier24.json')
const sourceImport = rd('out/SOURCE_IMPORT_CATEGORIZED.json')
const bonus = rd('out/ADDITIONAL_BEYOND_1000_POOL.json')
const m = rd('out/MASTER_AUDIT_976.json')
const categorization = rd('out/CATEGORIZATION_976.json')
const t24 = rd('ledger/the24_reconciled.json')
function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
function csvBarcode(bc) { return '="' + String(bc) + '"' }

const rows = []

// 1. Preserved-189 (976-cohort)
for (const r of preserved976) {
  rows.push({
    group: 'preserved_verified', barcode: r.barcode, name: r.name, calories: r.storedCalories, protein: r.storedProtein,
    basis: '100g', sourceRef: 'Independent two-reader verification (label photo / manufacturer page)',
    status: 'VERIFIED', exclusionReason: '',
  })
}
// 2. Preserved-189 (earlier-24)
for (const r of preserved24) {
  rows.push({
    group: 'preserved_verified', barcode: r.barcode, name: r.name, calories: r.storedCalories, protein: r.storedProtein,
    basis: '100g', sourceRef: 'Independent two-reader verification (label photo)',
    status: 'VERIFIED', exclusionReason: '',
  })
}
// 3. Source-provided ready (976-cohort)
for (const r of sourceImport.ready_100g) {
  rows.push({
    group: 'source_provided_ready', barcode: r.barcode, name: r.name || r.offName, calories: r.calories, protein: r.protein,
    basis: r.basis, sourceRef: r.sourceRef, status: 'SOURCE_PROVIDED_NOT_INDEPENDENTLY_VERIFIED', exclusionReason: '',
  })
}
for (const r of sourceImport.ready_100ml) {
  rows.push({
    group: 'source_provided_flagged_ml', barcode: r.barcode, name: r.name || r.offName, calories: r.calories, protein: r.protein,
    basis: r.basis, sourceRef: r.sourceRef, status: 'SOURCE_PROVIDED_NOT_INDEPENDENTLY_VERIFIED', exclusionReason: 'Basis is per-100ml, not per-100g; flagged for explicit decision (schema has no separate ml column).',
  })
}
// 4. Exceptions -- known discrepancies (correction_proposed + unresolved_conflict, 976-cohort)
for (const bc of categorization.correction_proposed) {
  const r = m[bc]
  rows.push({
    group: 'exception_known_discrepancy', barcode: bc, name: r.name, calories: r.storedCalories, protein: r.storedProtein,
    basis: '100g', sourceRef: 'Prior evidence-based review', status: 'CORRECTION_PROPOSED', exclusionReason: r.evidence,
  })
}
for (const bc of categorization.unresolved_conflict) {
  const r = m[bc]
  rows.push({
    group: 'exception_known_discrepancy', barcode: bc, name: r.name, calories: r.storedCalories, protein: r.storedProtein,
    basis: '100g', sourceRef: 'Prior evidence-based review', status: 'UNRESOLVED', exclusionReason: r.evidence,
  })
}
// 5. earlier-24 exceptions (the 4 non-preserved)
for (const bc in t24) {
  if (t24[bc].finalOutcome === 'VERIFIED') continue
  const r = t24[bc]
  rows.push({
    group: 'exception_known_discrepancy', barcode: bc, name: r.name, calories: r.storedCalories, protein: r.storedProtein,
    basis: '100g', sourceRef: 'Prior evidence-based review', status: r.finalOutcome, exclusionReason: r.justification,
  })
}
// 6. Missing-data / incompatible-basis / malformed / not-found (976-cohort source-import categorization)
for (const key of ['incompatible_basis', 'missing_data', 'malformed', 'not_found']) {
  for (const r of sourceImport[key]) {
    rows.push({
      group: key, barcode: r.barcode, name: r.name || r.offName || '', calories: r.calories ?? '', protein: r.protein ?? '',
      basis: r.basis || '', sourceRef: 'https://world.openfoodfacts.org/product/' + r.barcode, status: 'EXCLUDED', exclusionReason: r.reason,
    })
  }
}
// 7. Bonus pool beyond the original 1000-candidate scope
for (const r of bonus) {
  rows.push({
    group: 'bonus_beyond_original_pool', barcode: r.barcode, name: r.name, calories: r.calories, protein: r.protein,
    basis: r.basis, sourceRef: r.sourceRef, status: 'SOURCE_PROVIDED_NOT_INDEPENDENTLY_VERIFIED_OUT_OF_SCOPE',
    exclusionReason: 'Outside the original 1000-candidate audit scope -- offered only to help close the 1500 gap; not yet reviewed for name-collision beyond the 504 exact-name check already applied.',
  })
}

// --- Write CSV ---
const headers = ['Group', 'Barcode', 'Name', 'Calories_per_100g_or_ml', 'Protein_per_100g_or_ml', 'Basis', 'SourceReference', 'VerificationStatus', 'ExclusionOrFlagReason']
const csvLines = [headers.join(',')]
for (const r of rows) {
  csvLines.push([
    csvEscape(r.group), csvBarcode(r.barcode), csvEscape(r.name), csvEscape(r.calories), csvEscape(r.protein),
    csvEscape(r.basis), csvEscape(r.sourceRef), csvEscape(r.status), csvEscape(r.exclusionReason),
  ].join(','))
}
writeFileSync(path.join(here, 'out/SOURCE_IMPORT_FULL_TABLE.csv'), '﻿' + csvLines.join('\n'))

// --- Summary ---
const counts = {}
for (const r of rows) counts[r.group] = (counts[r.group] || 0) + 1
const preservedTotal = preserved976.length + preserved24.length
const readyTotal = sourceImport.ready_100g.length + sourceImport.ready_100ml.length
const exceptionTotal = categorization.correction_proposed.length + categorization.unresolved_conflict.length + Object.values(t24).filter(r => r.finalOutcome !== 'VERIFIED').length
const missingIncompatTotal = sourceImport.incompatible_basis.length + sourceImport.missing_data.length + sourceImport.malformed.length + sourceImport.not_found.length
const dupTotal = 0 // no barcode or exact-name duplicates found within scope

const projected1 = 504 + preservedTotal + readyTotal
const projected2 = projected1 + bonus.length

console.log('=== SUMMARY ===')
console.log('Preserved (independently verified, untouched):', preservedTotal)
console.log('Source-provided ready for import (976-cohort, within original scope):', readyTotal, `(of which ${sourceImport.ready_100ml.length} flagged as per-100ml, not silently merged)`)
console.log('Exceptions -- known discrepancies, held for your review, not imported:', exceptionTotal)
console.log('Missing data / incompatible basis / malformed / not found:', missingIncompatTotal)
console.log('Duplicates (barcode or exact-name collision) found within scope:', dupTotal)
console.log('Projected catalog total (504 + preserved + source-ready, within original 1000-candidate scope):', projected1)
console.log('Shortfall vs. 1500 target (within-scope only):', 1500 - projected1)
console.log('---')
console.log('Bonus pool found beyond the original 1000-candidate scope (in already-cached OFF data, clean of 504 name-collisions):', bonus.length)
console.log('Projected catalog total INCLUDING bonus pool:', projected2)
console.log('Shortfall vs. 1500 target (including bonus pool):', 1500 - projected2)
console.log('---')
console.log('Full product-level table written to: out/SOURCE_IMPORT_FULL_TABLE.csv (', rows.length, 'rows )')
