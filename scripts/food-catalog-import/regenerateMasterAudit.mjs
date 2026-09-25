// Regenerates out/MASTER_AUDIT_976.json from the current live ledger
// state (ledger/reconciled_with_photo.json for the 140-item with-photo
// track, ledger/search_results.json for the 836-item no-photo track),
// keyed against out/bucket2_remaining.json for stored values/names.
// Run this any time either track's ledger changes, BEFORE regenerating
// blocked_from_import.json or IMPORT_ALLOWLIST.json -- those consume
// this file and go stale otherwise.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const bucket2 = JSON.parse(readFileSync(path.join(here, 'out/bucket2_remaining.json'), 'utf8'))
const bucketArr = Array.isArray(bucket2) ? bucket2 : (bucket2.items || Object.values(bucket2))
const withPhoto = JSON.parse(readFileSync(path.join(here, 'ledger/reconciled_with_photo.json'), 'utf8'))
const withPhotoArr = Array.isArray(withPhoto) ? withPhoto : Object.values(withPhoto)
const noPhoto = JSON.parse(readFileSync(path.join(here, 'ledger/search_results.json'), 'utf8'))

const withPhotoByBarcode = new Map(withPhotoArr.map(r => [r.barcode, r]))

const master = {}
let missing = 0
for (const item of bucketArr) {
  const bc = item.barcode
  const wp = withPhotoByBarcode.get(bc)
  const np = noPhoto[bc]
  if (wp) {
    master[bc] = {
      barcode: bc,
      name: wp.name || item.name,
      track: 'with_photo',
      storedCalories: wp.storedCalories ?? item.calories,
      storedProtein: wp.storedProtein ?? item.protein,
      outcome: (wp.finalOutcome || 'PENDING').toUpperCase(),
      evidence: wp.justification || '',
      twoReaderConfirmed: !!(wp.reader1 && wp.reader2),
    }
  } else if (np) {
    master[bc] = {
      barcode: bc,
      name: item.name,
      track: 'no_photo',
      storedCalories: item.calories,
      storedProtein: item.protein,
      outcome: (np.outcome || 'pending').toUpperCase(),
      evidence: np.notes || '',
      twoReaderConfirmed: np.twoReaderConfirmed === true,
    }
  } else {
    missing++
    master[bc] = {
      barcode: bc,
      name: item.name,
      track: 'UNKNOWN',
      storedCalories: item.calories,
      storedProtein: item.protein,
      outcome: 'PENDING',
      evidence: 'ABSENT from both with_photo and no_photo ledgers -- structural gap, treat as unreviewed',
      twoReaderConfirmed: false,
    }
  }
}

writeFileSync(path.join(here, 'out/MASTER_AUDIT_976.json'), JSON.stringify(master, null, 2))

const counts = {}
for (const k in master) counts[master[k].outcome] = (counts[master[k].outcome] || 0) + 1
console.log('Regenerated MASTER_AUDIT_976.json. Total:', Object.keys(master).length, 'Missing from both ledgers:', missing)
console.log('Outcome counts:', counts)
