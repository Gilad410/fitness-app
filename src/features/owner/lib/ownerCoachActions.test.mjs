import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateInviteEmail,
  validateStatusChangeReason,
  isValidAccessStatus,
  isValidPaymentStatus,
  accessStatusLabelHe,
  paymentStatusLabelHe,
  filterCoachesByEmail,
  countByAccessStatus,
} from './ownerCoachActions.js'

test('validateInviteEmail: rejects empty/whitespace-only', () => {
  assert.notEqual(validateInviteEmail(''), '')
  assert.notEqual(validateInviteEmail('   '), '')
})

test('validateInviteEmail: rejects malformed addresses', () => {
  assert.notEqual(validateInviteEmail('not-an-email'), '')
  assert.notEqual(validateInviteEmail('missing@domain'), '')
})

test('validateInviteEmail: accepts a well-formed address', () => {
  assert.equal(validateInviteEmail('coach@example.com'), '')
})

test('validateStatusChangeReason: requires a reason ONLY when suspending', () => {
  assert.notEqual(validateStatusChangeReason('suspended', ''), '')
  assert.notEqual(validateStatusChangeReason('suspended', '   '), '')
  assert.equal(validateStatusChangeReason('suspended', 'non-payment'), '')
})

test('validateStatusChangeReason: activation/approval does not require a reason', () => {
  assert.equal(validateStatusChangeReason('active', ''), '')
  assert.equal(validateStatusChangeReason('active', 'approved after review'), '')
})

test('isValidAccessStatus / isValidPaymentStatus: exact allowed sets, matching the DB CHECK constraints', () => {
  assert.equal(isValidAccessStatus('pending'), true)
  assert.equal(isValidAccessStatus('active'), true)
  assert.equal(isValidAccessStatus('suspended'), true)
  assert.equal(isValidAccessStatus('banned'), false)
  assert.equal(isValidPaymentStatus('unpaid'), true)
  assert.equal(isValidPaymentStatus('trial'), true)
  assert.equal(isValidPaymentStatus('paid'), true)
  assert.equal(isValidPaymentStatus('overdue'), true)
  assert.equal(isValidPaymentStatus('free'), false)
})

test('accessStatusLabelHe / paymentStatusLabelHe: every real status has a Hebrew label, not the raw English key', () => {
  for (const s of ['pending', 'active', 'suspended']) {
    const label = accessStatusLabelHe(s)
    assert.notEqual(label, s)
    assert.match(label, /[֐-׿]/, `expected Hebrew script in label for "${s}"`)
  }
  for (const s of ['unpaid', 'trial', 'paid', 'overdue']) {
    const label = paymentStatusLabelHe(s)
    assert.notEqual(label, s)
    assert.match(label, /[֐-׿]/, `expected Hebrew script in label for "${s}"`)
  }
})

test('filterCoachesByEmail: case-insensitive substring match', () => {
  const coaches = [{ email: 'Coach.A@Example.com' }, { email: 'coach.b@example.com' }]
  assert.equal(filterCoachesByEmail(coaches, 'coach.a').length, 1)
  assert.equal(filterCoachesByEmail(coaches, 'EXAMPLE').length, 2)
  assert.equal(filterCoachesByEmail(coaches, 'nomatch').length, 0)
})

test('filterCoachesByEmail: empty/blank term returns everything unchanged', () => {
  const coaches = [{ email: 'a@x.com' }, { email: 'b@x.com' }]
  assert.deepEqual(filterCoachesByEmail(coaches, ''), coaches)
  assert.deepEqual(filterCoachesByEmail(coaches, '   '), coaches)
})

test('countByAccessStatus: tallies each bucket independently', () => {
  const coaches = [
    { access_status: 'active' }, { access_status: 'active' },
    { access_status: 'pending' },
    { access_status: 'suspended' }, { access_status: 'suspended' }, { access_status: 'suspended' },
  ]
  assert.deepEqual(countByAccessStatus(coaches), { pending: 1, active: 2, suspended: 3 })
})

test('countByAccessStatus: empty roster', () => {
  assert.deepEqual(countByAccessStatus([]), { pending: 0, active: 0, suspended: 0 })
})
