import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleInviteCoachRequest } from './handlerV2.js'

function fixture({ authenticated = true, prepareError = null, sendError = null } = {}) {
  const calls = []
  const asUser = {
    auth: {
      getUser: async () =>
        authenticated
          ? { data: { user: { id: 'owner-1' } }, error: null }
          : { data: { user: null }, error: { message: 'expired' } },
    },
    rpc: async (name, args) => {
      calls.push([name, args])
      return {
        data: [
          {
            invitation_id: 'invite-1',
            invite_token: 'app-token-1',
            invite_expires_at: '2026-10-07T00:00:00Z',
            newly_issued: true,
          },
        ],
        error: null,
      }
    },
  }
  const admin = {
    rpc: async (name, args) => {
      calls.push([name, args])
      if (name === 'owner_admin_prepare_coach_invite') {
        if (prepareError) return { data: null, error: { message: prepareError } }
        return {
          data: [
            {
              invitation_id: 'invite-1',
              email: 'coach@example.com',
              invite_token: 'app-token-1',
              invite_expires_at: '2026-10-07T00:00:00Z',
            },
          ],
          error: null,
        }
      }
      return { data: null, error: null }
    },
    auth: {
      admin: {
        inviteUserByEmail: async (email, options) => {
          calls.push(['inviteUserByEmail', { email, options }])
          return { data: {}, error: null }
        },
        generateLink: async (options) => {
          calls.push(['generateLink', options])
          return {
            data: { properties: { action_link: 'https://auth.example/verify?token=abc' } },
            error: null,
          }
        },
      },
    },
  }
  const sendResendEmail = async (message) => {
    calls.push(['sendResendEmail', message])
    return sendError
  }
  return { asUser, admin, sendResendEmail, calls }
}

test('new invitation keeps the existing Supabase SMTP flow', async () => {
  const f = fixture()
  const result = await handleInviteCoachRequest({
    ...f,
    action: 'invite',
    email: 'coach@example.com',
    siteUrl: 'https://fitness-app.online',
  })
  assert.equal(result.status, 200)
  assert.equal(result.body.action, 'invite')
  assert.ok(f.calls.some(([name]) => name === 'inviteUserByEmail'))
  assert.ok(!f.calls.some(([name]) => name === 'sendResendEmail'))
})

test('resend authorizes, generates a fresh link, and sends it through Resend', async () => {
  const f = fixture()
  const result = await handleInviteCoachRequest({
    ...f,
    action: 'resend',
    invitationId: 'invite-1',
    siteUrl: 'https://fitness-app.online',
  })
  assert.equal(result.status, 200)
  assert.equal(result.body.action, 'resend')
  const generate = f.calls.find(([name]) => name === 'generateLink')[1]
  assert.equal(generate.type, 'invite')
  assert.equal(generate.options.redirectTo, 'https://fitness-app.online/coach/join')
  const message = f.calls.find(([name]) => name === 'sendResendEmail')[1]
  assert.equal(message.to, 'coach@example.com')
  assert.match(message.html, /https:\/\/auth\.example\/verify\?token=abc/)
  assert.ok(!JSON.stringify(result.body).includes('app-token-1'))
})

test('cancel is finalized only after the owner and invitation are validated', async () => {
  const f = fixture()
  const result = await handleInviteCoachRequest({
    ...f,
    action: 'cancel',
    invitationId: 'invite-1',
    siteUrl: 'https://fitness-app.online',
  })
  assert.equal(result.status, 200)
  assert.ok(f.calls.some(([name]) => name === 'owner_admin_prepare_coach_invite'))
  assert.ok(f.calls.some(([name]) => name === 'owner_admin_cancel_coach_invite'))
  assert.ok(!f.calls.some(([name]) => name === 'generateLink'))
})

test('expired login is rejected before a privileged invitation action', async () => {
  const f = fixture({ authenticated: false })
  const result = await handleInviteCoachRequest({
    ...f,
    action: 'resend',
    invitationId: 'invite-1',
    siteUrl: 'https://fitness-app.online',
  })
  assert.equal(result.status, 401)
  assert.match(result.body.error.message, /להתחבר מחדש/)
  assert.ok(!f.calls.some(([name]) => name === 'owner_admin_prepare_coach_invite'))
})

test('database authorization errors are returned in Hebrew', async () => {
  const f = fixture({ prepareError: 'Only the owner may manage coach invitations.' })
  const result = await handleInviteCoachRequest({
    ...f,
    action: 'resend',
    invitationId: 'invite-1',
    siteUrl: 'https://fitness-app.online',
  })
  assert.equal(result.status, 400)
  assert.match(result.body.error.message, /בעל\/ת המערכת/)
})

test('Resend delivery failure is visible and never exposes the invite token', async () => {
  const f = fixture({ sendError: 'temporary outage' })
  const result = await handleInviteCoachRequest({
    ...f,
    action: 'resend',
    invitationId: 'invite-1',
    siteUrl: 'https://fitness-app.online',
  })
  assert.equal(result.status, 502)
  assert.match(result.body.error.message, /שליחת מייל ההזמנה נכשלה/)
  assert.ok(!JSON.stringify(result.body).includes('app-token-1'))
})
