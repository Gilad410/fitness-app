// Feature detection for camera-based barcode scanning -- DI-injectable
// (navigatorImpl/windowImpl default to the real globals) so this is
// testable under plain Node without a real browser.
//
// Two independent things must both be true for the camera scanner to be
// usable at all: the browser must expose the native BarcodeDetector API
// (Chrome/Edge on Android and most desktops; NOT Safari/iOS or Firefox
// as of this writing), and it must expose getUserMedia (camera access).
// Either missing means the UI goes straight to manual entry -- the same
// fallback path used for an explicit permission denial (see
// BarcodeFoodEntry.vue), so "unsupported browser" and "declined camera
// access" both land the user in one place, not two different dead ends.
//
// Deliberately does NOT check whether BarcodeDetector actually supports
// the ean_13/ean_8/upc_a/upc_e formats via its own
// getSupportedFormats() -- that call is itself async and browser-gated;
// a browser that has BarcodeDetector at all reliably supports those
// formats in every shipping implementation as of this writing, so the
// extra round-trip isn't worth the complexity for this minimal version.
export function supportsCameraBarcodeScanning({ windowImpl = window, navigatorImpl = navigator } = {}) {
  return (
    typeof windowImpl !== 'undefined' &&
    typeof windowImpl.BarcodeDetector === 'function' &&
    typeof navigatorImpl !== 'undefined' &&
    typeof navigatorImpl.mediaDevices?.getUserMedia === 'function'
  )
}
