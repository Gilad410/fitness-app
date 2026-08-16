<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useTraineesStore } from '../../trainees/store/trainees'
import { useNotificationsStore } from '../store/notifications'

// Manual coach -> trainee notifications: compose/send (public.trainee_notifications,
// 020_trainee_notifications.sql) plus the coach's sent history. Entirely
// separate from the automatic alerts above this section on the page --
// this reads/writes trainee_notifications only, never touches the tables
// useAlertsStore reads, so it can never change the automatic-alert count
// shown in the sidebar/dashboard badge.
const TITLE_MAX = 120
const MESSAGE_MAX = 2000

const traineesStore = useTraineesStore()
const notificationsStore = useNotificationsStore()

onMounted(async () => {
  // ensureLoaded() reuses the app-wide cached trainee roster (no refetch
  // if some other view already loaded it this session).
  traineesStore.ensureLoaded().catch(() => {})
  try {
    await notificationsStore.fetchSent()
  } catch {
    // surfaced via notificationsStore.error in the template below
  }
})

// Selectable trainees: archived trainees are excluded, same "not someone
// you're actively coaching right now" reasoning the automatic alerts use
// (see alerts.js) -- sorted by name for a usable dropdown.
const selectableTrainees = computed(() =>
  [...traineesStore.trainees]
    .filter((t) => t.status !== 'archived')
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
)

const traineeNameById = computed(() => {
  const map = new Map()
  for (const t of traineesStore.trainees) map.set(t.id, t.full_name)
  return map
})

const form = reactive({ traineeId: '', title: '', message: '' })
const confirming = ref(false)
const validationError = ref('')
const successMessage = ref('')

const titleLength = computed(() => form.title.length)
const messageLength = computed(() => form.message.length)
const selectedTraineeName = computed(() => traineeNameById.value.get(form.traineeId) ?? '')

function resetForm() {
  form.traineeId = ''
  form.title = ''
  form.message = ''
  confirming.value = false
}

function validate() {
  const title = form.title.trim()
  const message = form.message.trim()
  if (!form.traineeId) return 'יש לבחור מתאמן.'
  if (title === '') return 'יש להזין כותרת.'
  if (title.length > TITLE_MAX) return `הכותרת ארוכה מדי (מקסימום ${TITLE_MAX} תווים).`
  if (message === '') return 'יש להזין תוכן הודעה.'
  if (message.length > MESSAGE_MAX) return `ההודעה ארוכה מדי (מקסימום ${MESSAGE_MAX} תווים).`
  return ''
}

// Step 1: validate and move to the confirmation step -- no network call
// yet. Sent notifications can't currently be edited or deleted, so the
// coach reviews the exact trainee/title/message before anything is sent.
function handleReview() {
  successMessage.value = ''
  const error = validate()
  if (error) {
    validationError.value = error
    return
  }
  validationError.value = ''
  confirming.value = true
}

// Step 2: the actual send, only reachable from the confirmation step.
// notificationsStore.sending guards this against double submission (the
// buttons are disabled while true).
async function handleConfirmSend() {
  try {
    await notificationsStore.send({
      traineeId: form.traineeId,
      title: form.title,
      message: form.message,
    })
    successMessage.value = 'ההתראה נשלחה בהצלחה.'
    resetForm()
  } catch {
    // Stays on the confirmation step so the coach can retry without
    // re-filling the form; notificationsStore.sendError is shown below.
  }
}

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long', timeStyle: 'short' })
</script>

