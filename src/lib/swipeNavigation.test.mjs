import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COACH_SWIPE_ROUTES,
  TRAINEE_SWIPE_ROUTES,
  resolveSwipeTarget,
  isHorizontalSwipe,
  passesCommitThreshold,
  startedInHorizontalScroller,
} from './swipeNavigation.js'

// ---------------------------------------------------------------------
// Which page a swipe lands on
// ---------------------------------------------------------------------

test('the swipe order matches the bottom nav, and excludes the form and the sheet', () => {
  assert.deepEqual(COACH_SWIPE_ROUTES, ['/', '/trainees', '/alerts'])
  assert.ok(!COACH_SWIPE_ROUTES.includes('/trainees/new'), 'must never swipe into the add form')
})

// Dragging the RTL strip rightwards brings the next destination in from
// the left edge. An earlier revision had this inverted and the app moved
// against the finger.
test('dragging right advances to the next page', () => {
  assert.equal(resolveSwipeTarget('/', 90, COACH_SWIPE_ROUTES), '/trainees')
  assert.equal(resolveSwipeTarget('/trainees', 90, COACH_SWIPE_ROUTES), '/alerts')
})

test('dragging left goes back a page', () => {
  assert.equal(resolveSwipeTarget('/alerts', -90, COACH_SWIPE_ROUTES), '/trainees')
  assert.equal(resolveSwipeTarget('/trainees', -90, COACH_SWIPE_ROUTES), '/')
})

test('the ends do not wrap around', () => {
  assert.equal(resolveSwipeTarget('/', -90, COACH_SWIPE_ROUTES), null, 'first page: dragging back does nothing')
  assert.equal(resolveSwipeTarget('/alerts', 90, COACH_SWIPE_ROUTES), null, 'last page: dragging on does nothing')
})

test('pages outside the swipe set are left alone', () => {
  for (const path of ['/trainees/new', '/trainees/abc-123', '/nutrition', '/progress/7', '/login']) {
    assert.equal(resolveSwipeTarget(path, -90, COACH_SWIPE_ROUTES), null, `${path} must not be swipeable`)
    assert.equal(resolveSwipeTarget(path, 90, COACH_SWIPE_ROUTES), null, `${path} must not be swipeable`)
  }
})

test('query strings, hashes and trailing slashes still resolve to the right page', () => {
  assert.equal(resolveSwipeTarget('/trainees?filter=active', 90, COACH_SWIPE_ROUTES), '/alerts')
  assert.equal(resolveSwipeTarget('/trainees#top', -90, COACH_SWIPE_ROUTES), '/')
  assert.equal(resolveSwipeTarget('/trainees/', 90, COACH_SWIPE_ROUTES), '/alerts')
})

test('a zero or nonsense delta resolves to nothing', () => {
  assert.equal(resolveSwipeTarget('/', 0, COACH_SWIPE_ROUTES), null)
  assert.equal(resolveSwipeTarget('/', NaN, COACH_SWIPE_ROUTES), null)
  assert.equal(resolveSwipeTarget('/', undefined, COACH_SWIPE_ROUTES), null)
  assert.equal(resolveSwipeTarget(undefined, -90, COACH_SWIPE_ROUTES), null)
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

// ---------------------------------------------------------------------
// The trainee portal has its own order
// ---------------------------------------------------------------------

test('the trainee swipe order matches its own bottom nav', () => {
  assert.deepEqual(TRAINEE_SWIPE_ROUTES, [
    '/trainee',
    '/trainee/training',
    '/trainee/nutrition',
    '/trainee/progress',
  ])
})

test('swiping works across all four trainee pages', () => {
  assert.equal(resolveSwipeTarget('/trainee', 90, TRAINEE_SWIPE_ROUTES), '/trainee/training')
  assert.equal(resolveSwipeTarget('/trainee/training', 90, TRAINEE_SWIPE_ROUTES), '/trainee/nutrition')
  assert.equal(resolveSwipeTarget('/trainee/nutrition', 90, TRAINEE_SWIPE_ROUTES), '/trainee/progress')
  assert.equal(resolveSwipeTarget('/trainee/progress', -90, TRAINEE_SWIPE_ROUTES), '/trainee/nutrition')
})

test('the two portals never leak into each other', () => {
  // '/trainee' (the trainee home) must not be confused with '/trainees'
  // (the coach's roster) -- one character apart, opposite portals.
  assert.equal(resolveSwipeTarget('/trainee', -90, COACH_SWIPE_ROUTES), null)
  assert.equal(resolveSwipeTarget('/trainees', -90, TRAINEE_SWIPE_ROUTES), null)
  assert.equal(resolveSwipeTarget('/', -90, TRAINEE_SWIPE_ROUTES), null)
})

test('trainee pages outside the nav are not swipeable', () => {
  for (const p of ['/trainee/measurements', '/trainee/notifications', '/trainee/login']) {
    assert.equal(resolveSwipeTarget(p, -90, TRAINEE_SWIPE_ROUTES), null, p)
  }
})

test('a missing or too-short route list is ignored rather than throwing', () => {
  assert.equal(resolveSwipeTarget('/', -90, undefined), null)
  assert.equal(resolveSwipeTarget('/', -90, []), null)
  assert.equal(resolveSwipeTarget('/', -90, ['/']), null)
})

// ---------------------------------------------------------------------
// What actually commits a page change
// ---------------------------------------------------------------------

const W = 390 // a typical phone

test('a deliberate drag past a quarter of the screen commits', () => {
  assert.equal(passesCommitThreshold(W * 0.25, 0, W), true)
  assert.equal(passesCommitThreshold(-W * 0.4, 0, W), true)
})

test('a slow short drag does not commit', () => {
  assert.equal(passesCommitThreshold(40, 0.05, W), false)
  assert.equal(passesCommitThreshold(-60, 0.1, W), false)
})

test('a fast flick commits even though it barely travelled', () => {
  // This is the case that used to feel ignored: light, quick, ~35px.
  assert.equal(passesCommitThreshold(35, 0.8, W), true)
  assert.equal(passesCommitThreshold(-30, 0.5, W), true)
})

test('a flick that barely moved is a tap with a slip, not a swipe', () => {
  assert.equal(passesCommitThreshold(8, 2.0, W), false)
  assert.equal(passesCommitThreshold(0, 3.0, W), false)
})

test('the threshold scales with the screen, and survives junk', () => {
  assert.equal(passesCommitThreshold(80, 0, 300), true, 'a quarter of a small screen')
  assert.equal(passesCommitThreshold(80, 0, 900), false, 'not a quarter of a wide one')
  assert.equal(passesCommitThreshold(120, NaN, NaN), true)
  assert.equal(passesCommitThreshold(NaN, 1, W), false)
})
