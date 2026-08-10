import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

export const useCircumferenceLogsStore = defineStore('circumferenceLogs', {
  state: () => ({
    logsByTrainee: {},
    loadPromises: {},
    error: {},
  }),

  getters: {
    logsFor: (state) => (traineeId) => state.logsByTrainee[traineeId] ?? [],
  },

  actions: {
    // Loads a trainee's history once and caches the in-flight/resolved
    // promise, so views can call this on every mount without refetching.
    ensureLoaded(traineeId) {
      if (this.loadPromises[traineeId]) return this.loadPromises[traineeId]
      this.loadPromises[traineeId] = this.fetchForTrainee(traineeId)
      return this.loadPromises[traineeId]
    },

    async fetchForTrainee(traineeId) {
      this.error[traineeId] = null
      const { data, error } = await supabase
        .from('trainee_circumference_logs')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('logged_at', { ascending: false })
      if (error) {
        this.error[traineeId] = error.message
        throw error
      }
      this.logsByTrainee[traineeId] = data
    },

    async addLog(traineeId, payload) {
      const authStore = useAuthStore()
      const { data, error } = await supabase
        .from('trainee_circumference_logs')
        .insert({ ...payload, trainee_id: traineeId, coach_id: authStore.user.id })
        .select()
        .single()
      if (error) throw error

      const logs = this.logsByTrainee[traineeId] ?? []
      this.logsByTrainee[traineeId] = [...logs, data].sort((a, b) =>
        b.logged_at.localeCompare(a.logged_at),
      )
      return data
    },

    // Corrections are delete + re-add, not edit-in-place, matching the
    // trainee_progress_logs / trainee_nutrition_logs convention.
    async deleteLog(traineeId, logId) {
      const { error } = await supabase.from('trainee_circumference_logs').delete().eq('id', logId)
      if (error) throw error

      const logs = this.logsByTrainee[traineeId] ?? []
      this.logsByTrainee[traineeId] = logs.filter((log) => log.id !== logId)
    },
  },
})
