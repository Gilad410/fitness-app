// Maps a coach's live access_status (from coach_get_own_status, via
// authStore.checkCoachAccessStatus()) to what the router should do about
// it. Pure: no router, no store, no Supabase -- so every state can be
// unit-tested directly (coachAccessRouting.test.mjs), which is what the
// router guard itself cannot easily be.
//
// Why this exists as its own module: an earlier revision collapsed the
// status to a boolean inside the guard, so 'pending' and 'suspended'
// were indistinguishable and a newly-approved-pending coach was told
// they had been suspended. Keeping the decision in one tested place
// makes that class of mistake visible instead of buried in a guard.

// Returned by resolveCoachAccessRoute() when the coach may proceed.
export const COACH_ACCESS_ALLOWED = null

/**
 * @param {'active'|'pending'|'suspended'|'unknown'} status
 * @param {{ verificationFailed?: boolean }} [opts] verificationFailed is
 *   true when the status RPC itself threw (network/RPC failure) -- a
 *   different event from the server answering with something unusable,
 *   even though both fail closed.
 * @returns {null | { route: object, signOut: boolean, clearCoachCaches: boolean }}
 *   null means "allow navigation". Otherwise: where to send them, and
 *   whether the session/caches must be torn down first.
 */
export function resolveCoachAccessRoute(status, opts = {}) {
  if (opts.verificationFailed) {
    // Could not reach or trust the server at all. Fail closed, but say
    // so accurately -- do NOT claim the account was suspended.
    return {
      route: { name: 'login', query: { access: 'unavailable' } },
      signOut: true,
      clearCoachCaches: true,
    }
  }

  if (status === 'active') return COACH_ACCESS_ALLOWED

  if (status === 'pending') {
    return {
      route: { name: 'coach-pending-approval' },
      signOut: true,
      clearCoachCaches: true,
    }
  }

  if (status === 'suspended') {
    return {
      route: { name: 'coach-suspended' },
      signOut: true,
      clearCoachCaches: true,
    }
  }

  // 'unknown' -- no coaches row, a null field, or a status string this
  // build does not recognize (e.g. a newer migration deployed ahead of
  // this frontend). Fail closed with the same accurate generic message
  // as an unreachable server: we cannot confirm access, and we will not
  // guess which specific reason applies.
  return {
    route: { name: 'login', query: { access: 'unavailable' } },
    signOut: true,
    clearCoachCaches: true,
  }
}
