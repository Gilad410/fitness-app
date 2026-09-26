<script setup>
import { computed, ref, watch } from 'vue'
import { useFoodsStore } from '../store/foods'
import { useFoodReferenceCatalogStore } from '../store/foodReferenceCatalog'
import { useRestaurantFoodItemsStore } from '../store/restaurantFoodItems'
import ExternalChainLink from './ExternalChainLink.vue'
import { externalChainLinks } from '../config/externalChainLinks'

// Shared food-source + quantity picker -- the exact selection UI/logic
// NutritionSection.vue's "add entry" form always had, extracted so the
// coach's nutrition-PLAN builder (NutritionPlanSection.vue) can reuse the
// identical food sources, units, and creation flow rather than
// duplicating (and risking drifting from) them. This component owns
// selection/validation/food-creation only -- it never itself writes a
// log or plan-item row; the caller (NutritionSection.vue for the log,
// NutritionPlanSection.vue for a plan meal item) calls resolve() to get
// back a plain { foodId, grams } or { restaurantFoodItemId, servings }
// payload and passes THAT to whichever store actually persists it
// (nutritionLogsStore.addLog() / nutritionPlansStore.addMealItem()) --
// both of which end up computing calories/protein through the exact same
// server-side path (compute_nutrition_amounts(),
// 037_nutrition_plan_meals_and_items.sql) regardless of which caller is
// using this component. Nothing about food sources, units, or
// calculation is reimplemented here or by either caller.
const foodsStore = useFoodsStore()
const foodReferenceCatalogStore = useFoodReferenceCatalogStore()
const restaurantFoodItemsStore = useRestaurantFoodItemsStore()

const NEW_FOOD_VALUE = '__new__'
const NAME_SEARCH_DEBOUNCE_MS = 300
const NAME_SEARCH_MIN_LENGTH = 2

// 'regular' = the coach's own foods catalog (grams-based) plus "add a new
// food" (optionally autofilled from the shared reference catalog).
// 'restaurant' = restaurant_food_items (fixed serving, servings-based,
// never grams). Same two sources/units the existing food log has always
// offered -- nothing new introduced here.
const entrySource = ref('regular')

const entryFoodId = ref('')
const newFoodName = ref('')
const newFoodCalories = ref('')
const newFoodProtein = ref('')
const entryGrams = ref('')

// Inline remove-confirmation state for the food picker: removingFoodId is
// the row currently showing its "כן, הסר / ביטול" prompt (at most one at
// a time); archivingFoodId is set only while that removal is in flight.
const removingFoodId = ref(null)
const archivingFoodId = ref(null)
const removeFoodError = ref('')

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

function requestRemoveFood(food) {
  removeFoodError.value = ''
  removingFoodId.value = food.id
}

function cancelRemoveFood() {
  removingFoodId.value = null
}

async function confirmRemoveFood(food) {
  removeFoodError.value = ''
  archivingFoodId.value = food.id
  try {
    await foodsStore.archive(food.id)
    if (entryFoodId.value === food.id) {
      entryFoodId.value = ''
    }
  } catch (err) {
    removeFoodError.value = err.message
  } finally {
    archivingFoodId.value = null
    removingFoodId.value = null
  }
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
    // surfaced to the caller via resolve() throwing on submit if the
    // selection can't complete
  }
})

const foods = computed(() => foodsStore.active)

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

function proteinLabel(proteinPer100g) {
  return proteinPer100g === null ? 'חלבון לא ידוע' : `${proteinPer100g} ג' חלבון ל-100 גרם`
}

function reset() {
  entrySource.value = 'regular'
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

// Resolves the current selection into a plain { food_id, grams } or
// { restaurant_food_item_id, servings } payload -- snake_case, matching
// nutritionLogsStore.addLog()'s existing payload shape exactly (its keys
// ARE the trainee_nutrition_logs column names, spread directly into the
// insert with no translation) -- so a caller (NutritionSection.vue for
// the log, NutritionPlanSection.vue for a plan meal item) can spread
// this result straight into whichever store call it needs with zero key
// mapping either way. Creates (or reviving a previously-archived) `foods`
// row first if "+ הוסף מאכל חדש" was picked, exactly as
// NutritionSection.vue's own handleAddEntry always has. Throws (never
// returns null) on an incomplete/invalid selection, same convention as
// the log form's own validation -- callers catch and show err.message.
async function resolve() {
  if (entrySource.value === 'restaurant') {
    if (!selectedRestaurantItemId.value) {
      throw new Error('יש לבחור פריט מהתפריט')
    }
    return {
      restaurant_food_item_id: selectedRestaurantItemId.value,
      servings: Number(entryServings.value),
    }
  }

  if (!entryFoodId.value) {
    throw new Error('יש לבחור מאכל')
  }

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
          // Recreating a food the coach previously removed brings it
          // back into the picker instead of leaving it stuck hidden.
          archived_at: null,
        })
      : await foodsStore.create({
          name,
          calories_per_100g: caloriesPer100g,
          protein_per_100g: proteinPer100g,
        })
    foodId = food.id
  }

  return { food_id: foodId, grams: Number(entryGrams.value) }
}

