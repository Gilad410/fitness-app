import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'
import { moveItem as moveItemCore } from './nutritionPlansCore'
import { sortPlan } from '../lib/sortPlan'

// Coach-side nutrition PLANS -- a simple, editable menu (title + notes +
// ordered, named meals, each holding ordered food entries) assigned to
// one specific trainee at a time (trainee_nutrition_plans.trainee_id is
// UNIQUE, 035_trainee_nutrition_plans.sql). "Assigning" a plan is simply
// creating it for that trainee_id; there is no reusable-template/
// reassignment concept, matching every other per-trainee table in this
// schema.
//
// A meal item's food source, units, and calculation are the SAME ones
// the existing food log (useNutritionLogsStore) already uses -- public.foods
// (grams) / public.restaurant_food_items (servings), computed server-side
// through the exact same shared function both features call
// (public.compute_nutrition_amounts(), 037_nutrition_plan_meals_and_items.sql).
// Selecting a food/quantity in the UI goes through the SAME
// FoodQuantityPicker.vue component NutritionSection.vue uses -- see
// NutritionPlanSection.vue. No food data, unit handling, or calculation
// is duplicated anywhere in this store.
//
// Reads/creates/edits/deletes go directly against
// public.trainee_nutrition_plans / _meals / _meal_items -- plain
// RLS-protected table operations, same shape as
// trainingPrograms.js/workouts.js (only the coach ever writes here).
// Reordering (moveMeal/moveMealItem) is the one exception: each goes
// through its own atomic RPC (coach_swap_nutrition_plan_meals /
// coach_swap_nutrition_plan_meal_items) for the same reason
// 036_nutrition_plan_item_reorder.sql originally introduced that pattern
// -- swapping two rows' display_order needs to be atomic.
const PLAN_SELECT = `
  *,
  meals:trainee_nutrition_plan_meals (
    *,
    items:trainee_nutrition_plan_meal_items (
      *,
      food:foods(name),
      restaurant_food_item:restaurant_food_items(item_name, chain_name, serving_description)
    )
  )
`

const MEAL_ITEM_SELECT =
  '*, food:foods(name), restaurant_food_item:restaurant_food_items(item_name, chain_name, serving_description)'

