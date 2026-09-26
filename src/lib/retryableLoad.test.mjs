// node --test src/lib/retryableLoad.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { ensureLoadedOnce } from './retryableLoad.js'

test('concurrent calls share one in-flight request', async () => {
  const holder = { loadPromise: null }
  let calls = 0
  const load = async () => {
    calls += 1
  }
  await Promise.all([ensureLoadedOnce(holder, load), ensureLoadedOnce(holder, load)])
  assert.equal(calls, 1)
})

test('a successful load stays cached', async () => {
  const holder = { loadPromise: null }
  let calls = 0
  const load = async () => {
    calls += 1
  }
  await ensureLoadedOnce(holder, load)
  await ensureLoadedOnce(holder, load)
  assert.equal(calls, 1)
})

test('a failed load is not cached: the next call retries and can recover', async () => {
  const holder = { loadPromise: null }
  let calls = 0
  let networkUp = false
  const load = async () => {
    calls += 1
    if (!networkUp) throw new Error('Failed to fetch')
  }

  await assert.rejects(ensureLoadedOnce(holder, load), /Failed to fetch/)
  assert.equal(holder.loadPromise, null)

  networkUp = true
  await ensureLoadedOnce(holder, load)
  assert.equal(calls, 2)
})

test('a synchronous throw from the loader is treated like a rejection', async () => {
  const holder = { loadPromise: null }
  await assert.rejects(
    ensureLoadedOnce(holder, () => {
      throw new Error('boom')
    }),
    /boom/,
  )
  assert.equal(holder.loadPromise, null)
})

test('a stale rejection never clears a newer cached promise', async () => {
  const holder = { loadPromise: null }
  let rejectFirst
  const first = ensureLoadedOnce(holder, () => new Promise((_, reject) => (rejectFirst = reject)))
  await Promise.resolve()
  // Simulate something else having replaced the cache meanwhile.
  const newer = Promise.resolve('newer')
  holder.loadPromise = newer
  rejectFirst(new Error('old failure'))
  await assert.rejects(first)
  assert.equal(holder.loadPromise, newer)
})

// Same shape as useTraineesStore's ensureLoaded(): the helper is called
// with the real Pinia store `this`, so this checks the cached promise
// survives Pinia's reactive state (identity comparison included).
test('works as a Pinia store action and recovers after a failure', async () => {
  setActivePinia(createPinia())
  let networkUp = false
  const useStore = defineStore('retryableLoadTest', {
    state: () => ({ items: [], loaded: false, loadPromise: null }),
    actions: {
      ensureLoaded() {
        return ensureLoadedOnce(this, () => this.fetchAll())
      },
      async fetchAll() {
        if (!networkUp) throw new Error('Failed to fetch')
        this.items = ['a']
        this.loaded = true
      },
    },
  })
  const store = useStore()

  await assert.rejects(store.ensureLoaded())
  assert.equal(store.loaded, false)
  assert.equal(store.loadPromise, null)

  networkUp = true
  await store.ensureLoaded()
  assert.equal(store.loaded, true)
  assert.deepEqual(store.items, ['a'])
})
