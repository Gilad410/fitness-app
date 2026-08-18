import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee's own active training program -- read exclusively through
// trainee_get_active_training_program() (023_trainee_training_access.sql),
// never a raw select on trainee_training_programs/trainee_program_workouts/
// trainee_workout_exercises. The RPC already returns workouts/exercises
// nested and pre-sorted by display_order, and already hand-picks only the
// fields a trainee is allowed to see (no coach_id/trainee_id, no other
// trainee's data) -- this store just holds whatever it returns, read-only.
export const useTraineeTrainingProgramStore = defineStore('traineeTrainingProgram', {
  state: () => ({
    program: null,
    loading: false,
    loaded: false,
    error: null,
  }),

  actions: {
    async fetchActiveProgram() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase.rpc('trainee_get_active_training_program')
        if (error) throw error
        // null is the documented "no active program" result -- not an error.
        this.program = data ?? null
        this.loaded = true
      } catch {
        // Never surface a raw Supabase/Postgres error to the trainee.
        this.error = 'אירעה שגיאה בטעינת תוכנית האימונים. נסה/י שוב.'
        throw new Error(this.error)
      } finally {
        this.loading = false
      }
    },
  },
})
