// node --test src/lib/displayName.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDisplayName } from './displayName.js'

test('prefers user_metadata.full_name when present', () => {
  assert.equal(
    resolveDisplayName({ email: 'coach@example.com', user_metadata: { full_name: 'דנה כהן', name: 'Dana' } }),
    'דנה כהן',
  )
})

test('falls back to user_metadata.name when full_name is absent', () => {
  assert.equal(
    resolveDisplayName({ email: 'coach@example.com', user_metadata: { name: 'Dana' } }),
    'Dana',
  )
})

test('falls back to the email local part when no metadata name exists', () => {
  assert.equal(resolveDisplayName({ email: 'dana.coach@example.com', user_metadata: {} }), 'dana.coach')
})

test('falls back to the email local part when user_metadata is entirely absent', () => {
  assert.equal(resolveDisplayName({ email: 'dana.coach@example.com' }), 'dana.coach')
})

test('treats a blank/whitespace-only full_name as absent', () => {
  assert.equal(
    resolveDisplayName({ email: 'dana@example.com', user_metadata: { full_name: '   ', name: 'Dana' } }),
    'Dana',
  )
})

test('treats a blank/whitespace-only name as absent too, falling through to email', () => {
  assert.equal(
    resolveDisplayName({ email: 'dana@example.com', user_metadata: { full_name: '  ', name: '  ' } }),
    'dana',
  )
})

test('never returns an empty string while an email exists (the "never blank" requirement)', () => {
  const result = resolveDisplayName({ email: 'dana@example.com', user_metadata: {} })
  assert.notEqual(result, '')
})

test('returns an empty string only when there is no user at all', () => {
  assert.equal(resolveDisplayName(null), '')
  assert.equal(resolveDisplayName(undefined), '')
})

test('a malformed email with no "@" is still returned as-is, not blanked', () => {
  assert.equal(resolveDisplayName({ email: 'not-an-email', user_metadata: {} }), 'not-an-email')
})
