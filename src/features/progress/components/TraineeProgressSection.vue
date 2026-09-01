<script setup>
import { computed, onMounted, ref } from 'vue'
import { useProgressLogsStore } from '../store/progressLogs'

const props = defineProps({
  trainee: { type: Object, required: true },
})

const progressLogsStore = useProgressLogsStore()

const logsChecking = ref(true)
const logsError = ref('')

const showAddMeasurement = ref(false)
const addingLog = ref(false)
const addLogError = ref('')
const logWeight = ref('')
const logDate = ref(todayIsoDate())
const logNote = ref('')

const confirmDeleteId = ref(null)
const deletingId = ref(null)
const deleteError = ref('')

onMounted(async () => {
  try {
    await progressLogsStore.ensureLoaded(props.trainee.id)
  } catch (err) {
    logsError.value = err.message
  } finally {
    logsChecking.value = false
  }
})

const logs = computed(() => progressLogsStore.logsFor(props.trainee.id))
const ascendingLogs = computed(() => progressLogsStore.ascendingLogsFor(props.trainee.id))
const currentWeight = computed(() => progressLogsStore.latestLogFor(props.trainee.id)?.weight ?? null)

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

function formatDelta(value) {
  if (value === null) return null
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded} ק"ג`
}

const deltaFromStart = computed(() => {
  if (currentWeight.value === null || !props.trainee.starting_weight) return null
  return formatDelta(currentWeight.value - props.trainee.starting_weight)
})

// Phrased as a plain-language status rather than a signed number, since
// "-4 ק"ג" reads ambiguously (missing 4kg? 4kg over?) without a sign legend.
const targetStatus = computed(() => {
  if (currentWeight.value === null || !props.trainee.target_weight) return null
  const diff = currentWeight.value - props.trainee.target_weight
  const rounded = Math.round(Math.abs(diff) * 10) / 10
  if (rounded === 0) return 'הגעת ליעד'
  return diff < 0 ? `חסר ${rounded} ק"ג` : `${rounded} ק"ג מעל היעד`
})

// Hand-rolled inline SVG line chart -- no charting library in the project,
// and a sparkline is simple enough not to need one. Points are placed
// chronologically by logged_at (not evenly spaced by index), so gaps
// between weigh-ins read visually. Target/starting weight are folded into
// the y-domain so the reference line lands in a meaningful spot even if
// it's outside the logged weight range.
const CHART_WIDTH = 300
const CHART_HEIGHT = 100
const CHART_PADDING = 8

const chart = computed(() => {
  const points = ascendingLogs.value
  if (points.length < 2) return null

  const times = points.map((log) => new Date(log.logged_at).getTime())
  const weights = points.map((log) => Number(log.weight))
  const referenceWeights = [props.trainee.starting_weight, props.trainee.target_weight].filter(
    (w) => w !== null && w !== undefined,
  )

  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const minWeight = Math.min(...weights, ...referenceWeights)
  const maxWeight = Math.max(...weights, ...referenceWeights)

  const timeSpan = maxTime - minTime || 1
  const weightSpan = maxWeight - minWeight || 1

  const toX = (t) =>
    CHART_PADDING + ((t - minTime) / timeSpan) * (CHART_WIDTH - 2 * CHART_PADDING)
  const toY = (w) =>
    CHART_PADDING + (1 - (w - minWeight) / weightSpan) * (CHART_HEIGHT - 2 * CHART_PADDING)

  const linePoints = points.map((log, i) => `${toX(times[i])},${toY(Number(log.weight))}`).join(' ')

  const targetY =
    props.trainee.target_weight !== null && props.trainee.target_weight !== undefined
      ? toY(props.trainee.target_weight)
      : null

  return { linePoints, targetY }
})

