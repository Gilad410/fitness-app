// The owner sign-out sequence, with its dependencies injected so it can
// be unit tested (ownerLogout.test.mjs). The view supplies the real auth
// store, the real owner store and a real router push; nothing here
// imports Vue, Pinia or Supabase.
//
// It exists as its own function because the ORDER and the
// failure-behaviour are the whole point, and neither is obvious from a
// three-line inline handler:
//
//   1. End the session.
//   2. Clear owner-scoped local state. store.coaches holds coach email
//      addresses and the owner's PRIVATE notes; pendingInvitations holds
//      invited addresses. None of that may survive into whatever account
//      signs in next on this browser. Same belt-and-suspenders convention
//      TheHeader.vue uses when it clears the selectedTrainee store on a
//      coach's logout.
//   3. Leave for /login.
//
// Steps 2 and 3 run even if step 1 rejects. A logout must fail closed: a
// network error while telling the server to end the session is not a
// reason to leave the previous owner's notes on screen and the person
// stuck on an admin page. authStore.signOut() already clears its own
// local auth state in a `finally`, so the session is locally gone
// regardless; this makes the rest of the teardown just as unconditional.

/** Where a signed-out owner lands. */
export const POST_LOGOUT_PATH = '/login'

/**
 * @param {object} deps
 * @param {{ signOut: () => Promise<void> }} deps.authStore
 * @param {{ $reset: () => void }} deps.ownerStore
 * @param {(path: string) => unknown} deps.navigate
 * @returns {Promise<{ signOutFailed: boolean }>} signOutFailed is true
 *   when the remote sign-out errored; the teardown still completed.
 */
export async function performOwnerLogout({ authStore, ownerStore, navigate }) {
  let signOutFailed = false
  try {
    await authStore.signOut()
  } catch {
    signOutFailed = true
  }

  ownerStore.$reset()
  navigate(POST_LOGOUT_PATH)

  return { signOutFailed }
}
