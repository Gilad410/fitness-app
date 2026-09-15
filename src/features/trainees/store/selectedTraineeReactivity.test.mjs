// node --test src/features/trainees/store/selectedTraineeReactivity.test.mjs
//
// End-to-end reactivity tests through the REAL selectedTraineeStorage.js
// -- the exact module selectedTrainee.js (the real Pinia store the app
// uses) delegates every read/write/clear/reconcile call to, completely
// unmocked here. selectedTrainee.js itself cannot be imported directly
// under plain Node -- confirmed: it imports ../../../stores/auth without
// a file extension, which plain Node ESM (unlike Vite) refuses to
// resolve, and that module in turn imports src/lib/supabaseClient.js,
// which requires real Vite-injected env vars -- same category of
// limitation as nutritionLogs.js/traineeNutrition.js in this repo's
// other store tests. So the Pinia store below is defined right here,
// deliberately matching selectedTrainee.js's own state shape and action
// bodies exactly, backed by a fake auth-store-like object instead of the
// real useAuthStore() -- what this verifies is genuine: real Pinia
// reactivity, real computed() dependency tracking (the exact mechanism
// TheSidebar.vue's/TheBottomNavElectric.vue's activeTraineeId relies on),
// and the real selectedTraineeStorage.js persistence/reconciliation logic
// -- just not literally the store file's own few lines of glue, which
// are visually trivial to review directly (three one-line actions, no
// branching of their own).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computed } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import {
  readSelectedTrainee,
  writeSelectedTrainee,
  clearSelectedTrainee,
  reconcileSelectionWithRoute,
} from './selectedTraineeStorage.js'

function makeFakeStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  }
}

// Same state shape and action bodies as the real selectedTrainee.js, with
// a fake `currentCoachUserId()` standing in for useAuthStore().user?.id
// and an injected fake storage standing in for window.localStorage.
function useSelectedTraineeLikeStore({ currentCoachUserId, storage }) {
  const useStore = defineStore('selectedTraineeLike', {
    state: () => ({ traineeId: null }),
    actions: {
      restore() {
        this.traineeId = readSelectedTrainee(currentCoachUserId(), storage)
      },
      select(traineeId) {
        this.traineeId = traineeId
        writeSelectedTrainee(currentCoachUserId(), traineeId, storage)
      },
      clear() {
        this.traineeId = null
        clearSelectedTrainee(currentCoachUserId(), storage)
      },
    },
  })
  return useStore()
}

// Same shape as TheSidebar.vue's/TheBottomNavElectric.vue's own
// activeTraineeId computed -- only counts a remembered id that still
// resolves against the (fake, RLS-shaped) trainees roster.
function useActiveTraineeId(store, trainees) {
  return computed(() => {
    const id = store.traineeId
    return id && trainees.some((t) => t.id === id) ? id : null
  })
}

// ---------------------------------------------------------------------
// Navigation with trainees A and B
// ---------------------------------------------------------------------
test('selecting trainee A, then trainee B, updates the reactive nav target consistently', () => {
  setActivePinia(createPinia())
  const storage = makeFakeStorage()
  const store = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-1', storage })
  const trainees = [{ id: 'trainee-A' }, { id: 'trainee-B' }]
  const activeTraineeId = useActiveTraineeId(store, trainees)
  const progressLink = computed(() => (activeTraineeId.value ? `/progress/${activeTraineeId.value}` : '/progress'))

  assert.equal(progressLink.value, '/progress', 'nothing selected yet -- falls back to the plain list')

  store.select('trainee-A')
  assert.equal(progressLink.value, '/progress/trainee-A')

  store.select('trainee-B')
  assert.equal(progressLink.value, '/progress/trainee-B', 'switching to trainee B must update every trainee-scoped nav target')
})

test('a direct link (explicit route id) reconciles to that trainee even when a different one was previously selected', () => {
  setActivePinia(createPinia())
  const storage = makeFakeStorage()
  const store = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-1', storage })
  store.select('trainee-A')

  // Simulates opening /nutrition/trainee-B directly (a bookmark, a typed
  // URL, or a link from elsewhere) -- the workspace view resolves
  // trainee-B successfully and reconciles.
  const outcome = reconcileSelectionWithRoute({
    resolvedTraineeId: 'trainee-B',
    routeParamId: 'trainee-B',
    rememberedId: store.traineeId,
  })
  assert.deepEqual(outcome, { type: 'select', traineeId: 'trainee-B' })
  store.select(outcome.traineeId)

  assert.equal(store.traineeId, 'trainee-B', 'the explicit route id must win over the previously remembered trainee A')
})

