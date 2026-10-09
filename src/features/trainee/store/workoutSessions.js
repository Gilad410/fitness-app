import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

const genericError = 'לא ניתן לשמור את האימון כרגע. נסה/י שוב.'

export const useWorkoutSessionsStore = defineStore('workoutSessions', {
  state: () => ({
    sessions: [],
    sets: [],
    loading: false,
    error: '',
    accountId: null,
  }),
  getters: {
    activeSession: (state) => state.accountId === useAuthStore().user?.id
      ? state.sessions.find((session) => session.status === 'active') ?? null : null,
    setsForSession: (state) => (sessionId) => state.accountId === useAuthStore().user?.id
      ? state.sets.filter((set) => set.session_id === sessionId) : [],
    historyForExercise: (state) => (exerciseId) => state.accountId === useAuthStore().user?.id ? state.sets
      .filter((set) => set.exercise_id === exerciseId)
      .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at)) : [],
  },
  actions: {
    async loadMine() {
      const accountId = useAuthStore().user?.id
      this.accountId = accountId
      this.sessions = []
      this.sets = []
      this.loading = true
      this.error = ''
      try {
        const { data: sessions, error: sessionsError } = await supabase
          .from('trainee_workout_sessions').select('*').order('started_at', { ascending: false }).limit(100)
        if (sessionsError) throw sessionsError
        const ids = sessions.map((session) => session.id)
        let sets = []
        if (ids.length) {
          const { data, error } = await supabase
            .from('trainee_workout_set_logs').select('*').in('session_id', ids)
          if (error) throw error
          sets = data
        }
        if (this.accountId === accountId && useAuthStore().user?.id === accountId) {
          this.sessions = sessions
          this.sets = sets
        }
      } catch {
        this.error = 'לא ניתן לטעון את היסטוריית האימונים. נסה/י שוב.'
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },
    async start(workoutId) {
      const { data, error } = await supabase.rpc('trainee_start_workout', { p_workout_id: workoutId })
      if (error) throw new Error(error.message?.includes('Finish the active workout')
        ? 'יש לסיים קודם את האימון הפעיל.' : genericError)
      this.sessions = [data, ...this.sessions.filter((session) => session.id !== data.id)]
      return data
    },
    async saveSet(sessionId, exerciseId, values) {
      const { data, error } = await supabase.rpc('trainee_save_workout_set', {
        p_session_id: sessionId,
        p_exercise_id: exerciseId,
        p_set_number: values.setNumber,
        p_reps: values.reps,
        p_weight_kg: values.weightKg,
        p_trainee_note: values.note || null,
      })
      if (error) throw new Error(genericError)
      this.sets = [...this.sets.filter((set) => set.id !== data.id), data]
      return data
    },
    async finish(sessionId) {
      const { data, error } = await supabase.rpc('trainee_finish_workout', { p_session_id: sessionId })
      if (error) throw new Error(genericError)
      this.sessions = this.sessions.map((session) => session.id === data.id ? data : session)
      return data
    },
  },
})
