import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  passesCommitThreshold,
  resolveSwipeTarget,
  startedInHorizontalScroller,
} from './swipeNavigation'
import { clearSlide, setSlideFromGesture, slideDirection } from './swipeTransition'

// Swipe left/right between a portal's main destinations. Mounted once per
// layout -- AppLayout.vue for the coach, TraineeLayout.vue for the
// trainee -- each passing its own ordered route list.
//
// THE MOTION MUST NEVER REVERSE OR JUMP. Two earlier revisions each broke
// that in their own way:
//
//   1. The first acted only on touchend, so nothing moved until the
//      finger lifted. Perceived latency in a gesture is the time until
//      something moves, not the time until it finishes.
//   2. The second followed the finger but then, on commit, reset the
//      page to 0 before the next one animated in from 40px -- a visible
//      snap backwards in the middle of a forward gesture. That is what
//      read as "not smooth": not the frame rate, a discontinuity.
//
// So the page now leaves in the direction the finger was already
// travelling, and the next page continues from the far edge on the same
// axis. Nothing reverses, nothing teleports.
//
// `touch-action: pan-y` (style.css) is what makes the first frame
// immediate: without it the browser withholds touchmove while it decides
// whether the gesture is a scroll. The drag writes el.style.transform
// inside rAF with translate3d, so it is composited -- no layout, no
// paint, no Vue reactivity per frame.
//
// Touch-only on purpose: a mouse drag across a page is a text selection,
// and desktop already has the sidebar.
export function useSwipeNavigation(targetRef, routes) {
  const router = useRouter()

  let startX = 0
  let startY = 0
  let dx = 0
  let axis = null // null = undecided, 'x' = ours, 'y' = the page scrolls
  let tracking = false
  let frame = null
  let width = 360
  // Velocity is measured over the last move only -- a flick's speed is in
  // its final millimetres, not its average.
  let lastX = 0
  let lastT = 0
  let velocity = 0

  function paint() {
    frame = null
    const el = targetRef.value
    if (el) el.style.transform = dx === 0 ? '' : `translate3d(${dx}px,0,0)`
  }
  function schedule() {
    if (frame === null) frame = requestAnimationFrame(paint)
  }
  function cancelFrame() {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }
  function reset(el) {
    cancelFrame()
    el.style.transition = ''
    el.style.transform = ''
    el.style.willChange = ''
  }

  function onTouchStart(event) {
    const el = targetRef.value
    if (!el || event.touches.length !== 1) {
      tracking = false
      return
    }
    const t = event.touches[0]
    startX = lastX = t.clientX
    startY = t.clientY
    lastT = event.timeStamp || performance.now()
    velocity = 0
    dx = 0
    axis = null
    tracking = true
    width = el.clientWidth || 360
    // No transition while the finger is down: the page tracks it exactly
    // rather than chasing it.
    el.style.transition = 'none'
    el.style.willChange = 'transform'
  }

  function onTouchMove(event) {
    if (!tracking) return
    const el = targetRef.value
    if (!el || event.touches.length !== 1) return

    const t = event.touches[0]
    const mx = t.clientX - startX
    const my = t.clientY - startY

    if (axis === null) {
      // Decided once, within a few pixels, and never revisited: a gesture
      // that changes its mind mid-stroke feels broken.
      if (Math.abs(mx) < 5 && Math.abs(my) < 5) return
      axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
      if (axis === 'y') {
        reset(el)
        tracking = false
        return
      }
      if (startedInHorizontalScroller(t.target, el)) {
        // The gesture belongs to a rail or table inside the page.
        reset(el)
        tracking = false
        return
      }
    }
    if (axis !== 'x') return

    const now = event.timeStamp || performance.now()
    const dt = now - lastT
    if (dt > 0) velocity = (t.clientX - lastX) / dt
    lastX = t.clientX
    lastT = now

    // Rubber-band where there is nowhere to go, so an end feels like an
    // edge rather than a dead control.
    const reachable = resolveSwipeTarget(router.currentRoute.value.path, mx, routes)
    dx = reachable ? mx : mx * 0.25
    schedule()
  }

  function finish(event) {
    if (!tracking) return
    tracking = false
    const el = targetRef.value
    if (!el) return

    const t = event.changedTouches && event.changedTouches[0]
    if (axis !== 'x' || !t || event.touches.length > 0) {
      reset(el)
      return
    }

    const totalX = t.clientX - startX
    const target = passesCommitThreshold(totalX, velocity, width)
      ? resolveSwipeTarget(router.currentRoute.value.path, totalX, routes)
      : null

    if (!target) {
      // Ease back to rest. Short, so a rejected swipe does not hold the
      // page hostage.
      cancelFrame()
      dx = 0
      el.style.transition = 'transform 0.18s cubic-bezier(0.22,0.9,0.24,1)'
      el.style.transform = ''
      window.setTimeout(() => {
        if (!tracking && targetRef.value === el) {
          el.style.transition = ''
          el.style.willChange = ''
        }
      }, 200)
      return
    }

    // Committed. Navigate on this very frame.
    //
    // The previous revision animated the outgoing page off the edge and
    // waited 110ms before navigating -- 110ms in which the finger had
    // already lifted and nothing new was happening. Added to a 240ms
    // enter, that is a third of a second of waiting after the gesture is
    // over, which is precisely what "stuck" describes. The outgoing page
    // is about to be replaced anyway, so animating it out buys nothing
    // and costs the whole delay.
    cancelFrame()
    setSlideFromGesture(totalX)
    el.style.transition = ''
    el.style.willChange = ''
    router.push(target)
  }

  function onAnimationEnd() {
    clearSlide()
  }

  onMounted(() => {
    const el = targetRef.value
    if (!el) return
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', finish, { passive: true })
    el.addEventListener('touchcancel', finish, { passive: true })
    el.addEventListener('animationend', onAnimationEnd)
  })

  onBeforeUnmount(() => {
    cancelFrame()
    const el = targetRef.value
    if (!el) return
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', finish)
    el.removeEventListener('touchcancel', finish)
    el.removeEventListener('animationend', onAnimationEnd)
  })

  // The shared ref, so every layout renders the direction the gesture
  // that led here actually set.
  return { slideFrom: slideDirection }
}
