// node --test src/lib/useResetPassword.test.mjs
//
// Exercises the actual composable useResetPassword.js -- the exact same
// module ResetPasswordView.vue / TraineeResetPasswordView.vue call --
// using real Vue reactivity (ref/computed/reactive from the `vue`
// package, which works standalone under plain Node with no DOM/jsdom;
// verified separately before writing this file) and fake, injected
// authStore/authEventState/supabase/router dependencies. This is
// deliberately NOT testing authEventState.js's pure hasValidRecoveryContext()
// helper again (see that file's own test) -- it tests the REACTIVE WIRING
// around it: that the composable's own `hasValidRecoveryContext` stays
// live rather than a one-time snapshot, and that handleSubmit() actually
// uses live state at the moment of submission. A component that computed
// this once in onMounted and cached it would fail every test below.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reactive } from 'vue'
import { useResetPassword } from './useResetPassword.js'
import { createAuthEventState, applyAuthEvent } from './authEventState.js'

// A fake Pinia store, reactive for the same reason the real one is (Pinia
// store state is itself a Vue reactive() proxy) -- without this, mutating
// `authStore.user` after construction would never be seen by the
// composable's `computed()`, and every "account changes after mount"
// scenario below would be untestable/meaningless.
function makeAuthStore(initialUser) {
  const store = reactive({
    user: initialUser,
    initCalls: 0,
    signOutCalls: 0,
    async init() {
      store.initCalls += 1
    },
    async signOut() {
      store.signOutCalls += 1
      store.user = null
    },
  })
  return store
}

function makeSupabase(updateUserImpl = async () => ({ error: null })) {
  const calls = []
  return {
    calls,
    auth: {
      updateUser: async (payload) => {
        calls.push(payload)
        return updateUserImpl(payload)
      },
    },
  }
}

function makeRouter() {
  const pushed = []
  return { pushed, push: (loc) => pushed.push(loc) }
}

// ---------------------------------------------------------------------
// REPRO 1 (independent review): account changes after mount
// ---------------------------------------------------------------------
test('REPRO 1: account changes from A to B (via SIGNED_IN) after mount -- the UI invalidates live, and submit never calls updateUser for B', async () => {
  const authStore = makeAuthStore({ id: 'user-a' })
  const authEventState = reactive(createAuthEventState())
  applyAuthEvent(authEventState, 'PASSWORD_RECOVERY', 'user-a')

  const supabase = makeSupabase()
  const router = makeRouter()
  const rp = useResetPassword({ authStore, authEventState, supabase, router, loginRouteName: 'login' })

  await rp.initialize()
  assert.equal(rp.checkingSession.value, false)
  assert.equal(rp.hasValidRecoveryContext.value, true, 'must show the form for the verified user A')

  // Account changes to B -- e.g. someone else signs in on the same
  // device/tab before the form is submitted. Dispatched exactly as the
  // real onAuthStateChange listener would.
  authStore.user = { id: 'user-b' }
  applyAuthEvent(authEventState, 'SIGNED_IN', 'user-b')

  // The bug: a component that cached this once in onMounted would still
  // say `true` here. The fix must reflect the change immediately, with
  // no remount.
  assert.equal(rp.hasValidRecoveryContext.value, false, 'the reactive computed must invalidate as soon as the account changes')

  rp.newPassword.value = 'newpassword123'
  rp.confirmNewPassword.value = 'newpassword123'
  await rp.handleSubmit()

  assert.equal(supabase.calls.length, 0, 'updateUser() must never be invoked for the new, unverified account')
  assert.ok(rp.setPasswordError.value, 'a clear error must be shown instead of silently doing nothing')
  assert.equal(authStore.signOutCalls, 0, 'no sign-out/redirect flow should have started either')
})

