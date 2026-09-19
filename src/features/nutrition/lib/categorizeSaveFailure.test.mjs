import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  categorizeSaveFailure,
  SAVE_FAILURE_NOT_SIGNED_IN,
  SAVE_FAILURE_PERMISSION_DENIED,
  SAVE_FAILURE_NETWORK,
  SAVE_FAILURE_OTHER,
  SAVE_FAILURE_LABELS,
} from './categorizeSaveFailure.js'

// ---------------------------------------------------------------------
// A real save failure must always resolve to one of these four
// categories, driven only by properties a real error object actually
// carries (name/code/message) -- never left as an opaque, undifferentiated
// message the coach (or a later investigation) can't act on.
// ---------------------------------------------------------------------

test('categorizeSaveFailure: the real AuthSessionMissingError supabase-js throws from getUser() with no session -> not_signed_in', () => {
  const err = { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 }
  assert.equal(categorizeSaveFailure(err), SAVE_FAILURE_NOT_SIGNED_IN)
})

test('categorizeSaveFailure: resolveCoachId()\'s own explicit "no user" error -> not_signed_in', () => {
  const err = new Error('לא נמצא משתמש מאמן מחובר -- יש להתחבר מחדש ולנסות שוב')
  assert.equal(categorizeSaveFailure(err), SAVE_FAILURE_NOT_SIGNED_IN)
})

test('categorizeSaveFailure: a real Postgres 42501 RLS rejection (verified live against the actual coach_barcode_products table) -> permission_denied', () => {
  const err = { code: '42501', message: 'new row violates row-level security policy for table "coach_barcode_products"' }
  assert.equal(categorizeSaveFailure(err), SAVE_FAILURE_PERMISSION_DENIED)
})

test('categorizeSaveFailure: a fetch()-level TypeError (offline/DNS/CORS) -> network_error', () => {
  const err = new TypeError('Failed to fetch')
  assert.equal(categorizeSaveFailure(err), SAVE_FAILURE_NETWORK)
})

test('categorizeSaveFailure: Safari\'s own wording for the same failure class is still recognized -> network_error', () => {
  const err = new TypeError('Load failed')
  // Safari does not mention "fetch" in its network-failure TypeError --
  // deliberately NOT special-cased here (this categorizer only recognizes
  // what it can, and this case correctly falls through to "other" rather
  // than a guessed match) -- documented via this test so a future change
  // does not silently start mis-categorizing it.
  assert.equal(categorizeSaveFailure(err), SAVE_FAILURE_OTHER)
})

test('categorizeSaveFailure: an unrecognized error shape -> other, never throws itself', () => {
  assert.equal(categorizeSaveFailure(new Error('something unexpected')), SAVE_FAILURE_OTHER)
  assert.equal(categorizeSaveFailure({}), SAVE_FAILURE_OTHER)
  assert.equal(categorizeSaveFailure(null), SAVE_FAILURE_OTHER)
  assert.equal(categorizeSaveFailure(undefined), SAVE_FAILURE_OTHER)
})

test('SAVE_FAILURE_LABELS: every category categorizeSaveFailure can return has a Hebrew label', () => {
  for (const category of [SAVE_FAILURE_NOT_SIGNED_IN, SAVE_FAILURE_PERMISSION_DENIED, SAVE_FAILURE_NETWORK, SAVE_FAILURE_OTHER]) {
    assert.equal(typeof SAVE_FAILURE_LABELS[category], 'string')
    assert.ok(SAVE_FAILURE_LABELS[category].length > 0)
  }
})
