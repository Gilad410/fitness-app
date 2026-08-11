import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

export const useTrainingProgramsStore = defineStore('trainingPrograms', {
  state: () => ({
    programsByTrainee: {},
    loadPromises: {},
    error: {},
  }),

  getters: {
    programsFor: (state) => (traineeId) => state.programsByTrainee[traineeId] ?? [],
    programFor: (state) => (traineeId, programId) =>
      (state.programsByTrainee[traineeId] ?? []).find((p) => p.id === programId) ?? null,
  },

  actions: {
    // Loads a trainee's programs once and caches the in-flight/resolved
    // promise, so views can call this on every mount without refetching.
    ensureLoaded(traineeId) {
      if (this.loadPromises[traineeId]) return this.loadPromises[traineeId]
      this.loadPromises[traineeId] = this.fetchForTrainee(traineeId)
      return this.loadPromises[traineeId]
    },

    async fetchForTrainee(traineeId) {
      this.error[traineeId] = null
      const { data, error } = await supabase
        .from('trainee_training_programs')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('created_at', { ascending: false })
      if (error) {
        this.error[traineeId] = error.message
        throw error
      }
      this.programsByTrainee[traineeId] = data
    },

    async create(traineeId, payload) {
      const authStore = useAuthStore()
      const { data, error } = await supabase
        .from('trainee_training_programs')
        .insert({ ...payload, trainee_id: traineeId, coach_id: authStore.user.id })
        .select()
        .single()
      if (error) throw error

      const programs = this.programsByTrainee[traineeId] ?? []
      this.programsByTrainee[traineeId] = [data, ...programs]
      return data
    },

    // Covers both the name/notes edit form and the active/inactive status
    // toggle -- both just update this same row and refresh the cache the
    // same way.
    async update(traineeId, programId, patch) {
      const { data, error } = await supabase
        .from('trainee_training_programs')
        .update(patch)
        .eq('id', programId)
        .select()
        .single()
      if (error) throw error

      const programs = this.programsByTrainee[traineeId] ?? []
      const index = programs.findIndex((p) => p.id === programId)
      if (index !== -1) programs[index] = data
      return data
    },

    // No delete action: a program is deactivated via status = 'inactive'
    // instead, matching migration 018 (no delete policy on
    // trainee_training_programs, by design -- see that file's comments).
  },
})
