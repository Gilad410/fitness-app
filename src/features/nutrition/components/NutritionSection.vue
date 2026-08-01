<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useFoodsStore } from '../store/foods'
import { useNutritionLogsStore } from '../store/nutritionLogs'
import { useFoodReferenceCatalogStore } from '../store/foodReferenceCatalog'

const props = defineProps({
  traineeId: { type: String, required: true },
})

const NEW_FOOD_VALUE = '__new__'
const NAME_SEARCH_DEBOUNCE_MS = 300
const NAME_SEARCH_MIN_LENGTH = 2

const foodsStore = useFoodsStore()
const nutritionLogsStore = useNutritionLogsStore()
const foodReferenceCatalogStore = useFoodReferenceCatalogStore()

const checking = ref(true)
const loadError = ref('')

const showAddEntry = ref(false)
const addingEntry = ref(false)
const addEntryError = ref('')
const entryFoodId = ref('')
const newFoodName = ref('')
const newFoodCalories = ref('')
const newFoodProtein = ref('')
const entryGrams = ref('')
const entryDate = ref(todayIsoDate())

const nameSuggestions = ref([])
const nameSuggestionsSearched = ref(false)
let nameSearchTimer = null

watch(newFoodName, (name) => {
  clearTimeout(nameSearchTimer)
  const trimmed = name.trim()
  if (trimmed.length < NAME_SEARCH_MIN_LENGTH) {
    nameSuggestions.value = []
    nameSuggestionsSearched.value = false
    return
  }

  nameSearchTimer = setTimeout(async () => {
    try {
      nameSuggestions.value = await foodReferenceCatalogStore.search(trimmed)
    } catch {
      nameSuggestions.value = []
    } finally {
      nameSuggestionsSearched.value = true
    }
  }, NAME_SEARCH_DEBOUNCE_MS)
})

function pickSuggestion(food) {
  newFoodName.value = food.name
  newFoodCalories.value = String(food.calories_per_100g)
  newFoodProtein.value = String(food.protein_per_100g)
  nameSuggestions.value = []
  nameSuggestionsSearched.value = false
}

const deletingLogId = ref(null)
const deleteError = ref('')

onMounted(async () => {
  try {
    await Promise.all([foodsStore.ensureLoaded(), nutritionLogsStore.ensureLoaded(props.traineeId)])
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

const foods = computed(() => foodsStore.foods)
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

function proteinLabel(proteinPer100g) {
  return proteinPer100g === null ? 'חלבון לא ידוע' : `${proteinPer100g} ג' חלבון ל-100 גרם`
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function resetForm() {
  entryFoodId.value = ''
  newFoodName.value = ''
  newFoodCalories.value = ''
  newFoodProtein.value = ''
  entryGrams.value = ''
  entryDate.value = todayIsoDate()
  nameSuggestions.value = []
  nameSuggestionsSearched.value = false
}

async function handleAddEntry() {
  addEntryError.value = ''
  addingEntry.value = true
  try {
    let foodId = entryFoodId.value
    if (foodId === NEW_FOOD_VALUE) {
      const name = newFoodName.value.trim()
      const caloriesPer100g = Number(newFoodCalories.value)
      const proteinPer100g = Number(newFoodProtein.value)
      const existing = foodsStore.getByName(name)

      const food = existing
        ? await foodsStore.update(existing.id, {
            calories_per_100g: caloriesPer100g,
            protein_per_100g: proteinPer100g,
          })
        : await foodsStore.create({
            name,
            calories_per_100g: caloriesPer100g,
            protein_per_100g: proteinPer100g,
          })
      foodId = food.id
    }

    await nutritionLogsStore.addLog(props.traineeId, {
      food_id: foodId,
      grams: Number(entryGrams.value),
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
          סה"כ קלוריות היום: <span class="font-semibold text-brand-black">{{ todayTotal }}</span>
          &middot; סה"כ חלבון היום:
          <span class="font-semibold text-brand-black">{{ todayProteinTotal }} גר'</span>
          <span v-if="todayProteinUnknown">(לא כולל פריט/ים עם חלבון לא ידוע)</span>
        </p>
      </div>
      <button
        v-if="!showAddEntry"
        type="button"
        class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
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
      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">מאכל</span>
        <select
          v-model="entryFoodId"
          required
          class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
        >
          <option value="" disabled>בחר מאכל</option>
          <option v-for="food in foods" :key="food.id" :value="food.id">
            {{ food.name }} ({{ food.calories_per_100g }} קק"ל, {{ proteinLabel(food.protein_per_100g) }})
          </option>
          <option :value="NEW_FOOD_VALUE">+ הוסף מאכל חדש</option>
        </select>
      </label>

      <template v-if="entryFoodId === NEW_FOOD_VALUE">
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">שם המאכל</span>
          <input
            v-model="newFoodName"
            type="text"
            required
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <ul
          v-if="nameSuggestions.length > 0"
          class="flex flex-col gap-1 rounded-lg border border-neutral-300 p-2"
        >
          <li v-for="food in nameSuggestions" :key="food.id">
            <button
              type="button"
              class="w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-neutral-100"
              @click="pickSuggestion(food)"
            >
              {{ food.name }}
              <span class="text-neutral-600"
                >({{ food.calories_per_100g }} קק"ל, {{ food.protein_per_100g }} ג' חלבון ל-100 גרם)</span
              >
            </button>
          </li>
        </ul>
        <p
          v-else-if="nameSuggestionsSearched"
          class="text-sm text-neutral-600"
        >
          לא נמצא במאגר, ניתן להזין קלוריות ידנית
        </p>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">קלוריות ל-100 גרם</span>
          <input
            v-model="newFoodCalories"
            type="number"
            step="0.1"
            min="0.1"
            required
            dir="ltr"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">חלבון (גרם) ל-100 גרם</span>
          <input
            v-model="newFoodProtein"
            type="number"
            step="0.1"
            min="0"
            required
            dir="ltr"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
          />
        </label>
      </template>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">כמות (גרם)</span>
        <input
          v-model="entryGrams"
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
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
        >
          {{ addingEntry ? 'שומר...' : 'שמור' }}
        </button>
        <button
          type="button"
          :disabled="addingEntry"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
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
            סה"כ {{ group.total }} קק"ל &middot; {{ group.protein }} גר' חלבון
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
              <p class="truncate text-brand-black">{{ log.food?.name }}</p>
              <p class="text-sm text-neutral-600">
                {{ log.grams }} גרם &middot; {{ log.calories }} קק"ל &middot;
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
