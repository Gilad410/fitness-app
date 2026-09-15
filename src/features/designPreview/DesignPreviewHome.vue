<script setup>
import { computed } from 'vue'
import DesignPreviewShell from './DesignPreviewShell.vue'
import DesignPreviewRing from './DesignPreviewRing.vue'
import IconDumbbell from '../../components/icons/IconDumbbell.vue'
import IconApple from '../../components/icons/IconApple.vue'
import IconTrendingUp from '../../components/icons/IconTrendingUp.vue'
import IconRuler from '../../components/icons/IconRuler.vue'
import { formatNutritionAmount } from '../../lib/formatNumber'
import { DEMO_TRAINEE_NAME, DEMO_CALORIE_GOAL, DEMO_MEALS, DEMO_NOTIFICATIONS, demoMealsTotals } from './designPreviewData'

// Trainee home screen, visual-direction preview -- demo data only (see
// designPreviewData.js). Structurally answers the same questions the
// real TraineeHomeView.vue does (greeting, today at a glance, quick
// access to the trainee's areas, recent notifications) with the new
// "Tempo" direction, not a redesign of its data or behavior.
const today = new Intl.DateTimeFormat('he-IL', { dateStyle: 'full' }).format(new Date())

const totals = demoMealsTotals(DEMO_MEALS)
const remaining = computed(() => Math.max(0, DEMO_CALORIE_GOAL - totals.calories))

const quickLinks = [
  { label: 'אימון', icon: IconDumbbell, color: 'var(--tp-violet)', tint: 'rgba(139,92,246,0.12)' },
  { label: 'תזונה', icon: IconApple, color: 'var(--tp-blue)', tint: 'rgba(47,111,237,0.12)', to: '/design-preview/nutrition' },
  { label: 'התקדמות', icon: IconTrendingUp, color: 'var(--tp-mint)', tint: 'rgba(23,184,146,0.12)' },
  { label: 'מדידות ותמונות', icon: IconRuler, color: 'var(--tp-navy)', tint: 'rgba(18,21,58,0.08)' },
]
</script>

<template>
  <DesignPreviewShell active="home">
    <section class="tp-hero">
      <p class="text-2xl font-extrabold">שלום, {{ DEMO_TRAINEE_NAME }}</p>
      <p class="mt-1 text-sm opacity-75">{{ today }}</p>

      <div class="relative mx-auto mt-6 flex w-fit items-center justify-center">
        <DesignPreviewRing :value="totals.calories" :max="DEMO_CALORIE_GOAL" :size="168" :stroke-width="14" />
        <div class="absolute flex flex-col items-center">
          <p class="tp-num text-4xl leading-none">{{ formatNutritionAmount(totals.calories) }}</p>
          <p class="mt-1 text-xs opacity-70">מתוך {{ formatNutritionAmount(DEMO_CALORIE_GOAL) }} קק"ל</p>
        </div>
      </div>
      <p class="mt-4 text-center text-sm opacity-90">
        נותרו <span class="tp-num">{{ formatNutritionAmount(remaining) }}</span> קק"ל להיום
      </p>
    </section>

    <div class="mx-auto max-w-3xl px-4 pt-6">
      <h2 class="mb-3 text-base font-bold">האזור שלי</h2>
      <div class="grid grid-cols-2 gap-3">
        <component
          :is="link.to ? 'RouterLink' : 'div'"
          v-for="link in quickLinks"
          :key="link.label"
          :to="link.to"
          class="tp-nav-card"
        >
          <span class="tp-nav-icon" :style="{ background: link.tint, color: link.color }">
            <component :is="link.icon" class="size-5" />
          </span>
          <span class="text-sm font-semibold">{{ link.label }}</span>
        </component>
      </div>

      <h2 class="mt-8 mb-3 text-base font-bold">התראות אחרונות</h2>
      <ul class="flex flex-col gap-3">
        <li v-for="n in DEMO_NOTIFICATIONS" :key="n.id" class="tp-card flex items-start gap-3 p-4">
          <span
            class="mt-1.5 size-2 shrink-0 rounded-full"
            :style="{ background: n.isRead ? 'var(--tp-border)' : 'var(--tp-blue)' }"
            aria-hidden="true"
          />
          <div class="min-w-0">
            <p class="text-sm font-semibold">{{ n.title }}</p>
            <p class="mt-0.5 text-sm" style="color: var(--tp-ink-soft)">{{ n.message }}</p>
          </div>
        </li>
      </ul>
    </div>
  </DesignPreviewShell>
</template>
