<script setup>
import { computed } from 'vue'
import AppLayout from '../../../layouts/AppLayout.vue'
import DashboardCard from '../../../components/dashboard/DashboardCard.vue'
import IconUsers from '../../../components/icons/IconUsers.vue'
import IconTrendingUp from '../../../components/icons/IconTrendingUp.vue'
import IconApple from '../../../components/icons/IconApple.vue'
import IconBell from '../../../components/icons/IconBell.vue'
import { useAuthStore } from '../../../stores/auth'

const authStore = useAuthStore()

const today = computed(() =>
  new Intl.DateTimeFormat('he-IL', { dateStyle: 'full' }).format(new Date()),
)

const cards = [
  {
    title: 'לקוחות',
    description: 'נהל את רשימת המתאמנים שלך',
    icon: IconUsers,
    value: '—',
  },
  {
    title: 'התקדמות',
    description: 'עקוב אחר התקדמות והישגי המתאמנים',
    icon: IconTrendingUp,
    value: '—',
  },
  {
    title: 'תזונה',
    description: 'נהל תוכניות תזונה למתאמנים',
    icon: IconApple,
    value: '—',
  },
  {
    title: 'התראות',
    description: 'עדכונים והתראות אחרונות',
    icon: IconBell,
    value: '—',
  },
]
</script>

<template>
  <AppLayout>
    <section class="mb-6 sm:mb-8">
      <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">
        ברוך הבא{{ authStore.user?.email ? `, ${authStore.user.email}` : '' }}
      </h1>
      <p class="mt-1 text-sm text-neutral-600">{{ today }}</p>
    </section>

    <section
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4"
      aria-label="סקירה כללית"
    >
      <DashboardCard
        v-for="card in cards"
        :key="card.title"
        :title="card.title"
        :description="card.description"
        :icon="card.icon"
        :value="card.value"
      />
    </section>
  </AppLayout>
</template>
