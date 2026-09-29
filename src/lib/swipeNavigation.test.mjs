import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SWIPE_ROUTES,
  resolveSwipeTarget,
  isHorizontalSwipe,
  startedInHorizontalScroller,
} from './swipeNavigation.js'

// ---------------------------------------------------------------------
// Which page a swipe lands on
// ---------------------------------------------------------------------

test('the swipe order matches the bottom nav, and excludes the form and the sheet', () => {
  assert.deepEqual(SWIPE_ROUTES, ['/', '/trainees', '/alerts'])
  assert.ok(!SWIPE_ROUTES.includes('/trainees/new'), 'must never swipe into the add form')
})

test('swiping left advances to the next page (RTL: further along is leftwards)', () => {
  assert.equal(resolveSwipeTarget('/', -90), '/trainees')
  assert.equal(resolveSwipeTarget('/trainees', -90), '/alerts')
})

test('swiping right goes back a page', () => {
  assert.equal(resolveSwipeTarget('/alerts', 90), '/trainees')
  assert.equal(resolveSwipeTarget('/trainees', 90), '/')
})

test('the ends do not wrap around', () => {
  assert.equal(resolveSwipeTarget('/', 90), null, 'first page: swiping back does nothing')
  assert.equal(resolveSwipeTarget('/alerts', -90), null, 'last page: swiping on does nothing')
})

test('pages outside the swipe set are left alone', () => {
  for (const path of ['/trainees/new', '/trainees/abc-123', '/nutrition', '/progress/7', '/login']) {
    assert.equal(resolveSwipeTarget(path, -90), null, `${path} must not be swipeable`)
    assert.equal(resolveSwipeTarget(path, 90), null, `${path} must not be swipeable`)
  }
})

test('query strings, hashes and trailing slashes still resolve to the right page', () => {
  assert.equal(resolveSwipeTarget('/trainees?filter=active', -90), '/alerts')
  assert.equal(resolveSwipeTarget('/trainees#top', 90), '/')
  assert.equal(resolveSwipeTarget('/trainees/', -90), '/alerts')
})

test('a zero or nonsense delta resolves to nothing', () => {
  assert.equal(resolveSwipeTarget('/', 0), null)
  assert.equal(resolveSwipeTarget('/', NaN), null)
  assert.equal(resolveSwipeTarget('/', undefined), null)
  assert.equal(resolveSwipeTarget(undefined, -90), null)
})

// ---------------------------------------------------------------------
// What counts as a swipe at all
// ---------------------------------------------------------------------

test('a clear horizontal drag is a swipe', () => {
  assert.equal(isHorizontalSwipe(-120, 10), true)
  assert.equal(isHorizontalSwipe(120, -8), true)
})

test('a short drag is a shaky tap, not a swipe', () => {
  assert.equal(isHorizontalSwipe(-30, 2), false)
  assert.equal(isHorizontalSwipe(59, 0), false)
  assert.equal(isHorizontalSwipe(61, 0), true)
})

test('a vertical drag is a scroll and must never change the page', () => {
  assert.equal(isHorizontalSwipe(10, -300), false)
  assert.equal(isHorizontalSwipe(0, 200), false)
})

test('a diagonal drag is treated as a scroll, not a page change', () => {
  // 100 across, 80 down: clearly horizontal by raw distance, but not by
  // enough of a margin to be confident it was not a scroll.
  assert.equal(isHorizontalSwipe(100, 80), false)
  assert.equal(isHorizontalSwipe(100, 20), true)
})

test('non-finite input is never a swipe', () => {
  assert.equal(isHorizontalSwipe(NaN, 0), false)
  assert.equal(isHorizontalSwipe(100, Infinity), false)
})

// ---------------------------------------------------------------------
// Gestures that belong to something else
// ---------------------------------------------------------------------

function el({ scrollWidth = 0, clientWidth = 0, overflowX = 'visible', parent = null }) {
  return { scrollWidth, clientWidth, parentElement: parent, __overflowX: overflowX }
}
const readStyle = (e) => ({ overflowX: e.__overflowX })

test('a swipe starting inside a horizontal scroller belongs to that scroller', () => {
  const rail = el({ scrollWidth: 900, clientWidth: 320, overflowX: 'auto' })
  const child = el({ parent: rail })
  assert.equal(startedInHorizontalScroller(child, null, readStyle), true)
})

test('an element that merely overflows, without scrolling, does not count', () => {
  const wide = el({ scrollWidth: 900, clientWidth: 320, overflowX: 'visible' })
  assert.equal(startedInHorizontalScroller(wide, null, readStyle), false)
})

test('a scrollable element that has nothing to scroll does not count', () => {
  const rail = el({ scrollWidth: 320, clientWidth: 320, overflowX: 'auto' })
  assert.equal(startedInHorizontalScroller(rail, null, readStyle), false)
})

test('the walk stops at the boundary, so the page container itself is not consulted', () => {
  const boundary = el({ scrollWidth: 900, clientWidth: 320, overflowX: 'auto' })
  const child = el({ parent: boundary })
  assert.equal(startedInHorizontalScroller(child, boundary, readStyle), false)
})

test('a plain element with no ancestors is safe', () => {
  assert.equal(startedInHorizontalScroller(el({}), null, readStyle), false)
  assert.equal(startedInHorizontalScroller(null, null, readStyle), false)
})
