// Full-audit Phase A: for every barcode in bucket2_remaining.json,
// fetch the current image_nutrition_url (+ basis/countries metadata)
// from the live individual-product API, and download the label photo
// immediately if one exists. Writes one checkpoint file
// (audit_checkpoint.json, a barcode->record map) updated after EVERY
// single item -- fully resumable: a restart skips any barcode already
// present in the checkpoint with status !== 'pending'.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const list = JSON.parse(readFileSync(path.join(here, 'out/bucket2_remaining.json'), 'utf8'))
// Phase A owns this file exclusively -- Phase B outcomes are recorded
// in the SEPARATE audit_outcomes.json (never touched here), so the two
// processes never race on the same file and clobber each other's
// writes (a real bug found and fixed this session: Phase A's
// re-save-whole-object-from-memory pattern was silently erasing
// concurrently-written Phase B outcomes).
const checkpointPath = path.join(here, 'out/audit_phase_a.json')
const photosDir = path.join(here, 'label_photos/audit')
import { mkdirSync } from 'node:fs'
mkdirSync(photosDir, { recursive: true })

let checkpoint = existsSync(checkpointPath) ? JSON.parse(readFileSync(checkpointPath, 'utf8')) : {}

const UA = 'FitnessAppFoodCatalogImport/1.0 (dry-run; contact: giladma2006@gmail.com)'
const FIELDS = 'code,product_name,product_name_he,brands,countries_tags,nutrition_data_per,nutrition_data_prepared_per,image_nutrition_url,image_nutrition_small_url'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function saveCheckpoint() {
  writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2))
}

let processed = 0
let withPhoto = 0
const LIMIT = Number(process.argv[2] ?? 976)

for (const item of list) {
  if (processed >= LIMIT) break
  const existing = checkpoint[item.barcode]
  if (existing && existing.phaseA === 'done') continue // resumable: skip already-fetched

  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${item.barcode}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    })
    if (res.status === 200) {
      const body = await res.json()
      const p = body.product || {}
      const record = {
        barcode: item.barcode,
        name: item.name,
        brand: item.brand,
        storedCalories: item.calories,
        storedProtein: item.protein,
        liveProductName: p.product_name || p.product_name_he || null,
        liveBrands: p.brands || null,
        liveCountriesTags: p.countries_tags || null,
        liveNutritionDataPer: p.nutrition_data_per || null,
        liveNutritionDataPreparedPer: p.nutrition_data_prepared_per || null,
        imageNutritionUrl: p.image_nutrition_url || null,
        apiStatus: body.status,
        phaseA: 'done',
        outcome: null, // filled in Phase B: 'verified' | 'correction_proposed' | 'unresolved'
        outcomeReason: null,
      }
      if (record.imageNutritionUrl) {
        try {
          const imgRes = await fetch(record.imageNutritionUrl, { signal: AbortSignal.timeout(15000) })
          if (imgRes.status === 200) {
            const buf = Buffer.from(await imgRes.arrayBuffer())
            const photoPath = path.join(photosDir, `${item.barcode}.jpg`)
            writeFileSync(photoPath, buf)
            record.photoDownloaded = true
            withPhoto++
          } else {
            record.photoDownloaded = false
            record.photoFetchError = `HTTP ${imgRes.status}`
          }
        } catch (e) {
          record.photoDownloaded = false
          record.photoFetchError = e.message
        }
      } else {
        record.photoDownloaded = false
        // No photo at all -- this item's Phase B outcome is already
        // determined: unresolved, evidence missing. Set it now so
        // Phase B doesn't need to re-derive it.
        record.outcome = 'unresolved'
        record.outcomeReason = 'no nutrition-label photo available for this barcode (image_nutrition_url absent from the live API response)'
      }
      checkpoint[item.barcode] = record
    } else {
      checkpoint[item.barcode] = {
        barcode: item.barcode, name: item.name, phaseA: 'done',
        outcome: 'unresolved', outcomeReason: `product API returned HTTP ${res.status}`,
      }
    }
  } catch (e) {
    checkpoint[item.barcode] = {
      barcode: item.barcode, name: item.name, phaseA: 'done',
      outcome: 'unresolved', outcomeReason: `fetch error: ${e.message}`,
    }
  }
  processed++
  saveCheckpoint()
  if (processed % 20 === 0) {
    const done = Object.values(checkpoint).filter((r) => r.phaseA === 'done').length
    console.log(`Phase A progress: ${done}/${list.length} fetched, ${withPhoto} new photos this run`)
  }
  await sleep(4500)
}

const done = Object.values(checkpoint).filter((r) => r.phaseA === 'done').length
console.log(`Phase A run complete. ${done}/${list.length} total fetched. ${withPhoto} photos downloaded this run.`)