async function handleAddLog() {
  addLogError.value = ''
  addingLog.value = true
  try {
    await progressLogsStore.addLog(props.trainee.id, {
      weight: Number(logWeight.value),
      logged_at: logDate.value,
      note: logNote.value.trim() === '' ? null : logNote.value.trim(),
    })
    logWeight.value = ''
    logDate.value = todayIsoDate()
    logNote.value = ''
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
    await progressLogsStore.deleteLog(props.trainee.id, logId)
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
      <h2 class="font-semibold text-brand-black">היסטוריית התקדמות</h2>
      <button
        v-if="!showAddMeasurement"
        type="button"
        class="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white"
        @click="showAddMeasurement = true"
      >
        הוסף מדידה
      </button>
    </div>

    <p v-if="logsChecking" class="text-sm text-neutral-600">טוען...</p>

    <template v-else-if="!logsError">
      <div v-if="currentWeight !== null" class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt class="text-sm text-neutral-600">משקל נוכחי</dt>
          <dd class="text-lg font-semibold text-brand-black">{{ currentWeight }} ק"ג</dd>
        </div>
        <div v-if="trainee.starting_weight">
          <dt class="text-sm text-neutral-600">לעומת התחלה</dt>
          <dd class="text-lg font-semibold text-brand-black">{{ deltaFromStart }}</dd>
        </div>
        <div v-if="trainee.target_weight">
          <dt class="text-sm text-neutral-600">לעומת יעד</dt>
          <dd class="text-lg font-semibold text-brand-black">{{ targetStatus }}</dd>
        </div>
      </div>

      <div v-if="chart" dir="ltr" class="rounded-xl border border-neutral-300 p-3">
        <svg
          :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
          preserveAspectRatio="none"
          class="h-24 w-full"
        >
          <line
            v-if="chart.targetY !== null"
            :x1="0"
            :x2="CHART_WIDTH"
            :y1="chart.targetY"
            :y2="chart.targetY"
            stroke="#d97706"
            stroke-width="1"
            stroke-dasharray="4 3"
          />
          <polyline
            :points="chart.linePoints"
            fill="none"
            stroke="#168345"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </template>

    <form
      v-if="showAddMeasurement"
      class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
      @submit.prevent="handleAddLog"
    >
      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">משקל (ק"ג)</span>
        <input
          v-model="logWeight"
          type="number"
          step="0.1"
          min="0.1"
          required
          dir="ltr"
          class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
        />
      </label>

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
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
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

    <p v-if="logsError" class="text-sm text-status-red">{{ logsError }}</p>
    <p v-if="deleteError" class="text-sm text-status-red">{{ deleteError }}</p>

    <p v-if="!logsChecking && !logsError && logs.length === 0" class="text-sm text-neutral-600">
      אין עדיין מדידות.
    </p>

    <ul v-else-if="!logsChecking && !logsError" class="flex flex-col gap-3">
      <li
        v-for="log in logs"
        :key="log.id"
        class="flex items-baseline justify-between gap-4 border-t border-neutral-300 pt-3 first:border-t-0 first:pt-0"
      >
        <div class="min-w-0">
          <p class="text-sm text-neutral-600">
            {{ dateFormatter.format(new Date(log.logged_at)) }}
          </p>
          <p v-if="log.note" class="truncate text-sm text-neutral-600">{{ log.note }}</p>
        </div>

        <div class="flex shrink-0 items-center gap-3">
          <p class="font-semibold text-brand-black">{{ log.weight }} ק"ג</p>

          <template v-if="confirmDeleteId === log.id">
            <button
              type="button"
              :disabled="deletingId === log.id"
              class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-status-red px-3 py-1.5 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
              @click="confirmDelete(log.id)"
            >
              {{ deletingId === log.id ? 'מוחק...' : 'אישור מחיקה' }}
            </button>
            <button
              type="button"
              :disabled="deletingId === log.id"
              class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
              @click="confirmDeleteId = null"
            >
              ביטול
            </button>
          </template>
          <button
            v-else
            type="button"
            class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100"
            @click="confirmDeleteId = log.id"
          >
            מחק
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
