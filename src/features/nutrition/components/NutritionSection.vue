<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useFoodsStore } from '../store/foods'
import { useNutritionLogsStore } from '../store/nutritionLogs'
import { useFoodReferenceCatalogStore } from '../store/foodReferenceCatalog'
import { useRestaurantFoodItemsStore } from '../store/restaurantFoodItems'

const props = defineProps({
  traineeId: { type: String, required: true },
})

const NEW_FOOD_VALUE = '__new__'
const NAME_SEARCH_DEBOUNCE_MS = 300
const NAME_SEARCH_MIN_LENGTH = 2

const foodsStore = useFoodsStore()
const nutritionLogsStore = useNutritionLogsStore()
const foodReferenceCatalogStore = useFoodReferenceCatalogStore()
const restaurantFoodItemsStore = useRestaurantFoodItemsStore()

const checking = ref(true)
const loadError = ref('')

const showAddEntry = ref(false)
const addingEntry = ref(false)
const addEntryError = ref('')

// 'regular' = existing food_reference_catalog-backed flow (grams-based,
// unchanged). 'restaurant' = restaurant_food_items-backed flow (fixed
// serving, servings-based, never grams).
const entrySource = ref('regular')

const entryFoodId = ref('')
const newFoodName = ref('')
const newFoodCalories = ref('')
const newFoodProtein = ref('')
const entryGrams = ref('')
const entryDate = ref(todayIsoDate())

const selectedChain = ref('')
const restaurantSearchTerm = ref('')
const selectedRestaurantItemId = ref('')
const entryServings = ref('1')

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

function setEntrySource(source) {
  if (entrySource.value === source) return
  entrySource.value = source
  // Clear both branches' transient input so switching sources never
  // leaves a stale selection behind (e.g. a chosen chain item while on
  // "regular", or a half-typed new-food name while on "restaurant").
  entryFoodId.value = ''
  newFoodName.value = ''
  newFoodCalories.value = ''
  newFoodProtein.value = ''
  entryGrams.value = ''
  nameSuggestions.value = []
  nameSuggestionsSearched.value = false
  selectedChain.value = ''
  restaurantSearchTerm.value = ''
  selectedRestaurantItemId.value = ''
  entryServings.value = '1'
}

watch(selectedChain, async (chain) => {
  selectedRestaurantItemId.value = ''
  restaurantSearchTerm.value = ''
  if (!chain) return
  try {
    await restaurantFoodItemsStore.ensureItemsLoaded(chain)
  } catch {
    // surfaced to the coach via addEntryError on submit / store.error
  }
})

const filteredRestaurantItems = computed(() => {
  const items = restaurantFoodItemsStore.itemsFor(selectedChain.value)
  const term = restaurantSearchTerm.value.trim()
  if (!term) return items
  return items.filter(
    (item) => item.item_name.includes(term) || item.serving_description.includes(term),
  )
})

const selectedRestaurantItem = computed(
  () =>
    restaurantFoodItemsStore
      .itemsFor(selectedChain.value)
      .find((item) => item.id === selectedRestaurantItemId.value) ?? null,
)

const restaurantPreviewCalories = computed(() => {
  if (!selectedRestaurantItem.value) return null
  const servings = Number(entryServings.value)
  if (!Number.isFinite(servings)) return null
  return Math.round(selectedRestaurantItem.value.calories_per_serving * servings * 10) / 10
})

const restaurantPreviewProtein = computed(() => {
  if (!selectedRestaurantItem.value || selectedRestaurantItem.value.protein_per_serving === null) return null
  const servings = Number(entryServings.value)
  if (!Number.isFinite(servings)) return null
  return Math.round(selectedRestaurantItem.value.protein_per_serving * servings * 10) / 10
})

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

// Regular foods show "<name>"; restaurant items show "<item> (<chain>)" so
// the source stays obvious in history without a dedicated column, and it
// works for any chain automatically -- nothing here names Aroma directly.
function entryDisplayName(log) {
  if (log.restaurant_food_item) {
    return `${log.restaurant_food_item.item_name} (${log.restaurant_food_item.chain_name})`
  }
  return log.food?.name ?? ''
}

