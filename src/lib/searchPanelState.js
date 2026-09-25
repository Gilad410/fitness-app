// Pure decision of which panel a debounced async-search box should show,
// given its current flags. Extracted so the priority order (a fresh
// search always wins over a stale error or stale results; "no results"
// is only shown once a search has actually completed) is unit-testable
// without mounting a component or faking timers.
//
// - 'idle': nothing searched yet (below the minimum term length, or the
//   field is empty).
// - 'searching': a request is in flight.
// - 'error': the most recent request failed.
// - 'results': the most recent request succeeded with at least one row.
// - 'empty': the most recent request succeeded with zero rows.
export function searchPanelState({ searching, failed, resultCount, searched }) {
  if (searching) return 'searching'
  if (failed) return 'error'
  if (resultCount > 0) return 'results'
  if (searched) return 'empty'
  return 'idle'
}
