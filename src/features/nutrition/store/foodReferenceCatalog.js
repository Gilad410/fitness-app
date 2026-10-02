import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

export const useFoodReferenceCatalogStore = defineStore('foodReferenceCatalog', {
  state: () => ({
    error: null,
  }),

  actions: {
    async createGlobal({ name, caloriesPer100g, proteinPer100g }) {
      this.error = null
      const { data, error } = await supabase.rpc('owner_create_reference_food', {
        p_name: name.trim(),
        p_calories_per_100g: caloriesPer100g,
        p_protein_per_100g: proteinPer100g,
      })
      if (error) {
        this.error = error.message
        throw error
      }
      return Array.isArray(data) ? data[0] : data
    },

    // Looks up reference foods whose name contains the given term, so the
    // caller can prefill calories_per_100g and protein_per_100g for a food
    // the coach is typing.
    async search(term) {
      const trimmed = term.trim()
      if (trimmed === '') return []

      this.error = null
      const { data, error } = await supabase
        .from('food_reference_catalog')
        .select('id, name, calories_per_100g, protein_per_100g')
        .ilike('name', `%${trimmed}%`)
        .order('name', { ascending: true })
        .limit(5)
      if (error) {
        this.error = error.message
        throw error
      }
      return data
    },
  },
})
