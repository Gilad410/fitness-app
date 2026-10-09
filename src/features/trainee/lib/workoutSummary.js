export function workoutSummary(session, sets) {
  const durationSeconds = session?.finished_at
    ? Math.max(0, Math.floor((Date.parse(session.finished_at) - Date.parse(session.started_at)) / 1000))
    : 0
  const totalReps = sets.reduce((sum, set) => sum + Number(set.reps || 0), 0)
  const totalVolumeKg = sets.reduce(
    (sum, set) => sum + Number(set.reps || 0) * Number(set.weight_kg || 0),
    0,
  )
  return {
    durationSeconds,
    setCount: sets.length,
    totalReps,
    totalVolumeKg: Math.round(totalVolumeKg * 100) / 100,
    exerciseCount: new Set(sets.map((set) => set.exercise_id)).size,
  }
}

export function formatWorkoutDuration(seconds) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const remaining = whole % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`
}
