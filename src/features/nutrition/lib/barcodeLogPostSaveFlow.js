// Pure decision logic for what NutritionSection.vue shows immediately
// after a barcode-sourced nutrition log is saved -- extracted because
// this was a real, reported UX bug: the previous behavior collapsed the
// whole barcode block back to the header's "הוסף מאכל" / "סרוק ברקוד"
// buttons the instant a save succeeded. On a phone, the coach's scroll
// position stays wherever it was while filling in the form -- usually
// well below those header buttons -- so nothing wrong happened, but
// there was no visible next action from where they were actually
// looking, and the only way forward that felt available was the phone's
// own Back button (which this app does not intercept -- see
// BarcodeFoodEntry.vue's own notes on that limitation).
//
// The fix: the barcode block never silently collapses on its own. It
// swaps, IN PLACE (same DOM position the form occupied, so there is no
// scroll jump), to a small success panel with two explicit actions --
// "סרוק ברקוד נוסף" (stay open, ready for another scan) and "סיום" (done,
// collapse back to the header buttons) -- both of them real state
// transitions asserted here, not the implicit "it just goes away" the
// previous version had.
//
// Pure/DI: no Vue, no Supabase -- just the small state object
// NutritionSection.vue's showBarcodeEntry/barcodeJustSaved refs mirror.

export function stateAfterStartBarcodeEntry() {
  return { showBarcodeEntry: true, barcodeJustSaved: false }
}

// The previously-approved/entered product is already durably saved
// (nutritionLogsStore.addLog() has already resolved by the time this is
// called) -- this only decides what the UI shows next, never re-touches
// that saved row. barcodeJustSaved: true is what makes the success panel
// render instead of the (already-reset, per BarcodeFoodEntry.vue's own
// reset() call) form.
export function stateAfterBarcodeLogSaved() {
  return { showBarcodeEntry: true, barcodeJustSaved: true }
}

// "סרוק ברקוד נוסף" -- returns to the form (already reset to its
// 'choose' step by the time this fires) without ever closing the block
// or requiring the header's "סרוק ברקוד" button to be found and
// re-clicked.
export function stateAfterScanAnother() {
  return { showBarcodeEntry: true, barcodeJustSaved: false }
}

// "סיום" -- the only path back to the collapsed header-buttons state
// after a successful save. Never reached automatically.
export function stateAfterFinishBarcodeEntry() {
  return { showBarcodeEntry: false, barcodeJustSaved: false }
}

// The form's own "ביטול" (cancel, mid-entry, nothing saved yet) --
// collapses immediately, same as before this change; barcodeJustSaved is
// reset defensively even though it can only be false already at this
// point (cancel only renders while the form itself is showing).
export function stateAfterBarcodeCancel() {
  return { showBarcodeEntry: false, barcodeJustSaved: false }
}
