import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { countByAccessStatus } from '../lib/ownerCoachActions'

// Owner-facing coach roster + administration actions
// (056_owner_coach_administration.sql). Every action here calls a
// security-definer RPC that independently re-checks is_owner() in its
// own body -- this store does not, and must not, attempt its own
// authorization check client-side; RLS/the RPCs are the real boundary,
// this store only reflects what the server actually allowed.
export const useOwnerCoachesStore = defineStore('ownerCoaches', {
  state: () => ({
    coaches: [],
    loading: false,
    error: null,
    // Per-coach in-flight action guard, keyed by user_id -- prevents a
    // duplicate submission (double-click / double-tap) from firing the
    // same status-change RPC twice while the first call is still pending.
    pendingActionFor: {},
  }),

  getters: {
    countByStatus: (state) => countByAccessStatus(state.coaches),
  },

  actions: {
    async fetchCoaches() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase.rpc('owner_list_coaches')
        if (error) throw error
        this.coaches = data ?? []
      } catch (err) {
        this.error = err.message ?? 'טעינת רשימת המאמנים נכשלה.'
        throw err
      } finally {
        this.loading = false
      }
    },

    async inviteCoach(email) {
      const { data, error } = await supabase.functions.invoke('invite-coach', {
        body: { email },
      })
      if (error) throw await toFunctionError(error)
      return data
    },

    async cancelInvite(invitationId) {
      const { error } = await supabase.rpc('owner_cancel_coach_invite', {
        p_invitation_id: invitationId,
      })
      if (error) throw error
    },

    async setStatus(coachUserId, newStatus, reason) {
      if (this.pendingActionFor[coachUserId]) return // duplicate-submission guard
      this.pendingActionFor = { ...this.pendingActionFor, [coachUserId]: true }
      try {
        const { error } = await supabase.rpc('owner_set_coach_status', {
          p_coach_user_id: coachUserId,
          p_new_status: newStatus,
          p_reason: reason,
        })
        if (error) throw error
        const coach = this.coaches.find((c) => c.user_id === coachUserId)
        if (coach) coach.access_status = newStatus
      } finally {
        const next = { ...this.pendingActionFor }
        delete next[coachUserId]
        this.pendingActionFor = next
      }
    },

    async setPaymentStatus(coachUserId, newPaymentStatus, reviewedAt, paidThrough) {
      if (this.pendingActionFor[coachUserId]) return
      this.pendingActionFor = { ...this.pendingActionFor, [coachUserId]: true }
      try {
        const { error } = await supabase.rpc('owner_set_coach_payment_status', {
          p_coach_user_id: coachUserId,
          p_new_payment_status: newPaymentStatus,
          p_payment_reviewed_at: reviewedAt,
          p_paid_through: paidThrough,
        })
        if (error) throw error
        const coach = this.coaches.find((c) => c.user_id === coachUserId)
        if (coach) {
          coach.payment_status = newPaymentStatus
          coach.payment_reviewed_at = reviewedAt
          coach.paid_through = paidThrough
        }
      } finally {
        const next = { ...this.pendingActionFor }
        delete next[coachUserId]
        this.pendingActionFor = next
      }
    },
  },
})

// Same reasoning and shape as traineeInvites.js's toFunctionError(): a
// non-2xx Edge Function response arrives as a FunctionsHttpError with the
// real `{ error: { message } }` body unread on `error.context` (a raw
// Response), not on `.message` directly.
async function toFunctionError(invokeError) {
  try {
    const body = await invokeError.context?.json()
    if (body?.error?.message) return new Error(body.error.message)
  } catch {
    // no readable JSON body -- fall through to the generic message below
  }
  return new Error(invokeError.message)
}
