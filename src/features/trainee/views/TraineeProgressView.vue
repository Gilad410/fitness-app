<script setup>
import { computed, onMounted, ref } from 'vue'
import TraineeLayout from '../layouts/TraineeLayout.vue'
import { useTraineeProgressLogsStore } from '../store/traineeProgressLogs'
import { useTraineeProfileStore } from '../store/traineeProfile'

// Trainee-side "My Progress": own weigh-in history + logging a new entry.
// Reads/writes go exclusively through useTraineeProgressLogsStore
// (RLS-scoped SELECT + trainee_log_progress_entry()/
// trainee_delete_progress_entry(), 024_trainee_progress_access.sql).
// starting_weight/target_weight come from useTraineeProfileStore
// (trainee_get_own_profile(), 021), already used on the dashboard --
// reused here unchanged, not refetched from anywhere else.
//
// The stat tiles, delta wording, and the hand-rolled inline SVG chart
// below are a direct, intentional re-implementation of the coach's
// TraineeProgressSection.vue (same calculations, same Hebrew wording, same
// chart algorithm) -- NOT an import of that component or its store: this
// page must never depend on useProgressLogsStore (coach-scoped, keyed by
// trainee id, backed by tables this account has no policy for).
const progressLogsStore = useTraineeProgressLogsStore()
const profileStore = useTraineeProfileStore()

const checking = ref(true)
const loadError = ref('')

const showAddMeasurement = ref(false)
const logWeight = ref('')
const logDate = ref(todayIsoDate())
const logNote = ref('')

const confirmDeleteId = ref(null)

