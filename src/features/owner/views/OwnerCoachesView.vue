<script setup>
import { computed, onMounted, ref } from 'vue'
import { useOwnerCoachesStore } from '../store/ownerCoaches'
import {
  validateInviteEmail,
  validateStatusChangeReason,
  validatePaymentEdit,
  validateOwnerNote,
  paymentEditIsDirty,
  noteEditIsDirty,
  emptyToNull,
  accessStatusLabelHe,
  paymentStatusLabelHe,
  invitationStateLabelHe,
  filterCoachesByEmail,
  formatDateHe,
  PAYMENT_STATUSES,
  NOTE_MAX_LENGTH,
} from '../lib/ownerCoachActions'

// Owner dashboard: coach roster + status/payment administration
// (056_owner_coach_administration.sql). Deliberately shows NOTHING about
// any coach's trainees beyond a bare count -- no trainee name, health
// data, body measurement, or progress-photo content is fetched by this
// view or by owner_list_coaches() itself (see that function's own
// comment). RTL Hebrew throughout, matching the rest of the app.
const store = useOwnerCoachesStore()

const searchTerm = ref('')
const inviteEmail = ref('')
const inviteSubmitting = ref(false)
const inviteError = ref('')
const inviteSuccess = ref('')

// Confirmation + reason state for a pending status change -- one at a
// time, keyed by the coach being acted on, so a second click on a
// different row doesn't confuse which confirmation belongs to which coach.
const confirmingFor = ref(null) // { userId, email, newStatus } | null
const reasonText = ref('')
const actionError = ref('')

// Payment + private-note editing, one coach at a time. Held as a local
// draft so nothing in the displayed roster changes until the server has
// accepted the write -- the store applies the row update only after the
// RPC returns without error, and this dialog only then re-reads it.
const editingFor = ref(null) // { userId, email } | null
const paymentForm = ref({ paymentStatus: 'unpaid', paymentReviewedAt: '', paidThrough: '' })
const paymentError = ref('')
const paymentSuccess = ref('')
const noteDraft = ref('')
const noteError = ref('')
const noteSuccess = ref('')

// Pending-invitation actions, keyed by invitation id so two rows never
// share a confirmation or a message.
const invitationConfirm = ref(null) // { id, email, action: 'cancel' | 'resend' } | null
const invitationError = ref('')
const invitationSuccess = ref('')

onMounted(() => {
  store.fetchCoaches()
  // Failure is surfaced through store.invitationsError in the template;
  // a rejected promise here would otherwise be unhandled.
  store.fetchPendingInvitations().catch(() => {})
})

const filteredCoaches = computed(() => filterCoachesByEmail(store.coaches, searchTerm.value))

const STATUS_LABEL = accessStatusLabelHe
const PAYMENT_LABEL = paymentStatusLabelHe
const INVITATION_STATE_LABEL = invitationStateLabelHe
const PAYMENT_OPTIONS = PAYMENT_STATUSES
const NOTE_LIMIT = NOTE_MAX_LENGTH
const STATUS_BADGE_CLASS = {
  pending: 'bg-status-yellow/15 text-status-yellow',
  active: 'bg-brand-green/15 text-brand-green',
  suspended: 'bg-status-red/15 text-status-red',
}
const INVITATION_BADGE_CLASS = {
  pending: 'bg-status-yellow/15 text-status-yellow',
  expired: 'bg-status-red/15 text-status-red',
}

const formatDate = formatDateHe

// The coach row currently being edited, read back from the store so the
// dialog reflects the saved server state (not the draft) after a save.
const editingCoach = computed(() =>
  editingFor.value ? store.coaches.find((c) => c.user_id === editingFor.value.userId) : null,
)
const editBusy = computed(() =>
  editingFor.value ? !!store.pendingActionFor[editingFor.value.userId] : false,
)
const paymentDirty = computed(() =>
  editingCoach.value ? paymentEditIsDirty(paymentForm.value, editingCoach.value) : false,
)
const noteDirty = computed(() =>
  editingCoach.value ? noteEditIsDirty(noteDraft.value, editingCoach.value) : false,
)

