import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  isHorizontalSwipe,
  resolveSwipeTarget,
  startedInHorizontalScroller,
  startedInInteractiveControl,
} from './swipeNavigation'
import { clearSlide, setSlideFromGesture, slideDirection } from './swipeTransition'

// Lightweight route swipe. It only decides after the finger is lifted,
// leaving scrolling, taps and native controls entirely to the browser.
// Moving the whole page on every touch frame made ordinary controls feel
// stuck on mobile, especially native category <select> elements.
export function useSwipeNavigation(targetRef, routes) {
  const router = useRouter()

  let startX = 0
  let startY = 0
  let tracking = false

  function onTouchStart(event) {
    const el = targetRef.value
    if (!el || event.touches.length !== 1) {
      tracking = false
      return
    }
    if (!routes.includes(router.currentRoute.value.path)) {
      tracking = false
      return
    }

    // Native and clickable controls own every gesture that begins on
    // them. This is the important guard for category selectors and cards.
    const target = event.target
    if (startedInInteractiveControl(target)) {
      tracking = false
      return
    }
    if (startedInHorizontalScroller(target, el)) {
      tracking = false
      return
    }

    const touch = event.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    tracking = true
  }

  function finish(event) {
    if (!tracking) return
    tracking = false
    const touch = event.changedTouches?.[0]
    if (!touch || event.touches.length > 0) return

    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY
    if (!isHorizontalSwipe(deltaX, deltaY)) return

    const route = resolveSwipeTarget(router.currentRoute.value.path, deltaX, routes)
    if (!route) return

    setSlideFromGesture(deltaX)
    router.push(route).catch(clearSlide)
  }

  function onAnimationEnd() {
    clearSlide()
  }

  onMounted(() => {
    const el = targetRef.value
    if (!el) return
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', finish, { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
    el.addEventListener('animationend', onAnimationEnd)
  })

  onBeforeUnmount(() => {
    const el = targetRef.value
    if (!el) return
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchend', finish)
    el.removeEventListener('touchcancel', onTouchCancel)
    el.removeEventListener('animationend', onAnimationEnd)
  })

  // The shared ref, so every layout renders the direction the gesture
  // that led here actually set.
  return { slideFrom: slideDirection }

  function onTouchCancel() {
    tracking = false
  }
}
