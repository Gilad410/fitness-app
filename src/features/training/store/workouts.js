import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

export const useTrainingWorkoutsStore = defineStore('trainingWorkouts', {
  state: () => ({
    workoutsByProgram: {},
    loadPromises: {},
    error: {},
  }),

  getters: {
    // Sorted by display_order, matching the fetch order below.
    workoutsFor: (state) => (programId) => state.workoutsByProgram[programId] ?? [],
  },

  actions: {
    // Loads a program's workouts once and caches the in-flight/resolved
    // promise, so views can call this on every mount without refetching.
    ensureLoaded(programId) {
      if (this.loadPromises[programId]) return this.loadPromises[programId]
      this.loadPromises[programId] = this.fetchForProgram(programId)
      return this.loadPromises[programId]
    },

    async fetchForProgram(programId) {
      this.error[programId] = null
      const { data, error } = await supabase
        .from('trainee_program_workouts')
        .select('*')
        .eq('program_id', programId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) {
        this.error[programId] = error.message
        throw error
      }
      this.workoutsByProgram[programId] = data
    },

    async create(programId, payload) {
      const authStore = useAuthStore()
      const workouts = this.workoutsByProgram[programId] ?? []
      // New workout goes to the end of the current order.
      const nextOrder =
        workouts.length === 0 ? 0 : Math.max(...workouts.map((w) => w.display_order)) + 1

      const { data, error } = await supabase
        .from('trainee_program_workouts')
        .insert({
          ...payload,
          program_id: programId,
          coach_id: authStore.user.id,
          display_order: nextOrder,
        })
        .select()
        .single()
      if (error) throw error

      this.workoutsByProgram[programId] = [...workouts, data]
      return data
    },

    async update(programId, workoutId, patch) {
      const { data, error } = await supabase
        .from('trainee_program_workouts')
        .update(patch)
        .eq('id', workoutId)
        .select()
        .single()
      if (error) throw error

      const workouts = this.workoutsByProgram[programId] ?? []
      const index = workouts.findIndex((w) => w.id === workoutId)
      if (index !== -1) workouts[index] = data
      return data
    },

    async remove(programId, workoutId) {
      const { error } = await supabase.from('trainee_program_workouts').delete().eq('id', workoutId)
      if (error) throw error

      const workouts = this.workoutsByProgram[programId] ?? []
      this.workoutsByProgram[programId] = workouts.filter((w) => w.id !== workoutId)
    },

    // Swaps a workout with its immediate neighbor (direction: -1 up / +1
    // down) by exchanging their display_order values. Optimistic: the
    // local order flips immediately for a responsive UI, then both rows
    // are persisted in parallel; if either write fails, the local order
    // is rolled back and the error is re-thrown, so the UI never shows an
    // order that didn't actually save.
    async move(programId, workoutId, direction) {
      const workouts = this.workoutsByProgram[programId] ?? []
      const index = workouts.findIndex((w) => w.id === workoutId)
      const targetIndex = index + direction
      if (index === -1 || targetIndex < 0 || targetIndex >= workouts.length) return

      const current = workouts[index]
      const target = workouts[targetIndex]
      const previousOrder = workouts

      const reordered = [...workouts]
      reordered[index] = target
      reordered[targetIndex] = current
      this.workoutsByProgram[programId] = reordered

      try {
        const [{ error: err1 }, { error: err2 }] = await Promise.all([
          supabase
            .from('trainee_program_workouts')
            .update({ display_order: target.display_order })
            .eq('id', current.id),
          supabase
            .from('trainee_program_workouts')
            .update({ display_order: current.display_order })
            .eq('id', target.id),
        ])
        if (err1 || err2) throw err1 || err2
      } catch (err) {
        this.workoutsByProgram[programId] = previousOrder
        throw err
      }
    },
  },
})
