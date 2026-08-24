import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee's own circumference history + starting baseline -- reads
// public.trainee_circumference_logs through the trainee-facing SELECT
// policy added by 025_trainee_measurements_photos_access.sql (scoped
// implicitly by RLS, no trainee_id filter needed client-side), and the six
// starting_*_cm values through trainee_get_own_starting_circumferences()
// (025) -- a function wholly separate from trainee_get_own_profile()
// (021), which is never called or modified here. Every write goes through
// trainee_log_circumference_entry() / trainee_delete_circumference_entry()
// -- this store never inserts, updates, or deletes the table directly,
// and never sends trainee_id/coach_id -- those are always resolved
// server-side from the caller's own auth context.
export const useTraineeCircumferenceLogsStore = defineStore('traineeCircumferenceLogs', {
  state: () => ({
    logs: [],
    loading: false,
    loaded: false,
    loadPromise: null,
    error: null,
    adding: false,
    addError: null,
    deletingId: null,
    deleteError: null,

    // Starting (baseline) circumferences -- trainees.starting_*_cm (015),
    // read-only, fetched once via trainee_get_own_starting_circumferences()
    // (025). No target-circumference concept exists anywhere in the
    // schema -- this is a baseline only, never a goal to compare against.
    starting: null,
    startingLoading: false,
    startingLoaded: false,
    startingLoadPromise: null,
    startingError: null,
  }),

  actions: {
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    // Newest first -- matches the insert/sort order used by addLog below.
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase
          .from('trainee_circumference_logs')
          .select('*')
          .order('logged_at', { ascending: false })
        if (error) throw error
        this.logs = data
        this.loaded = true
      } catch (err) {
        this.error = safeErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    ensureStartingLoaded() {
      if (this.startingLoadPromise) return this.startingLoadPromise
      this.startingLoadPromise = this.fetchStarting()
      return this.startingLoadPromise
    },

    async fetchStarting() {
      this.startingLoading = true
      this.startingError = null
      try {
        const { data, error } = await supabase.rpc('trainee_get_own_starting_circumferences')
        if (error) throw error
        // `returns table(...)` -- PostgREST returns an array of rows.
        this.starting = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
        this.startingLoaded = true
      } catch (err) {
        this.startingError = safeErrorMessage(err)
        throw err
      } finally {
        this.startingLoading = false
      }
    },

    // payload: { abdomenCm?, neckCm?, rightArmCm?, leftArmCm?, rightLegCm?,
    // leftLegCm?, loggedAt, note? } -- each measurement optional, but the
    // RPC re-validates "at least one" server-side regardless of anything
    // checked client-side. trainee_id/coach_id are never sent -- resolved
    // exclusively server-side by trainee_log_circumference_entry().
    async addLog({ abdomenCm, neckCm, rightArmCm, leftArmCm, rightLegCm, leftLegCm, loggedAt, note }) {
      this.adding = true
      this.addError = null
      try {
        const { data, error } = await supabase.rpc('trainee_log_circumference_entry', {
          p_abdomen_cm: abdomenCm ?? null,
          p_neck_cm: neckCm ?? null,
          p_right_arm_cm: rightArmCm ?? null,
          p_left_arm_cm: leftArmCm ?? null,
          p_right_leg_cm: rightLegCm ?? null,
          p_left_leg_cm: leftLegCm ?? null,
          p_logged_at: loggedAt,
          p_note: note ?? null,
        })
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        this.logs = [...this.logs, row].sort((a, b) => b.logged_at.localeCompare(a.logged_at))
        return row
      } catch (err) {
        this.addError = safeErrorMessage(err)
        throw err
      } finally {
        this.adding = false
      }
    },

    async deleteLog(logId) {
      this.deletingId = logId
      this.deleteError = null
      try {
        const { error } = await supabase.rpc('trainee_delete_circumference_entry', {
          p_log_id: logId,
        })
        if (error) throw error
        this.logs = this.logs.filter((log) => log.id !== logId)
      } catch (err) {
        this.deleteError = safeErrorMessage(err)
        throw err
      } finally {
        this.deletingId = null
      }
    },
  },
})

// trainee_log_circumference_entry() / trainee_delete_circumference_entry()
// / trainee_get_own_starting_circumferences() / trainee_get_auth_context()
// (025_trainee_measurements_photos_access.sql) raise plain-English `raise
// exception` messages for expected validation failures -- each one is
// deliberately short, generic, and already safe to show verbatim. Anything
// NOT in this list (a raw Postgres/network/RLS-denial error) is replaced
// with a generic Hebrew message so no internal detail ever reaches the UI.
const HEBREW_MESSAGES = {
  'Only a trainee may log their own circumference entry.': 'פעולה זו זמינה למתאמנים בלבד.',
  'Only a trainee may delete their own circumference entry.': 'פעולה זו זמינה למתאמנים בלבד.',
  'No trainee profile is linked to this account.': 'לא נמצא פרופיל מתאמן המקושר לחשבון זה.',
  'A log date is required.': 'יש לבחור תאריך.',
  'Abdomen measurement must be a positive number.': 'מדידת הבטן חייבת להיות מספר חיובי.',
  'Neck measurement must be a positive number.': 'מדידת הצוואר חייבת להיות מספר חיובי.',
  'Right arm measurement must be a positive number.': 'מדידת יד ימין חייבת להיות מספר חיובי.',
  'Left arm measurement must be a positive number.': 'מדידת יד שמאל חייבת להיות מספר חיובי.',
  'Right leg measurement must be a positive number.': 'מדידת רגל ימין חייבת להיות מספר חיובי.',
  'Left leg measurement must be a positive number.': 'מדידת רגל שמאל חייבת להיות מספר חיובי.',
  'At least one measurement is required.': 'יש להזין לפחות מדידה אחת.',
  'A circumference entry id is required.': 'לא נבחרה מדידה למחיקה.',
  'Circumference entry not found.': 'הרישום לא נמצא.',
}

function safeErrorMessage(err) {
  const msg = err?.message ?? ''
  return HEBREW_MESSAGES[msg] ?? 'אירעה שגיאה. נסה/י שוב.'
}