test('REPRO 1b: same scenario via SIGNED_OUT (no new account, just signed out) is also caught', async () => {
  const authStore = makeAuthStore({ id: 'user-a' })
  const authEventState = reactive(createAuthEventState())
  applyAuthEvent(authEventState, 'PASSWORD_RECOVERY', 'user-a')

  const supabase = makeSupabase()
  const router = makeRouter()
  const rp = useResetPassword({ authStore, authEventState, supabase, router, loginRouteName: 'login' })
  await rp.initialize()
  assert.equal(rp.hasValidRecoveryContext.value, true)

  authStore.user = null
  applyAuthEvent(authEventState, 'SIGNED_OUT', null)
  assert.equal(rp.hasValidRecoveryContext.value, false)

  rp.newPassword.value = 'newpassword123'
  rp.confirmNewPassword.value = 'newpassword123'
  await rp.handleSubmit()
  assert.equal(supabase.calls.length, 0)
})

// ---------------------------------------------------------------------
// REPRO 2 (independent review): PASSWORD_RECOVERY arrives after mount
// ---------------------------------------------------------------------
test('REPRO 2: PASSWORD_RECOVERY arrives AFTER the initial mount check -- the form becomes available without remounting', async () => {
  const authStore = makeAuthStore(null) // nothing signed in yet at mount time
  const authEventState = reactive(createAuthEventState())

  const supabase = makeSupabase()
  const router = makeRouter()
  const rp = useResetPassword({ authStore, authEventState, supabase, router, loginRouteName: 'login' })

  await rp.initialize()
  assert.equal(rp.hasValidRecoveryContext.value, false, 'nothing verified yet at the moment initialize() finished')

  // The recovery callback finishes verifying only now -- a real possible
  // timing case (e.g. the event's own microtask/flush ordering).
  authStore.user = { id: 'user-a' }
  applyAuthEvent(authEventState, 'PASSWORD_RECOVERY', 'user-a')

  assert.equal(
    rp.hasValidRecoveryContext.value,
    true,
    'a late-arriving recovery event must still make the form available -- the bug left this stuck on "invalid link" forever',
  )

  rp.newPassword.value = 'newpassword123'
  rp.confirmNewPassword.value = 'newpassword123'
  await rp.handleSubmit()
  assert.equal(supabase.calls.length, 1)
  assert.equal(supabase.calls[0].password, 'newpassword123')
})

// ---------------------------------------------------------------------
// General coverage
// ---------------------------------------------------------------------
test('happy path: valid recovery, matching passwords -> updateUser called, context consumed, signed out, redirected', async () => {
  const authStore = makeAuthStore({ id: 'user-a' })
  const authEventState = reactive(createAuthEventState())
  applyAuthEvent(authEventState, 'PASSWORD_RECOVERY', 'user-a')

  const supabase = makeSupabase()
  const router = makeRouter()
  const rp = useResetPassword({ authStore, authEventState, supabase, router, loginRouteName: 'trainee-login' })
  await rp.initialize()

  rp.newPassword.value = 'newpassword123'
  rp.confirmNewPassword.value = 'newpassword123'
  await rp.handleSubmit()

  assert.equal(supabase.calls.length, 1)
  assert.equal(authEventState.recoveryReady, false, 'the context must be consumed on success')
  assert.equal(authEventState.recoveryUserId, null)
  assert.equal(authStore.signOutCalls, 1)
  assert.equal(rp.done.value, true)
})

test('one-time use: submitting a second time after a successful reset is refused (context already consumed)', async () => {
  const authStore = makeAuthStore({ id: 'user-a' })
  const authEventState = reactive(createAuthEventState())
  applyAuthEvent(authEventState, 'PASSWORD_RECOVERY', 'user-a')

  const supabase = makeSupabase()
  const router = makeRouter()
  const rp = useResetPassword({ authStore, authEventState, supabase, router, loginRouteName: 'login' })
  await rp.initialize()

  rp.newPassword.value = 'newpassword123'
  rp.confirmNewPassword.value = 'newpassword123'
  await rp.handleSubmit()
  assert.equal(supabase.calls.length, 1)

  // authStore.signOut() clears authStore.user in this fake, matching the
  // real flow -- a second submit attempt (e.g. a duplicate form
  // submission) must be refused regardless.
  await rp.handleSubmit()
  assert.equal(supabase.calls.length, 1, 'no second updateUser() call')
})

