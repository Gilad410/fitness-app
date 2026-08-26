import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee performance-video review (030_trainee_exercise_submission_videos.sql):
// completely separate table/bucket from the coach's own instructional
// video (027-029, exercises.js). Coach-side, read + delete + mark-reviewed
// only -- there is no coach upload/replace path here or anywhere else;
// a trainee's performance video is uploaded exclusively by the trainee
// (traineeExerciseSubmissions.js). ExercisesSection.vue only ever calls
// these actions.
const BUCKET = 'exercise-submission-videos'
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour -- regenerated on demand, never persisted (matches exercises.js's own convention).

export const useExerciseSubmissionsStore = defineStore('exerciseSubmissions', {
  state: () => ({
    // At most one row per exercise (030's unique(trainee_id, exercise_id)
    // constraint), so a flat exerciseId -> row | null map is sufficient --
    // no per-trainee nesting needed since ExercisesSection.vue is always
    // already rendered inside one specific trainee's workspace.
    submissionsByExercise: {},
    loadPromises: {},
    error: {},
    videoUrlByExerciseId: {},
    videoUrlErrorByExerciseId: {},
  }),

  getters: {
    submissionFor: (state) => (exerciseId) => state.submissionsByExercise[exerciseId] ?? null,
    videoUrlFor: (state) => (exerciseId) => state.videoUrlByExerciseId[exerciseId] ?? null,
    videoUrlErrorFor: (state) => (exerciseId) => state.videoUrlErrorByExerciseId[exerciseId] ?? null,
  },

  actions: {
    // Loads every exercise's submission (if any) for a workout in one
    // batch call, and caches the in-flight/resolved promise per workout,
    // so ExercisesSection.vue can call this on every mount without
    // refetching.
    ensureLoadedForWorkout(workoutId, exerciseIds) {
      if (this.loadPromises[workoutId]) return this.loadPromises[workoutId]
      this.loadPromises[workoutId] = this.fetchForWorkout(workoutId, exerciseIds)
      return this.loadPromises[workoutId]
    },

    async fetchForWorkout(workoutId, exerciseIds) {
      this.error[workoutId] = null
      if (exerciseIds.length === 0) return
      const { data, error } = await supabase
        .from('trainee_exercise_submission_videos')
        .select('*')
        .in('exercise_id', exerciseIds)
      if (error) {
        this.error[workoutId] = error.message
        throw error
      }

      for (const exerciseId of exerciseIds) {
        this.submissionsByExercise[exerciseId] = null
      }
      for (const row of data) {
        this.submissionsByExercise[row.exercise_id] = row
      }
    },

    // The only way reviewed_at AND coach_note are ever set --
    // coach_mark_submission_reviewed(uuid, text) (031) is security
    // definer and coach-only; this store never writes either column
    // directly. Serves both "mark reviewed" (note omitted/blank) and
    // "update the note later" (called again with a new note) -- the same
    // RPC call either way, matching 031's own design. note is optional;
    // the RPC itself trims it and stores a blank result as null, so this
    // store never needs to pre-clean it. Refetches the single row
    // afterward (rather than trusting a client-side timestamp/note)
    // since the RPC returns void.
    async markReviewed(exerciseId, note = '') {
      const current = this.submissionsByExercise[exerciseId]
      if (!current) return

      const { error } = await supabase.rpc('coach_mark_submission_reviewed', {
        p_submission_id: current.id,
        p_coach_note: note,
      })
      if (error) throw new Error('שמירת הבדיקה נכשלה. נסה/י שוב.')

      const { data, error: fetchError } = await supabase
        .from('trainee_exercise_submission_videos')
        .select('*')
        .eq('id', current.id)
        .single()
      if (fetchError) throw new Error('שמירת הבדיקה נכשלה. נסה/י שוב.')

      this.submissionsByExercise[exerciseId] = data
      return data
    },

    // Row deleted first (so nothing can reference it again even if the
    // Storage removal below fails), then best-effort Storage removal --
    // same ordering/reasoning as exercises.js's own removeVideo(). This
    // can only ever touch THIS coach's own trainee's own submission row
    // (RLS-gated) and its own storage_path (read directly off that row,
    // never guessed/constructed) -- never another trainee's object, and
    // never anything in the 'exercise-videos' bucket (a different bucket
    // entirely, never referenced anywhere in this store).
    async remove(exerciseId) {
      const current = this.submissionsByExercise[exerciseId]
      if (!current) return

      const { error: deleteRowError } = await supabase
        .from('trainee_exercise_submission_videos')
        .delete()
        .eq('id', current.id)
      if (deleteRowError) throw new Error('מחיקת סרטון הביצוע נכשלה. נסה/י שוב.')

      this.submissionsByExercise[exerciseId] = null
      this.clearVideoUrl(exerciseId)

      const { error: removeObjectError } = await supabase.storage.from(BUCKET).remove([current.storage_path])
      if (removeObjectError) {
        console.error(
          `Deleted submission row but failed to remove storage object: ${current.storage_path}`,
          removeObjectError,
        )
      }
    },

    // Private bucket -- every video needs a fresh short-lived signed URL
    // to actually play.
    async fetchVideoSignedUrl(exerciseId, storagePath) {
      this.videoUrlErrorByExerciseId[exerciseId] = null
      try {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
        if (error) throw error
        this.videoUrlByExerciseId[exerciseId] = data.signedUrl
      } catch {
        this.videoUrlByExerciseId[exerciseId] = null
        this.videoUrlErrorByExerciseId[exerciseId] = 'לא ניתן לטעון את הסרטון כרגע.'
      }
    },

    clearVideoUrl(exerciseId) {
      delete this.videoUrlByExerciseId[exerciseId]
      delete this.videoUrlErrorByExerciseId[exerciseId]
    },
  },
})
