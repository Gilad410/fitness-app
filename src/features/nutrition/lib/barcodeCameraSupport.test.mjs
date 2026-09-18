import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getCameraScanStrategy,
  supportsCameraBarcodeScanning,
  CAMERA_STRATEGY_NATIVE,
  CAMERA_STRATEGY_ZXING,
  CAMERA_STRATEGY_UNSUPPORTED,
} from './barcodeCameraSupport.js'

test('getCameraScanStrategy: "native" when both BarcodeDetector and getUserMedia are present (Chrome/Edge)', () => {
  const windowImpl = { BarcodeDetector: function () {} }
  const navigatorImpl = { mediaDevices: { getUserMedia: async () => {} } }
  assert.equal(getCameraScanStrategy({ windowImpl, navigatorImpl }), CAMERA_STRATEGY_NATIVE)
})

test('getCameraScanStrategy: "zxing" when getUserMedia exists but BarcodeDetector does not (Safari/iOS, Firefox) -- this is the fix, it used to be unsupported', () => {
  const windowImpl = {}
  const navigatorImpl = { mediaDevices: { getUserMedia: async () => {} } }
  assert.equal(getCameraScanStrategy({ windowImpl, navigatorImpl }), CAMERA_STRATEGY_ZXING)
})

test('getCameraScanStrategy: "unsupported" when getUserMedia is missing, regardless of BarcodeDetector', () => {
  const withDetector = getCameraScanStrategy({
    windowImpl: { BarcodeDetector: function () {} },
    navigatorImpl: { mediaDevices: {} },
  })
  const withoutDetector = getCameraScanStrategy({
    windowImpl: {},
    navigatorImpl: { mediaDevices: {} },
  })
  assert.equal(withDetector, CAMERA_STRATEGY_UNSUPPORTED)
  assert.equal(withoutDetector, CAMERA_STRATEGY_UNSUPPORTED)
})

test('getCameraScanStrategy: "unsupported" when mediaDevices itself is entirely absent (older/non-secure-context browsers)', () => {
  const windowImpl = { BarcodeDetector: function () {} }
  const navigatorImpl = {}
  assert.equal(getCameraScanStrategy({ windowImpl, navigatorImpl }), CAMERA_STRATEGY_UNSUPPORTED)
})

test('getCameraScanStrategy: "zxing" (not "native") when BarcodeDetector exists but is not a constructor function (defensive)', () => {
  const windowImpl = { BarcodeDetector: 'not-a-function' }
  const navigatorImpl = { mediaDevices: { getUserMedia: async () => {} } }
  assert.equal(getCameraScanStrategy({ windowImpl, navigatorImpl }), CAMERA_STRATEGY_ZXING)
})

test('supportsCameraBarcodeScanning: true for native', () => {
  const windowImpl = { BarcodeDetector: function () {} }
  const navigatorImpl = { mediaDevices: { getUserMedia: async () => {} } }
  assert.equal(supportsCameraBarcodeScanning({ windowImpl, navigatorImpl }), true)
})

test('supportsCameraBarcodeScanning: true for zxing (the fix -- iOS Safari now offers the camera option)', () => {
  const windowImpl = {}
  const navigatorImpl = { mediaDevices: { getUserMedia: async () => {} } }
  assert.equal(supportsCameraBarcodeScanning({ windowImpl, navigatorImpl }), true)
})

test('supportsCameraBarcodeScanning: false only when there is no camera API at all', () => {
  const windowImpl = {}
  const navigatorImpl = {}
  assert.equal(supportsCameraBarcodeScanning({ windowImpl, navigatorImpl }), false)
})
