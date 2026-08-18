import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee's own notifications -- public.trainee_notifications, readable
// through trainee_notifications_select_own_trainee (021_trainee_auth_and_roles.sql),
// which already scopes every row to the caller's own linked trainee row
// (trainees.auth_user_id = auth.uid()) and requires the trainee role.
// Marking read goes through trainee_mark_notification_read() only -- there
// is no UPDATE policy granted to the trainee role on this table at all, so
// a raw .update() call here would simply be denied; the RPC is the only
// path, and it can only ever flip is_read/read_at on the caller's own row.
export const useTraineeNotificationsStore = defineStore('traineeNotifications', {
  state: () => ({
    items: [],
    loading: false,
    loaded: false,
    error: null,
    markingReadId: null,
  }),

  getters: {
    unreadCount: (state) => state.items.filter((n) => !n.is_read).length,
  },

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase
          .from('trainee_notifications')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error
        this.items = data
        this.loaded = true
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },

    async markRead(notificationId) {
      this.markingReadId = notificationId
      this.error = null
      try {
        const { error } = await supabase.rpc('trainee_mark_notification_read', {
          p_notification_id: notificationId,
        })
        if (error) throw error
        const item = this.items.find((n) => n.id === notificationId)
        if (item) {
          item.is_read = true
          item.read_at = new Date().toISOString()
        }
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.markingReadId = null
      }
    },
  },
})
