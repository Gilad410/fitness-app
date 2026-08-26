import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee's own performance videos (030_trainee_exercise_submission_videos.sql):
// completely separate table/bucket from the coach's instructional video
// (027-029) -- this store never reads, writes, or references
// trainee_workout_exercises.video_storage_path / video_original_name /
// video_mime_type, and never references the 'exercise-videos' bucket.
// One current performance video per exercise (030's
// unique(trainee_id, exercise_id) constraint) -- a second upload for an
// exercise that already has one is a REPLACE (UPDATE, same row), not a
// new row; replacing resets the row's reviewed_at to null server-side
// (030's own BEFORE UPDATE trigger, fires whenever storage_path changes)
// -- this store never sends reviewed_at itself (the trainee's column-
// scoped UPDATE grant excludes it entirely; only
// coach_mark_submission_reviewed() (030) can ever set it).
const BUCKET = 'exercise-submission-videos'
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour -- regenerated on demand, never persisted (matches exercises.js's own convention).
const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB, matches the bucket's file_size_limit (030).
const EXTENSION_BY_MIME_TYPE = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

// Single source of truth for the allowed types/size, matching 030's
// bucket-level allowlist/limit exactly. Exported so TraineeTrainingView.vue
// can reject an invalid file immediately on selection (before staging a
// replace confirmation) with the same Hebrew message attachVideo() below
// would otherwise raise -- not a duplicated rule, the same one used twice
// (mirrors exercises.js's validateExerciseVideoFile convention exactly).
export function validateSubmissionVideoFile(file) {
  if (!EXTENSION_BY_MIME_TYPE[file.type]) {
    return 'סוג קובץ לא נתמך. יש להעלות קובץ MP4, WebM או MOV בלבד.'
  }
  if (file.size > MAX_SIZE_BYTES) {
    return 'הסרטון גדול מדי. הגודל המרבי הוא 50MB.'
  }
  return ''
}

export const useTraineeExerciseSubmissionsStore = defineStore('traineeExerciseSubmissions', {
  state: () => ({
    // At most one row per exercise (030's unique constraint) -- a flat
    // exerciseId -> row | null map, mirroring the trainee's own read of
    // the whole active program in one shot (traineeTrainingProgram.js).
    submissionsByExercise: {},
    loading: false,
    loaded: false,
    loadPromise: null,
    error: null,
    videoUrlByExerciseId: {},
    videoUrlErrorByExerciseId: {},
  }),

  getters: {
    submissionFor: (state) => (exerciseId) => state.submissionsByExercise[exerciseId] ?? null,
    videoUrlFor: (state) => (exerciseId) => state.videoUrlByExerciseId[exerciseId] ?? null,
    videoUrlErrorFor: (state) => (exerciseId) => state.videoUrlErrorByExerciseId[exerciseId] ?? null,
  },

  actions: {
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    // Reads every one of the trainee's own submissions across their whole
    // active program in one call -- RLS (030's
    // trainee_exercise_submission_videos_select_own_trainee) scopes this
    // implicitly, no exercise_id filter needed client-side.
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase.from('trainee_exercise_submission_videos').select('*')
        if (error) throw error

        const map = {}
        for (const row of data) {
          map[row.exercise_id] = row
        }
        this.submissionsByExercise = map
        this.loaded = true
      } catch (err) {
        this.error = 'אירעה שגיאה בטעינת סרטוני הביצוע. נסה/י שוב.'
        throw err
      } finally {
        this.loading = false
      }
    },

    // Handles both a first-time upload and a replace -- TraineeTrainingView.vue
    // is responsible for asking the trainee to explicitly confirm before
    // calling this when a submission already exists for this exercise;
    // this action itself always re-validates the file regardless of what
    // the caller already checked.
    //
    // Storage path is always
    // {coachId}/{traineeId}/{exerciseId}/{submissionId}.{ext}, the exact
    // structure 030's RLS policies require -- built entirely from
    // server-resolved ids (trainee_get_auth_context(), 022) and the
    // row's own id, NEVER from the file's own name. On a first upload,
    // submissionId is freshly generated and used as BOTH the Storage
    // filename and the new row's own primary key (so the two always
    // match, matching 025's proven convention). On a replace, the
    // EXISTING row's id is reused (it's an UPDATE, not a new row) -- the
    // path only changes if the file's extension changes.
    //
    // Sequenced exactly as required: upload the new object first, write
    // the metadata row second (insert if new, update if replacing), and
    // only once that succeeds is any previous (different-path) object
    // removed -- so a failure at any step never leaves the exercise
    // pointing at a half-written or missing video, and the old video
    // stays fully intact until the new one is confirmed saved.
    async attachVideo(exerciseId, file) {
      const validationError = validateSubmissionVideoFile(file)
      if (validationError) throw new Error(validationError)

      const { data: ctxData, error: ctxError } = await supabase.rpc('trainee_get_auth_context')
      if (ctxError) throw new Error('אירעה שגיאה. נסה/י שוב.')
      const ctx = Array.isArray(ctxData) ? ctxData[0] : ctxData
      if (!ctx?.trainee_id || !ctx?.coach_id) {
        throw new Error('לא נמצא פרופיל מתאמן המקושר לחשבון זה.')
      }

      const existing = this.submissionsByExercise[exerciseId] ?? null
      const rowId = existing?.id ?? crypto.randomUUID()
      const ext = EXTENSION_BY_MIME_TYPE[file.type]
      const storagePath = `${ctx.coach_id}/${ctx.trainee_id}/${exerciseId}/${rowId}.${ext}`
      const previousPath = existing?.storage_path ?? null

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: true })
      if (uploadError) {
        throw new Error('העלאת הסרטון נכשלה. נסה/י שוב.')
      }

      const payload = {
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
      }

      let data, dbError
      if (existing) {
        ;({ data, error: dbError } = await supabase
          .from('trainee_exercise_submission_videos')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single())
      } else {
        ;({ data, error: dbError } = await supabase
          .from('trainee_exercise_submission_videos')
          .insert({
            id: rowId,
            trainee_id: ctx.trainee_id,
            coach_id: ctx.coach_id,
            exercise_id: exerciseId,
            ...payload,
          })
          .select()
          .single())
      }

      if (dbError) {
        // The upload above already succeeded (and, on a same-extension
        // replace, already overwrote the previous object's content via
        // upsert). Only clean it up here when it's a genuinely new,
        // now-unreferenced object -- a different path than what the row
        // still points at; when the path matches, the row's existing
        // reference is still valid and still points at real (now newer)
        // content, so nothing is removed (mirrors exercises.js's
        // attachVideo exactly).
        if (storagePath !== previousPath) {
          const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath])
          if (cleanupError) {
            console.error(
              `Failed to clean up orphaned submission video after a failed row write: ${storagePath}`,
              cleanupError,
            )
          }
        }
        throw new Error('שמירת פרטי הסרטון נכשלה. נסה/י שוב.')
      }

      this.submissionsByExercise[exerciseId] = data

      // Only after the row successfully points at the new object: remove
      // the previous one, if any, and only if it's a different path (a
      // same-extension replace already overwrote the identical path above
      // via upsert). This never touches any OTHER exercise's or trainee's
      // video -- previousPath always came from this exact exercise's own
      // prior row value, scoped to this trainee by RLS throughout.
      if (previousPath && previousPath !== storagePath) {
        const { error: removeOldError } = await supabase.storage.from(BUCKET).remove([previousPath])
        if (removeOldError) {
          console.error(
            `Uploaded replacement submission video but failed to remove the previous object: ${previousPath}`,
            removeOldError,
          )
        }
      }

      await this.fetchVideoSignedUrl(exerciseId, storagePath)
      return data
    },

    // Row deleted first (so nothing can reference it again even if the
    // Storage removal below fails), then best-effort Storage removal --
    // same ordering/reasoning as exercises.js's removeVideo() /
    // traineeProgressPhotos.js's deletePhoto().
    async removeVideo(exerciseId) {
      const existing = this.submissionsByExercise[exerciseId]
      if (!existing) return

      const { error: deleteRowError } = await supabase
        .from('trainee_exercise_submission_videos')
        .delete()
        .eq('id', existing.id)
      if (deleteRowError) throw new Error('מחיקת הסרטון נכשלה. נסה/י שוב.')

      this.submissionsByExercise[exerciseId] = null
      this.clearVideoUrl(exerciseId)

      const { error: removeObjectError } = await supabase.storage.from(BUCKET).remove([existing.storage_path])
      if (removeObjectError) {
        console.error(
          `Deleted submission row but failed to remove storage object: ${existing.storage_path}`,
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