export const useNutritionPlansStore = defineStore('nutritionPlans', {
  state: () => ({
    // traineeId -> plan row (with embedded, order-sorted `meals`, each
    // with its own order-sorted `items`) | null (checked, no plan
    // assigned yet). Absent entirely means "not checked yet".
    planByTrainee: {},
    loadPromises: {},
    error: {},
    // traineeId -> true while a moveMeal() reorder is in flight for that
    // trainee's plan; mealId -> true while a moveMealItem() reorder is in
    // flight for that meal -- both prevent a second, overlapping reorder
    // at the same level from racing the first (same reasoning
    // 036_nutrition_plan_item_reorder.sql documents).
    reorderMealInFlight: {},
    reorderItemInFlight: {},
  }),

  getters: {
    planFor: (state) => (traineeId) => state.planByTrainee[traineeId] ?? null,
  },

  actions: {
    ensureLoaded(traineeId) {
      if (this.loadPromises[traineeId]) return this.loadPromises[traineeId]
      const promise = this.fetchForTrainee(traineeId).finally(() => {
        if (this.loadPromises[traineeId] === promise) this.loadPromises[traineeId] = null
      })
      this.loadPromises[traineeId] = promise
      return promise
    },

    async fetchForTrainee(traineeId) {
      this.error[traineeId] = null
      // maybeSingle(): zero rows (no plan assigned yet) is a valid,
      // expected outcome, not an error -- trainee_id is UNIQUE, so more
      // than one row is genuinely impossible.
      const { data, error } = await supabase
        .from('trainee_nutrition_plans')
        .select(PLAN_SELECT)
        .eq('trainee_id', traineeId)
        .maybeSingle()
      if (error) {
        this.error[traineeId] = error.message
        throw error
      }
      this.planByTrainee[traineeId] = sortPlan(data)
    },

    async createPlan(traineeId, { title, notes }) {
      const authStore = useAuthStore()
      const { data, error } = await supabase
        .from('trainee_nutrition_plans')
        .insert({
          trainee_id: traineeId,
          coach_id: authStore.user.id,
          title,
          notes: notes && notes.trim() !== '' ? notes.trim() : null,
        })
        .select(PLAN_SELECT)
        .single()
      if (error) throw error
      this.planByTrainee[traineeId] = sortPlan(data)
      return data
    },

    async updatePlan(traineeId, planId, patch) {
      const { data, error } = await supabase
        .from('trainee_nutrition_plans')
        .update(patch)
        .eq('id', planId)
        .select(PLAN_SELECT)
        .single()
      if (error) throw error
      this.planByTrainee[traineeId] = sortPlan(data)
      return data
    },

    async deletePlan(traineeId, planId) {
      const { error } = await supabase.from('trainee_nutrition_plans').delete().eq('id', planId)
      if (error) throw error
      this.planByTrainee[traineeId] = null
    },

    // ---- Meals ----

    async addMeal(traineeId, planId, { name, notes }) {
      const authStore = useAuthStore()
      const plan = this.planByTrainee[traineeId]
      const meals = plan?.meals ?? []
      const nextOrder = meals.length === 0 ? 0 : Math.max(...meals.map((m) => m.display_order)) + 1

      const { data, error } = await supabase
        .from('trainee_nutrition_plan_meals')
        .insert({
          plan_id: planId,
          coach_id: authStore.user.id,
          name,
          notes: notes && notes.trim() !== '' ? notes.trim() : null,
          display_order: nextOrder,
        })
        .select()
        .single()
      if (error) throw error

      this.planByTrainee[traineeId] = { ...plan, meals: [...meals, { ...data, items: [] }] }
      return data
    },

    async updateMeal(traineeId, mealId, patch) {
      const { data, error } = await supabase
        .from('trainee_nutrition_plan_meals')
        .update(patch)
        .eq('id', mealId)
        .select()
        .single()
      if (error) throw error

      const plan = this.planByTrainee[traineeId]
      const meals = plan?.meals ?? []
      const index = meals.findIndex((m) => m.id === mealId)
      if (index !== -1) {
        const nextMeals = [...meals]
        nextMeals[index] = { ...data, items: meals[index].items }
        this.planByTrainee[traineeId] = { ...plan, meals: nextMeals }
      }
      return data
    },

    async removeMeal(traineeId, mealId) {
      const { error } = await supabase.from('trainee_nutrition_plan_meals').delete().eq('id', mealId)
      if (error) throw error

      const plan = this.planByTrainee[traineeId]
      const meals = plan?.meals ?? []
      this.planByTrainee[traineeId] = { ...plan, meals: meals.filter((m) => m.id !== mealId) }
    },

    // Swaps a meal with its immediate neighbor within the same plan.
    // Adapts nutritionPlansCore.js's pure, unit-tested moveItem()
    // (identical shape to how moveMealItem() below reuses it) -- get/set
    // views onto this store's own planByTrainee/reorderMealInFlight so
    // its plain property reads/writes transparently become
    // Pinia-reactive mutations.
    async moveMeal(traineeId, mealId, direction) {
      const store = this
      const planState = {
        get items() {
          return store.planByTrainee[traineeId]?.meals ?? []
        },
        set items(newMeals) {
          store.planByTrainee[traineeId] = { ...store.planByTrainee[traineeId], meals: newMeals }
        },
      }
      const reorderState = {
        get inFlight() {
          return !!store.reorderMealInFlight[traineeId]
        },
        set inFlight(value) {
          store.reorderMealInFlight[traineeId] = value
        },
      }

      await moveItemCore(planState, reorderState, mealId, direction, {
        swapItems: async (idA, idB) => {
          const { error } = await supabase.rpc('coach_swap_nutrition_plan_meals', {
            p_meal_id_a: idA,
            p_meal_id_b: idB,
          })
          if (error) throw error
        },
      })
    },

    // ---- Meal items (food entries within a meal) ----

    // sourcePayload is the resolved output of FoodQuantityPicker.vue's
    // resolve() -- { food_id, grams } or { restaurant_food_item_id,
    // servings }, the exact same shape nutritionLogsStore.addLog() takes,
    // spread here with zero translation. calories/protein are always
    // computed server-side by the trigger, never sent from here.
    async addMealItem(traineeId, mealId, sourcePayload) {
      const authStore = useAuthStore()
      const plan = this.planByTrainee[traineeId]
      const meals = plan?.meals ?? []
      const mealIndex = meals.findIndex((m) => m.id === mealId)
      if (mealIndex === -1) throw new Error('הארוחה לא נמצאה.')
      const items = meals[mealIndex].items ?? []
      const nextOrder = items.length === 0 ? 0 : Math.max(...items.map((i) => i.display_order)) + 1

      const { data, error } = await supabase
        .from('trainee_nutrition_plan_meal_items')
        .insert({
          meal_id: mealId,
          coach_id: authStore.user.id,
          ...sourcePayload,
          display_order: nextOrder,
        })
        .select(MEAL_ITEM_SELECT)
        .single()
      if (error) throw error

      const nextMeals = [...meals]
      nextMeals[mealIndex] = { ...nextMeals[mealIndex], items: [...items, data] }
      this.planByTrainee[traineeId] = { ...plan, meals: nextMeals }
      return data
    },

    // Quantity-only edit of an existing item -- patch is { grams } for a
    // food_id-sourced item or { servings } for a restaurant_food_item_id-
    // sourced one (the caller, NutritionPlanSection.vue, decides which
    // based on item.food_id, mirroring FoodQuantityPicker.vue's own
    // grams-vs-servings split). The food/restaurant-item source itself is
    // never changed here -- swapping the source is a different item, not
    // an edit, so that still goes through removeMealItem + addMealItem.
    // calories/protein are always recalculated server-side by the same
    // trigger/helper an add goes through
    // (public.compute_nutrition_amounts(), 037's
    // set_nutrition_plan_meal_item_calories()) -- never computed here, and
    // never sent as part of patch.
    async updateMealItem(traineeId, mealId, itemId, patch) {
      const { data, error } = await supabase
        .from('trainee_nutrition_plan_meal_items')
        .update(patch)
        .eq('id', itemId)
        .select(MEAL_ITEM_SELECT)
        .single()
      if (error) throw error

      const plan = this.planByTrainee[traineeId]
      const meals = plan?.meals ?? []
      const mealIndex = meals.findIndex((m) => m.id === mealId)
      if (mealIndex === -1) return data
      const items = meals[mealIndex].items ?? []
      const itemIndex = items.findIndex((i) => i.id === itemId)
      if (itemIndex === -1) return data
      const nextItems = [...items]
      nextItems[itemIndex] = data
      const nextMeals = [...meals]
      nextMeals[mealIndex] = { ...nextMeals[mealIndex], items: nextItems }
      this.planByTrainee[traineeId] = { ...plan, meals: nextMeals }
      return data
    },

    async removeMealItem(traineeId, mealId, itemId) {
      const { error } = await supabase.from('trainee_nutrition_plan_meal_items').delete().eq('id', itemId)
      if (error) throw error

      const plan = this.planByTrainee[traineeId]
      const meals = plan?.meals ?? []
      const mealIndex = meals.findIndex((m) => m.id === mealId)
      if (mealIndex === -1) return
      const nextMeals = [...meals]
      nextMeals[mealIndex] = {
        ...nextMeals[mealIndex],
        items: nextMeals[mealIndex].items.filter((i) => i.id !== itemId),
      }
      this.planByTrainee[traineeId] = { ...plan, meals: nextMeals }
    },

    async moveMealItem(traineeId, mealId, itemId, direction) {
      const store = this
      const planState = {
        get items() {
          const meal = (store.planByTrainee[traineeId]?.meals ?? []).find((m) => m.id === mealId)
          return meal?.items ?? []
        },
        set items(newItems) {
          const plan = store.planByTrainee[traineeId]
          const meals = plan?.meals ?? []
          const mealIndex = meals.findIndex((m) => m.id === mealId)
          if (mealIndex === -1) return
          const nextMeals = [...meals]
          nextMeals[mealIndex] = { ...nextMeals[mealIndex], items: newItems }
          store.planByTrainee[traineeId] = { ...plan, meals: nextMeals }
        },
      }
      const reorderState = {
        get inFlight() {
          return !!store.reorderItemInFlight[mealId]
        },
        set inFlight(value) {
          store.reorderItemInFlight[mealId] = value
        },
      }

      await moveItemCore(planState, reorderState, itemId, direction, {
        swapItems: async (idA, idB) => {
          const { error } = await supabase.rpc('coach_swap_nutrition_plan_meal_items', {
            p_item_id_a: idA,
            p_item_id_b: idB,
          })
          if (error) throw error
        },
      })
    },
  },
})
