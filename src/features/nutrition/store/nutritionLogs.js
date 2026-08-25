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

    // Only sums entries with a known protein value — an entry logged
    // against a food with unset protein is excluded, not treated as 0.
    dailyProteinTotalFor: (state) => (traineeId, date) =>
      (state.logsByTrainee[traineeId] ?? [])
        .filter((log) => log.logged_at === date && log.protein !== null)
        .reduce((sum, log) => sum + Number(log.protein), 0),

    dailyHasUnknownProteinFor: (state) => (traineeId, date) =>
      (state.logsByTrainee[traineeId] ?? []).some(
        (log) => log.logged_at === date && log.protein === null,
      ),
  },

  actions: {
    // Dedupes concurrent in-flight calls for the same trainee (e.g. a
    // component mounting and firing this twice in the same tick), but
    // deliberately does NOT cache the resolved/rejected result: the
    // in-flight promise is cleared as soon as it settles, so the next
    // call -- e.g. the coach leaving and re-entering this trainee's
    // nutrition workspace -- always re-fetches from Supabase instead of
    // silently returning a stale snapshot from earlier in the session
    // (a trainee can log a new entry at any time, from another device).
    ensureLoaded(traineeId) {
      if (this.loadPromises[traineeId]) return this.loadPromises[traineeId]
      const promise = this.fetchForTrainee(traineeId).finally(() => {
        if (this.loadPromises[traineeId] === promise) {
          this.loadPromises[traineeId] = null
        }
      })
      this.loadPromises[traineeId] = promise
      return promise
    },

    async fetchForTrainee(traineeId) {
      this.error[traineeId] = null
      const { data, error } = await supabase
        .from('trainee_nutrition_logs')
        .select('*, food:foods(name), restaurant_food_item:restaurant_food_items(item_name, chain_name, serving_description)')
        .eq('trainee_id', traineeId)
        .order('logged_at', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) {
        this.error[traineeId] = error.message
        throw error
      }
      this.logsByTrainee[traineeId] = data
    },

    // payload is either { food_id, grams, logged_at } (existing regular-food
    // flow, grams-based) or { restaurant_food_item_id, servings, logged_at }
    // (restaurant/chain flow, fixed-serving-based). calories/protein are
    // always computed server-side by the DB trigger, never sent here.
    async addLog(traineeId, payload) {
      const authStore = useAuthStore()
      const { data, error } = await supabase
        .from('trainee_nutrition_logs')
        .insert({ ...payload, trainee_id: traineeId, coach_id: authStore.user.id })
        .select('*, food:foods(name), restaurant_food_item:restaurant_food_items(item_name, chain_name, serving_description)')
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
