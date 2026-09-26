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
  validatePaymentEdit,
  validateOwnerNote,
  emptyToNull,
  paymentEditIsDirty,
  noteEditIsDirty,
  invitationStateLabelHe,
  formatDateHe,
  toDateString,
  NOTE_MAX_LENGTH,
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

// ---------------------------------------------------------------------
// Payment editing
// ---------------------------------------------------------------------

const TODAY = new Date(2026, 0, 15) // fixed reference so range tests never drift

function paymentForm(overrides = {}) {
  return { paymentStatus: 'paid', paymentReviewedAt: '2026-01-01', paidThrough: '2026-12-31', ...overrides }
}

test('validatePaymentEdit: accepts each valid payment status', () => {
  for (const paymentStatus of ['unpaid', 'trial', 'paid', 'overdue']) {
    assert.equal(validatePaymentEdit(paymentForm({ paymentStatus }), TODAY), '')
  }
})

test('validatePaymentEdit: rejects an unknown or missing payment status', () => {
  assert.notEqual(validatePaymentEdit(paymentForm({ paymentStatus: 'comped' }), TODAY), '')
  assert.notEqual(validatePaymentEdit(paymentForm({ paymentStatus: '' }), TODAY), '')
  assert.notEqual(validatePaymentEdit({}, TODAY), '')
})

test('validatePaymentEdit: both dates may be empty (both columns are nullable)', () => {
  assert.equal(
    validatePaymentEdit(paymentForm({ paymentReviewedAt: '', paidThrough: '' }), TODAY),
    '',
  )
  assert.equal(
    validatePaymentEdit(paymentForm({ paymentReviewedAt: null, paidThrough: null }), TODAY),
    '',
  )
})

test('validatePaymentEdit: paid-through earlier than the review date is rejected (mirrors the server rule)', () => {
  const msg = validatePaymentEdit(
    paymentForm({ paymentReviewedAt: '2026-06-01', paidThrough: '2026-05-31' }),
    TODAY,
  )
  assert.notEqual(msg, '')
})

test('validatePaymentEdit: equal dates are allowed (server rule is "earlier than", not "not later")', () => {
  assert.equal(
    validatePaymentEdit(paymentForm({ paymentReviewedAt: '2026-06-01', paidThrough: '2026-06-01' }), TODAY),
    '',
  )
})

test('validatePaymentEdit: a paid-through date alone, with no review date, is allowed', () => {
  assert.equal(validatePaymentEdit(paymentForm({ paymentReviewedAt: '' }), TODAY), '')
})

test('validatePaymentEdit: dates before 2020-01-01 are out of range', () => {
  assert.notEqual(validatePaymentEdit(paymentForm({ paymentReviewedAt: '2019-12-31' }), TODAY), '')
  assert.equal(validatePaymentEdit(paymentForm({ paymentReviewedAt: '2020-01-01' }), TODAY), '')
})

test('validatePaymentEdit: a typo\'d year beyond today+10y is out of range', () => {
  assert.notEqual(validatePaymentEdit(paymentForm({ paidThrough: '2226-12-31' }), TODAY), '')
  assert.equal(validatePaymentEdit(paymentForm({ paidThrough: '2036-01-15' }), TODAY), '')
  assert.notEqual(validatePaymentEdit(paymentForm({ paidThrough: '2036-01-16' }), TODAY), '')
})

test('validatePaymentEdit: malformed date strings are rejected, not silently sent', () => {
  assert.notEqual(validatePaymentEdit(paymentForm({ paidThrough: '31/12/2026' }), TODAY), '')
  assert.notEqual(validatePaymentEdit(paymentForm({ paidThrough: 'tomorrow' }), TODAY), '')
})

test('toDateString: uses local calendar date, not a UTC-shifted one', () => {
  // 00:30 local on the 15th. toISOString() would report the 14th for any
  // timezone east of UTC, which is the whole reason this helper exists.
  assert.equal(toDateString(new Date(2026, 0, 15, 0, 30)), '2026-01-15')
  assert.equal(toDateString(new Date(2026, 0, 15, 23, 30)), '2026-01-15')
})

