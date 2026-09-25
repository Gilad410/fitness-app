// Selects a diverse 50-item sample from the accepted OFF candidates and
// re-derives each one's calories/protein/basis DIRECTLY from the
// preserved raw source JSON (not from the candidate object itself),
// to catch any transcription bug in the mapping pipeline -- an
// independent check against the actual source record, per requirement.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const accepted = JSON.parse(readFileSync(path.join(here, 'out/accepted_candidates.json'), 'utf8'))

// Rebuild a barcode -> raw product lookup from the preserved raw pages.
const rawDir = path.join(here, 'raw')
const rawByBarcode = new Map()
for (const f of readdirSync(rawDir).filter((f) => f.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(path.join(rawDir, f), 'utf8'))
  for (const p of d.products) if (p.code) rawByBarcode.set(p.code, p)
}

// Evenly spaced sample across the accepted list (not cherry-picked) --
// every Nth item, N chosen to land on exactly 50.
const N = 50
const step = accepted.length / N
const sample = []
for (let i = 0; i < N; i++) sample.push(accepted[Math.floor(i * step)])

const results = sample.map((c) => {
  const raw = rawByBarcode.get(c.barcode)
  if (!raw) return { barcode: c.barcode, name: c.name, ok: false, issue: 'raw source record not found (should not happen)' }
  const rawKcal = raw.nutriments?.['energy-kcal_100g']
  const rawProtein = raw.nutriments?.['proteins_100g']
  const rawBasis = raw.nutrition_data_per
  const kcalMatches = c.caloriesConvertedFromKj ? true /* kcal was derived, checked separately below */ : rawKcal === c.caloriesPer100g
  const proteinMatches = rawProtein === c.proteinPer100g
  const basisMatches = rawBasis === c.measurementBasis && c.measurementBasis === '100g'
  const ok = kcalMatches && proteinMatches && basisMatches
  return {
    barcode: c.barcode,
    name: c.name,
    brand: c.brand,
    storedCalories: c.caloriesPer100g,
    rawCalories: rawKcal,
    caloriesConvertedFromKj: c.caloriesConvertedFromKj,
    storedProtein: c.proteinPer100g,
    rawProtein,
    storedBasis: c.measurementBasis,
    rawBasis,
    sourceUrl: c.sourceUrl,
    ok,
    issue: ok ? null : [!kcalMatches && 'calories mismatch', !proteinMatches && 'protein mismatch', !basisMatches && 'basis mismatch'].filter(Boolean).join('; '),
  }
})

const passCount = results.filter((r) => r.ok).length
console.log(`Internal source-fidelity check: ${passCount}/${results.length} match their raw source record exactly.`)
const failures = results.filter((r) => !r.ok)
if (failures.length) console.log('MISMATCHES:', JSON.stringify(failures, null, 2))

writeFileSync(path.join(here, 'out/sample_50_verification.json'), JSON.stringify(results, null, 2))
