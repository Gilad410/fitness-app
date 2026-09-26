import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveLoginRoleOutcome,
  GENERAL_LOGIN_ROLES,
  TRAINEE_LOGIN_ROLES,
} from './loginRoleCheck.js'

// Regression tests for the staging owner-login bug: the general login
// page demanded role === 'coach' exactly, so a valid owner was rejected,
// AND the wrong-role message table had no 'owner' entry, so the thrown
// Error's message was `undefined` -- the page showed nothing at all and
// looked like a failed load. Both halves are pinned here.

// ---------------------------------------------------------------------
// The general (/login) page: coach + owner
// ---------------------------------------------------------------------

test('OWNER is accepted by the general login page (the staging bug)', () => {
  const outcome = resolveLoginRoleOutcome('owner', GENERAL_LOGIN_ROLES)
  assert.equal(outcome.accepted, true)
  assert.equal(outcome.message, undefined, 'an accepted login carries no error')
})

test('COACH is still accepted by the general login page', () => {
  assert.equal(resolveLoginRoleOutcome('coach', GENERAL_LOGIN_ROLES).accepted, true)
})

test('TRAINEE is rejected by the general login page, with the wrong-page message', () => {
  const outcome = resolveLoginRoleOutcome('trainee', GENERAL_LOGIN_ROLES)
  assert.equal(outcome.accepted, false)
  assert.equal(outcome.message, 'זהו חשבון מתאמן. יש להתחבר דרך כניסת המתאמנים.')
})

test('a ROLE-LESS account is rejected by the general login page with the no-access message', () => {
  const outcome = resolveLoginRoleOutcome(null, GENERAL_LOGIN_ROLES)
  assert.equal(outcome.accepted, false)
  assert.equal(outcome.message, 'לחשבון זה אין הרשאת גישה.')
})

// ---------------------------------------------------------------------
// The trainee portal stays trainee-only
// ---------------------------------------------------------------------

test('TRAINEE is accepted by the trainee login page', () => {
  assert.equal(resolveLoginRoleOutcome('trainee', TRAINEE_LOGIN_ROLES).accepted, true)
})

test('widening the general page did NOT widen the trainee page', () => {
  for (const role of ['coach', 'owner']) {
    const outcome = resolveLoginRoleOutcome(role, TRAINEE_LOGIN_ROLES)
    assert.equal(outcome.accepted, false, `${role} must not sign in through the trainee portal`)
    assert.ok(outcome.message.length > 0)
  }
})

test('a ROLE-LESS account is rejected by the trainee login page too', () => {
  const outcome = resolveLoginRoleOutcome(null, TRAINEE_LOGIN_ROLES)
  assert.equal(outcome.accepted, false)
  assert.equal(outcome.message, 'לחשבון זה אין הרשאת גישה.')
})

// ---------------------------------------------------------------------
// The guarantee that actually made the bug invisible
// ---------------------------------------------------------------------

test('EVERY rejection carries a non-empty Hebrew message -- no role can produce a blank error', () => {
  // Includes the known roles, values a later migration might add, and the
  // shapes a missing/!oken role can take. The original bug was exactly a
  // role with no table entry yielding `undefined`.
  const roles = [
    'owner',
    'coach',
    'trainee',
    'admin',
    'nutritionist',
    'OWNER',
    '',
    ' ',
    null,
    undefined,
    0,
    false,
    {},
    [],
    ['coach'],
  ]

  for (const allowed of [GENERAL_LOGIN_ROLES, TRAINEE_LOGIN_ROLES]) {
    for (const role of roles) {
      const outcome = resolveLoginRoleOutcome(role, allowed)
      if (outcome.accepted) continue
      assert.equal(typeof outcome.message, 'string', `role ${JSON.stringify(role)}: message must be a string`)
      assert.ok(
        outcome.message.trim().length > 0,
        `role ${JSON.stringify(role)}: message must not be blank`,
      )
      // Hebrew, not a leaked English/undefined placeholder.
      assert.match(outcome.message, /[֐-׿]/, `role ${JSON.stringify(role)}: message must be Hebrew`)
      assert.doesNotMatch(outcome.message, /undefined/i)
    }
  }
})

test('only exact string roles are accepted -- no coercion sneaks a non-string through', () => {
  for (const role of [0, 1, true, false, {}, [], ['owner'], new String('owner')]) {
    assert.equal(
      resolveLoginRoleOutcome(role, GENERAL_LOGIN_ROLES).accepted,
      false,
      `${JSON.stringify(role)} must not be accepted as a role`,
    )
  }
})

test('role matching is case-sensitive and exact (no trimming of stray whitespace)', () => {
  for (const role of ['Owner', 'OWNER', ' owner', 'owner ', 'owner\n']) {
    assert.equal(resolveLoginRoleOutcome(role, GENERAL_LOGIN_ROLES).accepted, false)
  }
})

// ---------------------------------------------------------------------
// The allow-lists themselves
// ---------------------------------------------------------------------

test('GENERAL_LOGIN_ROLES is exactly coach + owner', () => {
  assert.deepEqual([...GENERAL_LOGIN_ROLES].sort(), ['coach', 'owner'])
})

test('TRAINEE_LOGIN_ROLES is exactly trainee', () => {
  assert.deepEqual([...TRAINEE_LOGIN_ROLES], ['trainee'])
})

test('neither allow-list contains a role the other is meant to keep out', () => {
  assert.ok(!GENERAL_LOGIN_ROLES.includes('trainee'))
  assert.ok(!TRAINEE_LOGIN_ROLES.includes('coach'))
  assert.ok(!TRAINEE_LOGIN_ROLES.includes('owner'))
})
