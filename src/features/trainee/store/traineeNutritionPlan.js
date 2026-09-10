import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../stores/auth'
import { ensureLoaded as ensureLoadedCore, reset as resetCore } from './traineeNutritionPlanCore'
import { sortPlan } from '../../nutrition/lib/sortPlan'

// Trainee's own assigned nutrition plan -- fully read-only. Reads
// public.trainee_nutrition_plans (+ embedded trainee_nutrition_plan_meals
// + their embedded trainee_nutrition_plan_meal_items) through the
// trainee-facing SELECT policies added by 035_trainee_nutrition_plans.sql /
// 037_nutrition_plan_meals_and_items.sql. No trainee_id filter is needed
// client-side -- those policies already scope the result to the caller's
// own plan (at most one row, trainee_id is UNIQUE), same convention as
// useTraineeNutritionStore's food-log fetch. No INSERT/UPDATE/DELETE
// policy exists for the trainee role on any of these three tables, and
// this store never attempts any -- create/edit/delete/reorder are
// coach-only (src/features/nutrition/store/nutritionPlans.js). Each
// item's calories/protein were computed server-side through the exact
// same shared function/formula the existing food log uses
// (public.compute_nutrition_amounts()) -- never recalculated here.
//
// The actual loading/caching state machine (dedup, per-user isolation,
// stale-response discarding, retry-after-failure) lives in
// traineeNutritionPlanCore.js -- a plain, dependency-injected module with
// no Pinia/Supabase import of its own, so it's unit-testable directly
// under Node (see its own test file). This store is a thin wrapper: it
// supplies the real supabase fetch and the real current-user lookup, and
// passes `this` (which supports the same property get/set a plain state
// object does) straight through as the mutable state.

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

async function fetchPlanFromSupabase() {
  const { data, error } = await supabase
    .from('trainee_nutrition_plans')
    .select(PLAN_SELECT)
    .maybeSingle()
  if (error) throw error
  return sortPlan(data)
}

export const useTraineeNutritionPlanStore = defineStore('traineeNutritionPlan', {
  state: () => ({
    // undefined = not fetched yet, null = no plan assigned, object = plan
    // (with embedded, order-sorted `meals`, each with its own
    // order-sorted `items`).
    plan: undefined,
    loadedForUserId: null,
    loading: false,
    loadPromise: null,
    loadPromiseForUserId: null,
    error: null,
  }),

  actions: {
    ensureLoaded() {
      return ensureLoadedCore(this, {
        getCurrentUserId: () => useAuthStore().user?.id ?? null,
        fetchPlan: fetchPlanFromSupabase,
      })
    },

    // Explicit, belt-and-suspenders clear for the common sign-out path
    // (called from TraineeHeader.vue's handleLogout) -- see
    // traineeNutritionPlanCore.js's header for the full reasoning.
    reset() {
      resetCore(this)
    },
  },
})
