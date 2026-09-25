import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCoachAccessRoute, COACH_ACCESS_ALLOWED } from './coachAccessRouting.js'

// Regression tests for the exact bug review caught: 'pending' and
// 'suspended' being collapsed into one boolean, so a newly-onboarded
// coach awaiting approval was shown a "your access was suspended"
// screen. Every state is pinned here, including the wording-sensitive
// distinction between them.

test('active: navigation is allowed, nothing is torn down', () => {
  assert.equal(resolveCoachAccessRoute('active'), COACH_ACCESS_ALLOWED)
  assert.equal(resolveCoachAccessRoute('active'), null)
})

test('pending: goes to the pending-approval screen, NOT the suspension screen', () => {
  const d = resolveCoachAccessRoute('pending')
  assert.equal(d.route.name, 'coach-pending-approval')
  assert.notEqual(d.route.name, 'coach-suspended', 'a pending coach must never be told they were suspended')
})

test('suspended: goes to the suspension screen', () => {
  const d = resolveCoachAccessRoute('suspended')
  assert.equal(d.route.name, 'coach-suspended')
})

test('pending and suspended resolve to DIFFERENT screens', () => {
  assert.notEqual(
    resolveCoachAccessRoute('pending').route.name,
    resolveCoachAccessRoute('suspended').route.name,
  )
})

test('unknown status (unrecognized value, e.g. a newer migration): fails closed with a generic message, not a suspension claim', () => {
  const d = resolveCoachAccessRoute('unknown')
  assert.equal(d.route.name, 'login')
  assert.equal(d.route.query.access, 'unavailable')
  assert.notEqual(d.route.name, 'coach-suspended')
})

test('missing status (no coaches row at all -> "unknown"): same accurate generic failure', () => {
  const d = resolveCoachAccessRoute('unknown')
  assert.equal(d.route.name, 'login')
  assert.equal(d.route.query.access, 'unavailable')
})

test('verification failure (RPC/network threw): fails closed generically, never claims suspension', () => {
  const d = resolveCoachAccessRoute(null, { verificationFailed: true })
  assert.equal(d.route.name, 'login')
  assert.equal(d.route.query.access, 'unavailable')
  assert.notEqual(d.route.name, 'coach-suspended')
  assert.notEqual(d.route.name, 'coach-pending-approval')
})

test('verificationFailed wins even if a stale status value is passed alongside it', () => {
  const d = resolveCoachAccessRoute('active', { verificationFailed: true })
  assert.equal(d.route.name, 'login', 'an unverifiable check must not be rescued by a stale "active"')
})

test('every non-allowed outcome tears down the session and the coach caches', () => {
  for (const status of ['pending', 'suspended', 'unknown']) {
    const d = resolveCoachAccessRoute(status)
    assert.equal(d.signOut, true, `${status} must sign out`)
    assert.equal(d.clearCoachCaches, true, `${status} must clear coach caches`)
  }
  const failed = resolveCoachAccessRoute(null, { verificationFailed: true })
  assert.equal(failed.signOut, true)
  assert.equal(failed.clearCoachCaches, true)
})

test('active never tears down the session (a working coach keeps their caches)', () => {
  assert.equal(resolveCoachAccessRoute('active'), null)
})
