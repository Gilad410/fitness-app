<script setup>
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useFoodsStore } from '../store/foods'
import { useNutritionLogsStore } from '../store/nutritionLogs'
import { useRestaurantFoodItemsStore } from '../store/restaurantFoodItems'
import FoodQuantityPicker from './FoodQuantityPicker.vue'
import { formatNutritionAmount } from '../../../lib/formatNumber'
import { entryDisplayName, entryQuantityLabel } from '../lib/entryDisplay'

const props = defineProps({
  traineeId: { type: String, required: true },
})

const foodsStore = useFoodsStore()
const nutritionLogsStore = useNutritionLogsStore()
const restaurantFoodItemsStore = useRestaurantFoodItemsStore()

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
        <p v-if="!checking" class="text-sm text-neutral-600">
          סה"כ קלוריות היום:
          <span class="font-semibold text-brand-black">{{ formatNutritionAmount(todayTotal) }}</span>
          &middot; סה"כ חלבון היום:
          <span class="font-semibold text-brand-black">{{ formatNutritionAmount(todayProteinTotal) }} גר'</span>
          <span v-if="todayProteinUnknown">(לא כולל פריט/ים עם חלבון לא ידוע)</span>
        </p>
      </div>
      <button
        v-if="!showAddEntry"
        type="button"
        class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white"
        @click="showAddEntry = true"
      >
        הוסף מאכל
      </button>
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
          <p class="text-sm font-semibold text-brand-black">
            סה"כ {{ formatNutritionAmount(group.total) }} קק"ל &middot;
            {{ formatNutritionAmount(group.protein) }} גר' חלבון
            <span v-if="group.hasUnknownProtein" class="font-normal text-neutral-600">(+חלבון לא ידוע)</span>
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
              <p class="text-sm text-neutral-600">
                {{ entryQuantityLabel(log) }} &middot; {{ log.calories }} קק"ל &middot;
                {{ log.protein === null ? 'חלבון לא ידוע' : `${log.protein} גר' חלבון` }}
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
