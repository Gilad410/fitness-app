import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supportsCameraBarcodeScanning } from './barcodeCameraSupport.js'

test('supportsCameraBarcodeScanning: true when both BarcodeDetector and getUserMedia are present', () => {
  const windowImpl = { BarcodeDetector: function () {} }
  const navigatorImpl = { mediaDevices: { getUserMedia: async () => {} } }
  assert.equal(supportsCameraBarcodeScanning({ windowImpl, navigatorImpl }), true)
})

test('supportsCameraBarcodeScanning: false when BarcodeDetector is missing (e.g. Safari/iOS, Firefox)', () => {
  const windowImpl = {}
  const navigatorImpl = { mediaDevices: { getUserMedia: async () => {} } }
  assert.equal(supportsCameraBarcodeScanning({ windowImpl, navigatorImpl }), false)
})

test('supportsCameraBarcodeScanning: false when getUserMedia is missing (e.g. no camera hardware, or mediaDevices unavailable)', () => {
  const windowImpl = { BarcodeDetector: function () {} }
  const navigatorImpl = { mediaDevices: {} }
  assert.equal(supportsCameraBarcodeScanning({ windowImpl, navigatorImpl }), false)
})

test('supportsCameraBarcodeScanning: false when mediaDevices itself is entirely absent (older/non-secure-context browsers)', () => {
  const windowImpl = { BarcodeDetector: function () {} }
  const navigatorImpl = {}
  assert.equal(supportsCameraBarcodeScanning({ windowImpl, navigatorImpl }), false)
})

test('supportsCameraBarcodeScanning: false when BarcodeDetector exists but is not a constructor function (defensive)', () => {
  const windowImpl = { BarcodeDetector: 'not-a-function' }
  const navigatorImpl = { mediaDevices: { getUserMedia: async () => {} } }
  assert.equal(supportsCameraBarcodeScanning({ windowImpl, navigatorImpl }), false)
})
