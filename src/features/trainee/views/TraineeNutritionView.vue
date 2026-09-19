<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import TraineeLayout from '../layouts/TraineeLayout.vue'
import ExternalChainLink from '../../nutrition/components/ExternalChainLink.vue'
import { externalChainLinks } from '../../nutrition/config/externalChainLinks'
import { useTraineeNutritionStore } from '../store/traineeNutrition'
import TraineeNutritionPlanSection from '../components/TraineeNutritionPlanSection.vue'
import BarcodeFoodEntry from '../../nutrition/components/BarcodeFoodEntry.vue'
import { useFoodsStore } from '../../nutrition/store/foods'
import { useFoodReferenceCatalogStore } from '../../nutrition/store/foodReferenceCatalog'
import { useRestaurantFoodItemsStore } from '../../nutrition/store/restaurantFoodItems'
import { formatNutritionAmount } from '../../../lib/formatNumber'
import { startRetentionClock, stopRetentionClock } from '../../nutrition/lib/nutritionRetentionClock'
import { israelCalendarDate } from '../../nutrition/lib/nutritionLogRetention.js'
import { entryDisplayName, entryQuantityLabel } from '../../nutrition/lib/entryDisplay.js'
import {
  stateAfterStartBarcodeEntry,
  stateAfterBarcodeLogSaved,
  stateAfterScanAnother,
  stateAfterFinishBarcodeEntry,
  stateAfterBarcodeCancel,
} from '../../nutrition/lib/barcodeLogPostSaveFlow.js'

// Trainee-side nutrition: own history + logging a new entry. Reads/writes
// go exclusively through useTraineeNutritionStore (RLS-scoped SELECT +
// trainee_log_nutrition_entry()/trainee_delete_nutrition_entry(),
// 022_trainee_nutrition_access.sql, extended for barcode support by
// 047_trainee_barcode_nutrition_logging.sql). foodsStore / foodReferenceCatalogStore /
// restaurantFoodItemsStore are the EXACT SAME stores the coach's
// NutritionSection.vue uses -- reused unchanged, read-only (fetchAll/
// ensureLoaded/search/ensureItemsLoaded + the `active` getter), never
// create/update/archive. RLS alone is what narrows what each of them
// returns to the caller -- nothing coach-specific is duplicated here, and
// nothing here can change coach behavior.
//
// Barcode entry reuses BarcodeFoodEntry.vue (the coach's own scan/Open
// Food Facts/manual-entry component) UNCHANGED except for one prop:
// :enable-coach-cache="false" -- coach_barcode_products' RLS is
// coach_id = auth.uid() only (046_coach_barcode_products.sql), so a
// trainee's own auth.uid() could never satisfy it; that prop makes the
// component skip the whole "approve once, remember" cache path entirely
// rather than let it fail against RLS (see BarcodeFoodEntry.vue's own
// comment on the prop). The post-save "stay open, scan another" state
// machine (barcodeLogPostSaveFlow.js) is reused verbatim from the
// coach's NutritionSection.vue -- it is already fully generic, not
// coach-specific in any way.
const NAME_SEARCH_DEBOUNCE_MS = 300
const NAME_SEARCH_MIN_LENGTH = 2

const nutritionStore = useTraineeNutritionStore()
const foodsStore = useFoodsStore()
const referenceCatalogStore = useFoodReferenceCatalogStore()
const restaurantStore = useRestaurantFoodItemsStore()

const checking = ref(true)
const loadError = ref('')

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

const selectedDate = ref(todayIsoDate())

// Keeps the shared retentionCutoff (nutritionRetentionClock.js, the exact
// same module the coach's NutritionSection.vue uses) current for as long
// as this view is mounted -- a periodic re-check plus an immediate one on
// tab focus/visibility restoration (e.g. the trainee's phone waking from
// sleep) -- so useTraineeNutritionStore's getters (forDate/dailyTotalFor/
// etc., all reactive on that same ref) stop showing/counting an
// already-fetched entry once it ages out of the 7-day retention window,
// without needing a fresh fetch. Started in onMounted, stopped in
// onUnmounted.
onMounted(() => {
  startRetentionClock()
})
onUnmounted(() => {
  stopRetentionClock()
})

