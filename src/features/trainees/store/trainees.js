import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

export const useTraineesStore = defineStore('trainees', {
  state: () => ({
    trainees: [],
    loading: false,
    error: null,
    loaded: false,
    loadPromise: null,
  }),

  getters: {
    activeTrainees: (state) => state.trainees.filter((t) => t.status === 'active'),
    pausedTrainees: (state) => state.trainees.filter((t) => t.status === 'paused'),
    archivedTrainees: (state) => state.trainees.filter((t) => t.status === 'archived'),
    activeCount: (state) => state.trainees.filter((t) => t.status !== 'archived').length,
    getById: (state) => (id) => state.trainees.find((t) => t.id === id),
  },

  actions: {
    // Loads the roster once and caches the in-flight/resolved promise, so
    // views can call this on every mount without refetching redundantly.
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    async fetchAll() {
      this.loading = true
      this.error = null
      const { data, error } = await supabase
        .from('trainees')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) {
        this.error = error.message
        this.loading = false
        throw error
      }
      this.trainees = data
      this.loaded = true
      this.loading = false
    },

    async create(payload) {
      const authStore = useAuthStore()
      const { data, error } = await supabase
        .from('trainees')
        .insert({ ...payload, coach_id: authStore.user.id })
        .select()
        .single()
      if (error) throw error
      this.trainees.unshift(data)
      return data
    },

    async update(id, patch) {
      const { data, error } = await supabase
        .from('trainees')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      const index = this.trainees.findIndex((t) => t.id === id)
      if (index !== -1) this.trainees[index] = data
      return data
    },
  },
})
