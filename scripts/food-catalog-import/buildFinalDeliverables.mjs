import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

function csvEscape(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
function csvBarcode(bc) { return '="' + String(bc) + '"' }

const finalRows = rd('out/FINAL_SQL_ROWS.json')

// --- Product-level table (all rows going into the SQL) ---
const headers = ['Barcode', 'Name', 'Calories_per_100g', 'Protein_per_100g', 'Basis', 'SourceReference', 'VerificationStatus']
const lines = [headers.join(',')]
for (const r of finalRows) {
  lines.push([
    csvBarcode(r.barcode), csvEscape(r.name), csvEscape(r.calories), csvEscape(r.protein),
    csvEscape('100g'), csvEscape(r.source_url || 'Independent verification (label photo/manufacturer page)'), csvEscape(r.verification_status),
  ].join(','))
}
writeFileSync(path.join(here, 'out/FINAL_IMPORT_PRODUCT_TABLE.csv'), '﻿' + lines.join('\n'))

// --- Exceptions table: 96 known discrepancies + newly excluded (12 rejected + 11 needsReview + 30 name collisions) ---
const categorization = rd('out/CATEGORIZATION_976.json')
const m = rd('out/MASTER_AUDIT_976.json')
const t24 = rd('ledger/the24_reconciled.json')
const rejected = rd('out/REAL_PIPELINE_REJECTED.json')
const needsReview = rd('out/FINAL_NEEDS_REVIEW.json')
const nameCollisions = rd('out/EXCLUDED_NAME_COLLISIONS.json')

const excRows = []
for (const bc of categorization.correction_proposed) {
  const r = m[bc]
  excRows.push({ barcode: bc, name: r.name, reason: 'CORRECTION_PROPOSED -- ' + r.evidence, category: 'known_discrepancy' })
}
for (const bc of categorization.unresolved_conflict) {
  const r = m[bc]
  excRows.push({ barcode: bc, name: r.name, reason: 'UNRESOLVED (documented conflict) -- ' + r.evidence, category: 'known_discrepancy' })
}
for (const bc in t24) {
  if (t24[bc].finalOutcome === 'VERIFIED') continue
  excRows.push({ barcode: bc, name: t24[bc].name, reason: t24[bc].finalOutcome + ' -- ' + t24[bc].justification, category: 'known_discrepancy' })
}
for (const r of rejected) {
  excRows.push({ barcode: r.barcode, name: '', reason: 'Rejected by import-integrity checks: ' + r.reason, category: 'newly_excluded_failed_checks' })
}
for (const r of needsReview) {
  excRows.push({ barcode: r.barcode, name: r.name, reason: 'Held for review -- macro-consistency (Atwater) check failed: ' + JSON.stringify(r.macroCheck), category: 'newly_excluded_needs_review' })
}
for (const r of nameCollisions) {
  excRows.push({ barcode: r.barcode, name: r.name, reason: r.reason, category: 'newly_excluded_name_collision' })
}

const excHeaders = ['Barcode', 'Name', 'Category', 'Reason']
const excLines = [excHeaders.join(',')]
for (const r of excRows) {
  excLines.push([csvBarcode(r.barcode), csvEscape(r.name), csvEscape(r.category), csvEscape(r.reason)].join(','))
}
writeFileSync(path.join(here, 'out/EXCEPTIONS_TABLE.csv'), '﻿' + excLines.join('\n'))

console.log('=== FINAL DELIVERABLE COUNTS ===')
console.log('Final import product table rows:', finalRows.length, '(', finalRows.filter(r=>r.verification_status==='verified').length, 'verified +', finalRows.filter(r=>r.verification_status==='unverified').length, 'unverified )')
console.log('Exceptions table rows:', excRows.length)
console.log('  known_discrepancy (original 96):', excRows.filter(r=>r.category==='known_discrepancy').length)
console.log('  newly_excluded_failed_checks:', excRows.filter(r=>r.category==='newly_excluded_failed_checks').length)
console.log('  newly_excluded_needs_review:', excRows.filter(r=>r.category==='newly_excluded_needs_review').length)
console.log('  newly_excluded_name_collision:', excRows.filter(r=>r.category==='newly_excluded_name_collision').length)
console.log('Projected catalog total (504 + final import rows):', 504 + finalRows.length)
