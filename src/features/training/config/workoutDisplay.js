// Shared workout display-label logic (032_optional_workout_name.sql) --
// used by both the coach's own WorkoutsSection.vue and the trainee's
// TraineeTrainingView.vue, so the numbering/naming composition can never
// drift between the two views.
//
// The number is ALWAYS the workout's 1-based position in the CURRENT,
// already-sorted array (index + 1) -- never a stored value, and
// deliberately never display_order + 1 directly, since display_order can
// have gaps after a delete (workouts.js's own remove() does not compact
// the survivors' display_order) -- using the array position instead keeps
// the displayed sequence gap-free (1, 2, 3, ...) automatically, with no
// renumbering step required anywhere.
export function workoutDisplayLabel(name, index) {
  const number = `אימון ${index + 1}`
  return name ? `${number} — ${name}` : number
}
