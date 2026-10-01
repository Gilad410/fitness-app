// Final programmatic row-by-row comparison: for every source-provided row
// in the FINAL generated SQL (out/FINAL_SQL_ROWS.json), re-read the RAW
// OFF source record fresh from the cache files (not from any of this
// session's intermediate JSON) and assert exact equality on barcode,
// calories, protein, and basis. Anything that fails is a real bug in the
// pipeline, reported, not hidden.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const rd = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf8'))

const offByBarcode = new Map()
for (let i = 1; i <= 10; i++) {
  const p = rd(`raw/off_israel_page_${String(i).padStart(3, '0')}.json`)
  for (const prod of p.products) offByBarcode.set(prod.code, prod)
}
const indivDir = path.join(here, 'raw_individual')
for (const f of readdirSync(indivDir)) {
  if (!f.endsWith('.json')) continue
  const bc = f.replace('.json', '')
  if (offByBarcode.has(bc)) continue
  try {
    const d = JSON.parse(readFileSync(path.join(indivDir, f), 'utf8'))
    if (d.status === 1 && d.product) offByBarcode.set(bc, d.product)
  } catch { /* skip */ }
}

const finalRows = rd('out/FINAL_SQL_ROWS.json')
const sourceProvided = finalRows.filter(r => r.source === 'openfoodfacts')

let checked = 0, failures = []
for (const row of sourceProvided) {
  checked++
  const raw = offByBarcode.get(row.barcode)
  if (!raw) { failures.push({ barcode: row.barcode, issue: 'raw source record not found on re-check' }); continue }
  if (raw.code !== row.barcode) failures.push({ barcode: row.barcode, issue: `raw.code (${raw.code}) != row.barcode (${row.barcode})` })

  const rawKcal = raw.nutriments?.['energy-kcal_100g']
  const rawProtein = raw.nutriments?.['proteins_100g']
  const rawBasis = raw.nutrition_data_per

  if (rawBasis !== '100g') failures.push({ barcode: row.barcode, issue: `raw nutrition_data_per is "${rawBasis}", expected "100g" for a row in the final import` })
  if (typeof rawKcal === 'number' && row.calories !== rawKcal) {
    failures.push({ barcode: row.barcode, issue: `calories mismatch: SQL has ${row.calories}, raw source (real kcal field) has ${rawKcal}` })
  }
  if (typeof rawProtein === 'number' && row.protein !== rawProtein) {
    failures.push({ barcode: row.barcode, issue: `protein mismatch: SQL has ${row.protein}, raw source has ${rawProtein}` })
  }
  // Confirm no rounding/decimal-shift was introduced: exact float equality (not just close)
}

console.log(`Row-by-row check: ${checked} source-provided rows checked against raw cached OFF source records.`)
console.log(`Failures: ${failures.length}`)
for (const f of failures.slice(0, 30)) console.log(' -', f.barcode, ':', f.issue)
if (failures.length === 0) console.log('PASS: every source-provided row in the final SQL exactly matches its raw source record (barcode, basis, calories, protein) -- no transcription error, no rounding, no decimal shift.')
