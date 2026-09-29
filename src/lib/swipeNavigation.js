// Pure decision logic behind the coach portal's swipe-between-pages
// gesture (see useSwipeNavigation.js for the DOM/router wiring). Split out
// so every rule here is unit-testable without a Vue or jsdom harness this
// repo doesn't have -- the same pattern displayName.js and
// coachAccessRouting.js already follow.

// The destinations a swipe moves between, in the order the bottom nav
// shows them. Deliberately only the three plain, id-less coach
// destinations: the central "הוספה" slot is a form (swiping into a form
// by accident would be hostile), and "עוד" is a sheet, not a page.
//
// Kept in this module rather than read off the nav component so the
// swipe order is stated once and tested, instead of being implied by
// template order.
export const SWIPE_ROUTES = ['/', '/trainees', '/alerts']

/**
 * Which path a swipe should navigate to, or null when it should be
 * ignored.
 *
 * RTL note: the bottom nav runs right-to-left (בית is the rightmost
 * slot), so content that is "further along" sits to the LEFT. A finger
 * moving left therefore advances to the next route, which is why a
 * negative deltaX maps to a higher index.
 *
 * @param {string} currentPath  router.currentRoute.path
 * @param {number} deltaX       total horizontal travel, px (negative = leftwards)
 * @returns {string|null} the path to navigate to, or null to do nothing
 */
export function resolveSwipeTarget(currentPath, deltaX) {
  const index = SWIPE_ROUTES.indexOf(normalizePath(currentPath))
  // Not on a swipeable page (a trainee detail, a form, the login screen):
  // the gesture is not ours to act on.
  if (index === -1) return null
  if (!Number.isFinite(deltaX) || deltaX === 0) return null

  const next = deltaX < 0 ? index + 1 : index - 1
  // No wrapping: running off either end does nothing, so the first and
  // last pages feel like ends rather than silently looping the coach
  // back around.
  if (next < 0 || next >= SWIPE_ROUTES.length) return null

  return SWIPE_ROUTES[next]
}

// Trailing slashes and query/hash are irrelevant to which page we are on.
function normalizePath(path) {
  if (typeof path !== 'string' || path === '') return ''
  const clean = path.split('?')[0].split('#')[0]
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1)
  return clean
}

/**
 * Whether a finished gesture counts as a deliberate horizontal swipe.
 *
 * Both rules matter on a phone held one-handed: a swipe that never
 * travels far is a tap with a shaky thumb, and one whose vertical travel
 * rivals its horizontal travel is the start of a scroll. Hijacking either
 * would make the page feel broken in a way that is hard to attribute.
 *
 * @param {number} deltaX horizontal travel, px
 * @param {number} deltaY vertical travel, px
 * @param {{minDistance?: number, ratio?: number}} [opts]
 */
export function isHorizontalSwipe(deltaX, deltaY, opts = {}) {
  const minDistance = opts.minDistance ?? 60
  const ratio = opts.ratio ?? 1.6
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return false

  const ax = Math.abs(deltaX)
  const ay = Math.abs(deltaY)
  if (ax < minDistance) return false
  // Strictly more horizontal than vertical, by a margin -- a diagonal
  // drag is treated as a scroll, not a page change.
  return ax > ay * ratio
}

/**
 * Whether the gesture started somewhere that owns horizontal scrolling of
 * its own (a table, a code block, a horizontally scrolling rail). Swiping
 * inside one of those must scroll it, never change the page.
 *
 * @param {Element|null} target the gesture's starting element
 * @param {Element|null} boundary stop walking at this ancestor
 * @param {(el: Element) => CSSStyleDeclaration} [readStyle] injectable for tests
 */
export function startedInHorizontalScroller(target, boundary, readStyle) {
  const getStyle =
    readStyle ??
    ((el) => (typeof globalThis.getComputedStyle === 'function' ? globalThis.getComputedStyle(el) : null))

  let el = target
  while (el && el !== boundary) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const style = getStyle(el)
      const overflowX = style?.overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}
