<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'
import { useTraineeProfileStore } from '../store/traineeProfile'
import { useTraineeNutritionPlanStore } from '../store/traineeNutritionPlan'

// Mirrors src/components/layout/TheHeader.vue's structure/branding/visual
// design (same sticky navy bar, same hamburger-to-toggle-sidebar pattern,
// same `.trainee-portal` scoped palette -- see style.css) but is its own
// component with no import of anything coach-side, so the trainee area can
// never accidentally pull in coach chrome.
defineEmits(['toggle-sidebar'])

const authStore = useAuthStore()
const profileStore = useTraineeProfileStore()
const nutritionPlanStore = useTraineeNutritionPlanStore()
const router = useRouter()

async function handleLogout() {
  await authStore.signOut()
  // Explicit clear of sensitive per-account cached state -- see
  // traineeNutritionPlan.js's reset()/traineeNutritionPlanCore.js for why
  // this is a belt-and-suspenders addition on top of (not a replacement
  // for) that store's own lazy per-access isolation.
  nutritionPlanStore.reset()
  router.push('/trainee/login')
}
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-neutral-300 bg-brand-black px-4 sm:px-6"
  >
    <div class="flex items-center gap-3">
      <!--
        `ec-menu-trigger` (see style.css) hides this on phone-sized touch
        viewports in favor of TraineeBottomNavElectric.vue; on
        desktop/tablet it opens the existing right-hand drawer
        (TraineeSidebar.vue).
      -->
      <button
        type="button"
        class="ec-menu-trigger rounded-md p-2.5 text-brand-white hover:bg-white/10"
        aria-label="פתיחת תפריט ניווט"
        @click="$emit('toggle-sidebar')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-6"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <span class="text-lg font-bold text-brand-white">האזור האישי שלי</span>
    </div>

    <div class="flex items-center gap-3 sm:gap-4">
      <!-- Trainee name + account indication -- falls back to the account
      email until trainee_get_own_profile() resolves (or if it never does,
      e.g. a not-yet-linked account), so this line is never blank. -->
      <div class="hidden text-end sm:block">
        <p class="max-w-[12rem] truncate text-sm font-medium text-brand-white">
          {{ profileStore.profile?.full_name ?? authStore.user?.email }}
        </p>
        <p
          v-if="profileStore.profile?.full_name"
          class="max-w-[12rem] truncate text-xs text-neutral-300"
        >
          {{ authStore.user?.email }}
        </p>
      </div>
      <button
        type="button"
        class="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-neutral-600 px-3 py-1.5 text-sm font-medium text-brand-white transition-colors hover:border-brand-green hover:text-brand-green"
        @click="handleLogout"
      >
        התנתקות
      </button>
    </div>
  </header>
</template>
