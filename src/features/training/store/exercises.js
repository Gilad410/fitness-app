import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

export const useWorkoutExercisesStore = defineStore('workoutExercises', {
  state: () => ({
    exercisesByWorkout: {},
    loadPromises: {},
    error: {},
  }),

  getters: {
    // Sorted by display_order, matching the fetch order below.
    exercisesFor: (state) => (workoutId) => state.exercisesByWorkout[workoutId] ?? [],
  },

  actions: {
    // Loads a workout's exercises once and caches the in-flight/resolved
    // promise, so views can call this on every mount without refetching.
    ensureLoaded(workoutId) {
      if (this.loadPromises[workoutId]) return this.loadPromises[workoutId]
      this.loadPromises[workoutId] = this.fetchForWorkout(workoutId)
      return this.loadPromises[workoutId]
    },

    async fetchForWorkout(workoutId) {
      this.error[workoutId] = null
      const { data, error } = await supabase
        .from('trainee_workout_exercises')
        .select('*')
        .eq('workout_id', workoutId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) {
        this.error[workoutId] = error.message
        throw error
      }
      this.exercisesByWorkout[workoutId] = data
    },

    async create(workoutId, payload) {
      const authStore = useAuthStore()
      const exercises = this.exercisesByWorkout[workoutId] ?? []
      const nextOrder =
        exercises.length === 0 ? 0 : Math.max(...exercises.map((e) => e.display_order)) + 1

      const { data, error } = await supabase
        .from('trainee_workout_exercises')
        .insert({
          ...payload,
          workout_id: workoutId,
          coach_id: authStore.user.id,
          display_order: nextOrder,
        })
        .select()
        .single()
      if (error) throw error

      this.exercisesByWorkout[workoutId] = [...exercises, data]
      return data
    },

    async update(workoutId, exerciseId, patch) {
      const { data, error } = await supabase
        .from('trainee_workout_exercises')
        .update(patch)
        .eq('id', exerciseId)
        .select()
        .single()
      if (error) throw error

      const exercises = this.exercisesByWorkout[workoutId] ?? []
      const index = exercises.findIndex((e) => e.id === exerciseId)
      if (index !== -1) exercises[index] = data
      return data
    },

    async remove(workoutId, exerciseId) {
      const { error } = await supabase.from('trainee_workout_exercises').delete().eq('id', exerciseId)
      if (error) throw error

      const exercises = this.exercisesByWorkout[workoutId] ?? []
      this.exercisesByWorkout[workoutId] = exercises.filter((e) => e.id !== exerciseId)
    },

    // Same optimistic-swap-with-rollback approach as
    // trainingWorkouts.move -- see that store for the full reasoning.
    async move(workoutId, exerciseId, direction) {
      const exercises = this.exercisesByWorkout[workoutId] ?? []
      const index = exercises.findIndex((e) => e.id === exerciseId)
      const targetIndex = index + direction
      if (index === -1 || targetIndex < 0 || targetIndex >= exercises.length) return

      const current = exercises[index]
      const target = exercises[targetIndex]
      const previousOrder = exercises

      const reordered = [...exercises]
      reordered[index] = target
      reordered[targetIndex] = current
      this.exercisesByWorkout[workoutId] = reordered

      try {
        const [{ error: err1 }, { error: err2 }] = await Promise.all([
          supabase
            .from('trainee_workout_exercises')
            .update({ display_order: target.display_order })
            .eq('id', current.id),
          supabase
            .from('trainee_workout_exercises')
            .update({ display_order: current.display_order })
            .eq('id', target.id),
        ])
        if (err1 || err2) throw err1 || err2
      } catch (err) {
        this.exercisesByWorkout[workoutId] = previousOrder
        throw err
      }
    },
  },
})
