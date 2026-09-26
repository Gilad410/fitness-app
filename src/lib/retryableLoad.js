// Single-flight loader with retry-after-failure, for stores that cache
// their load promise so every view can call ensureLoaded() on mount
// without refetching. A resolved (or still in-flight) promise stays
// cached; a REJECTED one is dropped, so the next call starts a fresh
// request instead of replaying the same failure forever -- which is what
// left coach screens stuck on "טוען..." after one network error until a
// full browser refresh.
//
// `holder` is any object with a `loadPromise` property (a Pinia store's
// `this` in practice). The identity check keeps a late rejection from an
// older request from clearing a newer, still-valid cached promise.
export function ensureLoadedOnce(holder, load) {
  if (holder.loadPromise) return holder.loadPromise
  const promise = Promise.resolve().then(load)
  holder.loadPromise = promise
  promise.catch(() => {
    if (holder.loadPromise === promise) holder.loadPromise = null
  })
  return promise
}