test('"browser back/forward" is just re-visiting a URL with its own explicit trainee id -- reconciliation is stateless and route-driven, not history-stack-dependent', () => {
  setActivePinia(createPinia())
  const storage = makeFakeStorage()
  const store = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-1', storage })

  // Forward: A -> B.
  store.select('trainee-A')
  let outcome = reconcileSelectionWithRoute({ resolvedTraineeId: 'trainee-B', routeParamId: 'trainee-B', rememberedId: store.traineeId })
  store.select(outcome.traineeId)
  assert.equal(store.traineeId, 'trainee-B')

  // Back: the browser re-renders /nutrition/trainee-A -- the workspace
  // view's onMounted runs again with route.params.id = 'trainee-A',
  // exactly as it would on a fresh forward navigation to that same URL.
  outcome = reconcileSelectionWithRoute({ resolvedTraineeId: 'trainee-A', routeParamId: 'trainee-A', rememberedId: store.traineeId })
  store.select(outcome.traineeId)
  assert.equal(store.traineeId, 'trainee-A', 'navigating back to trainee A\'s URL must restore trainee A as the selection')

  // Forward again: the browser re-renders /nutrition/trainee-B.
  outcome = reconcileSelectionWithRoute({ resolvedTraineeId: 'trainee-B', routeParamId: 'trainee-B', rememberedId: store.traineeId })
  store.select(outcome.traineeId)
  assert.equal(store.traineeId, 'trainee-B')
})

// ---------------------------------------------------------------------
// Restoring across a fresh load (AppLayout.vue's restore() on mount)
// ---------------------------------------------------------------------
test('a fresh Pinia instance (simulating a hard page reload) restores the previously persisted selection for the same coach', () => {
  const storage = makeFakeStorage()

  setActivePinia(createPinia())
  const firstLoad = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-1', storage })
  firstLoad.select('trainee-A')

  // A hard reload creates a brand-new Pinia instance -- in-memory state
  // is gone, but the shared fake `storage` (standing in for real
  // localStorage, which DOES survive a reload) is not.
  setActivePinia(createPinia())
  const afterReload = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-1', storage })
  assert.equal(afterReload.traineeId, null, 'a fresh store instance starts with nothing until restore() runs')

  afterReload.restore()
  assert.equal(afterReload.traineeId, 'trainee-A', 'restore() must bring back what was selected before the reload')
})

// ---------------------------------------------------------------------
// Missing or invalid selection
// ---------------------------------------------------------------------
test('missing selection (nothing ever chosen): nav falls back to the plain list route', () => {
  setActivePinia(createPinia())
  const store = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-1', storage: makeFakeStorage() })
  const trainees = [{ id: 'trainee-A' }]
  const activeTraineeId = useActiveTraineeId(store, trainees)

  assert.equal(activeTraineeId.value, null)
})

test('invalid/stale selection (remembered trainee no longer in the roster -- deleted or inaccessible): nav falls back, never shows stale data', () => {
  setActivePinia(createPinia())
  const store = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-1', storage: makeFakeStorage() })
  store.traineeId = 'trainee-DELETED' // simulates a value restored from a previous session

  const currentRoster = [{ id: 'trainee-A' }, { id: 'trainee-B' }] // trainee-DELETED is gone
  const activeTraineeId = useActiveTraineeId(store, currentRoster)

  assert.equal(activeTraineeId.value, null, 'a remembered id absent from the current roster must never be used for navigation')
})

test('a workspace view failing to resolve the remembered trainee clears it, so it stops being offered', () => {
  setActivePinia(createPinia())
  const storage = makeFakeStorage()
  const store = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-1', storage })
  store.select('trainee-DELETED')

  // The coach clicks "Progress" (nav still points at the stale id since
  // it hasn't been validated against a fresh roster fetch yet); the
  // workspace view loads, fails to resolve trainee-DELETED.
  const outcome = reconcileSelectionWithRoute({
    resolvedTraineeId: null,
    routeParamId: 'trainee-DELETED',
    rememberedId: store.traineeId,
  })
  assert.deepEqual(outcome, { type: 'clear' })
  store.clear()

  assert.equal(store.traineeId, null)
  assert.equal(readSelectedTrainee('coach-1', storage), null, 'must also be gone from persisted storage, not just in-memory')
})

// ---------------------------------------------------------------------
// Logout / account change
// ---------------------------------------------------------------------
test('signing out clears the selection, and a different coach signing in on the same browser never sees it', () => {
  const storage = makeFakeStorage()

  setActivePinia(createPinia())
  const coachA = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-A', storage })
  coachA.select('trainee-A')
  coachA.clear() // TheHeader.vue's handleLogout()

  assert.equal(coachA.traineeId, null)

  // A different coach signs in on the same browser/tab.
  setActivePinia(createPinia())
  const coachB = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-B', storage })
  coachB.restore()

  assert.equal(coachB.traineeId, null, 'coach B must never see anything -- there was nothing stored under their own key, and coach A\'s was cleared anyway')
})

test('even WITHOUT an explicit clear, a different coach never reads the previous coach\'s remembered trainee (per-coach keying alone is enough)', () => {
  const storage = makeFakeStorage()

  setActivePinia(createPinia())
  const coachA = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-A', storage })
  coachA.select('trainee-A') // no clear() called this time

  setActivePinia(createPinia())
  const coachB = useSelectedTraineeLikeStore({ currentCoachUserId: () => 'coach-B', storage })
  coachB.restore()

  assert.equal(coachB.traineeId, null)
})
