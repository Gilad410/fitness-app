import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

export const useNutritionLogsStore = defineStore('nutritionLogs', {
  state: () => ({
    logsByTrainee: {},
    loadPromises: {},
    error: {},
  }),

  getters: {
    logsFor: (state) => (traineeId) => state.logsByTrainee[traineeId] ?? [],

    dailyTotalFor: (state) => (traineeId, date) =>
      (state.logsByTrainee[traineeId] ?? [])
        .filter((log) => log.logged_at === date)
        .reduce((sum, log) => sum + Number(log.calories), 0),
  },

  actions: {
    // Loads a trainee's food log once and caches the in-flight/resolved
    // promise, so views can call this on every mount without refetching.
    ensureLoaded(traineeId) {
      if (this.loadPromises[traineeId]) return this.loadPromises[traineeId]
      this.loadPromises[traineeId] = this.fetchForTrainee(traineeId)
      return this.loadPromises[traineeId]
    },

    async fetchForTrainee(traineeId) {
      this.error[traineeId] = null
      const { data, error } = await supabase
        .from('trainee_nutrition_logs')
        .select('*, food:foods(name)')
        .eq('trainee_id', traineeId)
        .order('logged_at', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) {
        this.error[traineeId] = error.message
        throw error
      }
      this.logsByTrainee[traineeId] = data
    },

    async addLog(traineeId, payload) {
      const authStore = useAuthStore()
      const { data, error } = await supabase
        .from('trainee_nutrition_logs')
        .insert({ ...payload, trainee_id: traineeId, coach_id: authStore.user.id })
        .select('*, food:foods(name)')
        .single()
      if (error) throw error

      const logs = this.logsByTrainee[traineeId] ?? []
      this.logsByTrainee[traineeId] = [data, ...logs].sort((a, b) => {
        const byDate = b.logged_at.localeCompare(a.logged_at)
        return byDate !== 0 ? byDate : b.created_at.localeCompare(a.created_at)
      })
      return data
    },

    async deleteLog(traineeId, logId) {
      const { error } = await supabase.from('trainee_nutrition_logs').delete().eq('id', logId)
      if (error) throw error

      const logs = this.logsByTrainee[traineeId] ?? []
      this.logsByTrainee[traineeId] = logs.filter((log) => log.id !== logId)
    },
  },
})