defineExpose({ resolve, reset })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <span class="text-sm text-neutral-600">מקור המאכל</span>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          :aria-pressed="entrySource === 'regular' ? 'true' : 'false'"
          :class="[
            'rounded-lg border px-3 py-1.5 text-sm font-medium',
            entrySource === 'regular'
              ? 'border-brand-green bg-brand-green text-brand-black'
              : 'border-neutral-300 text-brand-black hover:bg-neutral-100',
          ]"
          @click="setEntrySource('regular')"
        >
          מאכלים
        </button>
        <button
          type="button"
          :aria-pressed="entrySource === 'restaurant' ? 'true' : 'false'"
          :class="[
            'rounded-lg border px-3 py-1.5 text-sm font-medium',
            entrySource === 'restaurant'
              ? 'border-brand-green bg-brand-green text-brand-black'
              : 'border-neutral-300 text-brand-black hover:bg-neutral-100',
          ]"
          @click="setEntrySource('restaurant')"
        >
          רשתות מזון
        </button>
      </div>
    </div>

    <template v-if="entrySource === 'regular'">
      <div class="flex flex-col gap-1">
        <span id="food-picker-label" class="text-sm text-neutral-600">מאכל</span>
        <div
          role="listbox"
          aria-labelledby="food-picker-label"
          class="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-neutral-300 p-2"
        >
          <div v-for="food in foods" :key="food.id">
            <div v-if="removingFoodId !== food.id" class="flex items-center gap-1">
              <button
                type="button"
                role="option"
                :aria-selected="entryFoodId === food.id"
                :class="[
                  'flex-1 rounded-md border-s-4 border-transparent px-2 py-3 text-start text-sm hover:bg-neutral-100',
                  entryFoodId === food.id ? 'border-brand-green bg-brand-green/10 font-medium text-brand-black' : '',
                ]"
                @click="entryFoodId = food.id"
              >
                {{ food.name }} ({{ food.calories_per_100g }} קק"ל, {{ proteinLabel(food.protein_per_100g) }})
              </button>
              <button
                type="button"
                :aria-label="`הסר את ${food.name} מרשימת הבחירה`"
                class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-sm text-neutral-600 hover:bg-status-red/10 hover:text-status-red"
                @click="requestRemoveFood(food)"
              >
                ✕
              </button>
            </div>
            <div v-else class="flex flex-wrap items-center gap-2 rounded-md bg-neutral-100 px-2 py-1.5 text-sm">
              <span class="text-brand-black">להסיר את "{{ food.name }}" מרשימת הבחירה?</span>
              <button
                type="button"
                :disabled="archivingFoodId === food.id"
                class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-status-red px-2 py-1 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                @click="confirmRemoveFood(food)"
              >
                {{ archivingFoodId === food.id ? 'מסיר...' : 'כן, הסר' }}
              </button>
              <button
                type="button"
                :disabled="archivingFoodId === food.id"
                class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                @click="cancelRemoveFood"
              >
                ביטול
              </button>
            </div>
          </div>

          <p v-if="foods.length === 0" class="px-2 py-1.5 text-sm text-neutral-600">
            אין עדיין מאכלים שמורים
          </p>

          <button
            type="button"
            role="option"
            :aria-selected="entryFoodId === NEW_FOOD_VALUE"
            :class="[
              'w-full rounded-md border-s-4 border-transparent px-2 py-1.5 text-start text-sm font-medium hover:bg-neutral-100',
              entryFoodId === NEW_FOOD_VALUE ? 'border-brand-green bg-brand-green/10 text-brand-black' : 'text-brand-green-dark',
            ]"
            @click="entryFoodId = NEW_FOOD_VALUE"
          >
            + הוסף מאכל חדש
          </button>
        </div>
        <p v-if="removeFoodError" role="alert" class="text-sm text-status-red">{{ removeFoodError }}</p>
      </div>

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
              class="w-full rounded-md px-2 py-3 text-start text-sm hover:bg-neutral-100"
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
            inputmode="decimal"
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
            inputmode="decimal"
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
          inputmode="decimal"
          step="0.1"
          min="0.1"
          required
          dir="ltr"
          class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
        />
      </label>
    </template>

    <template v-else>
      <div class="flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3">
        <p class="text-sm font-medium text-brand-black">קישורים רשמיים לתפריטי רשתות</p>
        <ExternalChainLink v-for="link in externalChainLinks" :key="link.chainName" :link="link" />
      </div>

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
                'w-full rounded-md border-s-4 border-transparent px-2 py-1.5 text-start text-sm hover:bg-neutral-100',
                selectedRestaurantItemId === item.id ? 'border-brand-green bg-brand-green/10 font-medium text-brand-black' : '',
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
            inputmode="decimal"
            step="0.5"
            min="0.5"
            required
            dir="ltr"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
          />
        </label>

        <p v-if="selectedRestaurantItem" class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="text-sm text-neutral-600">סה"כ:</span>
          <span class="ec-num text-sm" style="color: var(--color-brand-green)">{{ restaurantPreviewCalories }} קק"ל</span>
          <span v-if="restaurantPreviewProtein !== null" class="ec-num text-sm" style="color: var(--ec-violet)">
            {{ restaurantPreviewProtein }} ג' חלבון
          </span>
          <span v-else class="text-xs text-neutral-500">חלבון לא ידוע</span>
        </p>
      </template>
    </template>
  </div>
</template>
