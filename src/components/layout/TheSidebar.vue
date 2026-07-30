<script setup>
import IconHome from '../icons/IconHome.vue'
import IconUsers from '../icons/IconUsers.vue'
import IconTrendingUp from '../icons/IconTrendingUp.vue'
import IconApple from '../icons/IconApple.vue'
import IconBell from '../icons/IconBell.vue'

defineProps({
  open: { type: Boolean, default: false },
})
defineEmits(['close'])

const navItems = [
  { label: 'לוח בקרה', icon: IconHome, to: '/' },
  { label: 'לקוחות', icon: IconUsers, to: '/trainees' },
  { label: 'התקדמות', icon: IconTrendingUp },
  { label: 'תזונה', icon: IconApple },
  { label: 'התראות', icon: IconBell },
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
    class="fixed top-0 bottom-0 start-0 z-40 w-64 border-e border-neutral-300 bg-brand-white transition-transform duration-200"
    :class="open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'"
  >
    <nav class="flex h-full flex-col gap-1 overflow-y-auto p-4 pt-6" aria-label="ניווט ראשי">
      <RouterLink
        v-for="item in navItems.filter((i) => i.to)"
        :key="item.label"
        :to="item.to"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-black transition-colors"
        active-class="bg-brand-green/10 text-brand-green"
        @click="$emit('close')"
      >
        <component :is="item.icon" class="size-5 shrink-0" />
        {{ item.label }}
      </RouterLink>

      <span
        v-for="item in navItems.filter((i) => !i.to)"
        :key="item.label"
        class="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600"
      >
        <component :is="item.icon" class="size-5 shrink-0" />
        {{ item.label }}
        <span class="ms-auto rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          בקרוב
        </span>
      </span>
    </nav>
  </aside>
</template>
