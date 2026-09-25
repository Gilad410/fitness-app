// Normalizes whatever coach_get_own_status() returns into exactly one
// of four known strings. Pure and dependency-free so it can be unit
// tested (coachAccessStatus.test.mjs) -- authStore itself imports the
// Supabase client and therefore cannot be loaded in a plain node test.
//
// The separation matters because the interesting failures here are all
// about payload SHAPE: PostgREST returns a set-returning RPC as an
// array, a scalar RPC as a bare value, and zero matching rows as an
// empty array. An earlier revision reduced all of this to a boolean,
// which erased the difference between 'pending' and 'suspended'.

/** Statuses this client knows how to act on. */
export const KNOWN_COACH_ACCESS_STATUSES = ['active', 'pending', 'suspended']

/**
 * @param {unknown} data raw `data` from supabase.rpc('coach_get_own_status')
 * @returns {'active'|'pending'|'suspended'|'unknown'} 'unknown' whenever
 *   the answer cannot be trusted: no row, a null/absent field, a
 *   non-string, or a status value this build does not recognize (e.g. a
 *   later migration deployed ahead of the frontend). Never guesses.
 */
export function normalizeCoachAccessStatus(data) {
  const row = Array.isArray(data) ? data[0] : data
  const status = row?.access_status
  return KNOWN_COACH_ACCESS_STATUSES.includes(status) ? status : 'unknown'
}
