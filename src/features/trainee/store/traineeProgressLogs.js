import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee's own weigh-in history -- reads public.trainee_progress_logs
// through the trainee-facing SELECT policy added by
// 024_trainee_progress_access.sql (scoped implicitly by RLS, no
// trainee_id filter needed client-side, same shape as the coach's
// progressLogs.js store). Every write goes through
// trainee_log_progress_entry() / trainee_delete_progress_entry() -- this
// store never inserts, updates, or deletes the table directly, and never
// sends trainee_id/coach_id -- those are always resolved server-side from
// the caller's own auth context.
export const useTraineeProgressLogsStore = defineStore('traineeProgressLogs', {
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
  }),

  getters: {
    // Oldest first, for chronological chart plotting / history display.
    ascendingLogs: (state) => [...state.logs].reverse(),

    latestLog: (state) => state.logs[0] ?? null,
  },

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
          .from('trainee_progress_logs')
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

    // payload: { weight, loggedAt, note? }. trainee_id/coach_id are never
    // sent -- trainee_log_progress_entry() resolves both exclusively from
    // the caller's own auth context server-side.
    async addLog({ weight, loggedAt, note }) {
      this.adding = true
      this.addError = null
      try {
        const { data, error } = await supabase.rpc('trainee_log_progress_entry', {
          p_weight: weight,
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
        const { error } = await supabase.rpc('trainee_delete_progress_entry', {
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

// trainee_log_progress_entry() / trainee_delete_progress_entry() /
// trainee_get_auth_context() (024_trainee_progress_access.sql) raise
// plain-English `raise exception` messages for expected validation
// failures -- each one is deliberately short, generic, and already safe
// to show verbatim (never references internal state beyond what the
// trainee already sees). Anything NOT in this list (a raw Postgres/
// network/RLS-denial error) is replaced with a generic Hebrew message so
// no internal detail ever reaches the UI.
const HEBREW_MESSAGES = {
  'Only a trainee may log their own progress entry.': 'פעולה זו זמינה למתאמנים בלבד.',
  'Only a trainee may delete their own progress entry.': 'פעולה זו זמינה למתאמנים בלבד.',
  'No trainee profile is linked to this account.': 'לא נמצא פרופיל מתאמן המקושר לחשבון זה.',
  'Weight must be a positive number.': 'המשקל חייב להיות מספר חיובי.',
  'A log date is required.': 'יש לבחור תאריך.',
  'A progress entry id is required.': 'לא נבחרה מדידה למחיקה.',
  'Progress entry not found.': 'הרישום לא נמצא.',
}

function safeErrorMessage(err) {
  const msg = err?.message ?? ''
  return HEBREW_MESSAGES[msg] ?? 'אירעה שגיאה. נסה/י שוב.'
}
