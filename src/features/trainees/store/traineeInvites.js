import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useTraineesStore } from './trainees'

// Coach-side trainee invite management -- wraps the RPCs
// 021_trainee_auth_and_roles.sql and 034_safe_trainee_invite_retry.sql add
// specifically so a coach's normal trainees UPDATE can never touch
// auth_user_id/invite_* directly (the migration revokes that at the
// column-privilege level): coach_get_or_issue_trainee_invite,
// coach_cancel_trainee_invite, coach_unlink_trainee_account. All three
// re-verify ownership and the coach role server-side regardless of
// anything sent from here.
//
// issue() goes through the invite-trainee Edge Function (supabase/functions/
// invite-trainee) rather than calling a trainees-invite RPC directly -- the
// RPC call and the actual email delivery (auth.admin.inviteUserByEmail,
// which requires the service-role key and so can only ever run server-side)
// happen together as one request. That RPC is coach_get_or_issue_trainee_invite,
// not the older coach_issue_trainee_invite -- it reuses a still-pending,
// unexpired invite unchanged instead of always rotating the token, which is
// what makes a resend that fails to send safe (nothing to roll back) --
// see 034_safe_trainee_invite_retry.sql and the Edge Function for the full
// writeup. cancel() and unlink() have no email step, so they still call
// their RPCs directly.
//
// The invite token is held ONLY in this store's in-memory state
// (lastIssuedToken), and only right after issue()/reissue -- never
// persisted (no localStorage, no writing it back to any table from the
// client; the server already cleared it from trainees.invite_token the
// moment it was claimed or on cancel/unlink). It is cleared by every
// other action here and is scoped to the specific trainee it was issued
// for (lastIssuedTraineeId) so navigating from one trainee's page to
// another can never leak a previously issued token onto the wrong page.
export const useTraineeInvitesStore = defineStore('traineeInvites', {
  state: () => ({
    issuing: false,
    cancelling: false,
    unlinking: false,
    error: null,
    lastIssuedTraineeId: null,
    lastIssuedToken: null,
    lastIssuedExpiresAt: null,
  }),

  actions: {
    // Re-reads the single trainees row after an invite action so the
    // coach's cached roster (useTraineesStore) reflects the new
    // invite_status/auth_user_id without a full re-fetch of every trainee.
    async _refreshTrainee(traineeId) {
      const { data, error } = await supabase
        .from('trainees')
        .select('*')
        .eq('id', traineeId)
        .single()
      if (error) throw error
      const traineesStore = useTraineesStore()
      const index = traineesStore.trainees.findIndex((t) => t.id === traineeId)
      if (index !== -1) traineesStore.trainees[index] = data
      return data
    },

    clearToken() {
      this.lastIssuedTraineeId = null
      this.lastIssuedToken = null
      this.lastIssuedExpiresAt = null
    },

    async issue(traineeId) {
      this.issuing = true
      this.error = null
      this.clearToken()
      try {
        const { data, error } = await supabase.functions.invoke('invite-trainee', {
          body: { trainee_id: traineeId },
        })
        if (error) throw await toFunctionError(error)
        this.lastIssuedTraineeId = traineeId
        this.lastIssuedToken = data?.invite_token ?? null
        this.lastIssuedExpiresAt = data?.invite_expires_at ?? null
        await this._refreshTrainee(traineeId)
        return data
      } catch (err) {
        this.error = translateInviteError(err.message)
        // A failed send no longer cancels the invite server-side (see
        // handler.js) -- on a first-ever issue attempt, the trainee row
        // may now be 'invited' in the database even though this call
        // threw, so the cached roster is re-synced here too (best-effort;
        // a refresh failure must not hide the real error above) rather
        // than only on success, to avoid the UI showing "טרם הוזמן" for a
        // trainee who actually already has a pending, retryable invite.
        await this._refreshTrainee(traineeId).catch(() => {})
        throw err
      } finally {
        this.issuing = false
      }
    },

    async cancel(traineeId) {
      this.cancelling = true
      this.error = null
      try {
        const { error } = await supabase.rpc('coach_cancel_trainee_invite', {
          p_trainee_id: traineeId,
        })
        if (error) throw error
        if (this.lastIssuedTraineeId === traineeId) this.clearToken()
        await this._refreshTrainee(traineeId)
      } catch (err) {
        this.error = translateInviteError(err.message)
        throw err
      } finally {
        this.cancelling = false
      }
    },

    async unlink(traineeId) {
      this.unlinking = true
      this.error = null
      try {
        const { error } = await supabase.rpc('coach_unlink_trainee_account', {
          p_trainee_id: traineeId,
        })
        if (error) throw error
        if (this.lastIssuedTraineeId === traineeId) this.clearToken()
        await this._refreshTrainee(traineeId)
      } catch (err) {
        this.error = translateInviteError(err.message)
        throw err
      } finally {
        this.unlinking = false
      }
    },
  },
})

