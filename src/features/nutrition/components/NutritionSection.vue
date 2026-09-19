<script setup>
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { useFoodsStore } from '../store/foods'
import { useNutritionLogsStore } from '../store/nutritionLogs'
import { useRestaurantFoodItemsStore } from '../store/restaurantFoodItems'
import { useAuthStore } from '../../../stores/auth'
import FoodQuantityPicker from './FoodQuantityPicker.vue'
import BarcodeFoodEntry from './BarcodeFoodEntry.vue'
import { formatNutritionAmount } from '../../../lib/formatNumber'
import { entryDisplayName, entryQuantityLabel } from '../lib/entryDisplay'
import { startRetentionClock, stopRetentionClock } from '../lib/nutritionRetentionClock'
import { SAVE_FAILURE_LABELS, SAVE_FAILURE_NOT_SIGNED_IN } from '../lib/categorizeSaveFailure.js'

const props = defineProps({
  traineeId: { type: String, required: true },
})

const foodsStore = useFoodsStore()
const nutritionLogsStore = useNutritionLogsStore()
const restaurantFoodItemsStore = useRestaurantFoodItemsStore()
const authStore = useAuthStore()
const router = useRouter()

const checking = ref(true)
const loadError = ref('')

const showAddEntry = ref(false)
const addingEntry = ref(false)
const addEntryError = ref('')
const entryDate = ref(todayIsoDate())

// Food-source/quantity selection itself lives entirely in
// FoodQuantityPicker.vue (shared with the coach's nutrition-PLAN
// builder, NutritionPlanSection.vue) -- this component only supplies the
// one thing that's specific to a LOG entry (a date) and owns submitting
// the resolved selection to nutritionLogsStore.
const pickerRef = useTemplateRef('picker')

const deletingLogId = ref(null)
const deleteError = ref('')

// Barcode entry is a separate, self-contained flow (BarcodeFoodEntry.vue)
// rather than a third tab on FoodQuantityPicker -- see that component's
// own comment for why. It never touches the store itself; it only emits
// a resolved payload, exactly like pickerRef.value.resolve() does, and
// this handler adds the date and calls the exact same addLog() the
// regular/restaurant flow above uses.
const showBarcodeEntry = ref(false)
const barcodeRef = useTemplateRef('barcodeEntry')
const barcodeSaving = ref(false)
const barcodeSaveError = ref('')

// Deliberately its own top-level notice, NOT rendered inside the
// showBarcodeEntry block below -- BarcodeFoodEntry.vue resets/hides
// itself right after a successful resolve, so a message shown only
// inside its own subtree would disappear at the same moment, easy to
// never actually see (the exact "silently discard an approved
// product" gap found via barcode 7622202268298: today's log entry
// saved fine, but the cache-write failure was invisible). Persists
// until explicitly dismissed, survives the barcode form closing.
const saveForFutureFailedNotice = ref('')
// Set instead of (never alongside) saveForFutureFailedNotice specifically
// for SAVE_FAILURE_NOT_SIGNED_IN -- a generic "saving failed" message with
// no action isn't useful when the real, fixable cause is "you're signed
// out"; this renders as its own distinct block with a real sign-in
// button, not just different wording in the same yellow box.
const sessionExpiredNotice = ref(false)

function handleSaveForFutureFailed({ barcode, category, message }) {
  if (category === SAVE_FAILURE_NOT_SIGNED_IN) {
    sessionExpiredNotice.value = true
    return
  }
  const categoryLabel = SAVE_FAILURE_LABELS[category] ?? SAVE_FAILURE_LABELS.other
  saveForFutureFailedNotice.value = `שמירת המוצר לברקוד ${barcode} לסריקות הבאות נכשלה -- ${categoryLabel} (${message}). הרישום הנוכחי נשמר כרגיל, אך בסריקה הבאה של אותו ברקוד יהיה צורך להזין את הערכים שוב.`
}

async function signInAgainFromNotice() {
  await authStore.signOut().catch(() => {})
  router.push({ name: 'login' })
}

async function handleBarcodeResolved(resolved) {
  barcodeSaveError.value = ''
  barcodeSaving.value = true
  try {
    // Barcode entries are logged against today's date -- this flow is
    // inherently "in the moment" (scanning a product as it's eaten), and
    // keeping its own date field out of BarcodeFoodEntry.vue keeps that
    // component fully decoupled from the regular-entry form's entryDate
    // ref above. A past-dated barcode log isn't a use case this minimal
    // version covers.
    await nutritionLogsStore.addLog(props.traineeId, {
      ...resolved,
      logged_at: todayIsoDate(),
    })
    showBarcodeEntry.value = false
    barcodeRef.value?.reset()
  } catch (err) {
    barcodeSaveError.value = err.message
  } finally {
    barcodeSaving.value = false
  }
}

