<script setup>
import { computed, onMounted } from 'vue'
import TraineeLayout from '../layouts/TraineeLayout.vue'
import DashboardCard from '../../../components/dashboard/DashboardCard.vue'
import IconDumbbell from '../../../components/icons/IconDumbbell.vue'
import IconApple from '../../../components/icons/IconApple.vue'
import IconTrendingUp from '../../../components/icons/IconTrendingUp.vue'
import IconRuler from '../../../components/icons/IconRuler.vue'
import { useTraineeProfileStore } from '../store/traineeProfile'
import { useTraineeNotificationsStore } from '../store/traineeNotifications'

// Trainee dashboard -- deliberately built only from data the trainee role
// is actually authorized to read under 021_trainee_auth_and_roles.sql:
// trainee_get_own_profile() and public.trainee_notifications. The four
// cards below link to real (placeholder) routes, not fake data -- see
// TraineeComingSoon.vue and the per-section views for why.
const profileStore = useTraineeProfileStore()
const notificationsStore = useTraineeNotificationsStore()

onMounted(() => {
  profileStore.fetchProfile().catch(() => {})
  notificationsStore.fetchAll().catch(() => {})
})

const goalLabels = {
  fat_loss: 'ירידה במשקל',
  muscle_gain: 'עלייה במסת שריר',
  maintenance: 'שמירה על משקל',
  custom: 'אחר',
}

const today = computed(() =>
  new Intl.DateTimeFormat('he-IL', { dateStyle: 'full' }).format(new Date()),
)

const recentNotifications = computed(() => notificationsStore.items.slice(0, 3))

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' })

// "בקרוב" only for sections 022_trainee_nutrition_access.sql doesn't grant
// access to yet -- nutrition is now a real, working feature (own read
// access + trainee_log_nutrition_entry()/trainee_delete_nutrition_entry()),
// so its card no longer carries that badge.
const futureCards = [
  {
    title: 'תוכנית האימונים שלי',
    description: 'התרגילים, הסטים והחזרות שהוגדרו עבורך.',
    icon: IconDumbbell,
    to: '/trainee/training',
    comingSoon: true,
  },
  {
    title: 'התזונה שלי',
    description: 'יעדי התזונה והיומן שלך.',
    icon: IconApple,
    to: '/trainee/nutrition',
    comingSoon: false,
  },
  {
    title: 'ההתקדמות שלי',
    description: 'מעקב משקל והתקדמות לאורך זמן.',
    icon: IconTrendingUp,
    to: '/trainee/progress',
    comingSoon: true,
  },
  {
    title: 'מדידות ותמונות',
    description: 'היקפי גוף ותמונות התקדמות פרטיות.',
    icon: IconRuler,
    to: '/trainee/measurements',
    comingSoon: true,
  },
]
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-3xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">
          שלום{{ profileStore.profile?.full_name ? `, ${profileStore.profile.full_name}` : '' }} 👋
        </h1>
        <p class="mt-1 text-sm text-neutral-600">{{ today }}</p>
      </section>

      <!-- Profile summary -->
      <section class="mb-6 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
        <h2 class="mb-4 font-semibold text-brand-black">הפרופיל שלי</h2>

        <p v-if="profileStore.loading && !profileStore.loaded" class="text-sm text-neutral-600">
          טוען...
        </p>

        <div v-else-if="profileStore.error" class="flex flex-col items-start gap-3">
          <p class="text-sm text-status-red">{{ profileStore.error }}</p>
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
            @click="profileStore.fetchProfile()"
          >
            נסה שוב
          </button>
        </div>

        <p v-else-if="!profileStore.profile" class="text-sm text-neutral-600">
          לא נמצא פרופיל מקושר לחשבון זה. יש לפנות למאמן/ת.
        </p>

        <dl v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div v-if="profileStore.profile.email">
            <dt class="text-xs font-medium text-neutral-500">אימייל</dt>
            <dd class="mt-0.5 text-sm text-brand-black">{{ profileStore.profile.email }}</dd>
          </div>
          <div v-if="profileStore.profile.phone">
            <dt class="text-xs font-medium text-neutral-500">טלפון</dt>
            <dd class="mt-0.5 text-sm text-brand-black">{{ profileStore.profile.phone }}</dd>
          </div>
          <div v-if="profileStore.profile.goal">
            <dt class="text-xs font-medium text-neutral-500">מטרה</dt>
            <dd class="mt-0.5 text-sm text-brand-black">
              {{ goalLabels[profileStore.profile.goal] ?? profileStore.profile.goal }}
            </dd>
          </div>
          <div v-if="profileStore.profile.starting_weight">
            <dt class="text-xs font-medium text-neutral-500">משקל התחלתי</dt>
            <dd class="mt-0.5 text-sm text-brand-black">{{ profileStore.profile.starting_weight }} ק"ג</dd>
          </div>
          <div v-if="profileStore.profile.target_weight">
            <dt class="text-xs font-medium text-neutral-500">משקל מטרה</dt>
            <dd class="mt-0.5 text-sm text-brand-black">{{ profileStore.profile.target_weight }} ק"ג</dd>
          </div>
        </dl>
      </section>

      <!-- Notifications preview -->
      <section class="mb-6 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-semibold text-brand-black">התראות אחרונות</h2>
          <RouterLink to="/trainee/notifications" class="text-sm font-medium text-brand-green hover:underline">
            לכל ההתראות
          </RouterLink>
        </div>

        <p v-if="notificationsStore.loading && !notificationsStore.loaded" class="text-sm text-neutral-600">
          טוען...
        </p>

        <div v-else-if="notificationsStore.error" class="flex flex-col items-start gap-3">
          <p class="text-sm text-status-red">{{ notificationsStore.error }}</p>
          <button
            type="button"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
            @click="notificationsStore.fetchAll()"
          >
            נסה שוב
          </button>
        </div>

        <p v-else-if="notificationsStore.items.length === 0" class="text-sm text-neutral-600">
          אין עדיין התראות.
        </p>

        <template v-else>
          <p v-if="notificationsStore.unreadCount > 0" class="mb-3 text-sm text-neutral-600">
            יש לך <span class="font-semibold text-status-red">{{ notificationsStore.unreadCount }}</span>
            התראות שטרם נקראו.
          </p>
          <ul class="flex flex-col gap-3">
            <li
              v-for="n in recentNotifications"
              :key="n.id"
              class="flex flex-col gap-1 rounded-xl border p-3"
              :class="n.is_read ? 'border-neutral-300' : 'border-brand-green/40 bg-brand-green/5'"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-brand-black">{{ n.title }}</p>
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="n.is_read ? 'bg-neutral-100 text-neutral-600' : 'bg-brand-green/10 text-brand-green'"
                >
                  {{ n.is_read ? 'נקראה' : 'חדשה' }}
                </span>
              </div>
              <p class="line-clamp-2 text-sm text-neutral-600">{{ n.message }}</p>
              <p class="text-xs text-neutral-500">{{ dateTimeFormatter.format(new Date(n.created_at)) }}</p>
            </li>
          </ul>
        </template>
      </section>

      <!-- Future sections -->
      <section aria-label="האזור שלי">
        <h2 class="mb-3 font-semibold text-brand-black">האזור שלי</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DashboardCard
            v-for="card in futureCards"
            :key="card.title"
            :icon="card.icon"
            :title="card.title"
            :description="card.description"
            :to="card.to"
            :coming-soon="card.comingSoon"
          />
        </div>
      </section>
    </div>
  </TraineeLayout>
</template>
