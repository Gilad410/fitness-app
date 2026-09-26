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
    // Shared across status, payment and note writes deliberately: one
    // pending write per coach at a time keeps the locally-applied result
    // unambiguous.
    pendingActionFor: {},

    // Still-open invitations (owner_list_pending_invitations). Kept
    // separate from `coaches` because an invitation is not an account:
    // it has no user_id, no access status, and nothing to administer --
    // only cancel or resend. NEVER contains invite_token; the RPC does
    // not return one and the Edge Function no longer echoes one either.
    pendingInvitations: [],
    invitationsLoading: false,
    invitationsError: null,
    // Same duplicate-submission guard, keyed by invitation id.
    pendingInviteActionFor: {},
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

    async fetchPendingInvitations() {
      this.invitationsLoading = true
      this.invitationsError = null
      try {
        const { data, error } = await supabase.rpc('owner_list_pending_invitations')
        if (error) throw error
        this.pendingInvitations = data ?? []
      } catch (err) {
        this.invitationsError = err.message ?? 'טעינת ההזמנות הממתינות נכשלה.'
        throw err
      } finally {
        this.invitationsLoading = false
      }
    },

    // Sends a new invitation, then re-reads the pending list so the new
    // invitation is visible immediately rather than only after a manual
    // reload. The re-read is the server's answer, not an optimistic local
    // insert: if the send succeeded but the row somehow is not there, the
    // owner sees the truth.
    async inviteCoach(email) {
      const { data, error } = await supabase.functions.invoke('invite-coach', {
        body: { email },
      })
      if (error) throw await toFunctionError(error)
      await this.fetchPendingInvitations()
      return data
    },

    // There is deliberately NO resendInvite action.
    //
    // An earlier revision had one that re-invoked the invite-coach Edge
    // Function with the same address, on the theory that
    // owner_get_or_invite_coach is idempotent and reuses the existing
    // token. That reasoning only holds in a test whose fake never creates
    // an Auth user. In reality the first successful
    // admin.auth.admin.inviteUserByEmail() creates an UNCONFIRMED
    // auth.users row, and the RPC rejects every address that already has
    // one -- so the resend failed on the very first call, every time,
    // for any invitation that had actually been sent.
    //
    // A correct resend needs an officially supported GoTrue mechanism
    // verified against a real instance. That could not be done in this
    // environment (no container runtime, so no local Supabase/GoTrue),
    // and shipping a control that is known to work only against a fake is
    // worse than not shipping one. The dashboard says so in plain Hebrew
    // instead of offering a button that always errors.

    async cancelInvite(invitationId) {
      if (this.pendingInviteActionFor[invitationId]) return false
      this.pendingInviteActionFor = { ...this.pendingInviteActionFor, [invitationId]: true }
      try {
        const { error } = await supabase.rpc('owner_cancel_coach_invite', {
          p_invitation_id: invitationId,
        })
        if (error) throw error
        // Drop it locally only now that the server has confirmed.
        this.pendingInvitations = this.pendingInvitations.filter(
          (i) => i.invitation_id !== invitationId,
        )
        return true
      } finally {
        this.pendingInviteActionFor = omitKey(this.pendingInviteActionFor, invitationId)
      }
    },

    // Each mutating action returns true when the write actually reached
    // the server and was applied locally, and false when the
    // duplicate-submission guard swallowed it. Callers must not report
    // success on false -- an early return is not a successful save.
    async setStatus(coachUserId, newStatus, reason) {
      if (this.pendingActionFor[coachUserId]) return false // duplicate-submission guard
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
        return true
      } finally {
        this.pendingActionFor = omitKey(this.pendingActionFor, coachUserId)
      }
    },

    // Payment fields only. This deliberately cannot change access_status:
    // the RPC it calls never names that column, and this action never
    // touches coach.access_status locally either -- so a payment edit can
    // never appear to have suspended or approved anyone.
    async setPaymentStatus(coachUserId, newPaymentStatus, reviewedAt, paidThrough) {
      if (this.pendingActionFor[coachUserId]) return false
      this.pendingActionFor = { ...this.pendingActionFor, [coachUserId]: true }
      try {
        const { error } = await supabase.rpc('owner_set_coach_payment_status', {
          p_coach_user_id: coachUserId,
          p_new_payment_status: newPaymentStatus,
          p_payment_reviewed_at: reviewedAt,
          p_paid_through: paidThrough,
        })
        if (error) throw error
        // Local row updated only after the server accepted the write.
        const coach = this.coaches.find((c) => c.user_id === coachUserId)
        if (coach) {
          coach.payment_status = newPaymentStatus
          coach.payment_reviewed_at = reviewedAt
          coach.paid_through = paidThrough
        }
        return true
      } finally {
        this.pendingActionFor = omitKey(this.pendingActionFor, coachUserId)
      }
    },

    // The owner's private note. Same guarantee as setPaymentStatus: no
    // access_status involvement on either side of the wire. The server
    // normalizes blank/whitespace to NULL, so the local row mirrors that
    // normalization rather than storing '' and disagreeing with the
    // database about whether a note exists.
    async setNote(coachUserId, note) {
      if (this.pendingActionFor[coachUserId]) return false
      this.pendingActionFor = { ...this.pendingActionFor, [coachUserId]: true }
      try {
        const { error } = await supabase.rpc('owner_set_coach_note', {
          p_coach_user_id: coachUserId,
          p_note: note,
        })
        if (error) throw error
        const coach = this.coaches.find((c) => c.user_id === coachUserId)
        if (coach) coach.owner_note = normalizeNote(note)
        return true
      } finally {
        this.pendingActionFor = omitKey(this.pendingActionFor, coachUserId)
      }
    },
  },
})

// Removes one key without mutating the original object, so Pinia sees a
// new reference and re-renders the disabled state of the affected row.
function omitKey(map, key) {
  const next = { ...map }
  delete next[key]
  return next
}

// Mirrors owner_set_coach_note's server-side normalization
// (nullif(trim(coalesce(...)), '')) so the displayed row matches what the
// database actually stored.
function normalizeNote(note) {
  const trimmed = (note ?? '').trim()
  return trimmed === '' ? null : trimmed
}

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
