<script setup>
import { computed, onMounted, ref } from 'vue'
import { useOwnerCoachesStore } from '../store/ownerCoaches'
import {
  validateInviteEmail,
  validateStatusChangeReason,
  accessStatusLabelHe,
  paymentStatusLabelHe,
  filterCoachesByEmail,
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

onMounted(() => {
  store.fetchCoaches()
})

const filteredCoaches = computed(() => filterCoachesByEmail(store.coaches, searchTerm.value))

const STATUS_LABEL = accessStatusLabelHe
const PAYMENT_LABEL = paymentStatusLabelHe
const STATUS_BADGE_CLASS = {
  pending: 'bg-status-yellow/15 text-status-yellow',
  active: 'bg-brand-green/15 text-brand-green',
  suspended: 'bg-status-red/15 text-status-red',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('he-IL')
}

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
    <p v-if="inviteError" class="text-sm text-status-red">{{ inviteError }}</p>
    <p v-if="inviteSuccess" class="text-sm text-brand-green">{{ inviteSuccess }}</p>

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
  </section>
</template>
