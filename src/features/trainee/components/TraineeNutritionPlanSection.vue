<script setup>
import { computed, onMounted, ref } from 'vue'
import { useTraineeNutritionPlanStore } from '../store/traineeNutritionPlan'
import { entryDisplayName, entryQuantityLabel } from '../../nutrition/lib/entryDisplay'
import { mealTotals, planTotals } from '../../nutrition/lib/planTotals'
import { formatNutritionAmount } from '../../../lib/formatNumber'

// Trainee's own "My Nutrition" plan display -- read-only, no add/edit/
// delete/reorder controls anywhere in this component (there is nothing
// for a trainee to write here -- see the store's own comment). Each
// meal's items and per-meal totals use the exact same display helpers
// (entryDisplayName/entryQuantityLabel) and already server-computed
// calories/protein the coach's own plan builder and the food log use --
// nothing here recalculates or reformats nutrition values differently.
const planStore = useTraineeNutritionPlanStore()

const checking = ref(true)
const loadError = ref('')

onMounted(async () => {
  try {
    await planStore.ensureLoaded()
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

// mealTotals/planTotals -- shared with NutritionPlanSection.vue
// (src/features/nutrition/lib/planTotals.js), so the coach and trainee
// views can never disagree about what a plan/meal totals to.
const totalsForPlan = computed(() => planTotals(planStore.plan))
</script>

<template>
  <section class="mb-6 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
    <h2 class="font-semibold text-brand-black">תוכנית התזונה שלי</h2>

    <p v-if="checking" class="text-sm text-neutral-600">טוען...</p>
    <p v-else-if="loadError" role="alert" class="text-sm text-status-red">{{ loadError }}</p>

    <p v-else-if="!planStore.plan" class="text-sm text-neutral-600">
      המאמן/ת טרם הקצה/תה לך תוכנית תזונה.
    </p>

    <template v-else>
      <div>
        <p class="font-medium text-brand-black">{{ planStore.plan.title }}</p>
        <p v-if="planStore.plan.notes" class="mt-1 text-sm text-neutral-600">{{ planStore.plan.notes }}</p>
      </div>

      <div v-if="(planStore.plan.meals ?? []).length > 0" class="rounded-xl border border-neutral-300 bg-neutral-50 p-3">
        <p class="mb-1 text-sm text-neutral-600">סה"כ לתוכנית</p>
        <p class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span class="inline-flex items-baseline gap-1.5">
            <span class="ec-num text-lg" style="color: var(--color-brand-green)">{{ formatNutritionAmount(totalsForPlan.calories) }}</span>
            <span class="text-sm text-neutral-600">קק"ל</span>
          </span>
          <span class="inline-flex items-baseline gap-1.5">
            <span class="ec-num text-lg" style="color: var(--ec-violet)">{{ formatNutritionAmount(totalsForPlan.protein) }}</span>
            <span class="text-sm text-neutral-600">גר' חלבון</span>
          </span>
        </p>
        <p v-if="totalsForPlan.hasUnknownProtein" class="mt-1 text-sm text-neutral-600">
          (סכום החלבון אינו כולל פריט/ים עם חלבון לא ידוע)
        </p>
        <p v-if="totalsForPlan.hasLegacyMealsWithoutItems" class="mt-1 text-sm text-neutral-600">
          (התוכנית כוללת ארוחה/ות ללא פריטים מחושבים, שאינן נכללות בסה"כ)
        </p>
      </div>

      <p v-if="(planStore.plan.meals ?? []).length === 0" class="text-sm text-neutral-600">
        התוכנית עדיין ללא ארוחות.
      </p>

      <ul v-else class="flex flex-col gap-4">
        <li
          v-for="meal in planStore.plan.meals"
          :key="meal.id"
          class="border-t border-neutral-300 pt-3 first:border-t-0 first:pt-0"
        >
          <p class="font-medium text-brand-black">{{ meal.name }}</p>
          <p v-if="meal.notes" class="mt-1 text-sm text-neutral-600">{{ meal.notes }}</p>

          <p v-if="(meal.items ?? []).length === 0" class="mt-2 text-sm text-neutral-600">
            אין נתונים תזונתיים מחושבים לארוחה זו.
          </p>

          <template v-else>
            <ul class="mt-2 flex flex-col gap-2">
              <li v-for="item in meal.items" :key="item.id">
                <p class="text-brand-black">{{ entryDisplayName(item) }}</p>
                <p class="text-sm text-neutral-600">{{ entryQuantityLabel(item) }}</p>
                <p class="mt-0.5 flex items-baseline gap-3">
                  <span class="inline-flex items-baseline gap-1">
                    <span class="ec-num text-sm" style="color: var(--color-brand-green)">{{ item.calories }}</span>
                    <span class="text-xs text-neutral-500">קק"ל</span>
                  </span>
                  <span class="inline-flex items-baseline gap-1">
                    <template v-if="item.protein === null">
                      <span class="text-xs text-neutral-500">חלבון לא ידוע</span>
                    </template>
                    <template v-else>
                      <span class="ec-num text-sm" style="color: var(--ec-violet)">{{ item.protein }}</span>
                      <span class="text-xs text-neutral-500">גר' חלבון</span>
                    </template>
                  </span>
                </p>
              </li>
            </ul>

            <p class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span class="text-sm text-neutral-600">סה"כ לארוחה:</span>
              <span class="ec-num text-sm" style="color: var(--color-brand-green)">
                {{ formatNutritionAmount(mealTotals(meal).calories) }} קק"ל
              </span>
              <span class="ec-num text-sm" style="color: var(--ec-violet)">
                {{ formatNutritionAmount(mealTotals(meal).protein) }} גר' חלבון
              </span>
              <span v-if="mealTotals(meal).hasUnknownProtein" class="text-xs text-neutral-500">(לא כולל פריט/ים עם חלבון לא ידוע)</span>
            </p>
          </template>
        </li>
      </ul>
    </template>
  </section>
</template>
