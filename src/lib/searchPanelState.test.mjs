// node --test src/lib/searchPanelState.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchPanelState } from './searchPanelState.js'

const base = { searching: false, failed: false, resultCount: 0, searched: false }

test('nothing searched yet is idle', () => {
  assert.equal(searchPanelState(base), 'idle')
})

test('a request in flight is searching, even with stale results or an error', () => {
  assert.equal(searchPanelState({ ...base, searching: true }), 'searching')
  assert.equal(searchPanelState({ ...base, searching: true, failed: true }), 'searching')
  assert.equal(
    searchPanelState({ ...base, searching: true, resultCount: 3, searched: true }),
    'searching',
  )
})

test('a failed request shows error even if a previous search had results', () => {
  assert.equal(searchPanelState({ ...base, failed: true }), 'error')
  assert.equal(searchPanelState({ ...base, failed: true, resultCount: 2, searched: true }), 'error')
})

test('a successful search with rows shows results', () => {
  assert.equal(searchPanelState({ ...base, resultCount: 1, searched: true }), 'results')
})

test('a successful search with zero rows shows empty only once searched', () => {
  assert.equal(searchPanelState({ ...base, searched: true }), 'empty')
  assert.equal(searchPanelState({ ...base, resultCount: 0, searched: false }), 'idle')
})
