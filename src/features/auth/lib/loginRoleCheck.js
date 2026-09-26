// Decides whether a freshly-authenticated account's role is allowed to
// use the login page it just signed in through, and -- when it is not --
// what to tell the person in Hebrew.
//
// Pure and dependency-free so every role can be unit tested
// (loginRoleCheck.test.mjs); authStore imports the Supabase client and
// cannot be loaded in a plain node test. Same split as
// coachAccessRouting.js / coachAccessStatus.js.
//
// Why this exists as its own module: the general /login page used to
// demand role === 'coach' exactly. When the owner role was added
// (056_owner_coach_administration.sql) a valid owner was therefore
// rejected by their own login page, and -- because the wrong-role message
// table had no 'owner' entry -- the thrown Error carried `undefined` as
// its message. LoginView assigned that to its error ref, `''` is falsy,
// nothing rendered, and the page simply sat there looking like a failed
// load. Two separate bugs (wrong allow-list, silently empty message), so
// this module fixes both and pins both with tests: the allow-list is
// data, and a rejection is STRUCTURALLY incapable of producing an empty
// message.

// Roles the general (coach/owner) login page accepts. The owner needs a
// way in, and it is this page -- there is no separate owner login.
export const GENERAL_LOGIN_ROLES = ['coach', 'owner']

// The trainee portal stays trainee-only. Widening the general page does
// not widen this one: a coach or owner must not be able to sign in
// through the trainee portal and land in a trainee session.
export const TRAINEE_LOGIN_ROLES = ['trainee']

// Wrong-page messages, keyed by the role the account ACTUALLY has, so the
// text names where they should go instead of just refusing.
const WRONG_PAGE_MESSAGE_HE = {
  trainee: 'זהו חשבון מתאמן. יש להתחבר דרך כניסת המתאמנים.',
  coach: 'זהו חשבון מאמן. יש להתחבר דרך כניסת המאמנים.',
  owner: 'זהו חשבון בעל/ת מערכת. יש להתחבר דרך מסך ההתחברות הראשי.',
}

// Used when the account has no role at all, or a role this build does not
// recognize (e.g. a later migration deployed ahead of the frontend). Also
// the final fallback for any role missing from the table above -- the one
// gap that made the original bug invisible.
const NO_ACCESS_MESSAGE_HE = 'לחשבון זה אין הרשאת גישה.'

/**
 * @param {string|null|undefined} role the account's resolved role from
 *   public.user_roles, or null when it genuinely has none.
 * @param {string[]} allowedRoles roles this login page accepts.
 * @returns {{ accepted: true } | { accepted: false, message: string }}
 *   On rejection `message` is always a non-empty Hebrew string -- the
 *   caller signs the session out and surfaces it.
 */
export function resolveLoginRoleOutcome(role, allowedRoles) {
  if (typeof role === 'string' && allowedRoles.includes(role)) {
    return { accepted: true }
  }

  // Deliberately `||` and not `??`: an empty-string entry would be as
  // invisible as a missing one, so it falls through to the generic
  // message too.
  const message =
    (typeof role === 'string' ? WRONG_PAGE_MESSAGE_HE[role] : '') || NO_ACCESS_MESSAGE_HE

  return { accepted: false, message }
}
