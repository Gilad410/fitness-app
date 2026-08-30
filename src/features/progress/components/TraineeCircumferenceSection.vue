<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useCircumferenceLogsStore } from '../store/circumferenceLogs'

const props = defineProps({
  trainee: { type: Object, required: true },
})

const circumferenceLogsStore = useCircumferenceLogsStore()

// Shared source of truth for the six measurement fields, so the add form
// and the history rows stay in sync without repeating the list twice.
const MEASUREMENTS = [
  { key: 'abdomen_cm', label: 'בטן' },
  { key: 'neck_cm', label: 'צוואר' },
  { key: 'right_arm_cm', label: 'יד ימין' },
  { key: 'left_arm_cm', label: 'יד שמאל' },
  { key: 'right_leg_cm', label: 'רגל ימין' },
  { key: 'left_leg_cm', label: 'רגל שמאל' },
]

const logsChecking = ref(true)
const logsError = ref('')

const showAddMeasurement = ref(false)
const addingLog = ref(false)
const addLogError = ref('')
const form = reactive(Object.fromEntries(MEASUREMENTS.map((m) => [m.key, ''])))
const logDate = ref(todayIsoDate())
const logNote = ref('')

const confirmDeleteId = ref(null)
const deletingId = ref(null)
const deleteError = ref('')

onMounted(async () => {
  try {
    await circumferenceLogsStore.ensureLoaded(props.trainee.id)
  } catch (err) {
    logsError.value = err.message
  } finally {
    logsChecking.value = false
  }
})

const logs = computed(() => circumferenceLogsStore.logsFor(props.trainee.id))

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

function resetForm() {
  MEASUREMENTS.forEach((m) => {
    form[m.key] = ''
  })
  logDate.value = todayIsoDate()
  logNote.value = ''
}

function measurementsFor(log) {
  return MEASUREMENTS.filter((m) => log[m.key] !== null && log[m.key] !== undefined)
}

async function handleAddLog() {
  addLogError.value = ''

  const payload = Object.fromEntries(
    MEASUREMENTS.map((m) => [m.key, form[m.key] === '' ? null : Number(form[m.key])]),
  )

  if (Object.values(payload).every((value) => value === null)) {
    addLogError.value = 'יש להזין לפחות מדידה אחת.'
    return
  }

  addingLog.value = true
  try {
    await circumferenceLogsStore.addLog(props.trainee.id, {
      ...payload,
      logged_at: logDate.value,
      note: logNote.value.trim() === '' ? null : logNote.value.trim(),
    })
    resetForm()
    showAddMeasurement.value = false
  } catch (err) {
    addLogError.value = err.message
  } finally {
    addingLog.value = false
  }
}

async function confirmDelete(logId) {
  deleteError.value = ''
  deletingId.value = logId
  try {
    await circumferenceLogsStore.deleteLog(props.trainee.id, logId)
    confirmDeleteId.value = null
  } catch (err) {
    deleteError.value = err.message
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="mt-8 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h2 class="font-semibold text-brand-black">היקפי גוף</h2>
      <button
        v-if="!showAddMeasurement"
        type="button"
        class="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
        @click="showAddMeasurement = true"
      >
        הוסף מדידה
      </button>
    </div>

    <form
      v-if="showAddMeasurement"
      class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
      @submit.prevent="handleAddLog"
    >
      <div class="grid grid-cols-2 gap-4">
        <label v-for="m in MEASUREMENTS" :key="m.key" class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">{{ m.label }} (ס"מ)</span>
          <input
            v-model="form[m.key]"
            type="number"
            step="0.1"
            min="0.1"
            dir="ltr"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
          />
        </label>
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">תאריך</span>
        <input
          v-model="logDate"
          type="date"
          required
          class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">הערה</span>
        <textarea
          v-model="logNote"
          rows="2"
          class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
        />
      </label>

      <p v-if="addLogError" class="text-sm text-status-red">{{ addLogError }}</p>

      <div class="flex flex-wrap gap-3">
        <button
          type="submit"
          :disabled="addingLog"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
        >
          {{ addingLog ? 'שומר...' : 'שמור מדידה' }}
        </button>
        <button
          type="button"
          :disabled="addingLog"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
          @click="showAddMeasurement = false"
        >
          ביטול
        </button>
      </div>
    </form>

    <p v-if="logsChecking" class="text-sm text-neutral-600">טוען...</p>

    <p v-else-if="logsError" class="text-sm text-status-red">{{ logsError }}</p>

    <p v-if="deleteError" class="text-sm text-status-red">{{ deleteError }}</p>

    <p v-if="!logsChecking && !logsError && logs.length === 0" class="text-sm text-neutral-600">
      אין עדיין מדידות היקפים.
    </p>

    <ul v-else-if="!logsChecking && !logsError" class="flex flex-col gap-3">
      <li
        v-for="log in logs"
        :key="log.id"
        class="flex flex-wrap items-start justify-between gap-4 border-t border-neutral-300 pt-3 first:border-t-0 first:pt-0"
      >
        <div class="min-w-0">
          <p class="text-sm text-neutral-600">
            {{ dateFormatter.format(new Date(log.logged_at)) }}
          </p>
          <p class="flex flex-wrap gap-x-3 gap-y-1 text-brand-black">
            <span v-for="m in measurementsFor(log)" :key="m.key" class="font-semibold">
              {{ m.label }}: {{ log[m.key] }} ס"מ
            </span>
          </p>
          <p v-if="log.note" class="truncate text-sm text-neutral-600">{{ log.note }}</p>
        </div>

        <div class="flex shrink-0 items-center gap-3">
          <template v-if="confirmDeleteId === log.id">
            <button
              type="button"
              :disabled="deletingId === log.id"
              class="rounded-lg bg-status-red px-3 py-1.5 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
              @click="confirmDelete(log.id)"
            >
              {{ deletingId === log.id ? 'מוחק...' : 'אישור מחיקה' }}
            </button>
            <button
              type="button"
              :disabled="deletingId === log.id"
              class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
              @click="confirmDeleteId = null"
            >
              ביטול
            </button>
          </template>
          <button
            v-else
            type="button"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100"
            @click="confirmDeleteId = log.id"
          >
            מחק
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
