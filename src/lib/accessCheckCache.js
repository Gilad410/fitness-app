// Freshness policy for the router guard's per-navigation access checks.
//
// THE PROBLEM THIS SOLVES. The guard calls coach_get_own_status() /
// trainee_get_auth_context() before every protected navigation, and both
// were deliberately uncached so that an owner suspending someone was
// reflected on that person's very next navigation. Correct, and the
// direct cause of the app feeling stuck: every swipe blocked on a
// Supabase round trip -- 150-600ms on a phone -- before the next screen
// could render at all.
//
// STALE-WHILE-REVALIDATE. A recent answer is reused immediately, and once
// it passes the soft age a refresh runs in the background so the NEXT
// navigation has a newer one. Navigation stops waiting on the network
// without the answer ever drifting far from the truth.
//
// WHY THIS IS SAFE. These checks route the UI; they are not the security
// boundary. Every table and RPC is guarded by RLS with its own
// is_coach()/is_trainee() check, so a suspended account holding a stale
// "active" for a few seconds can reach a screen but cannot read or write
// a single row through it -- the server refuses independently. The guard
// exists so that person sees an honest screen instead of a broken one,
// and a HARD_TTL-second window does not change what they can actually do.
//
// The hard TTL is the outer bound: past it, the check is awaited again
// rather than reused, so a stale answer can never be served indefinitely
// if background refreshes keep failing.

export const SOFT_AGE_MS = 8000
export const HARD_TTL_MS = 45000

/**
 * What to do with a cached access check.
 *
 * @param {{value: unknown, at: number}|null} entry the cached answer
 * @param {number} now current epoch ms
 * @returns {'fetch'|'use'|'use-and-refresh'}
 *   fetch          -- nothing usable; await a fresh answer
 *   use            -- recent enough to use as is
 *   use-and-refresh-- usable now, but start a background refresh
 */
export function accessCheckDecision(entry, now) {
  if (!entry || typeof entry.at !== 'number' || !Number.isFinite(entry.at)) return 'fetch'
  const age = now - entry.at
  // A clock that jumped backwards must not make an old entry look new.
  if (age < 0) return 'fetch'
  if (age >= HARD_TTL_MS) return 'fetch'
  if (age >= SOFT_AGE_MS) return 'use-and-refresh'
  return 'use'
}

/** A fresh cache entry for a value just fetched. */
export function accessCheckEntry(value, now) {
  return { value, at: now }
}
