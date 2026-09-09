<script setup>
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import IconHome from '../icons/IconHome.vue'
import IconUsers from '../icons/IconUsers.vue'
import IconBell from '../icons/IconBell.vue'
import IconPlus from '../icons/IconPlus.vue'
import IconMore from '../icons/IconMore.vue'
import IconTrendingUp from '../icons/IconTrendingUp.vue'
import IconApple from '../icons/IconApple.vue'
import IconDumbbell from '../icons/IconDumbbell.vue'
import { useAlertsStore } from '../../features/alerts/store/alerts'

// Mobile bottom navigation for the coach portal, part of the "Electric
// Coach" visual design. Rendered by AppLayout.vue on every coach screen;
// whether it is actually visible (vs. the top-right hamburger + drawer) is
// decided purely by CSS -- see the `.ec-bottom-nav` / `.ec-menu-trigger`
// media-query rules in style.css, which key off viewport width AND
// pointer/hover capability (no user-agent sniffing), so a narrow desktop
// window with a mouse still gets the hamburger menu.
//
// Five items per spec: בית / מתאמנים / הוספה (prominent, centered) /
// התראות / עוד. "עוד" opens a small sheet with the coach sections that
// don't fit in a 5-slot bar -- התקדמות, תזונה, תוכניות אימון -- all
// real, already-working destinations (same routes the existing sidebar
// links to), not new features.
const alertsStore = useAlertsStore()
const moreOpen = ref(false)
const moreToggleRef = useTemplateRef('moreToggle')
const moreSheetRef = useTemplateRef('moreSheet')

const moreItems = [
  { label: 'התקדמות', icon: IconTrendingUp, to: '/progress' },
  { label: 'תזונה', icon: IconApple, to: '/nutrition' },
  { label: 'תוכניות אימון', icon: IconDumbbell, to: '/training' },
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
       CSS custom properties on `.coach-portal` (see style.css), which only
       inherit down the real DOM tree, so this has to stay inside that
       subtree (fixed positioning already lifts it above normal page
       layout without needing a teleport). -->
  <div
    v-if="moreOpen"
    class="fixed inset-0 z-40 bg-brand-black/40"
    aria-hidden="true"
    @click="closeMore"
  />

  <div
    v-if="moreOpen"
    id="ec-more-sheet"
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
    </RouterLink>
  </div>

  <nav
    class="ec-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-neutral-300 bg-brand-white/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
    aria-label="ניווט תחתון"
  >
    <div class="grid grid-cols-5 items-end px-1 pt-2 pb-1.5">
      <RouterLink
        to="/"
        class="flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-neutral-600"
        active-class="!text-brand-green-dark"
        exact-active-class="!text-brand-green-dark"
      >
        <IconHome class="size-6" />
        בית
      </RouterLink>

      <RouterLink
        to="/trainees"
        class="flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-neutral-600"
        active-class="!text-brand-green-dark"
      >
        <IconUsers class="size-6" />
        מתאמנים
      </RouterLink>

      <!-- Prominent central Add action: a real, already-working
           destination (existing "add trainee" form), just visually
           elevated -- not a new feature. -->
      <RouterLink
        to="/trainees/new"
        class="flex flex-col items-center gap-1 py-1 text-[11px] font-medium text-brand-black"
      >
        <span
          class="-mt-6 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand-green)] to-[var(--ec-violet)] text-brand-white shadow-[0_6px_16px_rgba(47,111,237,0.4)] ring-4 ring-brand-white"
        >
          <IconPlus class="size-7" />
        </span>
        הוספה
      </RouterLink>

      <RouterLink
        to="/alerts"
        class="relative flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium text-neutral-600"
        active-class="!text-brand-green-dark"
      >
        <span class="relative">
          <IconBell class="size-6" />
          <span
            v-if="alertsStore.totalCount > 0"
            class="absolute -top-1 -end-1 flex min-w-3.5 items-center justify-center rounded-full bg-status-red px-1 text-[9px] font-semibold text-brand-white"
          >
            {{ alertsStore.totalCount }}
          </span>
        </span>
        התראות
      </RouterLink>

      <button
        ref="moreToggle"
        type="button"
        class="flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] font-medium"
        :class="moreOpen ? 'text-brand-green-dark' : 'text-neutral-600'"
        aria-haspopup="dialog"
        :aria-expanded="moreOpen"
        aria-controls="ec-more-sheet"
        @click="moreOpen = !moreOpen"
      >
        <IconMore class="size-6" />
        עוד
      </button>
    </div>
  </nav>
</template>