async function handleInvite() {
  inviteError.value = ''
  inviteSuccess.value = ''
  const email = inviteEmail.value.trim()
  const validationError = validateInviteEmail(email)
  if (validationError) {
    inviteError.value = validationError
    return
  }
  inviteSubmitting.value = true
  try {
    // The store re-reads the pending-invitation list as part of this, so
    // the new invitation is visible in the section below immediately.
    await store.inviteCoach(email)
    inviteSuccess.value = `ההזמנה נשלחה אל ${email}.`
    inviteEmail.value = ''
    await store.fetchCoaches().catch(() => {})
  } catch (err) {
    inviteError.value = err.message || 'שליחת ההזמנה נכשלה.'
  } finally {
    inviteSubmitting.value = false
  }
}

// ---------------------------------------------------------------------
// Payment + note editing
// ---------------------------------------------------------------------

function openEditor(coach) {
  editingFor.value = { userId: coach.user_id, email: coach.email }
  paymentForm.value = {
    paymentStatus: coach.payment_status ?? 'unpaid',
    paymentReviewedAt: coach.payment_reviewed_at ?? '',
    paidThrough: coach.paid_through ?? '',
  }
  noteDraft.value = coach.owner_note ?? ''
  paymentError.value = ''
  paymentSuccess.value = ''
  noteError.value = ''
  noteSuccess.value = ''
}

function closeEditor() {
  editingFor.value = null
  paymentError.value = ''
  paymentSuccess.value = ''
  noteError.value = ''
  noteSuccess.value = ''
}

async function savePayment() {
  paymentError.value = ''
  paymentSuccess.value = ''
  if (!editingFor.value) return
  const validationError = validatePaymentEdit(paymentForm.value)
  if (validationError) {
    paymentError.value = validationError
    return
  }
  try {
    // setPaymentStatus returns false when the duplicate-submission guard
    // swallowed the call -- reporting success then would be a lie.
    const applied = await store.setPaymentStatus(
      editingFor.value.userId,
      paymentForm.value.paymentStatus,
      emptyToNull(paymentForm.value.paymentReviewedAt),
      emptyToNull(paymentForm.value.paidThrough),
    )
    if (applied) paymentSuccess.value = 'פרטי התשלום נשמרו.'
  } catch (err) {
    paymentError.value = err.message || 'שמירת פרטי התשלום נכשלה.'
  }
}

async function saveNote() {
  noteError.value = ''
  noteSuccess.value = ''
  if (!editingFor.value) return
  const validationError = validateOwnerNote(noteDraft.value)
  if (validationError) {
    noteError.value = validationError
    return
  }
  try {
    const applied = await store.setNote(editingFor.value.userId, noteDraft.value)
    if (applied) noteSuccess.value = 'ההערה נשמרה.'
  } catch (err) {
    noteError.value = err.message || 'שמירת ההערה נכשלה.'
  }
}

// ---------------------------------------------------------------------
// Pending invitations
// ---------------------------------------------------------------------

function requestInvitationAction(invitation, action) {
  invitationError.value = ''
  invitationSuccess.value = ''
  invitationConfirm.value = { id: invitation.invitation_id, email: invitation.email, action }
}

function cancelInvitationConfirmation() {
  invitationConfirm.value = null
  invitationError.value = ''
}

async function confirmInvitationAction() {
  if (!invitationConfirm.value) return
  const { id, email, action } = invitationConfirm.value
  invitationError.value = ''
  try {
    const applied =
      action === 'cancel' ? await store.cancelInvite(id) : await store.resendInvite(id, email)
    if (applied) {
      invitationSuccess.value =
        action === 'cancel' ? `ההזמנה אל ${email} בוטלה.` : `ההזמנה נשלחה שוב אל ${email}.`
      invitationConfirm.value = null
    }
  } catch (err) {
    invitationError.value =
      err.message || (action === 'cancel' ? 'ביטול ההזמנה נכשל.' : 'שליחת ההזמנה מחדש נכשלה.')
  }
}

