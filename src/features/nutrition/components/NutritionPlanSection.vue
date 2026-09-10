<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useNutritionPlansStore } from '../store/nutritionPlans'
import { useFoodsStore } from '../store/foods'
import { useRestaurantFoodItemsStore } from '../store/restaurantFoodItems'
import FoodQuantityPicker from './FoodQuantityPicker.vue'
import { entryDisplayName, entryQuantityLabel } from '../lib/entryDisplay'
import { mealTotals, planTotals } from '../lib/planTotals'
import { formatNutritionAmount } from '../../../lib/formatNumber'

const props = defineProps({
  traineeId: { type: String, required: true },
})

const plansStore = useNutritionPlansStore()
// FoodQuantityPicker.vue needs these two stores loaded (the same sources
// the existing food log uses) before a coach can add a meal item -- same
// Promise.all shape NutritionSection.vue's own onMounted already uses.
const foodsStore = useFoodsStore()
const restaurantFoodItemsStore = useRestaurantFoodItemsStore()

const checking = ref(true)
const loadError = ref('')

onMounted(async () => {
  try {
    await Promise.all([
      plansStore.ensureLoaded(props.traineeId),
      foodsStore.ensureLoaded(),
      restaurantFoodItemsStore.ensureChainsLoaded(),
    ])
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

const plan = computed(() => plansStore.planFor(props.traineeId))
const meals = computed(() => plan.value?.meals ?? [])

// mealTotals/planTotals -- shared with TraineeNutritionPlanSection.vue
// (src/features/nutrition/lib/planTotals.js), so the coach and trainee
// views can never disagree about what a plan/meal totals to.
const totalsForPlan = computed(() => planTotals(plan.value))

// ---- Create plan (shown only while none is assigned) ----
const showCreatePlan = ref(false)
const creatingPlan = ref(false)
const createPlanError = ref('')
const createForm = reactive({ title: '', notes: '' })

async function handleCreatePlan() {
  createPlanError.value = ''
  if (createForm.title.trim() === '') {
    createPlanError.value = 'יש להזין כותרת לתוכנית.'
    return
  }
  creatingPlan.value = true
  try {
    await plansStore.createPlan(props.traineeId, {
      title: createForm.title.trim(),
      notes: createForm.notes,
    })
    createForm.title = ''
    createForm.notes = ''
    showCreatePlan.value = false
  } catch (err) {
    createPlanError.value = err.message
  } finally {
    creatingPlan.value = false
  }
}

// ---- Edit plan title/notes ----
const editingPlan = ref(false)
const editPlanForm = reactive({ title: '', notes: '' })
const savingPlan = ref(false)
const editPlanError = ref('')

function startEditPlan() {
  editPlanError.value = ''
  editPlanForm.title = plan.value.title
  editPlanForm.notes = plan.value.notes ?? ''
  editingPlan.value = true
}

async function saveEditPlan() {
  editPlanError.value = ''
  if (editPlanForm.title.trim() === '') {
    editPlanError.value = 'יש להזין כותרת לתוכנית.'
    return
  }
  savingPlan.value = true
  try {
    await plansStore.updatePlan(props.traineeId, plan.value.id, {
      title: editPlanForm.title.trim(),
      notes: editPlanForm.notes.trim() === '' ? null : editPlanForm.notes.trim(),
    })
    editingPlan.value = false
  } catch (err) {
    editPlanError.value = err.message
  } finally {
    savingPlan.value = false
  }
}

// ---- Delete plan ----
const confirmDeletePlan = ref(false)
const deletingPlan = ref(false)
const deletePlanError = ref('')

async function handleDeletePlan() {
  deletePlanError.value = ''
  deletingPlan.value = true
  try {
    await plansStore.deletePlan(props.traineeId, plan.value.id)
    confirmDeletePlan.value = false
  } catch (err) {
    deletePlanError.value = err.message
  } finally {
    deletingPlan.value = false
  }
}

// ---- Meals: add/edit/delete/move ----
const showAddMeal = ref(false)
const addingMeal = ref(false)
const addMealError = ref('')
const addMealForm = reactive({ name: '', notes: '' })

async function handleAddMeal() {
  addMealError.value = ''
  if (addMealForm.name.trim() === '') {
    addMealError.value = 'יש להזין שם לארוחה.'
    return
  }
  addingMeal.value = true
  try {
    await plansStore.addMeal(props.traineeId, plan.value.id, {
      name: addMealForm.name.trim(),
      notes: addMealForm.notes,
    })
    addMealForm.name = ''
    addMealForm.notes = ''
    showAddMeal.value = false
  } catch (err) {
    addMealError.value = err.message
  } finally {
    addingMeal.value = false
  }
}

const editingMealId = ref(null)
const editMealForm = reactive({ name: '', notes: '' })
const savingMeal = ref(false)
const editMealError = ref('')

function startEditMeal(meal) {
  editMealError.value = ''
  editingMealId.value = meal.id
  editMealForm.name = meal.name
  editMealForm.notes = meal.notes ?? ''
}

function cancelEditMeal() {
  editingMealId.value = null
}

async function saveEditMeal(mealId) {
  editMealError.value = ''
  if (editMealForm.name.trim() === '') {
    editMealError.value = 'יש להזין שם לארוחה.'
    return
  }
  savingMeal.value = true
  try {
    await plansStore.updateMeal(props.traineeId, mealId, {
      name: editMealForm.name.trim(),
      notes: editMealForm.notes.trim() === '' ? null : editMealForm.notes.trim(),
    })
    editingMealId.value = null
  } catch (err) {
    editMealError.value = err.message
  } finally {
    savingMeal.value = false
  }
}

const confirmDeleteMealId = ref(null)
const deletingMealId = ref(null)
const deleteMealError = ref('')

async function confirmDeleteMeal(mealId) {
  deleteMealError.value = ''
  deletingMealId.value = mealId
  try {
    await plansStore.removeMeal(props.traineeId, mealId)
    confirmDeleteMealId.value = null
  } catch (err) {
    deleteMealError.value = err.message
  } finally {
    deletingMealId.value = null
  }
}

const movingMealId = ref(null)
const moveMealError = ref('')

async function moveMeal(mealId, direction) {
  moveMealError.value = ''
  movingMealId.value = mealId
  try {
    await plansStore.moveMeal(props.traineeId, mealId, direction)
  } catch (err) {
    moveMealError.value = err.message
  } finally {
    movingMealId.value = null
  }
}

// ---- Meal items: add/delete/move -- food source + quantity comes from
// the shared FoodQuantityPicker.vue, exactly like the food log's own
// "add entry" form. ----
const showAddItemForMealId = ref(null)
const addingItem = ref(false)
const addItemError = ref('')
const itemPickerRefs = reactive({})
function setItemPickerRef(mealId, el) {
  itemPickerRefs[mealId] = el
}

function openAddItem(mealId) {
  addItemError.value = ''
  showAddItemForMealId.value = mealId
}

function closeAddItem(mealId) {
  showAddItemForMealId.value = null
  itemPickerRefs[mealId]?.reset()
}

async function handleAddItem(mealId) {
  addItemError.value = ''
  addingItem.value = true
  try {
    const resolved = await itemPickerRefs[mealId].resolve()
    await plansStore.addMealItem(props.traineeId, mealId, resolved)
    closeAddItem(mealId)
  } catch (err) {
    addItemError.value = err.message
  } finally {
    addingItem.value = false
  }
}

const confirmDeleteItemId = ref(null)
const deletingItemId = ref(null)
const deleteItemError = ref('')

async function confirmDeleteItem(mealId, itemId) {
  deleteItemError.value = ''
  deletingItemId.value = itemId
  try {
    await plansStore.removeMealItem(props.traineeId, mealId, itemId)
    confirmDeleteItemId.value = null
  } catch (err) {
    deleteItemError.value = err.message
  } finally {
    deletingItemId.value = null
  }
}

const movingItemId = ref(null)
const moveItemError = ref('')

async function moveItem(mealId, itemId, direction) {
  moveItemError.value = ''
  movingItemId.value = itemId
  try {
    await plansStore.moveMealItem(props.traineeId, mealId, itemId, direction)
  } catch (err) {
    moveItemError.value = err.message
  } finally {
    movingItemId.value = null
  }
}

// ---- Meal items: edit quantity in place -- same grams/servings rules
// (step/min) as FoodQuantityPicker.vue's own inputs, but quantity-only:
// the food/restaurant-item source itself isn't editable here (changing
// the source is a different food entry, not an edit -- same distinction
// the picker's own "מקור המאכל" toggle draws). Persists through
// nutritionPlansStore.updateMealItem(), which recalculates calories/
// protein server-side through the exact same compute_nutrition_amounts()
// helper an add goes through (037_nutrition_plan_meals_and_items.sql) --
// never computed here.
const editingItemId = ref(null)
const editItemQuantity = ref('')
const savingItemId = ref(null)
const editItemError = ref('')

function startEditItem(item) {
  editItemError.value = ''
  editingItemId.value = item.id
  editItemQuantity.value = String(item.food_id ? item.grams : item.servings)
}

function cancelEditItem() {
  editingItemId.value = null
}

async function saveEditItem(mealId, item) {
  editItemError.value = ''
  const value = Number(editItemQuantity.value)
  if (!Number.isFinite(value) || value <= 0) {
    editItemError.value = item.food_id ? 'יש להזין כמות בגרמים גדולה מאפס.' : 'יש להזין כמות מנות גדולה מאפס.'
    return
  }
  savingItemId.value = item.id
  try {
    const patch = item.food_id ? { grams: value } : { servings: value }
    await plansStore.updateMealItem(props.traineeId, mealId, item.id, patch)
    editingItemId.value = null
  } catch (err) {
    editItemError.value = err.message
  } finally {
    savingItemId.value = null
  }
}
</script>

<template>
  <div class="mt-8 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
    <h2 class="font-semibold text-brand-black">תוכנית תזונה</h2>

    <p v-if="checking" class="text-sm text-neutral-600">טוען...</p>
    <p v-else-if="loadError" class="text-sm text-status-red">{{ loadError }}</p>

    <!-- No plan assigned yet -->
    <template v-else-if="!plan">
      <p class="text-sm text-neutral-600">טרם הוקצתה תוכנית תזונה למתאמן/ת זה/זו.</p>

      <form
        v-if="showCreatePlan"
        class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
        @submit.prevent="handleCreatePlan"
      >
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">כותרת התוכנית</span>
          <input
            v-model="createForm.title"
            type="text"
            placeholder="לדוגמה: תפריט שבועי בסיסי"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">הערות</span>
          <textarea
            v-model="createForm.notes"
            rows="2"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <p v-if="createPlanError" class="text-sm text-status-red">{{ createPlanError }}</p>

        <div class="flex flex-wrap gap-3">
          <button
            type="submit"
            :disabled="creatingPlan"
            class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
          >
            {{ creatingPlan ? 'שומר...' : 'שמירת תוכנית' }}
          </button>
          <button
            type="button"
            :disabled="creatingPlan"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
            @click="showCreatePlan = false; createForm.title = ''; createForm.notes = ''"
          >
            ביטול
          </button>
        </div>
      </form>

      <button
        v-else
        type="button"
        class="self-start rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white"
        @click="showCreatePlan = true"
      >
        צור תוכנית תזונה
      </button>
    </template>

    <!-- Plan exists -->
    <template v-else>
      <template v-if="editingPlan">
        <form class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4" @submit.prevent="saveEditPlan">
          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">כותרת התוכנית</span>
            <input
              v-model="editPlanForm.title"
              type="text"
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">הערות</span>
            <textarea
              v-model="editPlanForm.notes"
              rows="2"
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            />
          </label>

          <p v-if="editPlanError" class="text-sm text-status-red">{{ editPlanError }}</p>

          <div class="flex flex-wrap gap-3">
            <button
              type="submit"
              :disabled="savingPlan"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
            >
              {{ savingPlan ? 'שומר...' : 'שמירה' }}
            </button>
            <button
              type="button"
              :disabled="savingPlan"
              class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
              @click="editingPlan = false"
            >
              ביטול
            </button>
          </div>
        </form>
      </template>

      <template v-else>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-semibold text-brand-black">{{ plan.title }}</h3>
            <p v-if="plan.notes" class="mt-1 text-sm text-neutral-600">{{ plan.notes }}</p>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100"
              @click="startEditPlan"
            >
              ערוך תוכנית
            </button>

            <template v-if="confirmDeletePlan">
              <button
                type="button"
                :disabled="deletingPlan"
                class="rounded-lg bg-status-red px-3 py-1.5 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                @click="handleDeletePlan"
              >
                {{ deletingPlan ? 'מוחק...' : 'אישור מחיקה' }}
              </button>
              <button
                type="button"
                :disabled="deletingPlan"
                class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                @click="confirmDeletePlan = false"
              >
                ביטול
              </button>
            </template>
            <button
              v-else
              type="button"
              class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-status-red hover:bg-status-red/10"
              @click="confirmDeletePlan = true"
            >
              מחק תוכנית
            </button>
          </div>
        </div>
        <p v-if="deletePlanError" class="text-sm text-status-red">{{ deletePlanError }}</p>
      </template>

      <!-- Whole-plan totals -- summed across every meal, shared with the
           trainee's own read-only view (planTotals.js), so the two never
           disagree about the plan's overall numbers. -->
      <div class="rounded-xl border border-neutral-300 bg-neutral-50 p-4">
        <p class="text-sm text-neutral-600">
          סה"כ לתוכנית:
          <span class="font-semibold text-brand-black">{{ formatNutritionAmount(totalsForPlan.calories) }} קק"ל</span>
          &middot;
          <span class="font-semibold text-brand-black">{{ formatNutritionAmount(totalsForPlan.protein) }} גר'</span>
          חלבון
        </p>
        <p v-if="totalsForPlan.hasUnknownProtein" class="mt-1 text-sm text-neutral-600">
          (סכום החלבון אינו כולל פריט/ים עם חלבון לא ידוע)
        </p>
        <p v-if="totalsForPlan.hasLegacyMealsWithoutItems" class="mt-1 text-sm text-neutral-600">
          (התוכנית כוללת ארוחה/ות ללא פריטים מחושבים, שאינן נכללות בסה"כ)
        </p>
      </div>

      <!-- Meals -->
      <div class="border-t border-neutral-300 pt-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h4 class="text-sm font-semibold text-brand-black">ארוחות</h4>
          <button
            v-if="!showAddMeal"
            type="button"
            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100"
            @click="showAddMeal = true"
          >
            הוסף ארוחה
          </button>
        </div>

        <form
          v-if="showAddMeal"
          class="mb-4 flex flex-col gap-3 rounded-xl border border-neutral-300 p-4"
          @submit.prevent="handleAddMeal"
        >
          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">שם הארוחה</span>
            <input
              v-model="addMealForm.name"
              type="text"
              placeholder="לדוגמה: ארוחת בוקר"
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm text-neutral-600">הערות</span>
            <textarea
              v-model="addMealForm.notes"
              rows="2"
              class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
            />
          </label>

          <p v-if="addMealError" class="text-sm text-status-red">{{ addMealError }}</p>

          <div class="flex flex-wrap gap-3">
            <button
              type="submit"
              :disabled="addingMeal"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
            >
              {{ addingMeal ? 'שומר...' : 'הוספת ארוחה' }}
            </button>
            <button
              type="button"
              :disabled="addingMeal"
              class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
              @click="showAddMeal = false; addMealForm.name = ''; addMealForm.notes = ''"
            >
              ביטול
            </button>
          </div>
        </form>

        <p v-if="moveMealError" class="text-sm text-status-red">{{ moveMealError }}</p>
        <p v-if="deleteMealError" class="text-sm text-status-red">{{ deleteMealError }}</p>

        <p v-if="meals.length === 0" class="text-sm text-neutral-600">אין עדיין ארוחות בתוכנית.</p>

        <ul v-else class="flex flex-col gap-4">
          <li v-for="(meal, mealIndex) in meals" :key="meal.id" class="rounded-xl border border-neutral-300 p-4">
            <template v-if="editingMealId === meal.id">
              <form class="flex flex-col gap-3" @submit.prevent="saveEditMeal(meal.id)">
                <label class="flex flex-col gap-1">
                  <span class="text-sm text-neutral-600">שם הארוחה</span>
                  <input
                    v-model="editMealForm.name"
                    type="text"
                    class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-sm text-neutral-600">הערות</span>
                  <textarea
                    v-model="editMealForm.notes"
                    rows="2"
                    class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
                  />
                </label>

                <p v-if="editMealError" class="text-sm text-status-red">{{ editMealError }}</p>

                <div class="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    :disabled="savingMeal"
                    class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
                  >
                    {{ savingMeal ? 'שומר...' : 'שמירה' }}
                  </button>
                  <button
                    type="button"
                    :disabled="savingMeal"
                    class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                    @click="cancelEditMeal"
                  >
                    ביטול
                  </button>
                </div>
              </form>
            </template>

            <template v-else>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium text-brand-black">{{ meal.name }}</p>
                  <p v-if="meal.notes" class="mt-1 text-sm text-neutral-600">{{ meal.notes }}</p>
                  <p v-if="mealTotals(meal).itemCount === 0" class="mt-1 text-sm text-neutral-600">
                    אין נתונים תזונתיים מחושבים לארוחה זו.
                  </p>
                  <p v-else class="mt-1 text-sm text-neutral-600">
                    סה"כ לארוחה:
                    <span class="font-semibold text-brand-black">
                      {{ formatNutritionAmount(mealTotals(meal).calories) }} קק"ל
                    </span>
                    &middot;
                    <span class="font-semibold text-brand-black">
                      {{ formatNutritionAmount(mealTotals(meal).protein) }} גר'
                    </span>
                    חלבון
                    <span v-if="mealTotals(meal).hasUnknownProtein">(לא כולל פריט/ים עם חלבון לא ידוע)</span>
                  </p>
                </div>

                <div class="flex shrink-0 flex-wrap items-center gap-1">
                  <button
                    type="button"
                    :disabled="mealIndex === 0 || movingMealId === meal.id"
                    class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                    aria-label="הזז ארוחה למעלה"
                    @click="moveMeal(meal.id, -1)"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    :disabled="mealIndex === meals.length - 1 || movingMealId === meal.id"
                    class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                    aria-label="הזז ארוחה למטה"
                    @click="moveMeal(meal.id, 1)"
                  >
                    ↓
                  </button>

                  <template v-if="confirmDeleteMealId === meal.id">
                    <button
                      type="button"
                      :disabled="deletingMealId === meal.id"
                      class="inline-flex min-h-11 items-center justify-center rounded-md bg-status-red px-2 py-1 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                      @click="confirmDeleteMeal(meal.id)"
                    >
                      {{ deletingMealId === meal.id ? 'מוחק...' : 'אישור מחיקה' }}
                    </button>
                    <button
                      type="button"
                      :disabled="deletingMealId === meal.id"
                      class="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                      @click="confirmDeleteMealId = null"
                    >
                      ביטול
                    </button>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100"
                      @click="startEditMeal(meal)"
                    >
                      ערוך
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-status-red hover:bg-status-red/10"
                      @click="confirmDeleteMealId = meal.id"
                    >
                      מחק
                    </button>
                  </template>
                </div>
              </div>

              <!-- Meal items -->
              <div class="mt-3 border-t border-neutral-300 pt-3">
                <p v-if="moveItemError" class="mb-2 text-sm text-status-red">{{ moveItemError }}</p>
                <p v-if="deleteItemError" class="mb-2 text-sm text-status-red">{{ deleteItemError }}</p>
                <p v-if="editItemError" class="mb-2 text-sm text-status-red">{{ editItemError }}</p>

                <p v-if="(meal.items ?? []).length === 0" class="text-sm text-neutral-600">
                  אין עדיין פריטים בארוחה זו.
                </p>

                <ul v-else class="flex flex-col gap-2">
                  <li
                    v-for="(item, itemIndex) in meal.items"
                    :key="item.id"
                    class="flex items-center justify-between gap-4"
                  >
                    <template v-if="editingItemId === item.id">
                      <form
                        class="flex flex-1 flex-wrap items-center gap-2"
                        @submit.prevent="saveEditItem(meal.id, item)"
                      >
                        <span class="text-brand-black">{{ entryDisplayName(item) }}</span>
                        <input
                          v-model="editItemQuantity"
                          type="number"
                          :step="item.food_id ? '0.1' : '0.5'"
                          :min="item.food_id ? '0.1' : '0.5'"
                          required
                          dir="ltr"
                          class="w-24 rounded-lg border border-neutral-300 px-2 py-1 text-sm focus:border-brand-green focus:outline-none"
                        />
                        <span class="text-sm text-neutral-600">{{ item.food_id ? 'גרם' : 'מנות' }}</span>
                        <button
                          type="submit"
                          :disabled="savingItemId === item.id"
                          class="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-green px-3 py-1 text-xs font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
                        >
                          {{ savingItemId === item.id ? 'שומר...' : 'שמירה' }}
                        </button>
                        <button
                          type="button"
                          :disabled="savingItemId === item.id"
                          class="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-3 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                          @click="cancelEditItem"
                        >
                          ביטול
                        </button>
                      </form>
                    </template>

                    <template v-else>
                      <div class="min-w-0">
                        <p class="truncate text-brand-black">{{ entryDisplayName(item) }}</p>
                        <p class="text-sm text-neutral-600">
                          {{ entryQuantityLabel(item) }} &middot; {{ item.calories }} קק"ל &middot;
                          {{ item.protein === null ? 'חלבון לא ידוע' : `${item.protein} גר' חלבון` }}
                        </p>
                      </div>

                      <div class="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          :disabled="itemIndex === 0 || movingItemId === item.id"
                          class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                          aria-label="הזז פריט למעלה"
                          @click="moveItem(meal.id, item.id, -1)"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          :disabled="itemIndex === meal.items.length - 1 || movingItemId === item.id"
                          class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                          aria-label="הזז פריט למטה"
                          @click="moveItem(meal.id, item.id, 1)"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          class="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100"
                          @click="startEditItem(item)"
                        >
                          ערוך כמות
                        </button>

                        <template v-if="confirmDeleteItemId === item.id">
                          <button
                            type="button"
                            :disabled="deletingItemId === item.id"
                            class="rounded-lg bg-status-red px-3 py-1.5 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                            @click="confirmDeleteItem(meal.id, item.id)"
                          >
                            {{ deletingItemId === item.id ? 'מוחק...' : 'אישור מחיקה' }}
                          </button>
                          <button
                            type="button"
                            :disabled="deletingItemId === item.id"
                            class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                            @click="confirmDeleteItemId = null"
                          >
                            ביטול
                          </button>
                        </template>
                        <button
                          v-else
                          type="button"
                          class="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-status-red hover:bg-neutral-100"
                          @click="confirmDeleteItemId = item.id"
                        >
                          מחק
                        </button>
                      </div>
                    </template>
                  </li>
                </ul>

                <form
                  v-if="showAddItemForMealId === meal.id"
                  class="mt-3 flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
                  @submit.prevent="handleAddItem(meal.id)"
                >
                  <FoodQuantityPicker :ref="(el) => setItemPickerRef(meal.id, el)" />

                  <p v-if="addItemError" class="text-sm text-status-red">{{ addItemError }}</p>

                  <div class="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      :disabled="addingItem"
                      class="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
                    >
                      {{ addingItem ? 'שומר...' : 'הוספת פריט' }}
                    </button>
                    <button
                      type="button"
                      :disabled="addingItem"
                      class="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                      @click="closeAddItem(meal.id)"
                    >
                      ביטול
                    </button>
                  </div>
                </form>
                <button
                  v-else
                  type="button"
                  class="mt-3 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100"
                  @click="openAddItem(meal.id)"
                >
                  הוסף פריט לארוחה
                </button>
              </div>
            </template>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
