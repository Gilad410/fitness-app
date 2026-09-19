// Turns a raw coachBarcodeProductsStore failure -- save() OR refresh()/
// fetchAll() (the cache-check a lookup does before asking the coach
// again) -- into one of a small, fixed set of categories, so a real
// failure is never just an opaque, possibly-English exception string
// shown to the coach (or, worse, silently swallowed and indistinguishable
// from "not found"). Found necessary during a real investigation: a save
// failure was reported only as "Server error (404)" with no way to tell,
// from the coach's own description alone, whether the actual cause was an
// expired session, an RLS/permissions problem, a network failure, or
// something else entirely. A second, distinct gap found in the SAME
// investigation: runLookup()'s pre-lookup refresh() call swallowed its
// own error completely (`.catch(() => {})`), so a coach who WAS signed
// out (or hit any other read failure) at the moment of a re-scan saw no
// error at all -- just the exact same "not found, please approve again"
// screen a genuinely-new barcode would show, with zero way to tell those
// two situations apart. Every category below applies equally to both
// call sites.
//
// Pure/DI: takes the error object itself, no I/O, so every category is
// directly unit-testable without a real Supabase client or session.
export const SAVE_FAILURE_NOT_SIGNED_IN = 'not_signed_in'
export const SAVE_FAILURE_PERMISSION_DENIED = 'permission_denied'
export const SAVE_FAILURE_NETWORK = 'network_error'
export const SAVE_FAILURE_OTHER = 'other'

// Hebrew label per category, for direct use in the UI -- kept alongside
// the categorizer itself so a category value and its user-facing wording
// can never drift apart or be defined twice.
// Deliberately worded to make sense for BOTH a save and a read/cache-check
// failure (never "...לשמור" / "...to save" specifically) -- the same label
// is used in both places in the UI.
export const SAVE_FAILURE_LABELS = {
  [SAVE_FAILURE_NOT_SIGNED_IN]: 'ההתחברות פגה -- יש להתחבר מחדש ולנסות שוב',
  [SAVE_FAILURE_PERMISSION_DENIED]: 'אין הרשאה (בדיקת הרשאות נכשלה)',
  [SAVE_FAILURE_NETWORK]: 'שגיאת רשת',
  [SAVE_FAILURE_OTHER]: 'שגיאה לא צפויה',
}

export function categorizeSaveFailure(err) {
  const name = err?.name ?? ''
  const code = err?.code ?? ''
  const message = String(err?.message ?? '')

  // resolveCoachId() throws the real AuthSessionMissingError supabase-js
  // itself raises from getUser() when there is no session at all, or (far
  // less likely, since getUser() already covers "no session") its own
  // explicit Hebrew message if data.user is somehow still missing despite
  // no transport-level error.
  if (name === 'AuthSessionMissingError' || message.includes('לא נמצא משתמש מאמן מחובר')) {
    return SAVE_FAILURE_NOT_SIGNED_IN
  }
  // Postgres 42501: the row-level security policy itself rejected the
  // write -- the coach_id sent did not equal auth.uid() at write time.
  if (code === '42501' || /row-level security/i.test(message)) {
    return SAVE_FAILURE_PERMISSION_DENIED
  }
  // A fetch()-level failure (offline, DNS, CORS) throws a TypeError whose
  // message mentions "fetch" in every major browser engine.
  if (name === 'TypeError' && /fetch/i.test(message)) {
    return SAVE_FAILURE_NETWORK
  }
  return SAVE_FAILURE_OTHER
}
