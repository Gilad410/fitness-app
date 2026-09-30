// Warms the code for the destinations a swipe can reach, so the gesture
// never waits on a network round trip.
//
// Route components are lazy (router/index.js) -- that is what took the
// first load from 758 kB down to 83 kB. The cost was paid on the first
// visit to each screen instead: a swipe had to fetch that screen's chunk
// before it could render anything, which is the blank moment between the
// two pages. Prefetching the neighbours during idle time pays it back
// while nothing is happening, so by the time a finger moves the code is
// already in memory.
//
// Calling a resolved lazy component again is free: the browser's module
// cache returns the same promise, so this is safe to run on every mount.

/**
 * @param {import('vue-router').Router} router
 * @param {string[]} paths routes to warm
 */
export function prefetchRoutes(router, paths) {
  if (!router || !Array.isArray(paths)) return

  const run = () => {
    for (const path of paths) {
      let matched
      try {
        matched = router.resolve(path).matched
      } catch {
        continue // an unroutable path is not worth failing a page over
      }
      for (const record of matched) {
        const component = record.components?.default
        // A function here is still the un-invoked dynamic import; once
        // vue-router has resolved it, it holds the component object
        // instead and there is nothing left to warm.
        if (typeof component === 'function') {
          try {
            component()
          } catch {
            // A chunk that fails to preload will simply be fetched again
            // on navigation. Never let it break the current screen.
          }
        }
      }
    }
  }

  // Idle time only: this must never compete with the screen the person is
  // actually looking at.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2500 })
  } else {
    setTimeout(run, 400)
  }
}
