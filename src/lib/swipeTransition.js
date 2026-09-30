import { ref } from 'vue'

// The direction the next page should slide in from, shared across layout
// instances.
//
// WHY THIS IS MODULE-LEVEL AND NOT A COMPOSABLE REF. Every view renders
// its own AppLayout/TraineeLayout, so the layout that handles the swipe
// is a different instance from the layout that renders the destination.
// Holding this in the composable meant the direction was set on the
// OUTGOING layout and read by nobody: the incoming page's own ref was
// always empty, so no enter animation ever played.
//
// That was not a cosmetic loss. With no motion at all the screen simply
// swapped, which removed the only cue for which way the navigation went
// -- and a swipe with no matching movement reads as going the wrong way,
// however the destination was chosen. One shared value, set by whoever
// commits the gesture and read by whichever layout renders next, is what
// keeps the gesture and the motion describing the same thing.

/** '' | 'ec-slide-in-from-left' | 'ec-slide-in-from-right' */
export const slideDirection = ref('')

/**
 * @param {number} deltaX the gesture's horizontal travel
 */
export function setSlideFromGesture(deltaX) {
  // The finger drags the page off one edge, so the next page arrives
  // from the opposite one: drag left, the new page comes in from the
  // right, continuing the same movement.
  slideDirection.value = deltaX < 0 ? 'ec-slide-in-from-right' : 'ec-slide-in-from-left'
}

export function clearSlide() {
  slideDirection.value = ''
}
