import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'

// Manual coach-to-trainee notifications (public.trainee_notifications,
// see 020_trainee_notifications.sql). Coach-side only: composing/sending
// a notification and viewing the sent history. There is no trainee-facing
// read / mark-as-read here -- that migration's header comment explains
// why (trainees have no Supabase Auth identity yet) and RLS enforces it
// (no trainee policy exists on the table at all).
//
// Entirely separate from useAlertsStore: that store computes the
// *automatic* coach alerts (missing weight, no active program) and never
// reads this table, so sending/loading notifications here can never
// change the automatic-alert count shown in the sidebar/dashboard badge.
export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    sent: [],
    loading: false,
    loaded: false,
    error: null,
    sending: false,
    sendError: null,
  }),

  actions: {
    // Always refetches (no ensureLoaded/promise caching) -- the sent list
    // is meant to reflect the latest send immediately, and the view also
    // calls this right after a successful send.
    async fetchSent() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase
          .from('trainee_notifications')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error
        this.sent = data
        this.loaded = true
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },

    async send({ traineeId, title, message }) {
      const authStore = useAuthStore()
      this.sending = true
      this.sendError = null
      try {
        const { data, error } = await supabase
          .from('trainee_notifications')
          .insert({
            trainee_id: traineeId,
            coach_id: authStore.user.id,
            title: title.trim(),
            message: message.trim(),
          })
          .select()
          .single()
        if (error) throw error
        this.sent = [data, ...this.sent]
        this.loaded = true
        return data
      } catch (err) {
        this.sendError = err.message
        throw err
      } finally {
        this.sending = false
      }
    },
  },
})
