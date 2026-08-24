import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee's own progress photos -- reads/writes public.trainee_progress_photos
// + the private 'progress-photos' Storage bucket through the trainee-facing
// policies added by 025_trainee_measurements_photos_access.sql. Every photo
// is reachable only through a freshly generated signed URL (never a public
// URL -- the bucket is private, 017_progress_photos.sql).
//
// trainee_id/coach_id are resolved through trainee_get_auth_context()
// (022, the same security-definer mechanism every other trainee RPC uses)
// -- called once per upload, purely to construct the storage path
// client-side. Knowing its own ids grants the client no extra capability:
// every RLS/Storage policy independently re-verifies the exact same
// ownership server-side regardless of what this call returns.
//
// IMPORTANT (documented in full in 025's own comments): Storage upload and
// metadata insertion are two separate API calls that cannot share one
// PostgreSQL transaction. addPhoto() below uploads first, inserts second,
// and deletes the just-uploaded object if the insert is rejected -- a
// cleanup failure is reported as its own distinct Hebrew error, never
// silently swallowed. deletePhoto() removes the metadata row first, then
// the storage object; if the row delete fails nothing is touched (the
// photo stays visible, matching what it actually still is); if the row
// delete succeeds but the object removal fails, that is non-fatal and
// logged, not surfaced as a failure of the delete the trainee actually
// asked for and got (the metadata row -- the only thing this store or any
// UI reads from -- is already gone).
const BUCKET = 'progress-photos'
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour -- regenerated on every fetch, never persisted.
const MAX_SIZE_BYTES = 8 * 1024 * 1024 // 8 MB, matches the bucket's file_size_limit (017).
const EXTENSION_BY_MIME_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const useTraineeProgressPhotosStore = defineStore('traineeProgressPhotos', {
  state: () => ({
    photos: [],
    loading: false,
    loaded: false,
    loadPromise: null,
    error: null,
    adding: false,
    addError: null,
    deletingId: null,
    deleteError: null,
  }),

  actions: {
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase
          .from('trainee_progress_photos')
          .select('*')
          .order('logged_at', { ascending: false })
        if (error) throw error
        this.photos = await this.withSignedUrls(data)
        this.loaded = true
      } catch (err) {
        this.error = safeErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    // Private bucket -- there is no public URL, so every photo needs a
    // fresh short-lived signed URL each time it's displayed. Gated by the
    // trainee's own storage SELECT policy (025 section 4a) -- can only
    // ever resolve to paths under this trainee's own coach_id/trainee_id
    // folder, same as the metadata rows themselves.
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

    // payload: { angle, loggedAt, file }. Upload happens before the
    // metadata insert; if the insert fails (RLS, the one-per-angle-per-day
    // unique constraint, network), the just-uploaded object is removed so
    // it doesn't linger as an orphan -- see the module doc comment above.
    async addPhoto({ angle, loggedAt, file }) {
      this.adding = true
      this.addError = null
      try {
        if (!EXTENSION_BY_MIME_TYPE[file.type]) {
          throw new Error('סוג קובץ לא נתמך. יש להעלות תמונת JPEG, PNG או WebP בלבד.')
        }
        if (file.size > MAX_SIZE_BYTES) {
          throw new Error('התמונה גדולה מדי. הגודל המרבי הוא 8MB.')
        }

        // Resolve the caller's own trainee_id/coach_id -- never guessed,
        // never cached beyond this one call, and independently
        // re-verified server-side by both the storage-upload policy and
        // the metadata-insert policy below regardless of what this
        // returns.
        const { data: ctxData, error: ctxError } = await supabase.rpc('trainee_get_auth_context')
        if (ctxError) throw new Error(safeErrorMessage(ctxError))
        const ctx = Array.isArray(ctxData) ? ctxData[0] : ctxData
        if (!ctx?.trainee_id || !ctx?.coach_id) {
          throw new Error('לא נמצא פרופיל מתאמן המקושר לחשבון זה.')
        }

        // UUID generated before upload -- the same id is used for the
        // storage filename AND the metadata row's own id, exactly the
        // {coach_id}/{trainee_id}/{photo_id}.{extension} shape
        // 025's trainee_progress_photos_insert_own_trainee policy requires
        // an exact regex match against.
        const photoId = crypto.randomUUID()
        const ext = EXTENSION_BY_MIME_TYPE[file.type]
        const storagePath = `${ctx.coach_id}/${ctx.trainee_id}/${photoId}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, { contentType: file.type })
        if (uploadError) throw new Error(safeErrorMessage(uploadError))

        const { data, error: insertError } = await supabase
          .from('trainee_progress_photos')
          .insert({
            id: photoId,
            trainee_id: ctx.trainee_id,
            coach_id: ctx.coach_id,
            angle,
            storage_path: storagePath,
            content_type: file.type,
            size_bytes: file.size,
            logged_at: loggedAt,
          })
          .select()
          .single()

        if (insertError) {
          const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath])
          if (cleanupError) {
            // Row was never created, so nothing references this object --
            // it's an orphaned file, not a broken reference the trainee
            // can see. Surfaced distinctly rather than failing silently,
            // per 025's explicit two-phase-upload documentation.
            console.error(
              `Failed to clean up orphaned progress photo after a failed insert: ${storagePath}`,
              cleanupError,
            )
            throw new Error(
              'שמירת פרטי התמונה נכשלה, וייתכן שנשאר קובץ יתום באחסון. יש לפנות למאמן/ת אם זה חוזר.',
            )
          }
          throw new Error(friendlyInsertErrorMessage(insertError))
        }

        const [withUrl] = await this.withSignedUrls([data])
        this.photos = [withUrl, ...this.photos].sort((a, b) => b.logged_at.localeCompare(a.logged_at))
        return withUrl
      } catch (err) {
        this.addError = err.message ?? 'אירעה שגיאה. נסה/י שוב.'
        throw err
      } finally {
        this.adding = false
      }
    },

    // DB row is deleted first, then the storage object -- see the module
    // doc comment above for the full partial-failure handling this
    // implements (mirrors 025's explicit documentation exactly).
    async deletePhoto(photo) {
      this.deletingId = photo.id
      this.deleteError = null
      try {
        const { error: deleteRowError } = await supabase
          .from('trainee_progress_photos')
          .delete()
          .eq('id', photo.id)
        if (deleteRowError) throw deleteRowError

        this.photos = this.photos.filter((p) => p.id !== photo.id)

        const { error: removeObjectError } = await supabase.storage
          .from(BUCKET)
          .remove([photo.storage_path])
        if (removeObjectError) {
          console.error(
            `Deleted progress photo row but failed to remove storage object: ${photo.storage_path}`,
            removeObjectError,
          )
        }
      } catch (err) {
        this.deleteError = safeErrorMessage(err)
        throw err
      } finally {
        this.deletingId = null
      }
    },
  },
})

// Postgres unique_violation on trainee_progress_photos_one_per_angle_per_day
// (017) -- the one expected, nameable failure from the metadata insert;
// anything else falls through to the generic message.
function friendlyInsertErrorMessage(error) {
  if (error?.code === '23505') {
    return 'כבר קיימת תמונה לזווית הזו בתאריך הזה. יש למחוק אותה קודם כדי להחליף.'
  }
  return safeErrorMessage(error)
}

// No custom `raise exception` text applies to this store (no RPC is used
// for photos -- see the module doc comment above for why) -- every error
// reaching here is a raw Postgres/Storage/network error, always replaced
// with a generic Hebrew message so no internal detail ever reaches the UI.
function safeErrorMessage() {
  return 'אירעה שגיאה. נסה/י שוב.'
}
