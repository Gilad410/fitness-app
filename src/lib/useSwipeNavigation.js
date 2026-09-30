import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  isHorizontalSwipe,
  resolveSwipeTarget,
  startedInHorizontalScroller,
} from './swipeNavigation'

// Swipe left/right between a portal's main destinations. Mounted once per
// layout -- AppLayout.vue for the coach, TraineeLayout.vue for the
// trainee -- each passing its own ordered route list.
//
// THE PAGE FOLLOWS THE FINGER. The first version of this only acted on
// touchend: nothing on screen moved until the finger lifted, so the
// gesture felt dead and the navigation felt like a delayed jump. Now the
// page translates under the finger from the first millimetre, and the
// release only decides whether that movement completes or springs back.
// The perceived latency of a gesture is the time until something moves,
// not the time until it finishes.
//
// Two things make that actually fast:
//   · `touch-action: pan-y` on the element (set in style.css) tells the
//     browser up front that horizontal movement is ours. Without it the
//     browser waits to see whether the gesture is a scroll before
//     releasing touchmove events, which is its own source of lag.
//   · The drag writes el.style.transform directly inside rAF rather than
//     going through Vue reactivity every frame. Transform is composited,
//     so the drag never triggers layout or paint.
//
// Touch-only on purpose: a mouse drag across a page is a text selection,
// and desktop already has the sidebar.
export function useSwipeNavigation(targetRef, routes) {
  const router = useRouter()
  // Drives the enter animation after a committed swipe.
  const slideFrom = ref('')

  let startX = 0
  let startY = 0
  let dx = 0
  let axis = null // null = undecided, 'x' = ours, 'y' = the page scrolls
  let tracking = false
  let frame = null

  function paint() {
    frame = null
    const el = targetRef.value
    if (el) el.style.transform = dx === 0 ? '' : `translate3d(${dx}px,0,0)`
  }
  function schedule() {
    if (frame === null) frame = requestAnimationFrame(paint)
  }
  function release(el) {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
    el.style.transition = ''
    el.style.transform = ''
    el.style.willChange = ''
  }

  function onTouchStart(event) {
    const el = targetRef.value
    if (!el) return
    if (event.touches.length !== 1) {
      tracking = false
      return
    }
    const t = event.touches[0]
    startX = t.clientX
    startY = t.clientY
    dx = 0
    axis = null
    tracking = true
    // No transition while the finger is down -- the page must track it
    // exactly, not chase it.
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
      // Decide once, on the first few pixels, and never revisit it: a
      // gesture that changes its mind mid-stroke feels broken.
      if (Math.abs(mx) < 5 && Math.abs(my) < 5) return
      axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
      if (axis === 'y') {
        release(el)
        tracking = false
        return
      }
    }
    if (axis !== 'x') return

    // Rubber-band when there is nothing to swipe to, so the end of the
    // list feels like an edge rather than a dead control.
    const target = resolveSwipeTarget(router.currentRoute.value.path, mx, routes)
    dx = target ? mx : mx * 0.25
    schedule()
  }

  function finish(event) {
    if (!tracking) return
    tracking = false
    const el = targetRef.value
    if (!el) return

    const t = event.changedTouches && event.changedTouches[0]
    const settled = axis === 'x' && t && event.touches.length === 0
    if (!settled) {
      release(el)
      return
    }

    const totalX = t.clientX - startX
    const totalY = t.clientY - startY
    const target =
      isHorizontalSwipe(totalX, totalY) &&
      !startedInHorizontalScroller(t.target, el)
        ? resolveSwipeTarget(router.currentRoute.value.path, totalX, routes)
        : null

    if (!target) {
      // Spring back to where it was. Short, so a rejected swipe does not
      // hold the page hostage.
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      el.style.transition = 'transform 0.16s cubic-bezier(0.22,0.9,0.24,1)'
      el.style.transform = ''
      dx = 0
      setTimeout(() => {
        if (!tracking) {
          el.style.transition = ''
          el.style.willChange = ''
        }
      }, 170)
      return
    }

    // Committed. The new page enters from the side the finger travelled
    // towards, continuing the movement instead of restarting it.
    slideFrom.value = totalX < 0 ? 'ec-slide-from-start' : 'ec-slide-from-end'
    release(el)
    router.push(target)
  }

  function onAnimationEnd() {
    slideFrom.value = ''
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
    const el = targetRef.value
    if (frame !== null) cancelAnimationFrame(frame)
    if (!el) return
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', finish)
    el.removeEventListener('touchcancel', finish)
    el.removeEventListener('animationend', onAnimationEnd)
  })

  return { slideFrom }
}