<template>
  <section
    class="mt-10 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
  >
    <h2 class="font-semibold text-brand-black">שליחת התראה למתאמן</h2>

    <p v-if="traineesStore.loading && !traineesStore.loaded" class="text-sm text-neutral-600">
      טוען מתאמנים...
    </p>

    <div v-else-if="traineesStore.error" class="flex flex-col items-start gap-3">
      <p class="text-sm text-status-red">{{ traineesStore.error }}</p>
      <button
        type="button"
        class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
        @click="traineesStore.fetchAll()"
      >
        נסה שוב
      </button>
    </div>

    <p v-else-if="selectableTrainees.length === 0" class="text-sm text-neutral-600">
      אין עדיין מתאמנים לשליחת התראה.
    </p>

    <template v-else>
      <form v-if="!confirming" class="flex flex-col gap-4" @submit.prevent="handleReview">
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">מתאמן/ת</span>
          <select
            v-model="form.traineeId"
            required
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          >
            <option value="" disabled>בחר/י מתאמן</option>
            <option v-for="t in selectableTrainees" :key="t.id" :value="t.id">
              {{ t.full_name }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between">
            <span class="text-sm text-neutral-600">כותרת</span>
            <span class="text-xs text-neutral-500">{{ titleLength }}/{{ TITLE_MAX }}</span>
          </div>
          <input
            v-model="form.title"
            type="text"
            :maxlength="TITLE_MAX"
            required
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between">
            <span class="text-sm text-neutral-600">הודעה</span>
            <span class="text-xs text-neutral-500">{{ messageLength }}/{{ MESSAGE_MAX }}</span>
          </div>
          <textarea
            v-model="form.message"
            rows="4"
            :maxlength="MESSAGE_MAX"
            required
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <p v-if="validationError" class="text-sm text-status-red">{{ validationError }}</p>
        <p v-if="successMessage" class="text-sm text-brand-green">{{ successMessage }}</p>

        <div>
          <button
            type="submit"
            class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
          >
            שלח התראה
          </button>
        </div>
      </form>

      <div v-else class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4">
        <div>
          <p class="font-medium text-brand-black">לאשר שליחה?</p>
          <p class="mt-1 text-sm text-neutral-600">
            לא ניתן לערוך או למחוק התראה לאחר שליחתה. יש לוודא שהפרטים נכונים לפני האישור.
          </p>
        </div>

        <dl class="flex flex-col gap-2 rounded-lg bg-neutral-100 p-3 text-sm">
          <div>
            <dt class="inline text-neutral-600">מתאמן/ת: </dt>
            <dd class="inline font-medium text-brand-black">{{ selectedTraineeName }}</dd>
          </div>
          <div>
            <dt class="inline text-neutral-600">כותרת: </dt>
            <dd class="inline font-medium text-brand-black">{{ form.title.trim() }}</dd>
          </div>
          <div>
            <dt class="text-neutral-600">הודעה:</dt>
            <dd class="whitespace-pre-wrap text-brand-black">{{ form.message.trim() }}</dd>
          </div>
        </dl>

        <p v-if="notificationsStore.sendError" class="text-sm text-status-red">
          {{ notificationsStore.sendError }}
        </p>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            :disabled="notificationsStore.sending"
            class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
            @click="handleConfirmSend"
          >
            {{ notificationsStore.sending ? 'שולח...' : 'אישור שליחה' }}
          </button>
          <button
            type="button"
            :disabled="notificationsStore.sending"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
            @click="confirming = false"
          >
            ביטול
          </button>
        </div>
      </div>
    </template>
  </section>

  <section
    class="mt-8 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
  >
    <h2 class="font-semibold text-brand-black">התראות שנשלחו</h2>

    <p v-if="notificationsStore.loading && !notificationsStore.loaded" class="text-sm text-neutral-600">
      טוען...
    </p>

    <div v-else-if="notificationsStore.error" class="flex flex-col items-start gap-3">
      <p class="text-sm text-status-red">{{ notificationsStore.error }}</p>
      <button
        type="button"
        class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
        @click="notificationsStore.fetchSent()"
      >
        נסה שוב
      </button>
    </div>

    <p v-else-if="notificationsStore.sent.length === 0" class="text-sm text-neutral-600">
      עדיין לא נשלחו התראות למתאמנים.
    </p>

    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="n in notificationsStore.sent"
        :key="n.id"
        class="flex flex-col gap-1 border-t border-neutral-300 pt-3 first:border-t-0 first:pt-0"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-semibold text-brand-black">
            {{ traineeNameById.get(n.trainee_id) ?? 'מתאמן לא נמצא' }}
          </p>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            :class="n.is_read ? 'bg-neutral-100 text-neutral-600' : 'bg-brand-green/10 text-brand-green'"
          >
            {{ n.is_read ? 'נקראה' : 'טרם נקראה' }}
          </span>
        </div>
        <p class="text-sm font-medium text-brand-black">{{ n.title }}</p>
        <p class="whitespace-pre-wrap text-sm text-neutral-600">{{ n.message }}</p>
        <p class="text-xs text-neutral-500">{{ dateTimeFormatter.format(new Date(n.created_at)) }}</p>
      </li>
    </ul>
  </section>
</template>