onMounted(async () => {
  try {
    await Promise.all([
      nutritionStore.fetchAll(),
      foodsStore.ensureLoaded(),
      restaurantStore.ensureChainsLoaded(),
    ])
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

const entriesForDate = computed(() => nutritionStore.forDate(selectedDate.value))
const dailyTotal = computed(() => nutritionStore.dailyTotalFor(selectedDate.value))
const dailyProteinTotal = computed(() => nutritionStore.dailyProteinTotalFor(selectedDate.value))
const dailyProteinUnknown = computed(() => nutritionStore.dailyProteinUnknownFor(selectedDate.value))

// ---- Barcode entry -- mirrors NutritionSection.vue's (the coach's)
// barcode wiring exactly, reusing the same BarcodeFoodEntry.vue
// component and the same barcodeLogPostSaveFlow.js state machine, only
// the persistence call differs (nutritionStore.addBarcodeEntry(), the
// trainee's own RPC-backed write path, vs. the coach's direct insert).
const showBarcodeEntry = ref(false)
// True only right after a successful barcode log save -- swaps the
// block, IN PLACE, to a small success panel with explicit "scan
// another" / "done" actions instead of collapsing back to the header
// buttons (see barcodeLogPostSaveFlow.js).
const barcodeJustSaved = ref(false)
const barcodeSaveError = ref('')

function applyBarcodeFlowState(state) {
  showBarcodeEntry.value = state.showBarcodeEntry
  barcodeJustSaved.value = state.barcodeJustSaved
}

function startBarcodeEntry() {
  barcodeSaveError.value = ''
  applyBarcodeFlowState(stateAfterStartBarcodeEntry())
}

async function handleBarcodeResolved(resolved) {
  barcodeSaveError.value = ''
  try {
    await nutritionStore.addBarcodeEntry(resolved, israelCalendarDate())
    selectedDate.value = israelCalendarDate()
    // Stays open, showing the success panel -- never collapses back to
    // the header buttons on its own (the exact fix for "must press
    // Back to scan another barcode" on the coach side, reused here
    // verbatim).
    applyBarcodeFlowState(stateAfterBarcodeLogSaved())
  } catch (err) {
    barcodeSaveError.value = nutritionStore.addError ?? err.message
  }
}

function scanAnotherBarcode() {
  applyBarcodeFlowState(stateAfterScanAnother())
}

function finishBarcodeEntry() {
  applyBarcodeFlowState(stateAfterFinishBarcodeEntry())
}

function handleBarcodeCancel() {
  applyBarcodeFlowState(stateAfterBarcodeCancel())
}

// ---- Add entry form ----
const showAddEntry = ref(false)
// 'coach' = trainee's own coach's active foods (grams). 'reference' =
// shared food_reference_catalog (grams). 'restaurant' = restaurant_food_items
// (servings). No "custom food" option -- a trainee can never type a name
// or a calorie/protein number; the server only ever accepts an existing
// catalog id (see trainee_log_nutrition_entry()).
const entrySource = ref('coach')

const foodSearchTerm = ref('')
const entryFoodId = ref('')
const entryGrams = ref('')
const entryDate = ref(selectedDate.value)

const referenceSearchTerm = ref('')
const referenceResults = ref([])
const referenceSearched = ref(false)
const selectedReference = ref(null)
let referenceSearchTimer = null

const selectedChain = ref('')
const restaurantSearchTerm = ref('')
const selectedRestaurantItemId = ref('')
const entryServings = ref('1')

const validationError = ref('')
const successMessage = ref('')

watch(showAddEntry, (open) => {
  if (open) {
    successMessage.value = ''
    entryDate.value = selectedDate.value
  }
})

// foodsStore.active already excludes archived rows -- a trainee can never
// pick an archived food for a NEW entry (history still shows archived
// foods correctly via the food:foods(name) join, untouched by this
// filter).
const coachFoods = computed(() => {
  const term = foodSearchTerm.value.trim()
  const list = foodsStore.active
  if (!term) return list
  return list.filter((f) => f.name.includes(term))
})

function proteinLabel(proteinPer100g) {
  return proteinPer100g === null ? 'חלבון לא ידוע' : `${proteinPer100g} ג' חלבון ל-100 גרם`
}

watch(referenceSearchTerm, (term) => {
  clearTimeout(referenceSearchTimer)
  selectedReference.value = null
  const trimmed = term.trim()
  if (trimmed.length < NAME_SEARCH_MIN_LENGTH) {
    referenceResults.value = []
    referenceSearched.value = false
    return
  }
  referenceSearchTimer = setTimeout(async () => {
    try {
      referenceResults.value = await referenceCatalogStore.search(trimmed)
    } catch {
      referenceResults.value = []
    } finally {
      referenceSearched.value = true
    }
  }, NAME_SEARCH_DEBOUNCE_MS)
})

function pickReference(item) {
  selectedReference.value = item
  referenceResults.value = []
}

watch(selectedChain, async (chain) => {
  selectedRestaurantItemId.value = ''
  restaurantSearchTerm.value = ''
  if (!chain) return
  try {
    await restaurantStore.ensureItemsLoaded(chain)
  } catch {
    // surfaced via validationError on submit if the selection can't complete
  }
})

const filteredRestaurantItems = computed(() => {
  const items = restaurantStore.itemsFor(selectedChain.value)
  const term = restaurantSearchTerm.value.trim()
  if (!term) return items
  return items.filter(
    (item) => item.item_name.includes(term) || item.serving_description.includes(term),
  )
})

const selectedRestaurantItem = computed(
  () =>
    restaurantStore
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
  if (!selectedRestaurantItem.value || selectedRestaurantItem.value.protein_per_serving === null) {
    return null
  }
  const servings = Number(entryServings.value)
  if (!Number.isFinite(servings)) return null
  return Math.round(selectedRestaurantItem.value.protein_per_serving * servings * 10) / 10
})

function setEntrySource(source) {
  if (entrySource.value === source) return
  entrySource.value = source
  validationError.value = ''
  entryFoodId.value = ''
  foodSearchTerm.value = ''
  entryGrams.value = ''
  referenceSearchTerm.value = ''
  referenceResults.value = []
  referenceSearched.value = false
  selectedReference.value = null
  selectedChain.value = ''
  restaurantSearchTerm.value = ''
  selectedRestaurantItemId.value = ''
  entryServings.value = '1'
}

function resetForm() {
  setEntrySource('coach')
  entryDate.value = selectedDate.value
}

async function handleAddEntry() {
  validationError.value = ''
  successMessage.value = ''

  if (!entryDate.value) {
    validationError.value = 'יש לבחור תאריך.'
    return
  }

  const payload = { loggedAt: entryDate.value }

  if (entrySource.value === 'restaurant') {
    if (!selectedRestaurantItemId.value) {
      validationError.value = 'יש לבחור פריט מהתפריט.'
      return
    }
    const servings = Number(entryServings.value)
    if (!entryServings.value || !Number.isFinite(servings) || servings <= 0) {
      validationError.value = 'יש להזין כמות מנות תקינה (מספר חיובי).'
      return
    }
    payload.restaurantFoodItemId = selectedRestaurantItemId.value
    payload.servings = servings
  } else {
    const grams = Number(entryGrams.value)
    if (!entryGrams.value || !Number.isFinite(grams) || grams <= 0) {
      validationError.value = 'יש להזין כמות גרמים תקינה (מספר חיובי).'
      return
    }
    if (entrySource.value === 'reference') {
      if (!selectedReference.value) {
        validationError.value = 'יש לבחור מאכל מהמאגר.'
        return
      }
      payload.referenceFoodId = selectedReference.value.id
    } else {
      if (!entryFoodId.value) {
        validationError.value = 'יש לבחור מאכל.'
        return
      }
      payload.foodId = entryFoodId.value
    }
    payload.grams = grams
  }

  try {
    await nutritionStore.addEntry(payload)
    successMessage.value = 'הרישום נוסף בהצלחה.'
    selectedDate.value = payload.loggedAt
    resetForm()
    showAddEntry.value = false
  } catch {
    // surfaced via nutritionStore.addError below; form stays open for retry
  }
}

// ---- Delete ----
const confirmingDeleteId = ref(null)

function requestDelete(logId) {
  confirmingDeleteId.value = logId
}
function cancelDelete() {
  confirmingDeleteId.value = null
}
async function confirmDelete(logId) {
  try {
    await nutritionStore.deleteEntry(logId)
    confirmingDeleteId.value = null
  } catch {
    // surfaced via nutritionStore.deleteError below; stays on confirm step
  }
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">התזונה שלי</h1>
        <p class="mt-1 text-sm text-neutral-600">יומן התזונה היומי שלך</p>
      </section>

      <p v-if="checking" class="text-neutral-600">טוען...</p>

      <div v-else-if="loadError" class="flex flex-col items-start gap-3 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm">
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
        <TraineeNutritionPlanSection />

        <section class="mb-6 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">תאריך</span>
              <input
                v-model="selectedDate"
                type="date"
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>
            <div v-if="!showAddEntry && !showBarcodeEntry" class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
                @click="showAddEntry = true"
              >
                הוסף מאכל
              </button>
              <button
                type="button"
                class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
                @click="startBarcodeEntry"
              >
                סרוק ברקוד
              </button>
            </div>
          </div>

          <div v-if="showBarcodeEntry" class="flex flex-col gap-2">
            <!-- Shown IN PLACE of the form right after a successful save
            -- same DOM position, no scroll jump. Mirrors
            NutritionSection.vue's (the coach's) identical success-panel
            pattern. -->
            <div
              v-if="barcodeJustSaved"
              class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-green/40 bg-brand-green/5 p-4"
            >
              <p class="text-sm text-brand-black">✅ נשמר ביומן התזונה.</p>
              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
                  @click="scanAnotherBarcode"
                >
                  סרוק ברקוד נוסף
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
                  @click="finishBarcodeEntry"
                >
                  סיום
                </button>
              </div>
            </div>
            <template v-else>
              <BarcodeFoodEntry
                :enable-coach-cache="false"
                @resolved="handleBarcodeResolved"
                @cancel="handleBarcodeCancel"
              />
              <p v-if="nutritionStore.adding" class="text-sm text-neutral-600">שומר ביומן התזונה...</p>
              <p v-if="barcodeSaveError" class="text-sm text-status-red">{{ barcodeSaveError }}</p>
            </template>
          </div>

          <!-- Two color-coded stat pairs instead of a middot-joined line --
               calories and protein each keep one consistent color
               app-wide (see style.css's Tempo rollout notes). No ring
               here: unlike the design preview, the real trainee schema
               has no daily calorie/protein GOAL value to measure against
               (only starting/target *weight* exist), and inventing one
               would mean fabricating data this view has no business
               showing -- so this stays a plain, honest total display. -->
          <div class="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span class="inline-flex items-baseline gap-1.5">
              <span class="ec-num text-2xl" style="color: var(--color-brand-green)">{{ formatNutritionAmount(dailyTotal) }}</span>
              <span class="text-sm text-neutral-600">קק"ל</span>
            </span>
            <span class="inline-flex items-baseline gap-1.5">
              <span class="ec-num text-2xl" style="color: var(--ec-violet)">{{ formatNutritionAmount(dailyProteinTotal) }}</span>
              <span class="text-sm text-neutral-600">גר' חלבון</span>
            </span>
            <span v-if="dailyProteinUnknown" class="text-xs text-neutral-500">(לא כולל פריט/ים עם חלבון לא ידוע)</span>
          </div>

          <p v-if="successMessage" class="text-sm text-brand-green">{{ successMessage }}</p>
        </section>

        <!-- Inline add-entry form, in its original place in the page flow
             (not an overlay) -- only a restrained fade/slide-in on open
             (.ec-panel*, style.css) was added on top of the original
             structure. Every field/handler below is the same,
             unchanged logic already in this file. -->
        <Transition name="ec-panel">
          <form
            v-if="showAddEntry"
            class="mb-6 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
            @submit.prevent="handleAddEntry"
          >
          <div class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">מקור המאכל</span>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                :class="[
                  'inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium',
                  entrySource === 'coach'
                    ? 'border-brand-green bg-brand-green text-brand-white'
                    : 'border-neutral-300 text-brand-black hover:bg-neutral-100',
                ]"
                @click="setEntrySource('coach')"
              >
                המאכלים של המאמן/ת
              </button>
              <button
                type="button"
                :class="[
                  'inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium',
                  entrySource === 'reference'
                    ? 'border-brand-green bg-brand-green text-brand-white'
                    : 'border-neutral-300 text-brand-black hover:bg-neutral-100',
                ]"
                @click="setEntrySource('reference')"
              >
                מאגר מאכלים
              </button>
              <button
                type="button"
                :class="[
                  'inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium',
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

          <!-- Coach's own foods -->
          <template v-if="entrySource === 'coach'">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">חיפוש מאכל</span>
              <input
                v-model="foodSearchTerm"
                type="text"
                placeholder="לדוגמה: חזה עוף, אורז..."
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>

            <div
              role="listbox"
              aria-label="בחירת מאכל"
              class="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-neutral-300 p-2"
            >
              <button
                v-for="food in coachFoods"
                :key="food.id"
                type="button"
                role="option"
                :aria-selected="entryFoodId === food.id"
                :class="[
                  'w-full rounded-md border-s-4 border-transparent px-2 py-3 text-start text-sm hover:bg-neutral-100',
                  entryFoodId === food.id ? 'border-brand-green bg-brand-green/10 font-medium text-brand-black' : '',
                ]"
                @click="entryFoodId = food.id"
              >
                {{ food.name }} ({{ food.calories_per_100g }} קק"ל, {{ proteinLabel(food.protein_per_100g) }})
              </button>
              <p v-if="coachFoods.length === 0" class="px-2 py-1.5 text-sm text-neutral-600">
                לא נמצאו מאכלים תואמים
              </p>
            </div>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">כמות (גרם)</span>
              <input
                v-model="entryGrams"
                type="number"
                step="0.1"
                min="0.1"
                dir="ltr"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
              />
            </label>
          </template>

          <!-- Shared reference catalog -->
          <template v-else-if="entrySource === 'reference'">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">חיפוש במאגר המאכלים</span>
              <input
                v-model="referenceSearchTerm"
                type="text"
                placeholder="לדוגמה: תפוח, אורז לבן מבושל..."
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>

            <p v-if="selectedReference" class="rounded-lg bg-brand-green/10 px-3 py-2 text-sm text-brand-black">
              נבחר: {{ selectedReference.name }} ({{ selectedReference.calories_per_100g }} קק"ל,
              {{ selectedReference.protein_per_100g }} ג' חלבון ל-100 גרם)
            </p>

            <ul
              v-if="referenceResults.length > 0"
              class="flex flex-col gap-1 rounded-lg border border-neutral-300 p-2"
            >
              <li v-for="item in referenceResults" :key="item.id">
                <button
                  type="button"
                  class="w-full rounded-md px-2 py-3 text-start text-sm hover:bg-neutral-100"
                  @click="pickReference(item)"
                >
                  {{ item.name }}
                  <span class="text-neutral-600">
                    ({{ item.calories_per_100g }} קק"ל, {{ item.protein_per_100g }} ג' חלבון ל-100 גרם)
                  </span>
                </button>
              </li>
            </ul>
            <p
              v-else-if="referenceSearched && !selectedReference"
              class="text-sm text-neutral-600"
            >
              לא נמצאו תוצאות במאגר.
            </p>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">כמות (גרם)</span>
              <input
                v-model="entryGrams"
                type="number"
                step="0.1"
                min="0.1"
                dir="ltr"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
              />
            </label>
          </template>

          <!-- Restaurant / chain items -->
          <template v-else>
            <div class="flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3">
              <p class="text-sm font-medium text-brand-black">קישורים רשמיים לתפריטי רשתות</p>
              <ExternalChainLink v-for="link in externalChainLinks" :key="link.chainName" :link="link" />
            </div>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">רשת</span>
              <select
                v-model="selectedChain"
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              >
                <option value="" disabled>בחר/י רשת</option>
                <option v-for="chain in restaurantStore.chains" :key="chain" :value="chain">
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
                      'w-full rounded-md border-s-4 border-transparent px-2 py-3 text-start text-sm hover:bg-neutral-100',
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
                  step="0.5"
                  min="0.5"
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

          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">תאריך</span>
            <input
              v-model="entryDate"
              type="date"
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            />
          </label>

          <p v-if="validationError" class="text-sm text-status-red">{{ validationError }}</p>
          <p v-if="nutritionStore.addError" class="text-sm text-status-red">{{ nutritionStore.addError }}</p>

          <div class="flex flex-wrap gap-3">
            <button
              type="submit"
              :disabled="nutritionStore.adding"
              class="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ nutritionStore.adding ? 'שומר...' : 'שמור' }}
            </button>
            <button
              type="button"
              :disabled="nutritionStore.adding"
              class="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
              @click="showAddEntry = false; resetForm()"
            >
              ביטול
            </button>
          </div>
          </form>
        </Transition>

        <section class="rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
          <h2 class="mb-3 font-semibold text-brand-black">{{ dateFormatter.format(new Date(selectedDate)) }}</h2>

          <p v-if="nutritionStore.deleteError" class="mb-3 text-sm text-status-red">
            {{ nutritionStore.deleteError }}
          </p>

          <p v-if="entriesForDate.length === 0" class="text-sm text-neutral-600">
            אין עדיין רישומי תזונה לתאריך זה.
          </p>

          <ul v-else class="flex flex-col gap-3">
            <li
              v-for="log in entriesForDate"
              :key="log.id"
              class="flex items-center justify-between gap-4 border-t border-neutral-300 pt-3 first:border-t-0 first:pt-0"
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

              <div v-if="confirmingDeleteId !== log.id" class="shrink-0">
                <button
                  type="button"
                  class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-status-red hover:bg-status-red/5"
                  @click="requestDelete(log.id)"
                >
                  מחק
                </button>
              </div>
              <div v-else class="flex shrink-0 flex-col items-end gap-2">
                <div class="flex gap-2">
                  <button
                    type="button"
                    :disabled="nutritionStore.deletingId === log.id"
                    class="rounded-lg bg-status-red px-3 py-1.5 text-sm font-medium text-brand-white hover:bg-status-red/90 disabled:cursor-not-allowed disabled:opacity-60"
                    @click="confirmDelete(log.id)"
                  >
                    {{ nutritionStore.deletingId === log.id ? 'מוחק...' : 'כן, מחק' }}
                  </button>
                  <button
                    type="button"
                    :disabled="nutritionStore.deletingId === log.id"
                    class="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                    @click="cancelDelete"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </TraineeLayout>
</template>