test('emptyToNull: blanks become null, real values are trimmed', () => {
  assert.equal(emptyToNull(''), null)
  assert.equal(emptyToNull('   '), null)
  assert.equal(emptyToNull(null), null)
  assert.equal(emptyToNull(undefined), null)
  assert.equal(emptyToNull(' 2026-01-01 '), '2026-01-01')
})

// ---------------------------------------------------------------------
// Owner note
// ---------------------------------------------------------------------

test('validateOwnerNote: empty and normal notes are fine', () => {
  assert.equal(validateOwnerNote(''), '')
  assert.equal(validateOwnerNote(null), '')
  assert.equal(validateOwnerNote('שילם במזומן, לבדוק שוב בחודש הבא'), '')
})

test('validateOwnerNote: enforces the same 2000-character limit as the server', () => {
  assert.equal(validateOwnerNote('a'.repeat(NOTE_MAX_LENGTH)), '')
  assert.notEqual(validateOwnerNote('a'.repeat(NOTE_MAX_LENGTH + 1)), '')
})

test('validateOwnerNote: the limit applies to the trimmed value, as the server trims first', () => {
  assert.equal(validateOwnerNote(`  ${'a'.repeat(NOTE_MAX_LENGTH)}  `), '')
})

// ---------------------------------------------------------------------
// Dirty checks -- "save" must not write an unchanged row
// ---------------------------------------------------------------------

const STORED = {
  payment_status: 'paid',
  payment_reviewed_at: '2026-01-01',
  paid_through: '2026-12-31',
  owner_note: 'הערה',
}

test('paymentEditIsDirty: identical form is not dirty', () => {
  assert.equal(
    paymentEditIsDirty(
      { paymentStatus: 'paid', paymentReviewedAt: '2026-01-01', paidThrough: '2026-12-31' },
      STORED,
    ),
    false,
  )
})

test('paymentEditIsDirty: any single changed field makes it dirty', () => {
  const base = { paymentStatus: 'paid', paymentReviewedAt: '2026-01-01', paidThrough: '2026-12-31' }
  assert.equal(paymentEditIsDirty({ ...base, paymentStatus: 'overdue' }, STORED), true)
  assert.equal(paymentEditIsDirty({ ...base, paymentReviewedAt: '2026-02-01' }, STORED), true)
  assert.equal(paymentEditIsDirty({ ...base, paidThrough: '' }, STORED), true)
})

test('paymentEditIsDirty: empty-string vs stored null is NOT a change', () => {
  const stored = { payment_status: 'unpaid', payment_reviewed_at: null, paid_through: null }
  assert.equal(
    paymentEditIsDirty({ paymentStatus: 'unpaid', paymentReviewedAt: '', paidThrough: '' }, stored),
    false,
  )
})

test('noteEditIsDirty: whitespace-only edit of an empty note is not a change', () => {
  const stored = { owner_note: null }
  assert.equal(noteEditIsDirty('', stored), false)
  assert.equal(noteEditIsDirty('   ', stored), false)
  assert.equal(noteEditIsDirty('something', stored), true)
})

test('noteEditIsDirty: clearing an existing note IS a change', () => {
  assert.equal(noteEditIsDirty('', STORED), true)
  assert.equal(noteEditIsDirty('הערה', STORED), false)
})

// ---------------------------------------------------------------------
// Pending invitations
// ---------------------------------------------------------------------

test('invitationStateLabelHe: both server states have Hebrew labels', () => {
  assert.equal(invitationStateLabelHe('pending'), 'ממתינה')
  assert.equal(invitationStateLabelHe('expired'), 'פגה')
})

test('invitationStateLabelHe: an unrecognized state falls back to the raw value, never blank', () => {
  assert.equal(invitationStateLabelHe('something-new'), 'something-new')
})

test('formatDateHe: absent or unparsable values render as a dash, not "Invalid Date"', () => {
  assert.equal(formatDateHe(null), '—')
  assert.equal(formatDateHe(undefined), '—')
  assert.equal(formatDateHe(''), '—')
  assert.equal(formatDateHe('not a date'), '—')
})

test('formatDateHe: a real timestamptz produces a non-empty localized string', () => {
  const out = formatDateHe('2026-01-15T10:00:00Z')
  assert.notEqual(out, '—')
  assert.ok(out.length > 0)
})