function requestStatusChange(coach, newStatus) {
  actionError.value = ''
  reasonText.value = ''
  confirmingFor.value = { userId: coach.user_id, email: coach.email, newStatus }
}

function cancelConfirmation() {
  confirmingFor.value = null
  reasonText.value = ''
  actionError.value = ''
}

async function confirmStatusChange() {
  if (!confirmingFor.value) return
  const { userId, newStatus } = confirmingFor.value
  const validationError = validateStatusChangeReason(newStatus, reasonText.value)
  if (validationError) {
    actionError.value = validationError
    return
  }
  try {
    await store.setStatus(userId, newStatus, reasonText.value.trim() || 'אושר על ידי בעל/ת המערכת')
    confirmingFor.value = null
    reasonText.value = ''
  } catch (err) {
    actionError.value = err.message || 'עדכון הסטטוס נכשל.'
  }
}
</script>

<template>
  <section class="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6" dir="rtl">
    <h1 class="text-2xl font-bold text-brand-black">ניהול מאמנים</h1>

    <!-- Counts -->
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-xl border border-neutral-200 p-4 text-center">
        <p class="text-2xl font-bold text-status-yellow">{{ store.countByStatus.pending }}</p>
        <p class="text-sm text-neutral-600">ממתינים לאישור</p>
      </div>
      <div class="rounded-xl border border-neutral-200 p-4 text-center">
        <p class="text-2xl font-bold text-brand-green">{{ store.countByStatus.active }}</p>
        <p class="text-sm text-neutral-600">פעילים</p>
      </div>
      <div class="rounded-xl border border-neutral-200 p-4 text-center">
        <p class="text-2xl font-bold text-status-red">{{ store.countByStatus.suspended }}</p>
        <p class="text-sm text-neutral-600">מושהים</p>
      </div>
    </div>

    <!-- Invite a coach -->
    <form class="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-end" @submit.prevent="handleInvite">
      <label class="flex flex-1 flex-col gap-1">
        <span class="text-sm text-neutral-600">הזמנת מאמן/ת חדש/ה (אימייל)</span>
        <input
          v-model="inviteEmail"
          type="email"
          required
          class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
        />
      </label>
      <button
        type="submit"
        :disabled="inviteSubmitting"
        class="rounded-lg bg-brand-green px-4 py-2 font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
      >
        {{ inviteSubmitting ? 'שולח...' : 'שליחת הזמנה' }}
      </button>
    </form>
    <p v-if="inviteError" class="text-sm text-status-red" role="alert">{{ inviteError }}</p>
    <p v-if="inviteSuccess" class="text-sm text-brand-green" role="status">{{ inviteSuccess }}</p>

    <!--
      Pending invitations. Kept as its own section rather than mixed into
      the roster: an invitation is not an account. It has no access
      status and nothing to administer -- only cancel, or resend the same
      link. No invitation token appears here or anywhere else in the UI;
      owner_list_pending_invitations() does not return one.
    -->
    <section class="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4" aria-labelledby="pending-invites-heading">
      <h2 id="pending-invites-heading" class="text-lg font-bold text-brand-black">
        הזמנות ממתינות
        <span v-if="store.pendingInvitations.length" class="text-sm font-normal text-neutral-600">
          ({{ store.pendingInvitations.length }})
        </span>
      </h2>

      <p v-if="store.invitationsLoading" class="text-sm text-neutral-600">טוען הזמנות...</p>
      <p v-else-if="store.invitationsError" class="text-sm text-status-red" role="alert">
        {{ store.invitationsError }}
      </p>
      <p v-else-if="store.pendingInvitations.length === 0" class="text-sm text-neutral-600">
        אין הזמנות ממתינות.
      </p>

      <template v-else>
        <div class="hidden overflow-x-auto sm:block">
          <table class="w-full text-start text-sm">
            <caption class="sr-only">הזמנות שנשלחו וטרם נענו</caption>
            <thead>
              <tr class="border-b border-neutral-200 text-neutral-600">
                <th scope="col" class="p-2 text-start">אימייל</th>
                <th scope="col" class="p-2 text-start">נשלחה בתאריך</th>
                <th scope="col" class="p-2 text-start">בתוקף עד</th>
                <th scope="col" class="p-2 text-start">מצב</th>
                <th scope="col" class="p-2 text-start">פעולות</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="invitation in store.pendingInvitations"
                :key="invitation.invitation_id"
                class="border-b border-neutral-100"
              >
                <td class="p-2 font-medium text-brand-black">{{ invitation.email }}</td>
                <td class="p-2 text-neutral-600">{{ formatDate(invitation.invite_sent_at) }}</td>
                <td class="p-2 text-neutral-600">{{ formatDate(invitation.invite_expires_at) }}</td>
                <td class="p-2">
                  <span
                    class="rounded-full px-2 py-1 text-xs font-medium"
                    :class="INVITATION_BADGE_CLASS[invitation.state]"
                  >
                    {{ INVITATION_STATE_LABEL(invitation.state) }}
                  </span>
                </td>
                <td class="p-2">
                  <div class="flex flex-wrap gap-1">
                    <button
                      type="button"
                      :disabled="!!store.pendingInviteActionFor[invitation.invitation_id]"
                      class="rounded-lg border border-brand-green px-2 py-1 text-xs font-medium text-brand-green hover:bg-brand-green/10 disabled:opacity-60"
                      @click="requestInvitationAction(invitation, 'resend')"
                    >
                      {{ store.pendingInviteActionFor[invitation.invitation_id] ? 'פועל...' : 'שליחה מחדש' }}
                    </button>
                    <button
                      type="button"
                      :disabled="!!store.pendingInviteActionFor[invitation.invitation_id]"
                      class="rounded-lg border border-status-red px-2 py-1 text-xs font-medium text-status-red hover:bg-status-red/10 disabled:opacity-60"
                      @click="requestInvitationAction(invitation, 'cancel')"
                    >
                      ביטול הזמנה
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul class="flex flex-col gap-3 sm:hidden">
          <li
            v-for="invitation in store.pendingInvitations"
            :key="invitation.invitation_id"
            class="rounded-xl border border-neutral-200 p-3"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="break-all font-medium text-brand-black">{{ invitation.email }}</span>
              <span
                class="shrink-0 rounded-full px-2 py-1 text-xs font-medium"
                :class="INVITATION_BADGE_CLASS[invitation.state]"
              >
                {{ INVITATION_STATE_LABEL(invitation.state) }}
              </span>
            </div>
            <dl class="grid grid-cols-2 gap-1 text-xs text-neutral-600">
              <dt>נשלחה</dt>
              <dd>{{ formatDate(invitation.invite_sent_at) }}</dd>
              <dt>בתוקף עד</dt>
              <dd>{{ formatDate(invitation.invite_expires_at) }}</dd>
            </dl>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                :disabled="!!store.pendingInviteActionFor[invitation.invitation_id]"
                class="rounded-lg border border-brand-green px-3 py-1.5 text-xs font-medium text-brand-green disabled:opacity-60"
                @click="requestInvitationAction(invitation, 'resend')"
              >
                {{ store.pendingInviteActionFor[invitation.invitation_id] ? 'פועל...' : 'שליחה מחדש' }}
              </button>
              <button
                type="button"
                :disabled="!!store.pendingInviteActionFor[invitation.invitation_id]"
                class="rounded-lg border border-status-red px-3 py-1.5 text-xs font-medium text-status-red disabled:opacity-60"
                @click="requestInvitationAction(invitation, 'cancel')"
              >
                ביטול הזמנה
              </button>
            </div>
          </li>
        </ul>
      </template>

      <p v-if="invitationSuccess" class="text-sm text-brand-green" role="status">{{ invitationSuccess }}</p>
    </section>

    <!-- Search -->
    <input
      v-model="searchTerm"
      type="search"
      placeholder="חיפוש לפי אימייל..."
      class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
    />

    <!-- States: loading / error / empty / table -->
    <p v-if="store.loading" class="text-sm text-neutral-600">טוען...</p>
    <p v-else-if="store.error" class="text-sm text-status-red">{{ store.error }}</p>
    <p v-else-if="filteredCoaches.length === 0" class="text-sm text-neutral-600">
      {{ store.coaches.length === 0 ? 'אין עדיין מאמנים במערכת.' : 'לא נמצאו מאמנים התואמים לחיפוש.' }}
    </p>

    <template v-else>
      <!-- Desktop table -->
      <div class="hidden overflow-x-auto sm:block">
        <table class="w-full text-start text-sm">
          <thead>
            <tr class="border-b border-neutral-200 text-neutral-600">
              <th class="p-2 text-start">אימייל</th>
              <th class="p-2 text-start">תאריך הצטרפות</th>
              <th class="p-2 text-start">מתאמנים</th>
              <th class="p-2 text-start">סטטוס גישה</th>
              <th class="p-2 text-start">תשלום</th>
              <th class="p-2 text-start">בדיקת תשלום</th>
              <th class="p-2 text-start">בתוקף עד</th>
              <th class="p-2 text-start">פעולות</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="coach in filteredCoaches" :key="coach.user_id" class="border-b border-neutral-100">
              <td class="p-2 font-medium text-brand-black">{{ coach.email }}</td>
              <td class="p-2 text-neutral-600">{{ formatDate(coach.created_at) }}</td>
              <td class="p-2 text-neutral-600">{{ coach.trainee_count }}</td>
              <td class="p-2">
                <span class="rounded-full px-2 py-1 text-xs font-medium" :class="STATUS_BADGE_CLASS[coach.access_status]">
                  {{ STATUS_LABEL(coach.access_status) }}
                </span>
              </td>
              <td class="p-2 text-neutral-600">{{ PAYMENT_LABEL(coach.payment_status) }}</td>
              <td class="p-2 text-neutral-600">{{ formatDate(coach.payment_reviewed_at) }}</td>
              <td class="p-2 text-neutral-600">{{ formatDate(coach.paid_through) }}</td>
              <td class="p-2">
                <div class="flex flex-wrap gap-1">
                  <button
                    v-if="coach.access_status === 'pending'"
                    type="button"
                    :disabled="!!store.pendingActionFor[coach.user_id]"
                    class="rounded-lg border border-brand-green px-2 py-1 text-xs font-medium text-brand-green hover:bg-brand-green/10 disabled:opacity-60"
                    @click="requestStatusChange(coach, 'active')"
                  >
                    אישור
                  </button>
                  <button
                    v-if="coach.access_status !== 'suspended'"
                    type="button"
                    :disabled="!!store.pendingActionFor[coach.user_id]"
                    class="rounded-lg border border-status-red px-2 py-1 text-xs font-medium text-status-red hover:bg-status-red/10 disabled:opacity-60"
                    @click="requestStatusChange(coach, 'suspended')"
                  >
                    השהיה
                  </button>
                  <button
                    v-if="coach.access_status === 'suspended'"
                    type="button"
                    :disabled="!!store.pendingActionFor[coach.user_id]"
                    class="rounded-lg border border-brand-green px-2 py-1 text-xs font-medium text-brand-green hover:bg-brand-green/10 disabled:opacity-60"
                    @click="requestStatusChange(coach, 'active')"
                  >
                    הפעלה מחדש
                  </button>
                  <button
                    type="button"
                    :disabled="!!store.pendingActionFor[coach.user_id]"
                    class="rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                    :aria-label="`עריכת תשלום והערה עבור ${coach.email}`"
                    @click="openEditor(coach)"
                  >
                    תשלום והערה
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="flex flex-col gap-3 sm:hidden">
        <div v-for="coach in filteredCoaches" :key="coach.user_id" class="rounded-xl border border-neutral-200 p-4">
          <div class="mb-2 flex items-center justify-between">
            <span class="font-medium text-brand-black">{{ coach.email }}</span>
            <span class="rounded-full px-2 py-1 text-xs font-medium" :class="STATUS_BADGE_CLASS[coach.access_status]">
              {{ STATUS_LABEL(coach.access_status) }}
            </span>
          </div>
          <dl class="grid grid-cols-2 gap-1 text-xs text-neutral-600">
            <dt>הצטרפות</dt>
            <dd>{{ formatDate(coach.created_at) }}</dd>
            <dt>מתאמנים</dt>
            <dd>{{ coach.trainee_count }}</dd>
            <dt>תשלום</dt>
            <dd>{{ PAYMENT_LABEL(coach.payment_status) }}</dd>
            <dt>בתוקף עד</dt>
            <dd>{{ formatDate(coach.paid_through) }}</dd>
          </dl>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              v-if="coach.access_status === 'pending'"
              type="button"
              :disabled="!!store.pendingActionFor[coach.user_id]"
              class="rounded-lg border border-brand-green px-3 py-1.5 text-xs font-medium text-brand-green disabled:opacity-60"
              @click="requestStatusChange(coach, 'active')"
            >
              אישור
            </button>
            <button
              v-if="coach.access_status !== 'suspended'"
              type="button"
              :disabled="!!store.pendingActionFor[coach.user_id]"
              class="rounded-lg border border-status-red px-3 py-1.5 text-xs font-medium text-status-red disabled:opacity-60"
              @click="requestStatusChange(coach, 'suspended')"
            >
              השהיה
            </button>
            <button
              v-if="coach.access_status === 'suspended'"
              type="button"
              :disabled="!!store.pendingActionFor[coach.user_id]"
              class="rounded-lg border border-brand-green px-3 py-1.5 text-xs font-medium text-brand-green disabled:opacity-60"
              @click="requestStatusChange(coach, 'active')"
            >
              הפעלה מחדש
            </button>
            <button
              type="button"
              :disabled="!!store.pendingActionFor[coach.user_id]"
              class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black disabled:opacity-60"
              :aria-label="`עריכת תשלום והערה עבור ${coach.email}`"
              @click="openEditor(coach)"
            >
              תשלום והערה
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Confirmation dialog -->
    <div
      v-if="confirmingFor"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-sm rounded-xl bg-brand-white p-5">
        <h2 class="mb-2 text-lg font-bold text-brand-black">
          {{ confirmingFor.newStatus === 'suspended' ? 'השהיית גישה' : 'אישור/הפעלת גישה' }}
        </h2>
        <p class="mb-3 text-sm text-neutral-600">
          {{ confirmingFor.email }} —
          {{ confirmingFor.newStatus === 'suspended' ? 'הגישה תושהה מיידית.' : 'הגישה תופעל.' }}
        </p>
        <label class="mb-3 flex flex-col gap-1">
          <span class="text-sm text-neutral-600">
            סיבה{{ confirmingFor.newStatus === 'suspended' ? ' (חובה)' : ' (אופציונלי)' }}
          </span>
          <textarea
            v-model="reasonText"
            rows="2"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          ></textarea>
        </label>
        <p v-if="actionError" class="mb-2 text-sm text-status-red">{{ actionError }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
            @click="cancelConfirmation"
          >
            ביטול
          </button>
          <button
            type="button"
            :disabled="!!store.pendingActionFor[confirmingFor.userId]"
            class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
            @click="confirmStatusChange"
          >
            {{ store.pendingActionFor[confirmingFor.userId] ? 'מעדכן...' : 'אישור' }}
          </button>
        </div>
      </div>
    </div>

    <!--
      Payment + private-note editor. Two independent forms in one dialog,
      each with its own save button, its own validation and its own
      result message, because they are two separate RPCs and two separate
      concerns. NEITHER can change access status: the RPCs behind them do
      not name that column, and there is no access-status control here.
    -->
    <div
      v-if="editingFor"
      class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-editor-heading"
    >
      <div class="my-8 w-full max-w-md rounded-xl bg-brand-white p-5">
        <h2 id="coach-editor-heading" class="mb-1 text-lg font-bold text-brand-black">
          תשלום והערה פרטית
        </h2>
        <p class="mb-4 break-all text-sm text-neutral-600">{{ editingFor.email }}</p>

        <!-- Payment -->
        <form class="mb-5 flex flex-col gap-3 border-b border-neutral-200 pb-5" @submit.prevent="savePayment">
          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">סטטוס תשלום</span>
            <select
              v-model="paymentForm.paymentStatus"
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            >
              <option v-for="option in PAYMENT_OPTIONS" :key="option" :value="option">
                {{ PAYMENT_LABEL(option) }}
              </option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">תאריך בדיקת התשלום</span>
            <input
              v-model="paymentForm.paymentReviewedAt"
              type="date"
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">בתוקף עד</span>
            <input
              v-model="paymentForm.paidThrough"
              type="date"
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            />
          </label>
          <p v-if="paymentError" class="text-sm text-status-red" role="alert">{{ paymentError }}</p>
          <p v-else-if="paymentSuccess" class="text-sm text-brand-green" role="status">{{ paymentSuccess }}</p>
          <div class="flex justify-end">
            <button
              type="submit"
              :disabled="editBusy || !paymentDirty"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
            >
              {{ editBusy ? 'שומר...' : 'שמירת פרטי תשלום' }}
            </button>
          </div>
        </form>

        <!-- Private owner note -->
        <form class="flex flex-col gap-3" @submit.prevent="saveNote">
          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">
              הערה פרטית (נראית לבעל/ת המערכת בלבד)
            </span>
            <textarea
              v-model="noteDraft"
              rows="4"
              :maxlength="NOTE_LIMIT"
              aria-describedby="note-counter"
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            ></textarea>
          </label>
          <p id="note-counter" class="text-xs text-neutral-500">
            {{ noteDraft.length }} / {{ NOTE_LIMIT }} תווים
          </p>
          <p v-if="noteError" class="text-sm text-status-red" role="alert">{{ noteError }}</p>
          <p v-else-if="noteSuccess" class="text-sm text-brand-green" role="status">{{ noteSuccess }}</p>
          <div class="flex justify-end">
            <button
              type="submit"
              :disabled="editBusy || !noteDirty"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
            >
              {{ editBusy ? 'שומר...' : 'שמירת ההערה' }}
            </button>
          </div>
        </form>

        <div class="mt-5 flex justify-end">
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
            @click="closeEditor"
          >
            סגירה
          </button>
        </div>
      </div>
    </div>

    <!-- Invitation cancel / resend confirmation -->
    <div
      v-if="invitationConfirm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invitation-confirm-heading"
    >
      <div class="w-full max-w-sm rounded-xl bg-brand-white p-5">
        <h2 id="invitation-confirm-heading" class="mb-2 text-lg font-bold text-brand-black">
          {{ invitationConfirm.action === 'cancel' ? 'ביטול הזמנה' : 'שליחת ההזמנה מחדש' }}
        </h2>
        <p class="mb-4 break-all text-sm text-neutral-600">
          {{ invitationConfirm.email }} —
          {{
            invitationConfirm.action === 'cancel'
              ? 'הקישור שנשלח יפסיק לעבוד ולא יהיה ניתן להשלים באמצעותו הרשמה.'
              : 'יישלח אימייל נוסף עם אותו קישור הזמנה. קישור שכבר נשלח ימשיך לעבוד.'
          }}
        </p>
        <p v-if="invitationError" class="mb-2 text-sm text-status-red" role="alert">{{ invitationError }}</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
            @click="cancelInvitationConfirmation"
          >
            חזרה
          </button>
          <button
            type="button"
            :disabled="!!store.pendingInviteActionFor[invitationConfirm.id]"
            class="rounded-lg px-4 py-2 text-sm font-medium text-brand-white disabled:opacity-60"
            :class="
              invitationConfirm.action === 'cancel'
                ? 'bg-status-red hover:opacity-90'
                : 'bg-brand-green hover:bg-brand-green-dark'
            "
            @click="confirmInvitationAction"
          >
            {{
              store.pendingInviteActionFor[invitationConfirm.id]
                ? 'מבצע...'
                : invitationConfirm.action === 'cancel'
                  ? 'ביטול ההזמנה'
                  : 'שליחה מחדש'
            }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
