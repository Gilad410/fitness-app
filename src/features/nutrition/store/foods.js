import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

export const useFoodsStore = defineStore('foods', {
  state: () => ({
    foods: [],
    loading: false,
    error: null,
    loaded: false,
    loadPromise: null,
  }),

  getters: {
    getById: (state) => (id) => state.foods.find((f) => f.id === id),
    getByName: (state) => (name) =>
      state.foods.find((f) => f.name.toLowerCase() === name.toLowerCase()),
  },

  actions: {
    // Loads the coach's food catalog once and caches the in-flight/resolved
    // promise, so views can call this on every mount without refetching.
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    async fetchAll() {
      this.loading = true
      this.error = null
      const { data, error } = await supabase
        .from('foods')
        .select('*')
        .order('name', { ascending: true })
      if (error) {
        this.error = error.message
        this.loading = false
        throw error
      }
      this.foods = data
      this.loaded = true
      this.loading = false
    },

    async create(payload) {
      const authStore = useAuthStore()
      const { data, error } = await supabase
        .from('foods')
        .insert({ ...payload, coach_id: authStore.user.id })
        .select()
        .single()
      if (error) throw error
      this.foods = [...this.foods, data].sort((a, b) => a.name.localeCompare(b.name))
      return data
    },

    async update(id, patch) {
      const { data, error } = await supabase
        .from('foods')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      const index = this.foods.findIndex((f) => f.id === id)
      if (index !== -1) this.foods[index] = data
      return data
    },
  },
})
