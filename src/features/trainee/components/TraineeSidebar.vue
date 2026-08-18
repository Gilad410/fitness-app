<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import IconHome from '../../../components/icons/IconHome.vue'
import IconDumbbell from '../../../components/icons/IconDumbbell.vue'
import IconApple from '../../../components/icons/IconApple.vue'
import IconTrendingUp from '../../../components/icons/IconTrendingUp.vue'
import IconRuler from '../../../components/icons/IconRuler.vue'
import IconBell from '../../../components/icons/IconBell.vue'
import { useTraineeNotificationsStore } from '../store/traineeNotifications'

// Mirrors src/components/layout/TheSidebar.vue's off-canvas structure, but
// entirely separate: no shared import with the coach sidebar, and every
// nav target here is a trainee-only route (021_trainee_auth_and_roles.sql
// grants a trainee role no access to anything else, so there is nothing
// coach-side this menu could even point at).
defineProps({
  open: { type: Boolean, default: false },
})
defineEmits(['close'])

const route = useRoute()
const notificationsStore = useTraineeNotificationsStore()

// Same "refresh on every layout mount" role the coach TheSidebar's
// alertsStore.fetchAll() plays for its badge -- this remounts on every
// navigation, so the unread badge here stays current as the trainee
// moves around their own area.
onMounted(() => {
  notificationsStore.fetchAll().catch(() => {})
})

const navItems = [
  { label: 'לוח בקרה', icon: IconHome, to: '/trainee' },
  { label: 'תוכנית האימונים שלי', icon: IconDumbbell, to: '/trainee/training' },
  { label: 'התזונה שלי', icon: IconApple, to: '/trainee/nutrition' },
  { label: 'ההתקדמות שלי', icon: IconTrendingUp, to: '/trainee/progress' },
  { label: 'מדידות ותמונות', icon: IconRuler, to: '/trainee/measurements' },
  { label: 'התראות', icon: IconBell, to: '/trainee/notifications' },
]

// Plain RouterLink active-class does prefix matching, which would light up
// "לוח בקרה" (/trainee) while on any nested trainee page too -- this keeps
// exactly one item highlighted at a time.
function isActive(to) {
  return to === '/trainee' ? route.path === to : route.path.startsWith(to)
}
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
    <nav class="flex h-full flex-col gap-2 overflow-y-auto p-4 pt-6" aria-label="ניווט אזור מתאמן">
      <RouterLink
        v-for="item in navItems"
        :key="item.label"
        :to="item.to"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors"
        :class="isActive(item.to) ? 'bg-brand-green/10 text-brand-green' : 'text-brand-black hover:bg-neutral-100'"
        @click="$emit('close')"
      >
        <component :is="item.icon" class="size-6 shrink-0" />
        {{ item.label }}
        <span
          v-if="item.to === '/trainee/notifications' && notificationsStore.unreadCount > 0"
          class="ms-auto flex min-w-5 items-center justify-center rounded-full bg-status-red px-1.5 py-0.5 text-xs font-semibold text-brand-white"
        >
          {{ notificationsStore.unreadCount }}
        </span>
      </RouterLink>
    </nav>
  </aside>
</template>
