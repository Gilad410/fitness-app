// Pure helpers for tracking whether the browser's current session was
// established by a genuine Supabase PASSWORD_RECOVERY event -- no
// Supabase/Vite/Vue import (supabaseClient.js itself can't be unit-tested
// directly: it reads real Vite-injected env vars and constructs a real
// client), so this piece is split out specifically to be testable under
// Node (see authEventState.test.mjs).
//
// See src/lib/supabaseClient.js for why this is tracked via a
// module-level onAuthStateChange listener (registered immediately after
// the client is constructed, to win the race against the SDK's own
// construction-time URL processing) rather than read lazily from inside
// a page component, and src/lib/useResetPassword.js for how it's
// consumed REACTIVELY (not as a one-time snapshot -- see that module's
// own header for the bug that distinction fixes).
//
// The recovery context is bound to the specific user id it was verified
// for (recoveryUserId), not just a bare boolean -- hasValidRecoveryContext()
// below requires the CURRENTLY signed-in user's id to still match it.
// This is deliberately redundant with clearing recoveryReady on
// SIGNED_IN/SIGNED_OUT below: even if some future event sequence ever
// changed the effective signed-in user without also clearing the flag by
// event type, a mismatched identity alone still fails the check.

export function createAuthEventState() {
  return { lastEvent: null, recoveryReady: false, recoveryUserId: null }
}

// Mutates `state` in place (matching how the real onAuthStateChange
// listener uses it -- see supabaseClient.js) based on one auth event and
// the user id that event's session belongs to (null for e.g. SIGNED_OUT,
// which has no session).
export function applyAuthEvent(state, event, userId = null) {
  state.lastEvent = event
  if (event === 'PASSWORD_RECOVERY') {
    state.recoveryReady = true
    state.recoveryUserId = userId
    return
  }
  // Any account change -- a fresh ordinary sign-in (of the same or a
  // different account) or a sign-out -- invalidates whatever recovery
  // context existed before it. A genuine recovery flow's own session
  // establishment fires PASSWORD_RECOVERY, not SIGNED_IN (see the
  // installed SDK's redirectType branch), so this never clears the
  // context the recovery flow itself just set.
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    state.recoveryReady = false
    state.recoveryUserId = null
  }
}

// Explicit one-time-use consumption -- called after a recovery has
// actually been spent (a successful supabase.auth.updateUser() password
// change), so a later check in the same tab, without a fresh link, is
// denied rather than silently allowing another change.
export function consumeRecoveryContext(state) {
  state.recoveryReady = false
  state.recoveryUserId = null
}

// The actual gate src/lib/useResetPassword.js uses to decide whether to
// show/allow the "set new password" form. Requires ALL of: a currently
// signed-in user, a genuinely observed recovery event, AND that event
// having been verified for THIS SAME user -- any one alone is
// insufficient (see the module comment above).
export function hasValidRecoveryContext(currentUserId, state) {
  return (
    Boolean(currentUserId) &&
    Boolean(state.recoveryReady) &&
    state.recoveryUserId !== null &&
    state.recoveryUserId === currentUserId
  )
}
