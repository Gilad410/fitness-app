<script setup>
import { onMounted } from 'vue'
import IconHome from '../icons/IconHome.vue'
import IconUsers from '../icons/IconUsers.vue'
import IconTrendingUp from '../icons/IconTrendingUp.vue'
import IconApple from '../icons/IconApple.vue'
import IconDumbbell from '../icons/IconDumbbell.vue'
import IconBell from '../icons/IconBell.vue'
import { useAlertsStore } from '../../features/alerts/store/alerts'

defineProps({
  open: { type: Boolean, default: false },
})
defineEmits(['close'])

const alertsStore = useAlertsStore()

// AppLayout (and this sidebar with it) remounts on every navigation, so
// this doubles as a "refresh the badge count" hook -- no separate
// polling/subscription needed for alerts to go stale-then-fresh as the
// coach moves around the app.
onMounted(() => {
  alertsStore.fetchAll()
})

const navItems = [
  { label: 'לוח בקרה', icon: IconHome, to: '/' },
  { label: 'לקוחות', icon: IconUsers, to: '/trainees' },
  { label: 'התקדמות', icon: IconTrendingUp, to: '/progress' },
  // Separate main area: /nutrition lists trainees, and picking one opens
  // their nutrition workspace at /nutrition/:id (NutritionSection). Kept
  // fully apart from /trainees/:id, which is client profile/progress only.
  { label: 'תזונה', icon: IconApple, to: '/nutrition' },
  { label: 'תוכניות אימון', icon: IconDumbbell, to: '/training' },
  { label: 'התראות', icon: IconBell, to: '/alerts' },
]
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-30 bg-brand-black/50"
    aria-hidden="true"
    @click="$emit('close')"
  />

  <aside
    class="fixed top-0 bottom-0 start-0 z-40 w-[300px] border-e border-neutral-300 bg-brand-white transition-transform duration-200"
    :class="open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'"
  >
    <nav class="flex h-full flex-col gap-2 overflow-y-auto p-4 pt-6" aria-label="ניווט ראשי">
      <RouterLink
        v-for="item in navItems.filter((i) => i.to)"
        :key="item.label"
        :to="item.to"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-brand-black transition-colors"
        active-class="bg-brand-green/10 text-brand-green-dark"
        @click="$emit('close')"
      >
        <component :is="item.icon" class="size-6 shrink-0" />
        {{ item.label }}
        <span
          v-if="item.to === '/alerts' && alertsStore.totalCount > 0"
          class="ms-auto flex min-w-5 items-center justify-center rounded-full bg-status-red px-1.5 py-0.5 text-xs font-semibold text-brand-white"
        >
          {{ alertsStore.totalCount }}
        </span>
      </RouterLink>

      <span
        v-for="item in navItems.filter((i) => !i.to)"
        :key="item.label"
        class="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-neutral-600"
      >
        <component :is="item.icon" class="size-6 shrink-0" />
        {{ item.label }}
        <span class="ms-auto rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          בקרוב
        </span>
      </span>
    </nav>
  </aside>
</template>
