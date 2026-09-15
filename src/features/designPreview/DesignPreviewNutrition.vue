<script setup>
import { computed, ref } from 'vue'
import DesignPreviewShell from './DesignPreviewShell.vue'
import DesignPreviewRing from './DesignPreviewRing.vue'
import DesignPreviewFoodSheet from './DesignPreviewFoodSheet.vue'
import IconPlus from '../../components/icons/IconPlus.vue'
import { formatNutritionAmount } from '../../lib/formatNumber'
import { DEMO_CALORIE_GOAL, DEMO_PROTEIN_GOAL, DEMO_MEALS, demoMealsTotals } from './designPreviewData'

// Nutrition screen, visual-direction preview -- demo data only. Answers
// the same questions the real TraineeNutritionView.vue does (today's
// totals, a day switcher, the food log grouped by meal, adding a new
// entry) with the new "Tempo" direction and, for the food picker
// specifically, a bottom sheet instead of an inline form -- see the
// mobile-first requirement in the brief. Calories and protein only,
// matching the real app's actual scope -- no other macro is shown or
// invented here.
const DEMO_DAYS = ['יום רביעי', 'יום חמישי', 'יום שישי']
const dayIndex = ref(2)
const dayLabel = computed(() => DEMO_DAYS[dayIndex.value])

// Local, component-scoped copy only -- cloned once so "adding a food"
// below can genuinely mutate what's on screen without ever touching the
// shared demo constants (which stay the same every time this screen
// mounts) or anything resembling a store/API call.
const meals = ref(DEMO_MEALS.map((meal) => ({ ...meal, items: [...meal.items] })))
const totals = computed(() => demoMealsTotals(meals.value))
const remaining = computed(() => Math.max(0, DEMO_CALORIE_GOAL - totals.value.calories))
const proteinRatio = computed(() => Math.min(1, totals.value.protein / DEMO_PROTEIN_GOAL))
const proteinGoalMet = computed(() => totals.value.protein >= DEMO_PROTEIN_GOAL)

const sheetOpen = ref(false)
const toast = ref(null)
let toastTimer = null

function handleAdded(entry) {
  // Adds into today's most recent meal group for the demo -- genuinely
  // updates the ring/protein bar/log below, entirely in this component's
  // own local state.
  const lastMeal = meals.value[meals.value.length - 1]
  lastMeal.items.push(entry)
  sheetOpen.value = false

  toast.value = `נוסף ליומן: ${entry.name}`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 2600)
}
</script>

