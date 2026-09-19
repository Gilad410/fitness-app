import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stateAfterStartBarcodeEntry,
  stateAfterBarcodeLogSaved,
  stateAfterScanAnother,
  stateAfterFinishBarcodeEntry,
  stateAfterBarcodeCancel,
} from './barcodeLogPostSaveFlow.js'

// ---------------------------------------------------------------------
// Reproduces the reported navigation bug: after a successful barcode
// log save, the block must NOT silently collapse back to the header
// buttons -- the coach needs a real "scan another" action reachable
// from wherever they already are, without the phone's Back button.
// ---------------------------------------------------------------------

test('stateAfterStartBarcodeEntry: opens the block showing the form, not the success panel', () => {
  assert.deepEqual(stateAfterStartBarcodeEntry(), { showBarcodeEntry: true, barcodeJustSaved: false })
})

test('stateAfterBarcodeLogSaved: the block STAYS OPEN and shows the success panel -- this is the actual fix, it never collapses back to the header buttons on its own', () => {
  const state = stateAfterBarcodeLogSaved()
  assert.equal(state.showBarcodeEntry, true, 'must not silently close after a successful save')
  assert.equal(state.barcodeJustSaved, true, 'must show the success/next-action panel, not the bare form or nothing at all')
})

test('stateAfterScanAnother: returns to the form (already reset by BarcodeFoodEntry.vue) without closing the block -- no re-finding the header button, no Back', () => {
  assert.deepEqual(stateAfterScanAnother(), { showBarcodeEntry: true, barcodeJustSaved: false })
})

test('stateAfterFinishBarcodeEntry: the only path back to the collapsed header-buttons state after a save -- explicit, never automatic', () => {
  assert.deepEqual(stateAfterFinishBarcodeEntry(), { showBarcodeEntry: false, barcodeJustSaved: false })
})

test('stateAfterBarcodeCancel: mid-entry cancel still collapses immediately, unchanged from before this fix', () => {
  assert.deepEqual(stateAfterBarcodeCancel(), { showBarcodeEntry: false, barcodeJustSaved: false })
})

test('SCENARIO: save -> scan another -> save again -- the block never closes across two consecutive saves, matching "does not need to press Back"', () => {
  let state = stateAfterStartBarcodeEntry()
  assert.equal(state.showBarcodeEntry, true)

  state = stateAfterBarcodeLogSaved()
  assert.equal(state.showBarcodeEntry, true, 'still open after the first save')
  assert.equal(state.barcodeJustSaved, true)

  state = stateAfterScanAnother()
  assert.equal(state.showBarcodeEntry, true, 'still open, back on the form')
  assert.equal(state.barcodeJustSaved, false)

  state = stateAfterBarcodeLogSaved()
  assert.equal(state.showBarcodeEntry, true, 'still open after the SECOND save -- never had to reopen via the header button')
  assert.equal(state.barcodeJustSaved, true)
})
