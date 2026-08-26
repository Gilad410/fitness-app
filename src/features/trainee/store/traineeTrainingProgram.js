import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee's own active training program -- read exclusively through
// trainee_get_active_training_program() (023_trainee_training_access.sql),
// never a raw select on trainee_training_programs/trainee_program_workouts/
// trainee_workout_exercises. The RPC already returns workouts/exercises
// nested and pre-sorted by display_order, and already hand-picks only the
// fields a trainee is allowed to see (no coach_id/trainee_id, no other
// trainee's data) -- this store just holds whatever it returns, read-only.
// Instructional video (027_exercise_instructional_videos.sql): each
// exercise object the RPC returns may carry video_storage_path -- a
// private Storage path, never a playable URL. Read-only here: the
// trainee-facing Storage SELECT policy (027) is the only thing that
// determines whether createSignedUrl below succeeds, scoped to exactly
// the trainee's own currently active program -- nothing in this store can
// create, replace, or delete a video.
const VIDEO_BUCKET = 'exercise-videos'
const VIDEO_SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour -- regenerated on demand, never persisted (matches progressPhotos.js's convention).

export const useTraineeTrainingProgramStore = defineStore('traineeTrainingProgram', {
  state: () => ({
    program: null,
    loading: false,
    loaded: false,
    error: null,
    videoUrlByExerciseId: {},
    videoUrlErrorByExerciseId: {},
  }),

  getters: {
    videoUrlFor: (state) => (exerciseId) => state.videoUrlByExerciseId[exerciseId] ?? null,
    videoUrlErrorFor: (state) => (exerciseId) => state.videoUrlErrorByExerciseId[exerciseId] ?? null,
  },

  actions: {
    async fetchActiveProgram() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase.rpc('trainee_get_active_training_program')
        if (error) throw error
        // null is the documented "no active program" result -- not an error.
        this.program = data ?? null
        this.loaded = true
      } catch {
        // Never surface a raw Supabase/Postgres error to the trainee.
        this.error = 'אירעה שגיאה בטעינת תוכנית האימונים. נסה/י שוב.'
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },

    async fetchVideoSignedUrl(exerciseId, storagePath) {
      this.videoUrlErrorByExerciseId[exerciseId] = null
      try {
        const { data, error } = await supabase.storage
          .from(VIDEO_BUCKET)
          .createSignedUrl(storagePath, VIDEO_SIGNED_URL_TTL_SECONDS)
        if (error) throw error
        this.videoUrlByExerciseId[exerciseId] = data.signedUrl
      } catch {
        // A failed/expired signed URL never breaks the rest of the
        // training program -- just this one exercise's video shows a
        // clear Hebrew message with a manual retry instead of a player.
        this.videoUrlByExerciseId[exerciseId] = null
        this.videoUrlErrorByExerciseId[exerciseId] = 'לא ניתן לטעון את הסרטון כרגע.'
      }
    },
  },
})
