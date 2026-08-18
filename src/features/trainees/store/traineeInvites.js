import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useTraineesStore } from './trainees'

// Coach-side trainee invite management -- wraps the three RPCs
// 021_trainee_auth_and_roles.sql adds specifically so a coach's normal
// trainees UPDATE can never touch auth_user_id/invite_* directly (the
// migration revokes that at the column-privilege level): coach_issue_trainee_invite,
// coach_cancel_trainee_invite, coach_unlink_trainee_account. All three
// re-verify ownership and the coach role server-side regardless of
// anything sent from here.
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
        const { data, error } = await supabase.rpc('coach_issue_trainee_invite', {
          p_trainee_id: traineeId,
        })
        if (error) throw error
        // coach_issue_trainee_invite is `returns table(...)` -- PostgREST
        // returns set-returning functions as an array of rows.
        const row = Array.isArray(data) ? data[0] : data
        this.lastIssuedTraineeId = traineeId
        this.lastIssuedToken = row?.invite_token ?? null
        this.lastIssuedExpiresAt = row?.invite_expires_at ?? null
        await this._refreshTrainee(traineeId)
        return row
      } catch (err) {
        this.error = translateInviteError(err.message)
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

// The RPCs raise plain-English `raise exception` messages (see
// 021_trainee_auth_and_roles.sql) -- SQL can't be changed to localize
// them, so every known message is mapped to Hebrew here. Anything
// unrecognized falls back to a generic Hebrew message rather than ever
// showing raw English/SQL error text in this Hebrew UI.
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
  }
  return known[message] ?? 'אירעה שגיאה. נסה/י שוב.'
}
