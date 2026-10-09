import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWorkoutDuration, workoutSummary } from './workoutSummary.js'

test('completed workout summary includes elapsed time and actual logged effort', () => {
  const session = {
    started_at: '2026-10-09T10:00:00Z',
    finished_at: '2026-10-09T10:45:15Z',
  }
  const sets = [
    { exercise_id: 'squat', reps: 8, weight_kg: 80 },
    { exercise_id: 'squat', reps: 6, weight_kg: 90 },
    { exercise_id: 'press', reps: 10, weight_kg: 20 },
  ]
  assert.deepEqual(workoutSummary(session, sets), {
    durationSeconds: 2715,
    setCount: 3,
    totalReps: 24,
    totalVolumeKg: 1380,
    exerciseCount: 2,
  })
  assert.equal(formatWorkoutDuration(2715), '45:15')
  assert.equal(formatWorkoutDuration(3661), '1:01:01')
})

test('an empty completed workout still has an honest zero-effort summary', () => {
  const session = { started_at: '2026-10-09T10:00:00Z', finished_at: '2026-10-09T10:02:00Z' }
  assert.equal(workoutSummary(session, []).durationSeconds, 120)
  assert.equal(workoutSummary(session, []).totalVolumeKg, 0)
  assert.equal(workoutSummary(session, []).setCount, 0)
})
