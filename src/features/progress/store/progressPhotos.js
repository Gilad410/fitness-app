import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

const BUCKET = 'progress-photos'
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour — regenerated on every fetch, never persisted.
const MAX_SIZE_BYTES = 8 * 1024 * 1024 // 8 MB, matches the bucket's file_size_limit (017_progress_photos.sql).
const EXTENSION_BY_MIME_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function friendlyError(error) {
  // Postgres unique_violation on trainee_progress_photos_one_per_angle_per_day.
  if (error.code === '23505') {
    return new Error('כבר קיימת תמונה לזווית הזו בתאריך הזה. יש למחוק אותה קודם כדי להחליף.')
  }
  return error
}

export const useProgressPhotosStore = defineStore('progressPhotos', {
  state: () => ({
    photosByTrainee: {},
    loadPromises: {},
    error: {},
  }),

  getters: {
    photosFor: (state) => (traineeId) => state.photosByTrainee[traineeId] ?? [],
  },

  actions: {
    // Loads a trainee's photo metadata (+ fresh signed URLs) once and
    // caches the in-flight/resolved promise, so views can call this on
    // every mount without refetching.
    ensureLoaded(traineeId) {
      if (this.loadPromises[traineeId]) return this.loadPromises[traineeId]
      this.loadPromises[traineeId] = this.fetchForTrainee(traineeId)
      return this.loadPromises[traineeId]
    },

    async fetchForTrainee(traineeId) {
      this.error[traineeId] = null
      const { data, error } = await supabase
        .from('trainee_progress_photos')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('logged_at', { ascending: false })
      if (error) {
        this.error[traineeId] = error.message
        throw error
      }

      this.photosByTrainee[traineeId] = await this.withSignedUrls(data)
    },

    // Private bucket -- there is no public URL, so every photo needs a
    // fresh short-lived signed URL each time it's displayed.
    async withSignedUrls(rows) {
      if (rows.length === 0) return rows

      const { data: signed, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          rows.map((row) => row.storage_path),
          SIGNED_URL_TTL_SECONDS,
        )
      if (error) throw error

      return rows.map((row, i) => ({ ...row, signedUrl: signed[i]?.signedUrl ?? null }))
    },

    // payload is { angle, logged_at, file }. Upload happens before the
    // metadata insert; if the insert fails (RLS, the one-per-angle-per-day
    // unique constraint, network), the just-uploaded object is removed so
    // it doesn't linger as an orphan.
    async addPhoto(traineeId, { angle, logged_at, file }) {
      if (!EXTENSION_BY_MIME_TYPE[file.type]) {
        throw new Error('סוג קובץ לא נתמך. יש להעלות תמונת JPEG, PNG או WebP בלבד.')
      }
      if (file.size > MAX_SIZE_BYTES) {
        throw new Error('התמונה גדולה מדי. הגודל המרבי הוא 8MB.')
      }

      const authStore = useAuthStore()
      const coachId = authStore.user.id
      const id = crypto.randomUUID()
      const ext = EXTENSION_BY_MIME_TYPE[file.type]
      const storagePath = `${coachId}/${traineeId}/${id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type })
      if (uploadError) throw uploadError

      const { data, error: insertError } = await supabase
        .from('trainee_progress_photos')
        .insert({
          id,
          trainee_id: traineeId,
          coach_id: coachId,
          angle,
          storage_path: storagePath,
          content_type: file.type,
          size_bytes: file.size,
          logged_at,
        })
        .select()
        .single()

      if (insertError) {
        const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath])
        if (cleanupError) {
          // Row was never created, so nothing references this object —
          // it's an orphaned file, not a broken reference the coach can
          // see. Surface it distinctly rather than failing silently.
          console.error(
            `Failed to clean up orphaned progress photo after a failed insert: ${storagePath}`,
            cleanupError,
          )
          throw new Error(
            'שמירת פרטי התמונה נכשלה, וייתכן שנשאר קובץ יתום באחסון. פנה לתמיכה אם זה חוזר.',
          )
        }
        throw friendlyError(insertError)
      }

      const [withUrl] = await this.withSignedUrls([data])
      const photos = this.photosByTrainee[traineeId] ?? []
      this.photosByTrainee[traineeId] = [withUrl, ...photos].sort((a, b) =>
        b.logged_at.localeCompare(a.logged_at),
      )
      return withUrl
    },

    // DB row is deleted first, then the storage object. If the DB delete
    // fails, nothing is touched and the photo stays visible (safe
    // default). If the DB delete succeeds but the storage removal fails,
    // that's non-fatal: the coach no longer sees the photo (correct from
    // their perspective) and the leftover file is a harmless orphan under
    // their own folder, logged for manual cleanup rather than surfaced as
    // a user-facing error.
    async deletePhoto(traineeId, photo) {
      const { error: deleteRowError } = await supabase
        .from('trainee_progress_photos')
        .delete()
        .eq('id', photo.id)
      if (deleteRowError) throw deleteRowError

      const photos = this.photosByTrainee[traineeId] ?? []
      this.photosByTrainee[traineeId] = photos.filter((p) => p.id !== photo.id)

      const { error: removeObjectError } = await supabase.storage
        .from(BUCKET)
        .remove([photo.storage_path])
      if (removeObjectError) {
        console.error(
          `Deleted progress photo row but failed to remove storage object: ${photo.storage_path}`,
          removeObjectError,
        )
      }
    },
  },
})