<template>
  <DesignPreviewShell active="nutrition">
    <div class="mx-auto max-w-5xl md:flex md:items-start md:gap-6 md:px-6 md:pt-6">
      <div class="md:flex-1">
        <!-- Day switcher -->
        <div class="flex items-center justify-center gap-4 px-4 pt-4 pb-2 md:justify-start md:px-0">
          <!-- RTL: this flex row visually reverses, so the FIRST button
               (previous day) renders on the physical RIGHT and the second
               (next day) on the physical LEFT -- each glyph points OUTWARD
               from the label toward its own rendered side, not toward the
               arrow shape an LTR reading would suggest. -->
          <button
            type="button"
            class="flex size-10 items-center justify-center rounded-full"
            style="color: var(--tp-ink-soft)"
            :disabled="dayIndex === 0"
            aria-label="יום קודם"
            @click="dayIndex = Math.max(0, dayIndex - 1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <p class="w-28 text-center text-base font-bold md:w-auto">{{ dayLabel }}</p>
          <button
            type="button"
            class="flex size-10 items-center justify-center rounded-full"
            style="color: var(--tp-ink-soft)"
            :disabled="dayIndex === DEMO_DAYS.length - 1"
            aria-label="יום הבא"
            @click="dayIndex = Math.min(DEMO_DAYS.length - 1, dayIndex + 1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <!-- Mobile hero (hidden on desktop -- becomes the persistent right panel there) -->
        <section class="tp-hero mx-4 md:hidden">
          <div class="relative mx-auto flex w-fit items-center justify-center">
            <DesignPreviewRing :value="totals.calories" :max="DEMO_CALORIE_GOAL" :size="152" />
            <div class="absolute flex flex-col items-center">
              <p class="tp-num text-3xl leading-none">{{ formatNutritionAmount(totals.calories) }}</p>
              <p class="mt-1 text-xs opacity-70">מתוך {{ formatNutritionAmount(DEMO_CALORIE_GOAL) }} קק"ל</p>
            </div>
          </div>
          <p class="mt-3 text-center text-sm opacity-90">
            נותרו <span class="tp-num">{{ formatNutritionAmount(remaining) }}</span> קק"ל
          </p>

          <div class="mt-4">
            <div class="flex items-center justify-between text-xs opacity-80">
              <span>חלבון</span>
              <span class="tp-num">{{ formatNutritionAmount(totals.protein) }} / {{ DEMO_PROTEIN_GOAL }} גר'</span>
            </div>
            <div class="mt-1.5 h-2 rounded-full" style="background: rgba(255,255,255,0.16)">
              <div
                class="h-full rounded-full transition-[width] duration-500"
                :style="{ width: `${proteinRatio * 100}%`, background: proteinGoalMet ? 'var(--tp-mint)' : 'var(--tp-violet)' }"
              />
            </div>
          </div>
        </section>

        <!-- Meal log -->
        <div class="px-4 pt-5 md:px-0">
          <div v-for="meal in meals" :key="meal.id" class="mb-5">
            <div class="mb-2 flex items-baseline justify-between">
              <p class="text-sm font-bold">{{ meal.label }}</p>
              <span class="tp-num text-xs" style="color: var(--tp-ink-soft)">
                {{ formatNutritionAmount(meal.items.reduce((s, i) => s + i.calories, 0)) }} קק"ל
              </span>
            </div>
            <ul class="tp-card divide-y" style="--tw-divide-color: var(--tp-border)">
              <li v-for="item in meal.items" :key="item.id" class="flex items-center justify-between gap-3 p-4">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{{ item.name }}</p>
                  <p class="mt-0.5 text-xs" style="color: var(--tp-ink-soft)">{{ item.quantity }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                  <span class="tp-stat-pair">
                    <span class="tp-num text-sm" style="color: var(--tp-blue)">{{ formatNutritionAmount(item.calories) }}</span>
                    <span class="text-[11px]" style="color: var(--tp-ink-soft)">קק"ל</span>
                  </span>
                  <span class="tp-stat-pair">
                    <span class="tp-num text-sm" style="color: var(--tp-violet)">{{ formatNutritionAmount(item.protein) }}</span>
                    <span class="text-[11px]" style="color: var(--tp-ink-soft)">גר'</span>
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Desktop persistent summary panel -->
      <aside class="tp-hero sticky top-6 hidden w-72 shrink-0 md:block">
        <p class="text-sm font-semibold opacity-80">סיכום היום</p>
        <div class="relative mx-auto mt-4 flex w-fit items-center justify-center">
          <DesignPreviewRing :value="totals.calories" :max="DEMO_CALORIE_GOAL" :size="152" />
          <div class="absolute flex flex-col items-center">
            <p class="tp-num text-3xl leading-none">{{ formatNutritionAmount(totals.calories) }}</p>
            <p class="mt-1 text-xs opacity-70">מתוך {{ formatNutritionAmount(DEMO_CALORIE_GOAL) }} קק"ל</p>
          </div>
        </div>
        <div class="mt-5">
          <div class="flex items-center justify-between text-xs opacity-80">
            <span>חלבון</span>
            <span class="tp-num">{{ formatNutritionAmount(totals.protein) }} / {{ DEMO_PROTEIN_GOAL }} גר'</span>
          </div>
          <div class="mt-1.5 h-2 rounded-full" style="background: rgba(255,255,255,0.16)">
            <div
              class="h-full rounded-full transition-[width] duration-500"
              :style="{ width: `${proteinRatio * 100}%`, background: proteinGoalMet ? 'var(--tp-mint)' : 'var(--tp-violet)' }"
            />
          </div>
        </div>
        <button type="button" class="tp-btn-primary mt-5 w-full" @click="sheetOpen = true">
          <IconPlus class="size-4" />
          הוספת מאכל
        </button>
      </aside>
    </div>

    <!-- Mobile floating action -->
    <button type="button" class="tp-fab md:hidden" aria-label="הוספת מאכל" @click="sheetOpen = true">
      <IconPlus class="size-6" />
    </button>

    <DesignPreviewFoodSheet v-if="sheetOpen" @close="sheetOpen = false" @add="handleAdded" />

    <Transition name="tp-toast">
      <div
        v-if="toast"
        class="fixed inset-x-0 top-4 z-[60] mx-auto flex w-fit items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        style="background: var(--tp-mint)"
        role="status"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {{ toast }}
      </div>
    </Transition>
  </DesignPreviewShell>
</template>
