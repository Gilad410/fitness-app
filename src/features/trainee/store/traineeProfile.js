import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee's own profile -- read exclusively through trainee_get_own_profile()
// (021_trainee_auth_and_roles.sql), never a raw select on public.trainees.
// That table grants the trainee role no row access at all: the RPC is a
// hand-picked column allowlist (no coach-private `notes`, no invite/token
// columns), by design, so nothing this store does can widen what a
// trainee can see.
export const useTraineeProfileStore = defineStore('traineeProfile', {
  state: () => ({
    profile: null,
    loading: false,
    loaded: false,
    error: null,
  }),

  actions: {
    async fetchProfile() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase.rpc('trainee_get_own_profile')
        if (error) throw error
        // `returns table(...)` -- PostgREST returns an array of rows.
        this.profile = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
        this.loaded = true
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },
  },
})
