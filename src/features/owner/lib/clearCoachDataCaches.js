// Clears every coach-facing Pinia store's in-memory cache -- including
// the three stores that hold signed Storage URLs (progressPhotos.js,
// exercises.js, exerciseSubmissions.js) -- when a coach's session is
// detected as suspended (see router/index.js's live coach-status
// re-check). This does NOT and cannot revoke an already-issued signed
// URL still open in another tab or already downloaded (RLS has no reach
// over a URL once issued -- see 056_owner_coach_administration.sql's
// design notes and the shortened TTLs in the three stores above); it
// removes the cached URLs and coach data from THIS session's reactive
// state so the current tab stops holding or displaying them, and any
// re-fetch attempt fails immediately against is_coach() regardless.
//
// Deliberately explicit imports rather than iterating every active Pinia
// store -- this list is exactly the app's coach-facing data stores
// (trainee-facing stores, e.g. src/features/trainee/store/*, are never
// touched here: a suspended coach's trainees must keep their own access
// and their own cached data completely unaffected). Each store below is
// defined with Pinia's Options API (defineStore(id, { state, ... })),
// which gives every one of them a built-in $reset() that restores state()
// to its original factory value -- no per-store custom reset code needed.
import { useTraineesStore } from '../../trainees/store/trainees.js'
import { useTraineeInvitesStore } from '../../trainees/store/traineeInvites.js'
import { useFoodsStore } from '../../nutrition/store/foods.js'
import { useNutritionLogsStore } from '../../nutrition/store/nutritionLogs.js'
import { useNutritionPlansStore } from '../../nutrition/store/nutritionPlans.js'
import { useProgressLogsStore } from '../../progress/store/progressLogs.js'
import { useProgressPhotosStore } from '../../progress/store/progressPhotos.js'
import { useCircumferenceLogsStore } from '../../progress/store/circumferenceLogs.js'
import { useTrainingProgramsStore } from '../../training/store/trainingPrograms.js'
import { useTrainingWorkoutsStore } from '../../training/store/workouts.js'
import { useWorkoutExercisesStore } from '../../training/store/exercises.js'
import { useExerciseSubmissionsStore } from '../../training/store/exerciseSubmissions.js'
import { useAlertsStore } from '../../alerts/store/alerts.js'
import { useNotificationsStore } from '../../alerts/store/notifications.js'
import { useCoachBarcodeProductsStore } from '../../nutrition/store/coachBarcodeProducts.js'

const STORE_FACTORIES = [
  useTraineesStore,
  useTraineeInvitesStore,
  useFoodsStore,
  useNutritionLogsStore,
  useNutritionPlansStore,
  useProgressLogsStore,
  useProgressPhotosStore,
  useCircumferenceLogsStore,
  useTrainingProgramsStore,
  useTrainingWorkoutsStore,
  useWorkoutExercisesStore,
  useExerciseSubmissionsStore,
  useAlertsStore,
  useNotificationsStore,
  useCoachBarcodeProductsStore,
]

// Exported separately so a regression test can verify the exact set of
// stores this clears without needing a real Pinia instance for each.
export const COACH_DATA_STORE_FACTORIES = STORE_FACTORIES

export function clearCoachDataCaches() {
  for (const useStore of STORE_FACTORIES) {
    const store = useStore()
    if (typeof store.$reset === 'function') {
      store.$reset()
    }
  }
}
