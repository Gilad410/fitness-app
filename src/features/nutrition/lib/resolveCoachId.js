// Resolves the coach id to use for a coach_barcode_products write from a
// FRESH supabase.auth.getUser() result -- never from a Pinia store's
// cached session (authStore.user.id, populated once at app load / on an
// auth-state-change event and potentially stale by the time a save()
// actually runs), and never from any profile id, trainee id, or demo id.
// getUser() re-validates the JWT against Supabase Auth itself (unlike
// getSession(), which only reads whatever is cached in local storage), so
// this is the one place a write's coach_id is decided at the moment the
// write happens -- the same instant RLS's `with_check (coach_id =
// auth.uid())` evaluates server-side, closing any possible drift between
// "who the app's cached state thinks is signed in" and "who auth.uid()
// actually resolves to right now."
//
// Pure by design (DI: takes the already-awaited { data, error } result
// supabase.auth.getUser() resolves to, never calls supabase itself) so
// this one piece of logic is unit-testable without a real Supabase
// client -- same convention as every other lib/*.js module in this
// directory (see barcodeLookup.js's fetchImpl for the same pattern).
export function resolveCoachId({ data, error } = {}) {
  if (error) throw error
  const id = data?.user?.id
  if (!id) throw new Error('לא נמצא משתמש מאמן מחובר -- יש להתחבר מחדש ולנסות שוב')
  return id
}