// supabase.functions.invoke() surfaces a non-2xx Edge Function response as
// a FunctionsHttpError with the JSON body's text sitting unread on
// `error.context` (the raw Response) -- unlike a PostgREST/RPC error,
// there is no `.message` with our actual error text on it directly. This
// pulls the `{ error: { message } }` body the invite-trainee function
// always returns on failure (see supabase/functions/invite-trainee/index.ts)
// back out into a plain Error, so translateInviteError() below can treat
// an Edge Function failure exactly like an RPC failure -- one map, same
// shape either way. Falls back to the SDK's own generic message if the
// body can't be read (e.g. a network failure that never reached the
// function at all, so there is no JSON body to parse).
async function toFunctionError(invokeError) {
  try {
    const body = await invokeError.context?.json()
    if (body?.error?.message) return new Error(body.error.message)
  } catch {
    // no readable JSON body -- fall through to the generic message below
  }
  return new Error(invokeError.message)
}

// The RPCs raise plain-English `raise exception` messages (see
// 021_trainee_auth_and_roles.sql), and the invite-trainee Edge Function
// (supabase/functions/invite-trainee) raises its own in the same plain-
// English style for the email-sending step -- SQL/Deno can't be changed to
// localize either, so every known message is mapped to Hebrew here.
// Anything unrecognized falls back to a generic Hebrew message rather than
// ever showing raw English/SQL error text in this Hebrew UI.
function translateInviteError(message) {
  const known = {
    'Only a coach may issue a trainee invite.': 'אין הרשאה לבצע פעולה זו.',
    'Only a coach may cancel a trainee invite.': 'אין הרשאה לבצע פעולה זו.',
    'Only a coach may unlink a trainee account.': 'אין הרשאה לבצע פעולה זו.',
    'Trainee not found or not owned by the current coach.': 'המתאמן לא נמצא.',
    'This trainee already has a linked account -- unlink it before issuing a new invite.':
      'למתאמן/ת זה כבר יש חשבון מקושר. יש לנתק אותו לפני שליחת הזמנה חדשה.',
    'Trainee must have a valid email before an invite can be issued.':
      'יש להוסיף כתובת אימייל תקינה למתאמן/ת (בעריכת הפרופיל) לפני שליחת הזמנה.',
    'Trainee email is not a valid email address.': 'כתובת האימייל של המתאמן/ת אינה תקינה.',
    'No pending invite to cancel for this trainee.': 'אין הזמנה ממתינה לביטול.',
    'This trainee has no linked account to unlink.': 'אין חשבון מקושר לניתוק.',
    'A user with this email address has already been registered.':
      'כתובת האימייל הזו כבר משויכת לחשבון קיים במערכת. יש לבדוק את הכתובת או לפנות לתמיכה.',
  }
  if (known[message]) return known[message]
  if (message?.startsWith('Failed to send the invitation email')) {
    // The invite itself was NOT deleted/cancelled by this failure (see
    // handler.js -- a failed send never auto-cancels) -- it stays pending
    // and unexpired, so this deliberately does not say "the invitation
    // was not created" the way an earlier version of this message did.
    // "שלח הזמנה מחדש" simply retries delivery of that same still-valid
    // invitation; it does not need to (and, per the underlying RPC, will
    // not) issue a new one.
    return 'שליחת מייל ההזמנה נכשלה. ההזמנה עצמה עדיין פעילה — אפשר לנסות לשלוח את המייל שוב בעוד מספר דקות.'
  }
  return 'אירעה שגיאה. נסה/י שוב.'
}
