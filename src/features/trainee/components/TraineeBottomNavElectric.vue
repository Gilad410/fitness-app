<script setup>
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import IconHome from '../../../components/icons/IconHome.vue'
import IconDumbbell from '../../../components/icons/IconDumbbell.vue'
import IconApple from '../../../components/icons/IconApple.vue'
import IconTrendingUp from '../../../components/icons/IconTrendingUp.vue'
import IconRuler from '../../../components/icons/IconRuler.vue'
import IconBell from '../../../components/icons/IconBell.vue'
import IconMore from '../../../components/icons/IconMore.vue'
import { useTraineeNotificationsStore } from '../store/traineeNotifications'

// Mobile bottom navigation for the trainee portal -- mirrors
// TheBottomNavElectric.vue's (coach) shape/behavior exactly, just with
// trainee-only destinations (same routes TraineeSidebar.vue already links
// to, not new features). Rendered by TraineeLayout.vue; whether it's
// actually visible (vs. the top-right hamburger + drawer) is decided
// purely by CSS -- see the `.ec-bottom-nav` / `.ec-menu-trigger`
// media-query rules in style.css, keyed off viewport width AND
// pointer/hover capability (no user-agent sniffing).
//
// Five items per the same spec shape as the coach nav: בית / אימון /
// תזונה / התקדמות / עוד. "עוד" opens a small sheet for what doesn't fit in
// a 5-slot bar -- מדידות ותמונות, התראות -- both real, already-working
// destinations (same routes the existing sidebar links to).
const notificationsStore = useTraineeNotificationsStore()
const moreOpen = ref(false)
const moreToggleRef = useTemplateRef('moreToggle')
const moreSheetRef = useTemplateRef('moreSheet')

const moreItems = [
  { label: 'מדידות ותמונות', icon: IconRuler, to: '/trainee/measurements' },
  { label: 'התראות', icon: IconBell, to: '/trainee/notifications', badge: () => notificationsStore.unreadCount },
]

function closeMore() {
  moreOpen.value = false
  // Return focus to the trigger so keyboard/screen-reader users land back
  // where they started, instead of on a now-hidden element.
  moreToggleRef.value?.focus()
}

function onSheetKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    closeMore()
  }
}

// Basic focus management for the sheet: move focus into it on open, per
// standard dialog a11y expectations (it's a small, non-nested overlay, so
// a full focus trap isn't implemented -- Escape/backdrop/close always
// remain reachable).
watch(moreOpen, async (open) => {
  if (!open) return
  await nextTick()
  moreSheetRef.value?.querySelector('a, button')?.focus()
})
</script>

<template>
  <!-- Not teleported to <body>: the Electric Coach palette is applied via
       CSS custom properties on `.trainee-portal` (see style.css), which
       only inherit down the real DOM tree, so this has to stay inside
       that subtree (fixed positioning already lifts it above normal page
       layout without needing a teleport). -->
  <div
    v-if="moreOpen"
    class="fixed inset-0 z-40 bg-brand-black/40"
    aria-hidden="true"
    @click="closeMore"
  />

  <div
    v-if="moreOpen"
    id="ec-trainee-more-sheet"
    ref="moreSheet"
    class="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-neutral-300 bg-brand-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(16,20,51,0.16)]"
    role="dialog"
    aria-modal="true"
    aria-label="עוד ניווט"
    @keydown="onSheetKeydown"
  >
    <div class="flex items-center justify-between px-2 pb-2">
      <p class="text-sm font-semibold text-neutral-600">עוד</p>
      <button
        type="button"
        class="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100"
        aria-label="סגירה"
        @click="closeMore"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          class="size-5"
          aria-hidden="true"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      </button>
    </div>
    <RouterLink
      v-for="item in moreItems"
      :key="item.label"
      :to="item.to"
      class="flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium text-brand-black hover:bg-neutral-100"
      @click="closeMore"
    >
      <component :is="item.icon" class="size-5 shrink-0 text-brand-green" />
      {{ item.label }}
      <span
        v-if="item.badge?.() > 0"
        class="ms-auto flex min-w-5 items-center justify-center rounded-full bg-status-red px-1.5 py-0.5 text-xs font-semibold text-brand-white"
      >
        {{ item.badge() }}
      </span>
    </RouterLink>
  </div>

  <nav
    class="ec-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-neutral-300 bg-brand-white/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
    aria-label="ניווט תחתון"
  >
    <div class="grid grid-cols-5 items-center px-1 pt-2 pb-1.5">
      <RouterLink
        to="/trainee"
        class="flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-neutral-600"
        active-class="!text-brand-green-dark"
        exact-active-class="!text-brand-green-dark"
      >
        <IconHome class="size-6" />
        בית
      </RouterLink>

      <RouterLink
        to="/trainee/training"
        class="flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-neutral-600"
        active-class="!text-brand-green-dark"
      >
        <IconDumbbell class="size-6" />
        אימון
      </RouterLink>

      <RouterLink
        to="/trainee/nutrition"
        class="flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-neutral-600"
        active-class="!text-brand-green-dark"
      >
        <IconApple class="size-6" />
        תזונה
      </RouterLink>

      <RouterLink
        to="/trainee/progress"
        class="flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-neutral-600"
        active-class="!text-brand-green-dark"
      >
        <IconTrendingUp class="size-6" />
        התקדמות
      </RouterLink>

      <button
        ref="moreToggle"
        type="button"
        class="relative flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium"
        :class="moreOpen ? 'text-brand-green-dark' : 'text-neutral-600'"
        aria-haspopup="dialog"
        :aria-expanded="moreOpen"
        aria-controls="ec-trainee-more-sheet"
        @click="moreOpen = !moreOpen"
      >
        <span class="relative">
          <IconMore class="size-6" />
          <span
            v-if="notificationsStore.unreadCount > 0"
            class="absolute -top-0.5 -end-0.5 size-2 rounded-full bg-status-red"
            aria-hidden="true"
          />
        </span>
        עוד
      </button>
    </div>
  </nav>
</template>
