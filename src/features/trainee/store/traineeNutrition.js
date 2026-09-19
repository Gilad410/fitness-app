import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'
import { retentionCutoff } from '../../nutrition/lib/nutritionRetentionClock'
import {
  logsForDate,
  dailyCaloriesTotal,
  dailyProteinTotal,
  dailyHasUnknownProtein,
} from '../../nutrition/lib/nutritionLogsCore'
import { buildTraineeBarcodeLogRpcParams } from '../lib/traineeBarcodeLogParams.js'

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
    // Every getter below reads retentionCutoff.value (via
    // nutritionLogsCore.js) -- reactive on the shared clock in
    // nutritionRetentionClock.js, so cached entries/totals here stop
    // being shown/counted once they age out of the 7-day retention
    // window, even without a fresh fetch, for as long as
    // TraineeNutritionView.vue keeps the clock running. Server-side RLS
    // (038_trainee_nutrition_log_retention.sql) remains the actual
    // enforcement -- this is a client-side courtesy layer on top of it,
    // shared with (and identical to) the coach's own nutritionLogs.js.
    forDate: (state) => (date) => logsForDate(state.logs, date, retentionCutoff.value),

    dailyTotalFor: (state) => (date) => dailyCaloriesTotal(state.logs, date, retentionCutoff.value),

    // Only sums entries with a known protein value -- an entry logged
    // against a food with unset protein is excluded, not treated as 0
    // (matches the coach's nutritionLogs.js dailyProteinTotalFor).
    dailyProteinTotalFor: (state) => (date) => dailyProteinTotal(state.logs, date, retentionCutoff.value),

    dailyProteinUnknownFor: (state) => (date) =>
      dailyHasUnknownProtein(state.logs, date, retentionCutoff.value),
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

    // resolved: BarcodeFoodEntry.vue's 'resolved' payload (barcode,
    // barcode_source, barcode_product_name, barcode_calories_per_100g,
    // barcode_protein_per_100g, grams) -- the SAME emit shape used by
    // the coach's NutritionSection.vue, unchanged. Maps to the RPC's
    // barcode parameters via buildTraineeBarcodeLogRpcParams() (pure,
    // unit-tested) rather than a raw insert -- trainee_nutrition_logs
    // has no INSERT policy a trainee could ever satisfy
    // (trainee_nutrition_logs_insert_own, 003_nutrition.sql, is
    // coach_id = auth.uid() only); trainee_log_nutrition_entry()
    // (extended for barcode support by
    // 047_trainee_barcode_nutrition_logging.sql) is the only path, same
    // as every other source this store already logs through addEntry().
    async addBarcodeEntry(resolved, loggedAt) {
      this.adding = true
      this.addError = null
      try {
        const { data, error } = await supabase.rpc(
          'trainee_log_nutrition_entry',
          buildTraineeBarcodeLogRpcParams(resolved, loggedAt),
        )
        if (error) throw error
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
// trainee_get_auth_context() (022_trainee_nutrition_access.sql,
// extended for barcode support by
// 047_trainee_barcode_nutrition_logging.sql) raise plain-English `raise
// exception` messages for expected validation failures -- each one is
// deliberately short, generic, and already safe to show verbatim (never
// references internal state beyond what the trainee already sees).
// Anything NOT in this list (a raw Postgres/network/RLS-denial error) is
// replaced with a generic Hebrew message so no internal detail ever
// reaches the UI. Until 047 is applied, the RPC still raises the OLD
// (pre-barcode) three-source message below verbatim -- both the old and
// new exact wording are kept here so this map is correct on either side
// of that migration.
const HEBREW_MESSAGES = {
  'Only a trainee may log their own nutrition entry.': 'פעולה זו זמינה למתאמנים בלבד.',
  'Only a trainee may delete their own nutrition entry.': 'פעולה זו זמינה למתאמנים בלבד.',
  'No trainee profile is linked to this account.': 'לא נמצא פרופיל מתאמן המקושר לחשבון זה.',
  'A log date is required.': 'יש לבחור תאריך.',
  'Exactly one of food, reference food, or restaurant item must be provided.':
    'יש לבחור פריט אחד לרישום.',
  'Exactly one of food, reference food, restaurant item, or barcode must be provided.':
    'יש לבחור פריט אחד לרישום.',
  'Servings must be a positive number.': 'כמות המנות חייבת להיות מספר חיובי.',
  'Restaurant item not found.': 'הפריט לא נמצא.',
  'Grams must be a positive number.': 'כמות הגרמים חייבת להיות מספר חיובי.',
  'Food not found.': 'המאכל לא נמצא.',
  'This food is no longer available for new entries.': 'המאכל הזה כבר לא זמין לרישום חדש.',
  'Reference food not found.': 'הפריט לא נמצא במאגר.',
  'This food is currently unavailable. Please contact your coach.':
    'הפריט אינו זמין כרגע. יש לפנות למאמן/ת.',
  'Barcode product details are incomplete.': 'פרטי המוצר לא הושלמו. יש להזין שם וקלוריות.',
  'Calories must not be negative.': 'הקלוריות אינן יכולות להיות שליליות.',
  'Protein must not be negative.': 'החלבון אינו יכול להיות שלילי.',
  'Nutrition entry not found.': 'הרישום לא נמצא.',
}

function safeErrorMessage(err) {
  const msg = err?.message ?? ''
  return HEBREW_MESSAGES[msg] ?? 'אירעה שגיאה. נסה/י שוב.'
}
