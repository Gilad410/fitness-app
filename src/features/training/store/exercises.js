import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

// Instructional video support (027_exercise_instructional_videos.sql):
// private bucket, coach read/write + trainee read-only via Storage RLS
// that re-derives ownership through the exercise -> workout -> program ->
// trainee chain -- never trusts a path segment by itself. This store is
// the ONLY place that talks to Storage or writes the three video_* columns
// for a coach; ExercisesSection.vue only ever calls these actions.
const VIDEO_BUCKET = 'exercise-videos'
const VIDEO_SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour -- regenerated on demand, never persisted (matches progressPhotos.js's convention).
const VIDEO_MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB, matches the bucket's file_size_limit (027).
const VIDEO_EXTENSION_BY_MIME_TYPE = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

// Single source of truth for the allowed types/size, matching 027's
// bucket-level allowlist/limit exactly. Exported so ExercisesSection.vue
// can reject an invalid file immediately on selection (before staging a
// replace confirmation) with the same Hebrew message attachVideo() below
// would otherwise raise -- not a duplicated rule, the same one used twice.
export function validateExerciseVideoFile(file) {
  if (!VIDEO_EXTENSION_BY_MIME_TYPE[file.type]) {
    return 'סוג קובץ לא נתמך. יש להעלות קובץ MP4, WebM או MOV בלבד.'
  }
  if (file.size > VIDEO_MAX_SIZE_BYTES) {
    return 'הסרטון גדול מדי. הגודל המרבי הוא 50MB.'
  }
  return ''
}

export const useWorkoutExercisesStore = defineStore('workoutExercises', {
  state: () => ({
    exercisesByWorkout: {},
    loadPromises: {},
    error: {},
    // Ephemeral signed-URL cache, keyed by exercise id -- deliberately
    // separate from the exercise rows themselves (which create/update/
    // attachVideo/removeVideo all replace wholesale from Supabase's
    // response) so a signed URL already fetched for an exercise survives
    // an unrelated field edit on that same exercise without extra merge
    // logic, and is explicitly cleared (clearVideoUrl) exactly when it
    // becomes obsolete: the video is removed, replaced, or the exercise
    // itself is deleted.
    videoUrlByExerciseId: {},
    videoUrlErrorByExerciseId: {},
  }),

  getters: {
    // Sorted by display_order, matching the fetch order below.
    exercisesFor: (state) => (workoutId) => state.exercisesByWorkout[workoutId] ?? [],
    videoUrlFor: (state) => (exerciseId) => state.videoUrlByExerciseId[exerciseId] ?? null,
    videoUrlErrorFor: (state) => (exerciseId) => state.videoUrlErrorByExerciseId[exerciseId] ?? null,
  },

  actions: {
    // Loads a workout's exercises once and caches the in-flight/resolved
    // promise, so views can call this on every mount without refetching.
    ensureLoaded(workoutId) {
      if (this.loadPromises[workoutId]) return this.loadPromises[workoutId]
      this.loadPromises[workoutId] = this.fetchForWorkout(workoutId)
      return this.loadPromises[workoutId]
    },

    async fetchForWorkout(workoutId) {
      this.error[workoutId] = null
      const { data, error } = await supabase
        .from('trainee_workout_exercises')
        .select('*')
        .eq('workout_id', workoutId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) {
        this.error[workoutId] = error.message
        throw error
      }
      this.exercisesByWorkout[workoutId] = data
    },

    async create(workoutId, payload) {
      const authStore = useAuthStore()
      const exercises = this.exercisesByWorkout[workoutId] ?? []
      const nextOrder =
        exercises.length === 0 ? 0 : Math.max(...exercises.map((e) => e.display_order)) + 1

      const { data, error } = await supabase
        .from('trainee_workout_exercises')
        .insert({
          ...payload,
          workout_id: workoutId,
          coach_id: authStore.user.id,
          display_order: nextOrder,
        })
        .select()
        .single()
      if (error) throw error

      this.exercisesByWorkout[workoutId] = [...exercises, data]
      return data
    },

    async update(workoutId, exerciseId, patch) {
      const { data, error } = await supabase
        .from('trainee_workout_exercises')
        .update(patch)
        .eq('id', exerciseId)
        .select()
        .single()
      if (error) throw error

      const exercises = this.exercisesByWorkout[workoutId] ?? []
      const index = exercises.findIndex((e) => e.id === exerciseId)
      if (index !== -1) exercises[index] = data
      return data
    },

    // Before deleting the exercise row itself, its instructional video (if
    // any) is removed from Storage FIRST -- if that removal fails, the
    // whole deletion is aborted and the exercise/row/video are left
    // completely untouched, rather than leaving a Storage object no
    // policy could ever reach again afterward (027's coach policies all
    // require a REAL, still-existing exercise row in the ownership chain
    // -- deleting the row first would make the video permanently
    // unreachable, even to the coach who owns it).
    async remove(workoutId, exerciseId) {
      const exercises = this.exercisesByWorkout[workoutId] ?? []
      const current = exercises.find((e) => e.id === exerciseId)

      if (current?.video_storage_path) {
        const { error: removeVideoError } = await supabase.storage
          .from(VIDEO_BUCKET)
          .remove([current.video_storage_path])
        if (removeVideoError) {
          throw new Error('לא ניתן היה למחוק את סרטון ההדרכה של התרגיל. התרגיל לא נמחק.')
        }
      }

      const { error } = await supabase.from('trainee_workout_exercises').delete().eq('id', exerciseId)
      if (error) {
        // Postgres foreign_key_violation -- trainee_exercise_submission_videos.exercise_id
        // references this row with ON DELETE RESTRICT (030), specifically
        // so a trainee's already-submitted performance video can never be
        // silently orphaned by an unrelated exercise-management action.
        if (error.code === '23503') {
          throw new Error(
            'לתרגיל זה יש סרטון ביצוע שהעלה המתאמן/ת. יש למחוק את סרטון הביצוע לפני מחיקת התרגיל.',
          )
        }
        throw error
      }

      this.exercisesByWorkout[workoutId] = exercises.filter((e) => e.id !== exerciseId)
      this.clearVideoUrl(exerciseId)
    },

    // Same optimistic-swap-with-rollback approach as
    // trainingWorkouts.move -- see that store for the full reasoning.
    async move(workoutId, exerciseId, direction) {
      const exercises = this.exercisesByWorkout[workoutId] ?? []
      const index = exercises.findIndex((e) => e.id === exerciseId)
      const targetIndex = index + direction
      if (index === -1 || targetIndex < 0 || targetIndex >= exercises.length) return

      const current = exercises[index]
      const target = exercises[targetIndex]
      const previousOrder = exercises

      const reordered = [...exercises]
      reordered[index] = target
      reordered[targetIndex] = current
      this.exercisesByWorkout[workoutId] = reordered

      try {
        const [{ error: err1 }, { error: err2 }] = await Promise.all([
          supabase
            .from('trainee_workout_exercises')
            .update({ display_order: target.display_order })
            .eq('id', current.id),
          supabase
            .from('trainee_workout_exercises')
            .update({ display_order: current.display_order })
            .eq('id', target.id),
        ])
        if (err1 || err2) throw err1 || err2
      } catch (err) {
        this.exercisesByWorkout[workoutId] = previousOrder
        throw err
      }
    },

    // ---- Instructional video (027_exercise_instructional_videos.sql) ----

    // Handles both a first-time attach and a replace -- ExercisesSection.vue
    // is responsible for asking the coach to explicitly confirm before
    // calling this when a video already exists; this action itself always
    // re-validates the file regardless of what the caller already checked.
    //
    // Storage path is always {coachId}/{traineeId}/{exerciseId}.{ext}, the
    // exact structure 027's RLS policies require -- built entirely from
    // server-known ids, NEVER from the file's own name. The original
    // filename is stored only as display metadata (video_original_name);
    // it is never used as, or folded into, any Storage path.
    //
    // Sequenced exactly as required: upload the new object first, update
    // the row to point at it second, and only once THAT succeeds is any
    // previous (different-path) object removed -- so a failure at any step
    // never leaves the exercise pointing at a half-written or missing
    // video.
    async attachVideo(workoutId, exerciseId, traineeId, file) {
      const validationError = validateExerciseVideoFile(file)
      if (validationError) throw new Error(validationError)

      const exercises = this.exercisesByWorkout[workoutId] ?? []
      const index = exercises.findIndex((e) => e.id === exerciseId)
      const previousPath = exercises[index]?.video_storage_path ?? null

      const authStore = useAuthStore()
      const coachId = authStore.user.id
      const ext = VIDEO_EXTENSION_BY_MIME_TYPE[file.type]
      // upsert: true covers both cases in one call -- a first-time attach
      // (nothing exists at this path yet, checked against 027's INSERT
      // policy) and a same-extension replace (overwrites the existing
      // object in place, checked against 027's UPDATE policy).
      const storagePath = `${coachId}/${traineeId}/${exerciseId}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: true })
      if (uploadError) {
        throw new Error('העלאת הסרטון נכשלה. נסה/י שוב.')
      }

      const { data, error: updateError } = await supabase
        .from('trainee_workout_exercises')
        .update({
          video_storage_path: storagePath,
          video_original_name: file.name,
          video_mime_type: file.type,
        })
        .eq('id', exerciseId)
        .select()
        .single()

      if (updateError) {
        // The upload above already succeeded (and, on a same-extension
        // replace, already overwrote the previous object's content via
        // upsert). Only clean it up here when it's a genuinely new,
        // now-unreferenced object -- a different path than what the row
        // still points at; when the path matches, the row's existing
        // reference is still valid and still points at real (now newer)
        // content, so nothing is removed.
        if (storagePath !== previousPath) {
          const { error: cleanupError } = await supabase.storage.from(VIDEO_BUCKET).remove([storagePath])
          if (cleanupError) {
            console.error(
              `Failed to clean up orphaned exercise video after a failed row update: ${storagePath}`,
              cleanupError,
            )
          }
        }
        throw new Error('שמירת פרטי הסרטון נכשלה. נסה/י שוב.')
      }

      if (index !== -1) exercises[index] = data

      // Only after the row successfully points at the new object: remove
      // the previous one, if any, and only if it's a different path (a
      // same-extension replace already overwrote the identical path above
      // via upsert, so there is nothing left to remove in that case). This
      // never touches any OTHER exercise's video -- previousPath always
      // came from this exact exercise's own prior row value.
      if (previousPath && previousPath !== storagePath) {
        const { error: removeOldError } = await supabase.storage.from(VIDEO_BUCKET).remove([previousPath])
        if (removeOldError) {
          console.error(
            `Uploaded replacement exercise video but failed to remove the previous object: ${previousPath}`,
            removeOldError,
          )
        }
      }

      await this.fetchVideoSignedUrl(exerciseId, storagePath)
      return data
    },

    // Clears the DB reference first (so nothing can point at the object
    // again even if the Storage removal below fails), then best-effort
    // removes the Storage object -- same ordering/reasoning as
    // progressPhotos.js's deletePhoto: if clearing the row fails, nothing
    // is touched; if the row clears but the object removal fails, that is
    // non-fatal and logged, not surfaced as a failure of the removal the
    // coach actually asked for and got.
    async removeVideo(workoutId, exerciseId) {
      const exercises = this.exercisesByWorkout[workoutId] ?? []
      const current = exercises.find((e) => e.id === exerciseId)
      const path = current?.video_storage_path
      if (!path) return current

      const { data, error: updateError } = await supabase
        .from('trainee_workout_exercises')
        .update({ video_storage_path: null, video_original_name: null, video_mime_type: null })
        .eq('id', exerciseId)
        .select()
        .single()
      if (updateError) throw new Error('הסרת הסרטון נכשלה. נסה/י שוב.')

      const index = exercises.findIndex((e) => e.id === exerciseId)
      if (index !== -1) exercises[index] = data
      this.clearVideoUrl(exerciseId)

      const { error: removeObjectError } = await supabase.storage.from(VIDEO_BUCKET).remove([path])
      if (removeObjectError) {
        console.error(
          `Cleared exercise video reference but failed to remove storage object: ${path}`,
          removeObjectError,
        )
      }

      return data
    },

    // Private bucket -- every video needs a fresh short-lived signed URL
    // to actually play; never persisted beyond this store's own in-memory
    // cache, and never cached longer than the current session.
    async fetchVideoSignedUrl(exerciseId, storagePath) {
      this.videoUrlErrorByExerciseId[exerciseId] = null
      try {
        const { data, error } = await supabase.storage
          .from(VIDEO_BUCKET)
          .createSignedUrl(storagePath, VIDEO_SIGNED_URL_TTL_SECONDS)
        if (error) throw error
        this.videoUrlByExerciseId[exerciseId] = data.signedUrl
      } catch {
        this.videoUrlByExerciseId[exerciseId] = null
        this.videoUrlErrorByExerciseId[exerciseId] = 'לא ניתן לטעון את הסרטון כרגע.'
      }
    },

    // Drops a now-obsolete cached signed URL -- called whenever a video is
    // removed or its exercise is deleted, so nothing in the UI can ever
    // reference a stale URL for content that no longer exists there.
    clearVideoUrl(exerciseId) {
      delete this.videoUrlByExerciseId[exerciseId]
      delete this.videoUrlErrorByExerciseId[exerciseId]
    },
  },
})
