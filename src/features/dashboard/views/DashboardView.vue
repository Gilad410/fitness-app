<script setup>
import { computed, onMounted } from 'vue'
import AppLayout from '../../../layouts/AppLayout.vue'
import DashboardCard from '../../../components/dashboard/DashboardCard.vue'
import IconUsers from '../../../components/icons/IconUsers.vue'
import IconTrendingUp from '../../../components/icons/IconTrendingUp.vue'
import IconApple from '../../../components/icons/IconApple.vue'
import IconBell from '../../../components/icons/IconBell.vue'
import { useAuthStore } from '../../../stores/auth'
import { useTraineesStore } from '../../trainees/store/trainees'

const authStore = useAuthStore()
const traineesStore = useTraineesStore()

onMounted(async () => {
  try {
    await traineesStore.ensureLoaded()
  } catch {
    // Leave the trainees card at its placeholder value on failure.
  }
})

const today = computed(() =>
  new Intl.DateTimeFormat('he-IL', { dateStyle: 'full' }).format(new Date()),
)

const cards = computed(() => [
  {
    title: 'לקוחות',
    description: 'נהל את רשימת המתאמנים שלך',
    icon: IconUsers,
    value: traineesStore.loaded ? String(traineesStore.activeCount) : '—',
    comingSoon: false,
    to: '/trainees',
  },
  {
    title: 'התקדמות',
    description: 'עקוב אחר התקדמות והישגי המתאמנים',
    icon: IconTrendingUp,
    value: '—',
    comingSoon: true,
  },
  {
    title: 'תזונה',
    description: 'נהל תוכניות תזונה למתאמנים',
    icon: IconApple,
    value: '—',
    comingSoon: true,
  },
  {
    title: 'התראות',
    description: 'עדכונים והתראות אחרונות',
    icon: IconBell,
    value: '—',
    comingSoon: true,
  },
])
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
        :coming-soon="card.comingSoon"
        :to="card.to"
      />
    </section>
  </AppLayout>
</template>
