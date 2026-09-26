// node --test src/lib/debouncedSearchGuard.test.mjs
//
// Exercises the actual guard/predicate TraineeNutritionView.vue's
// reference-catalog search wires up (createSearchGuard() +
// isApplicableSearchResponse()), not a reimplementation of it -- these
// are the same exports the component imports.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSearchGuard, isApplicableSearchResponse } from './debouncedSearchGuard.js'

test('an older response cannot overwrite a newer search', () => {
  const guard = createSearchGuard()
  const oldToken = guard.start() // e.g. searching "chi"
  const newToken = guard.start() // e.g. searching "chicken", before "chi" resolved

  assert.equal(
    isApplicableSearchResponse({
      guard,
      token: oldToken,
      requestTerm: 'chi',
      currentTerm: 'chicken',
    }),
    false,
    'the old "chi" response must be discarded once "chicken" has started',
  )
  assert.equal(
    isApplicableSearchResponse({
      guard,
      token: newToken,
      requestTerm: 'chicken',
      currentTerm: 'chicken',
    }),
    true,
    'the newer "chicken" response is still applicable',
  )
})

test('clearing the field while a request is running leaves the search idle with no results', () => {
  const guard = createSearchGuard()
  const token = guard.start() // request in flight for "apple"

  // The field is cleared (or shortened below the minimum length) while
  // the request is still running -- the view calls invalidate() here,
  // synchronously, without waiting for the request to resolve.
  guard.invalidate()

  // The in-flight request eventually resolves (success or failure, it
  // doesn't matter) -- its response must never be applied.
  assert.equal(
    isApplicableSearchResponse({ guard, token, requestTerm: 'apple', currentTerm: '' }),
    false,
  )
  // Also true even if, hypothetically, the field held the exact same
  // term again by the time it resolves: invalidate() alone must be
  // enough to retire this specific request.
  assert.equal(
    isApplicableSearchResponse({ guard, token, requestTerm: 'apple', currentTerm: 'apple' }),
    false,
  )
})

test('a late failure from an older request cannot replace a newer successful result with an error', () => {
  const guard = createSearchGuard()
  const oldToken = guard.start() // "ric" -- will fail, and resolve LAST
  const newToken = guard.start() // "rice" -- will succeed, and resolve FIRST

  // The newer request resolves first and is applied.
  assert.equal(
    isApplicableSearchResponse({ guard, token: newToken, requestTerm: 'rice', currentTerm: 'rice' }),
    true,
  )

  // The older request's failure arrives afterwards -- it must not be
  // applied, so it can never stomp the newer request's success with an
  // error state.
  assert.equal(
    isApplicableSearchResponse({ guard, token: oldToken, requestTerm: 'ric', currentTerm: 'rice' }),
    false,
  )
})

test('retry uses the current normalized term, not whatever the failed request searched for', () => {
  const guard = createSearchGuard()
  const failedToken = guard.start()
  // Between the failure and the retry click, the trainee edited the term
  // (e.g. fixed a typo) -- retry must key off the CURRENT field value.
  const currentTerm = 'oatmeal'
  assert.equal(
    isApplicableSearchResponse({
      guard,
      token: failedToken,
      requestTerm: 'oatmea', // the stale, pre-edit term the failed request was for
      currentTerm,
    }),
    false,
  )

  const retryToken = guard.start()
  assert.equal(
    isApplicableSearchResponse({ guard, token: retryToken, requestTerm: currentTerm, currentTerm }),
    true,
  )
})

test('the loading state belongs only to the latest active request', () => {
  const guard = createSearchGuard()
  const first = guard.start()
  const second = guard.start()

  // A caller sets its own "searching" flag to false only from inside the
  // branch guarded by isCurrent()/isApplicableSearchResponse() (see
  // runReferenceSearch) -- so the first (superseded) request must never
  // pass that guard, no matter when it resolves.
  assert.equal(guard.isCurrent(first), false)
  assert.equal(guard.isCurrent(second), true)

  // Even after the second (current) request itself resolves, the first
  // one still never becomes current again.
  assert.equal(guard.isCurrent(first), false)
})

// End-to-end through real async timing (not just the pure predicate in
// isolation): a small stand-in for runReferenceSearch's own shape --
// claim a token, await a fetch, then only apply the outcome if still
// applicable -- proving the guard actually prevents the race when two
// real, differently-timed promises are in flight together.
function makeHarness() {
  const guard = createSearchGuard()
  const state = { term: '', searching: false, failed: false, results: null }

  async function search(term, fetch) {
    const token = guard.start()
    state.searching = true
    state.failed = false
    let results = null
    let failed = false
    try {
      results = await fetch()
    } catch {
      failed = true
    }
    const applicable = isApplicableSearchResponse({
      guard,
      token,
      requestTerm: term,
      currentTerm: state.term,
    })
    if (!applicable) return
    if (failed) {
      state.results = null
      state.failed = true
    } else {
      state.results = results
      state.failed = false
    }
    state.searching = false
  }

  return { guard, state, search }
}

test('end-to-end: a slow older request cannot overwrite a fast newer one', async () => {
  const h = makeHarness()
  h.state.term = 'chi'
  const slowOld = h.search('chi', () => new Promise((r) => setTimeout(() => r(['old-result']), 20)))

  h.state.term = 'chicken'
  const fastNew = h.search('chicken', () => Promise.resolve(['new-result']))

  await fastNew
  assert.deepEqual(h.state.results, ['new-result'])

  await slowOld // resolves later; must not have touched state
  assert.deepEqual(h.state.results, ['new-result'])
  assert.equal(h.state.failed, false)
})

test('end-to-end: clearing the field mid-request leaves it idle with no results', async () => {
  const h = makeHarness()
  h.state.term = 'apple'
  let resolveFetch
  const pending = h.search('apple', () => new Promise((r) => (resolveFetch = r)))

  h.state.term = ''
  h.guard.invalidate()
  h.state.searching = false

  resolveFetch(['apple-pie'])
  await pending

  assert.equal(h.state.results, null)
  assert.equal(h.state.failed, false)
  assert.equal(h.state.searching, false)
})

test('end-to-end: an older failure cannot replace a newer success with an error', async () => {
  const h = makeHarness()
  h.state.term = 'ric'
  const slowFail = h.search(
    'ric',
    () => new Promise((_, reject) => setTimeout(() => reject(new Error('network')), 20)),
  )

  h.state.term = 'rice'
  const fastSuccess = h.search('rice', () => Promise.resolve(['rice']))
  await fastSuccess
  assert.deepEqual(h.state.results, ['rice'])

  await slowFail
  assert.deepEqual(h.state.results, ['rice'])
  assert.equal(h.state.failed, false)
})

test('end-to-end: only the latest request is allowed to clear the loading flag', async () => {
  const h = makeHarness()
  h.state.term = 'a'
  let resolveFirst
  const first = h.search('a', () => new Promise((r) => (resolveFirst = r)))
  assert.equal(h.state.searching, true)

  h.state.term = 'ab'
  const second = h.search('ab', () => Promise.resolve(['ab-result']))
  await second
  assert.equal(h.state.searching, false)

  // Reopen "searching" as if a third keystroke started yet another
  // request, then let the FIRST request's stale response arrive.
  h.state.searching = true
  resolveFirst(['a-result'])
  await first
  assert.equal(h.state.searching, true, 'the stale first response must not clear the flag')
})
