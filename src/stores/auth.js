import { defineStore } from 'pinia'
import { supabase } from '../lib/supabaseClient'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    initialized: false,
    initPromise: null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
  },

  actions: {
    // Restores the session on app load and subscribes to future auth changes
    // (sign-in, sign-out, token refresh). Safe to call more than once —
    // subsequent calls reuse the same in-flight/resolved promise.
    init() {
      if (this.initPromise) return this.initPromise

      this.initPromise = supabase.auth.getSession().then(({ data }) => {
        this.user = data.session?.user ?? null
        this.initialized = true
      })

      supabase.auth.onAuthStateChange((_event, session) => {
        this.user = session?.user ?? null
      })

      return this.initPromise
    },

    async signUp(email, password) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      this.user = data.user
      return data
    },

    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      this.user = data.user
      return data
    },

    async signOut() {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      this.user = null
    },
  },
})