function handleBarcodeCancel() {
  showBarcodeEntry.value = false
}

// Keeps the shared retentionCutoff (nutritionRetentionClock.js) current
// for as long as this section is mounted -- a periodic re-check plus an
// immediate one on tab focus/visibility restoration (e.g. the coach's
// laptop waking from sleep hours later) -- so nutritionLogsStore's
// getters (logsFor/dailyTotalFor/etc., all reactive on that same ref)
// stop showing/counting an already-fetched entry once it ages out of the
// 7-day retention window, without needing a fresh fetch. Started in
// onMounted, stopped in onUnmounted -- reference-counted, so this is safe
// even if some future screen also renders this section concurrently.
onMounted(() => {
  startRetentionClock()
})
onUnmounted(() => {
  stopRetentionClock()
})

onMounted(async () => {
  try {
    await Promise.all([
      foodsStore.ensureLoaded(),
      nutritionLogsStore.ensureLoaded(props.traineeId),
      restaurantFoodItemsStore.ensureChainsLoaded(),
    ])
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

const logs = computed(() => nutritionLogsStore.logsFor(props.traineeId))

const todayTotal = computed(() => nutritionLogsStore.dailyTotalFor(props.traineeId, todayIsoDate()))
const todayProteinTotal = computed(() =>
  nutritionLogsStore.dailyProteinTotalFor(props.traineeId, todayIsoDate()),
)
const todayProteinUnknown = computed(() =>
  nutritionLogsStore.dailyHasUnknownProteinFor(props.traineeId, todayIsoDate()),
)

const groupedLogs = computed(() => {
  const groups = []
  const byDate = new Map()
  for (const log of logs.value) {
    if (!byDate.has(log.logged_at)) {
      const group = { date: log.logged_at, total: 0, protein: 0, hasUnknownProtein: false, entries: [] }
      byDate.set(log.logged_at, group)
      groups.push(group)
    }
    const group = byDate.get(log.logged_at)
    group.entries.push(log)
    group.total += Number(log.calories)
    if (log.protein === null) {
      group.hasUnknownProtein = true
    } else {
      group.protein += Number(log.protein)
    }
  }
  return groups
})

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

// Local calendar date (not UTC -- toISOString().slice(0, 10) reads the
// UTC date, which is a day behind local time for part of the evening in
// timezones ahead of UTC). Same approach as
// TraineeMeasurementsView.vue / TraineeProgressView.vue.
function todayIsoDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resetForm() {
  entryDate.value = todayIsoDate()
  pickerRef.value?.reset()
}

async function handleAddEntry() {
  addEntryError.value = ''
  addingEntry.value = true
  try {
    const resolved = await pickerRef.value.resolve()
    await nutritionLogsStore.addLog(props.traineeId, {
      ...resolved,
      logged_at: entryDate.value,
    })
    resetForm()
    showAddEntry.value = false
  } catch (err) {
    addEntryError.value = err.message
  } finally {
    addingEntry.value = false
  }
}

async function handleDelete(logId) {
  deleteError.value = ''
  deletingLogId.value = logId
  try {
    await nutritionLogsStore.deleteLog(props.traineeId, logId)
  } catch (err) {
    deleteError.value = err.message
  } finally {
    deletingLogId.value = null
  }
}
</script>

<template>
  <div class="mt-8 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="font-semibold text-brand-black">תזונה</h2>
        <div v-if="!checking" class="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span class="inline-flex items-baseline gap-1.5">
            <span class="ec-num text-lg" style="color: var(--color-brand-green)">{{ formatNutritionAmount(todayTotal) }}</span>
            <span class="text-sm text-neutral-600">קק"ל היום</span>
          </span>
          <span class="inline-flex items-baseline gap-1.5">
            <span class="ec-num text-lg" style="color: var(--ec-violet)">{{ formatNutritionAmount(todayProteinTotal) }}</span>
            <span class="text-sm text-neutral-600">גר' חלבון היום</span>
          </span>
          <span v-if="todayProteinUnknown" class="text-xs text-neutral-500">(לא כולל פריט/ים עם חלבון לא ידוע)</span>
        </div>
      </div>
      <div v-if="!showAddEntry && !showBarcodeEntry" class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white"
          @click="showAddEntry = true"
        >
          הוסף מאכל
        </button>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="showBarcodeEntry = true"
        >
          סרוק ברקוד
        </button>
      </div>
    </div>

    <div
      v-if="sessionExpiredNotice"
      class="flex items-center justify-between gap-3 rounded-lg border border-status-red/40 bg-status-red/5 p-3 text-sm text-brand-black"
    >
      <p>ההתחברות שלך פגה, ולכן השמירה לא הושלמה. יש להתחבר מחדש ולנסות שוב.</p>
      <button
        type="button"
        class="shrink-0 rounded-lg bg-status-red px-3 py-1.5 text-xs font-medium text-brand-white"
        @click="signInAgainFromNotice"
      >
        התחבר/י מחדש
      </button>
    </div>

    <div
      v-else-if="saveForFutureFailedNotice"
      class="flex items-start justify-between gap-3 rounded-lg border border-status-yellow/40 bg-status-yellow/5 p-3 text-sm text-brand-black"
    >
      <p>{{ saveForFutureFailedNotice }}</p>
      <button
        type="button"
        class="shrink-0 text-xs text-neutral-600 underline"
        @click="saveForFutureFailedNotice = ''"
      >
        הבנתי
      </button>
    </div>

    <div v-if="showBarcodeEntry" class="flex flex-col gap-2">
      <BarcodeFoodEntry
        ref="barcodeEntry"
        @resolved="handleBarcodeResolved"
        @cancel="handleBarcodeCancel"
        @save-for-future-failed="handleSaveForFutureFailed"
      />
      <p v-if="barcodeSaving" class="text-sm text-neutral-600">שומר ביומן התזונה...</p>
      <p v-if="barcodeSaveError" class="text-sm text-status-red">{{ barcodeSaveError }}</p>
    </div>

    <form
      v-if="showAddEntry"
      class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
      @submit.prevent="handleAddEntry"
    >
      <FoodQuantityPicker ref="picker" />

      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">תאריך</span>
        <input
          v-model="entryDate"
          type="date"
          required
          class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
        />
      </label>

      <p v-if="addEntryError" class="text-sm text-status-red">{{ addEntryError }}</p>

      <div class="flex flex-wrap gap-3">
        <button
          type="submit"
          :disabled="addingEntry"
          class="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
        >
          {{ addingEntry ? 'שומר...' : 'שמור' }}
        </button>
        <button
          type="button"
          :disabled="addingEntry"
          class="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
          @click="showAddEntry = false; resetForm()"
        >
          ביטול
        </button>
      </div>
    </form>

    <p v-if="checking" class="text-sm text-neutral-600">טוען...</p>

    <p v-else-if="loadError" class="text-sm text-status-red">{{ loadError }}</p>

    <p v-else-if="logs.length === 0" class="text-sm text-neutral-600">אין עדיין רישומי תזונה.</p>

    <p v-if="deleteError" class="text-sm text-status-red">{{ deleteError }}</p>

    <div v-if="!checking && groupedLogs.length > 0" class="flex flex-col gap-4">
      <div
        v-for="group in groupedLogs"
        :key="group.date"
        class="border-t border-neutral-300 pt-3 first:border-t-0 first:pt-0"
      >
        <div class="mb-2 flex items-baseline justify-between gap-4">
          <p class="text-sm text-neutral-600">{{ dateFormatter.format(new Date(group.date)) }}</p>
          <p class="flex items-baseline gap-3">
            <span class="ec-num text-sm" style="color: var(--color-brand-green)">{{ formatNutritionAmount(group.total) }} קק"ל</span>
            <span class="ec-num text-sm" style="color: var(--ec-violet)">{{ formatNutritionAmount(group.protein) }} גר' חלבון</span>
            <span v-if="group.hasUnknownProtein" class="text-xs font-normal text-neutral-600">(+חלבון לא ידוע)</span>
          </p>
        </div>
        <ul class="flex flex-col gap-2">
          <li
            v-for="log in group.entries"
            :key="log.id"
            class="flex items-center justify-between gap-4"
          >
            <div class="min-w-0">
              <p class="truncate text-brand-black">{{ entryDisplayName(log) }}</p>
              <p class="text-sm text-neutral-600">{{ entryQuantityLabel(log) }}</p>
              <p class="mt-0.5 flex items-baseline gap-3">
                <span class="inline-flex items-baseline gap-1">
                  <span class="ec-num text-sm" style="color: var(--color-brand-green)">{{ log.calories }}</span>
                  <span class="text-xs text-neutral-500">קק"ל</span>
                </span>
                <span class="inline-flex items-baseline gap-1">
                  <template v-if="log.protein === null">
                    <span class="text-xs text-neutral-500">חלבון לא ידוע</span>
                  </template>
                  <template v-else>
                    <span class="ec-num text-sm" style="color: var(--ec-violet)">{{ log.protein }}</span>
                    <span class="text-xs text-neutral-500">גר' חלבון</span>
                  </template>
                </span>
              </p>
            </div>
            <button
              type="button"
              :disabled="deletingLogId === log.id"
              class="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-status-red hover:bg-neutral-100 disabled:opacity-60"
              @click="handleDelete(log.id)"
            >
              {{ deletingLogId === log.id ? 'מוחק...' : 'מחק' }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