onMounted(async () => {
  try {
    await Promise.all([progressLogsStore.ensureLoaded(), profileStore.fetchProfile()])
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

// Local calendar date, not UTC -- toISOString() converts to UTC first, so
// near midnight (in either direction, depending on the trainee's UTC
// offset) it can return yesterday's or tomorrow's date instead of today's.
function todayIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const profile = computed(() => profileStore.profile)
const logs = computed(() => progressLogsStore.logs)
const ascendingLogs = computed(() => progressLogsStore.ascendingLogs)
const currentWeight = computed(() => progressLogsStore.latestLog?.weight ?? null)

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

function formatDelta(value) {
  if (value === null) return null
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded} ק"ג`
}

const deltaFromStart = computed(() => {
  if (currentWeight.value === null || !profile.value?.starting_weight) return null
  return formatDelta(currentWeight.value - profile.value.starting_weight)
})

// Phrased as a plain-language status rather than a signed number, since
// "-4 ק"ג" reads ambiguously (missing 4kg? 4kg over?) without a sign
// legend -- same wording as the coach's TraineeProgressSection.vue.
const targetStatus = computed(() => {
  if (currentWeight.value === null || !profile.value?.target_weight) return null
  const diff = currentWeight.value - profile.value.target_weight
  const rounded = Math.round(Math.abs(diff) * 10) / 10
  if (rounded === 0) return 'הגעת ליעד'
  return diff < 0 ? `חסר ${rounded} ק"ג` : `${rounded} ק"ג מעל היעד`
})

// Hand-rolled inline SVG line chart -- no charting library in the project,
// same algorithm as the coach's TraineeProgressSection.vue. Points are
// placed chronologically by logged_at (not evenly spaced by index), so
// gaps between weigh-ins read visually. Target/starting weight are folded
// into the y-domain so the reference line lands in a meaningful spot even
// if it's outside the logged weight range.
const CHART_WIDTH = 300
const CHART_HEIGHT = 100
const CHART_PADDING = 8

const chart = computed(() => {
  const points = ascendingLogs.value
  if (points.length < 2) return null

  const times = points.map((log) => new Date(log.logged_at).getTime())
  const weights = points.map((log) => Number(log.weight))
  const referenceWeights = [profile.value?.starting_weight, profile.value?.target_weight].filter(
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
    profile.value?.target_weight !== null && profile.value?.target_weight !== undefined
      ? toY(profile.value.target_weight)
      : null

  return { linePoints, targetY }
})

async function handleAddLog() {
  try {
    await progressLogsStore.addLog({
      weight: Number(logWeight.value),
      loggedAt: logDate.value,
      note: logNote.value.trim() === '' ? null : logNote.value.trim(),
    })
    logWeight.value = ''
    logDate.value = todayIsoDate()
    logNote.value = ''
    showAddMeasurement.value = false
  } catch {
    // surfaced via progressLogsStore.addError below; form stays open for retry
  }
}

async function confirmDelete(logId) {
  try {
    await progressLogsStore.deleteLog(logId)
    confirmDeleteId.value = null
  } catch {
    // surfaced via progressLogsStore.deleteError below; stays on confirm step
  }
}
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">ההתקדמות שלי</h1>
        <p class="mt-1 text-sm text-neutral-600">מעקב משקל והתקדמות לאורך זמן</p>
      </section>

      <p v-if="checking" class="text-neutral-600">טוען...</p>

      <div
        v-else-if="loadError"
        class="flex flex-col items-start gap-3 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm"
      >
        <p class="text-sm text-status-red">{{ loadError }}</p>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="$router.go(0)"
        >
          נסה שוב
        </button>
      </div>

      <template v-else>
        <div class="flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <h2 class="font-semibold text-brand-black">היסטוריית התקדמות</h2>
            <button
              v-if="!showAddMeasurement"
              type="button"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
              @click="showAddMeasurement = true"
            >
              הוסף מדידה
            </button>
          </div>

          <div v-if="currentWeight !== null" class="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt class="text-sm text-neutral-600">משקל נוכחי</dt>
              <dd class="text-lg font-semibold text-brand-black">{{ currentWeight }} ק"ג</dd>
            </div>
            <div v-if="profile?.starting_weight">
              <dt class="text-sm text-neutral-600">משקל התחלתי</dt>
              <dd class="text-lg font-semibold text-brand-black">{{ profile.starting_weight }} ק"ג</dd>
            </div>
            <div v-if="profile?.target_weight">
              <dt class="text-sm text-neutral-600">משקל יעד</dt>
              <dd class="text-lg font-semibold text-brand-black">{{ profile.target_weight }} ק"ג</dd>
            </div>
            <div v-if="profile?.starting_weight">
              <dt class="text-sm text-neutral-600">לעומת התחלה</dt>
              <dd class="text-lg font-semibold text-brand-black">{{ deltaFromStart }}</dd>
            </div>
            <div v-if="profile?.target_weight">
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
                stroke="#16a34a"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>

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

            <p v-if="progressLogsStore.addError" class="text-sm text-status-red">
              {{ progressLogsStore.addError }}
            </p>

            <div class="flex flex-wrap gap-3">
              <button
                type="submit"
                :disabled="progressLogsStore.adding"
                class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {{ progressLogsStore.adding ? 'שומר...' : 'שמור מדידה' }}
              </button>
              <button
                type="button"
                :disabled="progressLogsStore.adding"
                class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                @click="showAddMeasurement = false"
              >
                ביטול
              </button>
            </div>
          </form>

          <p v-if="progressLogsStore.deleteError" class="text-sm text-status-red">
            {{ progressLogsStore.deleteError }}
          </p>

          <p v-if="logs.length === 0" class="text-sm text-neutral-600">אין עדיין מדידות.</p>

          <ul v-else class="flex flex-col gap-3">
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
                    :disabled="progressLogsStore.deletingId === log.id"
                    class="rounded-lg bg-status-red px-3 py-1.5 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:cursor-not-allowed disabled:opacity-60"
                    @click="confirmDelete(log.id)"
                  >
                    {{ progressLogsStore.deletingId === log.id ? 'מוחק...' : 'אישור מחיקה' }}
                  </button>
                  <button
                    type="button"
                    :disabled="progressLogsStore.deletingId === log.id"
                    class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
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
    </div>
  </TraineeLayout>
</template>
