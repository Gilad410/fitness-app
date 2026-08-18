import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Trainee's own nutrition log -- reads public.trainee_nutrition_logs
// through the trainee-facing SELECT policy added by
// 022_trainee_nutrition_access.sql (scoped implicitly by RLS, no
// trainee_id filter needed client-side, same join shape as the coach's
// nutritionLogs.js store). Every write goes through
// trainee_log_nutrition_entry() / trainee_delete_nutrition_entry() --
// this store never inserts, updates, or deletes the table directly, and
// never sends trainee_id/coach_id/calories/protein -- those are always
// resolved or computed server-side.
export const useTraineeNutritionStore = defineStore('traineeNutrition', {
  state: () => ({
    logs: [],
    loading: false,
    loaded: false,
    loadPromise: null,
    error: null,
    adding: false,
    addError: null,
    deletingId: null,
    deleteError: null,
  }),

  getters: {
    forDate: (state) => (date) => state.logs.filter((log) => log.logged_at === date),

    dailyTotalFor: (state) => (date) =>
      state.logs
        .filter((log) => log.logged_at === date)
        .reduce((sum, log) => sum + Number(log.calories), 0),

    // Only sums entries with a known protein value -- an entry logged
    // against a food with unset protein is excluded, not treated as 0
    // (matches the coach's nutritionLogs.js dailyProteinTotalFor).
    dailyProteinTotalFor: (state) => (date) =>
      state.logs
        .filter((log) => log.logged_at === date && log.protein !== null)
        .reduce((sum, log) => sum + Number(log.protein), 0),

    dailyProteinUnknownFor: (state) => (date) =>
      state.logs.some((log) => log.logged_at === date && log.protein === null),
  },

  actions: {
    ensureLoaded() {
      if (this.loadPromise) return this.loadPromise
      this.loadPromise = this.fetchAll()
      return this.loadPromise
    },

    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase
          .from('trainee_nutrition_logs')
          .select(
            '*, food:foods(name), restaurant_food_item:restaurant_food_items(item_name, chain_name, serving_description)',
          )
          .order('logged_at', { ascending: false })
          .order('created_at', { ascending: false })
        if (error) throw error
        this.logs = data
        this.loaded = true
      } catch (err) {
        this.error = safeErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    // payload: { loggedAt, foodId? , referenceFoodId?, restaurantFoodItemId?, grams?, servings? }
    // -- exactly one of foodId/referenceFoodId/restaurantFoodItemId, and
    // exactly the matching grams (foodId/referenceFoodId) or servings
    // (restaurantFoodItemId). trainee_log_nutrition_entry() re-validates
    // all of this server-side regardless.
    async addEntry({ loggedAt, foodId, referenceFoodId, restaurantFoodItemId, grams, servings }) {
      this.adding = true
      this.addError = null
      try {
        const { data, error } = await supabase.rpc('trainee_log_nutrition_entry', {
          p_food_id: foodId ?? null,
          p_reference_food_id: referenceFoodId ?? null,
          p_restaurant_food_item_id: restaurantFoodItemId ?? null,
          p_grams: grams ?? null,
          p_servings: servings ?? null,
          p_logged_at: loggedAt,
        })
        if (error) throw error
        // The RPC returns the bare created row (no food:/restaurant_food_item:
        // joins -- RPC calls don't support PostgREST's embed syntax), so
        // refetch to pick up the joined display names for the new row.
        await this.fetchAll()
        return Array.isArray(data) ? data[0] : data
      } catch (err) {
        this.addError = safeErrorMessage(err)
        throw err
      } finally {
        this.adding = false
      }
    },

    async deleteEntry(logId) {
      this.deletingId = logId
      this.deleteError = null
      try {
        const { error } = await supabase.rpc('trainee_delete_nutrition_entry', {
          p_log_id: logId,
        })
        if (error) throw error
        this.logs = this.logs.filter((log) => log.id !== logId)
      } catch (err) {
        this.deleteError = safeErrorMessage(err)
        throw err
      } finally {
        this.deletingId = null
      }
    },
  },
})

// trainee_log_nutrition_entry() / trainee_delete_nutrition_entry() /
// trainee_get_auth_context() (022_trainee_nutrition_access.sql) raise
// plain-English `raise exception` messages for expected validation
// failures -- each one is deliberately short, generic, and already safe
// to show verbatim (never references internal state beyond what the
// trainee already sees). Anything NOT in this list (a raw Postgres/
// network/RLS-denial error) is replaced with a generic Hebrew message so
// no internal detail ever reaches the UI.
const HEBREW_MESSAGES = {
  'Only a trainee may log their own nutrition entry.': 'פעולה זו זמינה למתאמנים בלבד.',
  'Only a trainee may delete their own nutrition entry.': 'פעולה זו זמינה למתאמנים בלבד.',
  'No trainee profile is linked to this account.': 'לא נמצא פרופיל מתאמן המקושר לחשבון זה.',
  'A log date is required.': 'יש לבחור תאריך.',
  'Exactly one of food, reference food, or restaurant item must be provided.':
    'יש לבחור פריט אחד לרישום.',
  'Servings must be a positive number.': 'כמות המנות חייבת להיות מספר חיובי.',
  'Restaurant item not found.': 'הפריט לא נמצא.',
  'Grams must be a positive number.': 'כמות הגרמים חייבת להיות מספר חיובי.',
  'Food not found.': 'המאכל לא נמצא.',
  'This food is no longer available for new entries.': 'המאכל הזה כבר לא זמין לרישום חדש.',
  'Reference food not found.': 'הפריט לא נמצא במאגר.',
  'This food is currently unavailable. Please contact your coach.':
    'הפריט אינו זמין כרגע. יש לפנות למאמן/ת.',
  'Nutrition entry not found.': 'הרישום לא נמצא.',
}

function safeErrorMessage(err) {
  const msg = err?.message ?? ''
  return HEBREW_MESSAGES[msg] ?? 'אירעה שגיאה. נסה/י שוב.'
}
