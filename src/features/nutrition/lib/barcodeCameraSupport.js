// Camera-based barcode scanning strategy detection -- DI-injectable
// (navigatorImpl/windowImpl default to the real globals) so this is
// testable under plain Node without a real browser.
//
// Two engines are available, tried in this order:
//   'native' -- the browser's own BarcodeDetector API (Chrome/Edge,
//               desktop and Android). Zero extra bundle weight, so
//               preferred whenever it exists.
//   'zxing'  -- a JS decoder (@zxing/browser + @zxing/library),
//               loaded via a dynamic import ONLY when actually used
//               (see BarcodeFoodEntry.vue) -- covers Safari/iOS and
//               Firefox, which never ship BarcodeDetector. This is what
//               lets iOS Safari scan at all; before this module split
//               camera support into two engines, any non-BarcodeDetector
//               browser fell straight to manual entry with no camera
//               option offered.
// Either way needs `getUserMedia` (actual camera access) to be usable
// at all -- its absence means camera scanning is 'unsupported'
// regardless of which decode engine might otherwise be available, and
// the UI goes straight to manual entry (the same fallback path used for
// an explicit permission denial at runtime -- see BarcodeFoodEntry.vue).
export const CAMERA_STRATEGY_NATIVE = 'native'
export const CAMERA_STRATEGY_ZXING = 'zxing'
export const CAMERA_STRATEGY_UNSUPPORTED = 'unsupported'

export function getCameraScanStrategy({ windowImpl = window, navigatorImpl = navigator } = {}) {
  const hasCamera =
    typeof navigatorImpl !== 'undefined' && typeof navigatorImpl.mediaDevices?.getUserMedia === 'function'
  if (!hasCamera) return CAMERA_STRATEGY_UNSUPPORTED

  const hasNativeDetector = typeof windowImpl !== 'undefined' && typeof windowImpl.BarcodeDetector === 'function'
  return hasNativeDetector ? CAMERA_STRATEGY_NATIVE : CAMERA_STRATEGY_ZXING
}

// Convenience boolean for "should the scan-with-camera option be
// offered at all" (used to decide whether to show the button in the
// 'choose' step) -- true for either engine, false only when there's no
// camera API to speak of.
export function supportsCameraBarcodeScanning(deps) {
  return getCameraScanStrategy(deps) !== CAMERA_STRATEGY_UNSUPPORTED
}
