// node --test src/features/trainee/store/traineeNutritionPlanCore.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureLoaded, reset } from './traineeNutritionPlanCore.js'

function makeState() {
  return {
    plan: undefined,
    loadedForUserId: null,
    loading: false,
    loadPromise: null,
    loadPromiseForUserId: null,
    error: null,
  }
}

// A tiny controllable "current user" cell -- deps.getCurrentUserId reads
// it live, so a test can change who's "signed in" mid-flight, exactly
// like a real sign-out/sign-in happening while a request is outstanding.
function makeUserCell(initial) {
  let current = initial
  return {
    get: () => current,
    set: (id) => {
      current = id
    },
  }
}

test('switching users: a different user starting fresh never sees the previous user\'s plan, even before the new fetch resolves', async () => {
  const state = makeState()
  const userA = makeUserCell('user-a')

  await ensureLoaded(state, { getCurrentUserId: userA.get, fetchPlan: async () => ({ id: 'plan-a' }) })
  assert.deepEqual(state.plan, { id: 'plan-a' })
  assert.equal(state.loadedForUserId, 'user-a')

  // User B signs in (a different id, not null -- the "different trainee,
  // same SPA session, no reload" scenario from the bug report).
  userA.set('user-b')

  // Never-resolving fetch for B -- lets us assert the SYNCHRONOUS clear
  // happens before any response ever arrives.
  let resolveB
  const bPromise = ensureLoaded(state, {
    getCurrentUserId: userA.get,
    fetchPlan: () => new Promise((resolve) => (resolveB = resolve)),
  })
  assert.equal(state.plan, undefined, "A's plan must already be cleared, synchronously, before B's fetch even resolves")
  assert.equal(state.loadedForUserId, null)

  resolveB({ id: 'plan-b' })
  await bPromise
  assert.deepEqual(state.plan, { id: 'plan-b' })
  assert.equal(state.loadedForUserId, 'user-b')
})

test('signing out (identity becomes null) clears a previously loaded plan the same way a user switch does', async () => {
  const state = makeState()
  const user = makeUserCell('user-a')
  await ensureLoaded(state, { getCurrentUserId: user.get, fetchPlan: async () => ({ id: 'plan-a' }) })
  assert.notEqual(state.plan, undefined)

  user.set(null)
  let resolveAfterSignOut
  const promise = ensureLoaded(state, {
    getCurrentUserId: user.get,
    fetchPlan: () => new Promise((resolve) => (resolveAfterSignOut = resolve)),
  })
  assert.equal(state.plan, undefined, 'signing out must clear the previous plan synchronously')
  resolveAfterSignOut(null)
  await promise
})

test('stale in-flight response: a slow response for a user who has since signed out is discarded, not committed', async () => {
  const state = makeState()
  const user = makeUserCell('user-a')

  let resolveSlow
  const slowPromise = ensureLoaded(state, {
    getCurrentUserId: user.get,
    fetchPlan: () => new Promise((resolve) => (resolveSlow = resolve)),
  })

  // The user signs out (or a different user signs in) WHILE the request
  // for user-a is still outstanding.
  user.set(null)

  resolveSlow({ id: 'plan-a-late' })
  await slowPromise

  assert.equal(state.plan, undefined, "a stale response for the previous user must never be committed")
  assert.equal(state.loadedForUserId, null)
})

test('stale in-flight response: a slow response for user A is discarded even if user B\'s own (faster) load already committed', async () => {
  const state = makeState()
  const user = makeUserCell('user-a')

  let resolveA
  const aPromise = ensureLoaded(state, {
    getCurrentUserId: user.get,
    fetchPlan: () => new Promise((resolve) => (resolveA = resolve)),
  })

  user.set('user-b')
  const bPromise = ensureLoaded(state, { getCurrentUserId: user.get, fetchPlan: async () => ({ id: 'plan-b' }) })
  await bPromise
  assert.deepEqual(state.plan, { id: 'plan-b' })

  // A's request FINALLY resolves, after B's has already committed.
  resolveA({ id: 'plan-a-very-late' })
  await aPromise

  assert.deepEqual(state.plan, { id: 'plan-b' }, "A's late response must not clobber B's already-committed plan")
  assert.equal(state.loadedForUserId, 'user-b')
})

test('failed-load retry: a failure is not cached forever -- the next ensureLoaded() call starts a fresh request', async () => {
  const state = makeState()
  const user = makeUserCell('user-a')
  let attempts = 0

  await assert.rejects(
    ensureLoaded(state, {
      getCurrentUserId: user.get,
      fetchPlan: async () => {
        attempts += 1
        throw new Error('network blip')
      },
    }),
  )
  assert.equal(state.loadPromise, null, 'a settled (even failed) load must not linger as "in flight"')
  assert.equal(attempts, 1)

  // Retry: a second call for the SAME still-signed-in user must not reuse
  // the dead, already-rejected promise -- it must actually try again.
  await ensureLoaded(state, { getCurrentUserId: user.get, fetchPlan: async () => ({ id: 'plan-a' }) })
  assert.equal(attempts, 1, 'the successful retry uses its own fetchPlan, not the failing one from the first call')
  assert.deepEqual(state.plan, { id: 'plan-a' })
})

test('revisiting an updated plan: a resolved load is never cached forever -- the next call re-fetches so a coach edit becomes visible', async () => {
  const state = makeState()
  const user = makeUserCell('user-a')

  await ensureLoaded(state, { getCurrentUserId: user.get, fetchPlan: async () => ({ id: 'plan-a', title: 'Old title' }) })
  assert.equal(state.plan.title, 'Old title')

  // Same user "revisits" the nutrition page (a fresh ensureLoaded() call,
  // e.g. from a remounted component) -- must hit the network again rather
  // than silently reusing the first response forever.
  await ensureLoaded(state, { getCurrentUserId: user.get, fetchPlan: async () => ({ id: 'plan-a', title: 'Coach edited this' }) })
  assert.equal(state.plan.title, 'Coach edited this')
})

test('concurrent calls for the same user in the same tick dedupe to one request', async () => {
  const state = makeState()
  const user = makeUserCell('user-a')
  let calls = 0

  const [p1, p2] = [
    ensureLoaded(state, {
      getCurrentUserId: user.get,
      fetchPlan: async () => {
        calls += 1
        return { id: 'plan-a' }
      },
    }),
    ensureLoaded(state, {
      getCurrentUserId: user.get,
      fetchPlan: async () => {
        calls += 1
        return { id: 'plan-a' }
      },
    }),
  ]
  assert.equal(p1, p2, 'the second call must reuse the exact same in-flight promise')
  await p1
  assert.equal(calls, 1)
})

test('reset() clears everything back to the initial "nothing loaded" shape', async () => {
  const state = makeState()
  const user = makeUserCell('user-a')
  await ensureLoaded(state, { getCurrentUserId: user.get, fetchPlan: async () => ({ id: 'plan-a' }) })
  assert.notEqual(state.plan, undefined)

  reset(state)
  assert.equal(state.plan, undefined)
  assert.equal(state.loadedForUserId, null)
  assert.equal(state.loading, false)
  assert.equal(state.loadPromise, null)
  assert.equal(state.loadPromiseForUserId, null)
  assert.equal(state.error, null)
})
