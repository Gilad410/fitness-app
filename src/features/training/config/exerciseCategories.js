// The seven fixed muscle-group categories a coach picks from when adding
// an exercise. Mirrors the `check (category in (...))` constraint on
// public.exercise_reference_catalog exactly (019_exercise_reference_catalog.sql)
// -- this is a UI label list for a fixed enum already enforced server-side,
// not a duplicate of the catalog's exercise data itself (that always comes
// from Supabase via the exerciseReferenceCatalog store).
export const EXERCISE_CATEGORIES = [
  'רגליים',
  'יד קדמית',
  'בטן',
  'גב',
  'חזה',
  'יד אחורית',
  'כתפיים',
]