function entryQuantityLabel(log) {
  if (log.restaurant_food_item) {
    const servings = Number(log.servings)
    const servingsText = Number.isInteger(servings) ? String(servings) : servings.toFixed(1)
    const servingsWord = servings === 1 ? 'מנה' : 'מנות'
    return `${servingsText} ${servingsWord} · ${log.restaurant_food_item.serving_description}`
  }
  return `${log.grams} גרם`
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function resetForm() {
  entrySource.value = 'regular'
  entryFoodId.value = ''
  newFoodName.value = ''
  newFoodCalories.value = ''
  newFoodProtein.value = ''
  entryGrams.value = ''
  entryDate.value = todayIsoDate()
  nameSuggestions.value = []
  nameSuggestionsSearched.value = false
  selectedChain.value = ''
  restaurantSearchTerm.value = ''
  selectedRestaurantItemId.value = ''
  entryServings.value = '1'
}

async function handleAddEntry() {
  addEntryError.value = ''
  addingEntry.value = true
  try {
    if (entrySource.value === 'restaurant') {
      if (!selectedRestaurantItemId.value) {
        throw new Error('יש לבחור פריט מהתפריט')
      }
      await nutritionLogsStore.addLog(props.traineeId, {
        restaurant_food_item_id: selectedRestaurantItemId.value,
        servings: Number(entryServings.value),
        logged_at: entryDate.value,
      })
    } else {
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
    }
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
      <div class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">מקור המאכל</span>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            :class="[
              'rounded-lg border px-3 py-1.5 text-sm font-medium',
              entrySource === 'regular'
                ? 'border-brand-green bg-brand-green text-brand-white'
                : 'border-neutral-300 text-brand-black hover:bg-neutral-100',
            ]"
            @click="setEntrySource('regular')"
          >
            מאכלים רגילים
          </button>
          <button
            type="button"
            :class="[
              'rounded-lg border px-3 py-1.5 text-sm font-medium',
              entrySource === 'restaurant'
                ? 'border-brand-green bg-brand-green text-brand-white'
                : 'border-neutral-300 text-brand-black hover:bg-neutral-100',
            ]"
            @click="setEntrySource('restaurant')"
          >
            רשתות מזון
          </button>
        </div>
      </div>

      <template v-if="entrySource === 'regular'">
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
      </template>

      <template v-else>
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">רשת</span>
          <select
            v-model="selectedChain"
            required
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          >
            <option value="" disabled>בחר רשת</option>
            <option v-for="chain in restaurantFoodItemsStore.chains" :key="chain" :value="chain">
              {{ chain }}
            </option>
          </select>
        </label>

        <template v-if="selectedChain">
          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">חיפוש פריט בתפריט</span>
            <input
              v-model="restaurantSearchTerm"
              type="text"
              placeholder="לדוגמה: קפוצ'ינו, כריך..."
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            />
          </label>

          <ul class="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-neutral-300 p-2">
            <li v-for="item in filteredRestaurantItems" :key="item.id">
              <button
                type="button"
                :class="[
                  'w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-neutral-100',
                  selectedRestaurantItemId === item.id ? 'bg-brand-green/10 font-medium text-brand-black' : '',
                ]"
                @click="selectedRestaurantItemId = item.id"
              >
                {{ item.item_name }}
                <span class="text-neutral-600">· {{ item.serving_description }}</span>
                <span class="block text-neutral-600">
                  {{ item.calories_per_serving }} קק"ל
                  <template v-if="item.protein_per_serving !== null"> · {{ item.protein_per_serving }} ג' חלבון</template>
                  <template v-else> · חלבון לא ידוע</template>
                </span>
              </button>
            </li>
            <li v-if="filteredRestaurantItems.length === 0" class="px-2 py-1.5 text-sm text-neutral-600">
              לא נמצאו פריטים
            </li>
          </ul>

          <label v-if="selectedRestaurantItem" class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">כמות מנות</span>
            <input
              v-model="entryServings"
              type="number"
              step="0.5"
              min="0.5"
              required
              dir="ltr"
              class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
            />
          </label>

          <p v-if="selectedRestaurantItem" class="text-sm text-neutral-600">
            סה"כ: <span class="font-semibold text-brand-black">{{ restaurantPreviewCalories }} קק"ל</span>
            <template v-if="restaurantPreviewProtein !== null">
              &middot; <span class="font-semibold text-brand-black">{{ restaurantPreviewProtein }} ג'</span> חלבון
            </template>
            <template v-else> &middot; חלבון לא ידוע</template>
          </p>
        </template>
      </template>

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
