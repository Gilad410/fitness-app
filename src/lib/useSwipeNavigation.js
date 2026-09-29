import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  SWIPE_ROUTES,
  isHorizontalSwipe,
  resolveSwipeTarget,
  startedInHorizontalScroller,
} from './swipeNavigation'

// Swipe left/right to move between the coach portal's three main
// destinations (בית / מתאמנים / התראות), mounted once by AppLayout.vue.
//
// WHY A GESTURE AND NOT A CAROUSEL. A finger-following carousel needs the
// outgoing and incoming pages rendered at the same time. Every coach
// screen here is its own route, mounted and unmounted by vue-router, so
// getting that would mean holding three routes alive at once and driving
// the URL from scroll position -- which breaks deep links, the back
// button, and per-page scroll restoration, on a production app, for a
// navigation nicety. This instead recognises the gesture and performs a
// normal router navigation, with a short slide so the movement still
// reads as pages moving rather than pages blinking.
//
// The listeners are touch-only on purpose: a mouse drag across a page is
// a text selection, not a navigation, and stealing it would be worse than
// not having the feature on desktop -- where the sidebar already exists.
export function useSwipeNavigation(targetRef) {
  const router = useRouter()
  // Drives the CSS slide; read by AppLayout's <main> as a class.
  const slideFrom = ref('')

  let startX = 0
  let startY = 0
  let startedInScroller = false
  let tracking = false

  function onTouchStart(event) {
    // Pinch/zoom or a second finger mid-gesture: not a swipe.
    if (event.touches.length !== 1) {
      tracking = false
      return
    }
    const touch = event.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    tracking = true
    startedInScroller = startedInHorizontalScroller(event.target, targetRef.value)
  }

  function onTouchEnd(event) {
    if (!tracking) return
    tracking = false
    if (startedInScroller) return
    // A gesture that ended with fingers still down (or none recorded) is
    // not a completed single-finger swipe.
    const touch = event.changedTouches && event.changedTouches[0]
    if (!touch || event.touches.length > 0) return

    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY
    if (!isHorizontalSwipe(deltaX, deltaY)) return

    const target = resolveSwipeTarget(router.currentRoute.value.path, deltaX)
    if (!target) return

    // The new page enters from the side the finger travelled towards, so
    // the motion matches the gesture instead of contradicting it.
    slideFrom.value = deltaX < 0 ? 'ec-slide-from-start' : 'ec-slide-from-end'
    router.push(target)
  }

  function onTouchCancel() {
    tracking = false
  }

  // Clear the animation class once it has played, so a later navigation
  // that did NOT come from a swipe (a nav tap, a back button) does not
  // inherit a stale slide direction.
  function onAnimationEnd() {
    slideFrom.value = ''
  }

  onMounted(() => {
    const el = targetRef.value
    if (!el) return
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
    el.addEventListener('animationend', onAnimationEnd)
  })

  onBeforeUnmount(() => {
    const el = targetRef.value
    if (!el) return
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('touchcancel', onTouchCancel)
    el.removeEventListener('animationend', onAnimationEnd)
  })

  return { slideFrom, SWIPE_ROUTES }
}
