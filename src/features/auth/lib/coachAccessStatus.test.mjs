import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCoachAccessStatus } from './coachAccessStatus.js'

// The auth-side half of the pending/suspended correction: what the
// store makes of each shape coach_get_own_status() can return. Paired
// with coachAccessRouting.test.mjs, which covers what the router then
// does with each result.

test('array payload (PostgREST set-returning RPC): each real status survives intact', () => {
  assert.equal(normalizeCoachAccessStatus([{ access_status: 'active' }]), 'active')
  assert.equal(normalizeCoachAccessStatus([{ access_status: 'pending' }]), 'pending')
  assert.equal(normalizeCoachAccessStatus([{ access_status: 'suspended' }]), 'suspended')
})

test('bare-object payload: each real status survives intact', () => {
  assert.equal(normalizeCoachAccessStatus({ access_status: 'active' }), 'active')
  assert.equal(normalizeCoachAccessStatus({ access_status: 'pending' }), 'pending')
  assert.equal(normalizeCoachAccessStatus({ access_status: 'suspended' }), 'suspended')
})

test('pending is never reported as suspended, and vice versa', () => {
  assert.notEqual(normalizeCoachAccessStatus([{ access_status: 'pending' }]), 'suspended')
  assert.notEqual(normalizeCoachAccessStatus([{ access_status: 'suspended' }]), 'pending')
})

test('empty array (no coaches row for this account) -> unknown, not a false active', () => {
  assert.equal(normalizeCoachAccessStatus([]), 'unknown')
})

test('null / undefined payload -> unknown', () => {
  assert.equal(normalizeCoachAccessStatus(null), 'unknown')
  assert.equal(normalizeCoachAccessStatus(undefined), 'unknown')
})

test('row present but access_status null or absent -> unknown', () => {
  assert.equal(normalizeCoachAccessStatus([{ access_status: null }]), 'unknown')
  assert.equal(normalizeCoachAccessStatus([{}]), 'unknown')
})

test('unrecognized status (a later migration deployed ahead of this build) -> unknown, never allowed through', () => {
  assert.equal(normalizeCoachAccessStatus([{ access_status: 'archived' }]), 'unknown')
  assert.equal(normalizeCoachAccessStatus([{ access_status: 'ACTIVE' }]), 'unknown')
  assert.equal(normalizeCoachAccessStatus([{ access_status: ' active' }]), 'unknown')
})

test('non-string values are not coerced into a status', () => {
  assert.equal(normalizeCoachAccessStatus([{ access_status: true }]), 'unknown')
  assert.equal(normalizeCoachAccessStatus([{ access_status: 1 }]), 'unknown')
  assert.equal(normalizeCoachAccessStatus([{ access_status: {} }]), 'unknown')
})

test('only the first row is consulted (the RPC is scoped to one account)', () => {
  assert.equal(
    normalizeCoachAccessStatus([{ access_status: 'pending' }, { access_status: 'active' }]),
    'pending',
  )
})