test('mismatched passwords are rejected before calling updateUser', async () => {
  const authStore = makeAuthStore({ id: 'user-a' })
  const authEventState = reactive(createAuthEventState())
  applyAuthEvent(authEventState, 'PASSWORD_RECOVERY', 'user-a')

  const supabase = makeSupabase()
  const rp = useResetPassword({ authStore, authEventState, supabase, router: makeRouter(), loginRouteName: 'login' })
  await rp.initialize()

  rp.newPassword.value = 'newpassword123'
  rp.confirmNewPassword.value = 'somethingElse123'
  await rp.handleSubmit()

  assert.equal(supabase.calls.length, 0)
  assert.match(rp.setPasswordError.value, /תואמות/)
})

test('a too-short password is rejected before calling updateUser', async () => {
  const authStore = makeAuthStore({ id: 'user-a' })
  const authEventState = reactive(createAuthEventState())
  applyAuthEvent(authEventState, 'PASSWORD_RECOVERY', 'user-a')

  const supabase = makeSupabase()
  const rp = useResetPassword({ authStore, authEventState, supabase, router: makeRouter(), loginRouteName: 'login' })
  await rp.initialize()

  rp.newPassword.value = 'ab'
  rp.confirmNewPassword.value = 'ab'
  await rp.handleSubmit()

  assert.equal(supabase.calls.length, 0)
  assert.match(rp.setPasswordError.value, new RegExp(String(rp.MIN_PASSWORD_LENGTH)))
})

test('updateUser() failure surfaces a generic error and does not consume the recovery context', async () => {
  const authStore = makeAuthStore({ id: 'user-a' })
  const authEventState = reactive(createAuthEventState())
  applyAuthEvent(authEventState, 'PASSWORD_RECOVERY', 'user-a')

  const supabase = makeSupabase(async () => ({ error: new Error('network blip') }))
  const rp = useResetPassword({ authStore, authEventState, supabase, router: makeRouter(), loginRouteName: 'login' })
  await rp.initialize()

  rp.newPassword.value = 'newpassword123'
  rp.confirmNewPassword.value = 'newpassword123'
  await rp.handleSubmit()

  assert.equal(supabase.calls.length, 1)
  assert.ok(rp.setPasswordError.value)
  assert.equal(authEventState.recoveryReady, true, 'a failed attempt must not burn the still-valid recovery context')
  assert.equal(rp.done.value, false)

  // A retry with the still-valid context must be allowed.
  const retryResult = await (async () => {
    supabase.auth.updateUser = async (payload) => {
      supabase.calls.push(payload)
      return { error: null }
    }
    return rp.handleSubmit()
  })()
  void retryResult
  assert.equal(supabase.calls.length, 2)
  assert.equal(rp.done.value, true)
})

test('no recovery context at all (direct navigation while normally signed in): submit is refused without calling updateUser', async () => {
  const authStore = makeAuthStore({ id: 'user-a' })
  const authEventState = reactive(createAuthEventState())
  // Only an ordinary sign-in ever happened -- no PASSWORD_RECOVERY.
  applyAuthEvent(authEventState, 'SIGNED_IN', 'user-a')

  const supabase = makeSupabase()
  const rp = useResetPassword({ authStore, authEventState, supabase, router: makeRouter(), loginRouteName: 'login' })
  await rp.initialize()

  assert.equal(rp.hasValidRecoveryContext.value, false)

  rp.newPassword.value = 'newpassword123'
  rp.confirmNewPassword.value = 'newpassword123'
  await rp.handleSubmit()

  assert.equal(supabase.calls.length, 0)
  assert.ok(rp.setPasswordError.value)
})
