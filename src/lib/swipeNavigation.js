// Pure decision logic behind the swipe-between-pages gesture (see
// useSwipeNavigation.js for the DOM/router wiring). Split out so every
// rule here is unit-testable without a Vue or jsdom harness this repo
// doesn't have -- the same pattern displayName.js already follows.

// The destinations a swipe moves between, in the order each portal's
// bottom nav shows them. Only plain, id-less pages: the coach nav's
// central "הוספה" slot is a form (swiping into a form by accident would
// be hostile) and "עוד" is a sheet, not a page.
//
// Stated here rather than read off the nav components so the swipe order
// is declared once and tested, instead of being implied by template
// order in two different files.
export const COACH_SWIPE_ROUTES = ['/', '/trainees', '/alerts']
export const TRAINEE_SWIPE_ROUTES = [
  '/trainee',
  '/trainee/training',
  '/trainee/nutrition',
  '/trainee/progress',
]

/**
 * Which path a swipe should navigate to, or null when it should be
 * ignored.
 *
 * DIRECTION. The pages sit in a right-to-left strip, matching the bottom
 * nav: the home slot is rightmost and each later destination sits
 * further left. Dragging the strip to the RIGHT therefore brings the
 * next destination in from the left edge, so a POSITIVE deltaX advances.
 *
 * An earlier revision had this the other way round and the app moved
 * opposite to the finger. It is stated here once, with the drag now
 * animating continuously in the same direction, so the two can never
 * disagree again.
 *
 * @param {string} currentPath  router.currentRoute.path
 * @param {number} deltaX       total horizontal travel, px (positive = rightwards)
 * @param {string[]} routes     the ordered destinations for this portal
 * @returns {string|null} the path to navigate to, or null to do nothing
 */
export function resolveSwipeTarget(currentPath, deltaX, routes) {
  if (!Array.isArray(routes) || routes.length < 2) return null
  const index = routes.indexOf(normalizePath(currentPath))
  // Not on a swipeable page (a trainee detail, a form, a login screen):
  // the gesture is not ours to act on.
  if (index === -1) return null
  if (!Number.isFinite(deltaX) || deltaX === 0) return null

  const next = deltaX > 0 ? index + 1 : index - 1
  // No wrapping: running off either end does nothing, so the first and
  // last pages feel like ends rather than silently looping around.
  if (next < 0 || next >= routes.length) return null

  return routes[next]
}

// Trailing slashes and query/hash are irrelevant to which page we are on.
// Exact matching after that, so '/trainee' never collides with
// '/trainees' -- two different portals' home pages.
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
 * rivals its horizontal travel is the start of a scroll. Hijacking
 * either would make the page feel broken in a way that is hard to
 * attribute.
 */
export function isHorizontalSwipe(deltaX, deltaY, opts = {}) {
  const minDistance = opts.minDistance ?? 60
  const ratio = opts.ratio ?? 1.6
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return false

  const ax = Math.abs(deltaX)
  const ay = Math.abs(deltaY)
  if (ax < minDistance) return false
  return ax > ay * ratio
}

/**
 * Whether a finished gesture should actually change the page.
 *
 * Distance alone is the wrong test on a phone: a quick flick travels
 * barely any distance but is unmistakably a swipe, and requiring 60px
 * from it is what made light swipes feel ignored. Either a deliberate
 * drag (a quarter of the screen) or a genuine flick commits.
 *
 * @param {number} deltaX   total horizontal travel, px
 * @param {number} velocity px per millisecond over the last moves
 * @param {number} width    the swiped element's width, px
 */
export function passesCommitThreshold(deltaX, velocity, width) {
  if (!Number.isFinite(deltaX)) return false
  const distance = Math.abs(deltaX)
  const speed = Number.isFinite(velocity) ? Math.abs(velocity) : 0
  const w = Number.isFinite(width) && width > 0 ? width : 360

  if (distance >= w * 0.25) return true
  // A flick still has to travel far enough to not be a tap with a slip.
  return speed >= 0.35 && distance >= 24
}

/**
 * Whether the gesture started somewhere that owns horizontal scrolling of
 * its own (a table, a code block, a horizontally scrolling rail). Swiping
 * inside one of those must scroll it, never change the page.
 */
export function startedInHorizontalScroller(target, boundary, readStyle) {
  const getStyle =
    readStyle ??
    ((el) =>
      typeof globalThis.getComputedStyle === 'function' ? globalThis.getComputedStyle(el) : null)

  let el = target
  while (el && el !== boundary) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getStyle(el)?.overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}
