import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OWNER_MFA_CHALLENGE_ROUTE,
  OWNER_MFA_SETUP_ROUTE,
  normalizeTotpCode,
  resolveOwnerMfaRoute,
  validateTotpCode,
} from './ownerMfaRouting.js'

test('owner without a factor is forced to setup', () => {
  assert.deepEqual(resolveOwnerMfaRoute({ currentLevel: 'aal1', nextLevel: 'aal1' }, 'owner-coaches'), {
    route: { name: OWNER_MFA_SETUP_ROUTE },
  })
  assert.equal(resolveOwnerMfaRoute({ currentLevel: 'aal1', nextLevel: 'aal1' }, OWNER_MFA_SETUP_ROUTE), null)
})

test('owner with a factor but aal1 is forced to challenge', () => {
  assert.deepEqual(resolveOwnerMfaRoute({ currentLevel: 'aal1', nextLevel: 'aal2' }, 'owner-coaches'), {
    route: { name: OWNER_MFA_CHALLENGE_ROUTE },
  })
  assert.equal(resolveOwnerMfaRoute({ currentLevel: 'aal1', nextLevel: 'aal2' }, OWNER_MFA_CHALLENGE_ROUTE), null)
})

test('aal2 owner enters the dashboard and cannot revisit setup or challenge', () => {
  assert.equal(resolveOwnerMfaRoute({ currentLevel: 'aal2', nextLevel: 'aal2' }, 'owner-coaches'), null)
  assert.deepEqual(resolveOwnerMfaRoute({ currentLevel: 'aal2', nextLevel: 'aal2' }, OWNER_MFA_SETUP_ROUTE), {
    route: { name: 'owner-coaches' },
  })
})

test('unknown assurance fails closed', () => {
  assert.deepEqual(resolveOwnerMfaRoute({}, 'owner-coaches'), { unavailable: true })
})

test('totp validation accepts only six digits and ignores spaces', () => {
  assert.equal(normalizeTotpCode(' 123 456 '), '123456')
  assert.equal(validateTotpCode('123456'), '')
  assert.notEqual(validateTotpCode('12345'), '')
  assert.notEqual(validateTotpCode('12345a'), '')
})
