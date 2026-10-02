import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

export const useTraineeCustomFoodsStore = defineStore('traineeCustomFoods', {
  state: () => ({
    foods: [],
    loading: false,
    error: null,
  }),

  getters: {
    active: (state) => state.foods.filter((food) => !food.archived_at),
  },

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase
          .from('trainee_custom_foods')
          .select('*')
          .order('name', { ascending: true })
        if (error) throw error
        this.foods = data
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async create({ name, caloriesPer100g, proteinPer100g }) {
      const { data: context, error: contextError } = await supabase.rpc('trainee_get_auth_context')
      if (contextError) throw contextError
      const traineeId = (Array.isArray(context) ? context[0] : context)?.trainee_id
      if (!traineeId) throw new Error('לא נמצא פרופיל מתאמן המקושר לחשבון זה.')

      const { data, error } = await supabase
        .from('trainee_custom_foods')
        .insert({
          trainee_id: traineeId,
          name: name.trim(),
          calories_per_100g: caloriesPer100g,
          protein_per_100g: proteinPer100g,
        })
        .select()
        .single()
      if (error) throw error
      this.foods = [...this.foods, data].sort((a, b) => a.name.localeCompare(b.name, 'he'))
      return data
    },
  },
})
