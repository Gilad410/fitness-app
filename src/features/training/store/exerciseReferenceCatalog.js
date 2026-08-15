import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Shared, read-only reference catalog (public.exercise_reference_catalog --
// 019_exercise_reference_catalog.sql). Small (under 100 rows), so it's
// fetched once in full and filtered/sorted client-side per category,
// rather than querying per category -- same "fetch small shared table
// once" shape as useFoodReferenceCatalogStore, just without the per-term
// search since here the whole thing comfortably fits in memory.
export const useExerciseReferenceCatalogStore = defineStore('exerciseReferenceCatalog', {
  state: () => ({
    catalog: [],
    loaded: false,
    loadPromise: null,
    error: null,
  }),

  getters: {
    // Alphabetical (Hebrew collation), scoped to one category -- exactly
    // what the exercise picker's second dropdown needs.
    exercisesFor: (state) => (category) =>
      state.catalog
        .filter((exercise) => exercise.category === category)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'he')),

    // Case-insensitive, whitespace-tolerant match against an existing
    // exercise's freeform name -- used to auto-select the right
    // category/exercise when opening the edit form (requirement: if the
    // name exists in the catalog, preselect it; otherwise fall back to
    // custom-exercise mode).
    findByName: (state) => (name) => {
      const needle = (name ?? '').trim().toLowerCase()
      if (needle === '') return null
      return state.catalog.find((exercise) => exercise.name.trim().toLowerCase() === needle) ?? null
    },
  },

  actions: {
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    async fetchAll() {
      this.error = null
      const { data, error } = await supabase
        .from('exercise_reference_catalog')
        .select('id, category, name')
        .order('category', { ascending: true })
        .order('name', { ascending: true })
      if (error) {
        this.error = error.message
        // Let a failed fetch be retried (e.g. after the coach reopens the
        // form) instead of permanently caching a rejected promise.
        this.loadPromise = null
        throw error
      }
      this.catalog = data
      this.loaded = true
    },
  },
})
