<script setup>
import { onMounted } from 'vue'
import AppLayout from '../../../layouts/AppLayout.vue'
import IconTrendingUp from '../../../components/icons/IconTrendingUp.vue'
import IconDumbbell from '../../../components/icons/IconDumbbell.vue'
import SendNotificationSection from '../components/SendNotificationSection.vue'
import { useAlertsStore } from '../store/alerts'

// Coach-side alerts, derived live from trainees / trainee_progress_logs /
// trainee_training_programs -- see the store for why no alerts table
// exists. Exactly two groups: missing weight, no active training program.
// No nutrition alerts, no read/dismissed state -- an alert simply stops
// appearing once its underlying cause is fixed.
const alertsStore = useAlertsStore()

onMounted(() => {
  alertsStore.fetchAll()
})

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })
const formatDate = (value) => dateFormatter.format(new Date(value))
</script>

<template>
  <AppLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">התראות</h1>
        <p class="mt-1 text-sm text-neutral-600">מעקב אחר מתאמנים שדורשים תשומת לב</p>
      </section>

      <p v-if="alertsStore.loading && !alertsStore.loaded" class="text-neutral-600">טוען...</p>

      <div v-else-if="alertsStore.error" class="flex flex-col items-start gap-3">
        <p class="text-sm text-status-red">{{ alertsStore.error }}</p>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="alertsStore.fetchAll()"
        >
          נסה שוב
        </button>
      </div>

      <template v-else-if="alertsStore.loaded">
        <div
          v-if="alertsStore.totalCount === 0"
          class="flex flex-col items-center gap-2 rounded-2xl border border-neutral-300 bg-brand-white p-8 text-center shadow-sm"
        >
          <span class="text-3xl" aria-hidden="true">🎉</span>
          <p class="font-semibold text-brand-black">הכל תקין!</p>
          <p class="text-sm text-neutral-600">אין כרגע התראות פעילות לאף מתאמן.</p>
        </div>

        <div v-else class="flex flex-col gap-8">
          <section v-if="alertsStore.missingWeightAlerts.length > 0" aria-labelledby="missing-weight-heading">
            <h2
              id="missing-weight-heading"
              class="mb-3 flex items-center gap-2 font-semibold text-brand-black"
            >
              <IconTrendingUp class="size-5 text-status-red" aria-hidden="true" />
              משקל חסר
              <span class="rounded-full bg-status-red/10 px-2 py-0.5 text-xs text-status-red">
                {{ alertsStore.missingWeightAlerts.length }}
              </span>
            </h2>

            <ul class="flex flex-col gap-3">
              <li v-for="alert in alertsStore.missingWeightAlerts" :key="alert.traineeId">
                <RouterLink
                  :to="`/progress/${alert.traineeId}`"
                  class="flex items-center justify-between gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
                >
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-brand-black">{{ alert.traineeName }}</p>
                    <p class="mt-0.5 text-sm text-neutral-600">
                      <template v-if="alert.lastLoggedAt">
                        לא נרשם משקל כבר {{ alert.daysMissing }} ימים (מאז
                        {{ formatDate(alert.lastLoggedAt) }})
                      </template>
                      <template v-else>
                        מעולם לא נרשם משקל למתאמן/ת זה ({{ alert.daysMissing }} ימים מהצטרפות)
                      </template>
                    </p>
                  </div>
                  <span
                    class="shrink-0 rounded-lg bg-brand-green px-3 py-1.5 text-sm font-medium text-brand-white"
                  >
                    לצפייה במשקל
                  </span>
                </RouterLink>
              </li>
            </ul>
          </section>

          <section v-if="alertsStore.noProgramAlerts.length > 0" aria-labelledby="no-program-heading">
            <h2
              id="no-program-heading"
              class="mb-3 flex items-center gap-2 font-semibold text-brand-black"
            >
              <IconDumbbell class="size-5 text-status-red" aria-hidden="true" />
              אין תוכנית אימון פעילה
              <span class="rounded-full bg-status-red/10 px-2 py-0.5 text-xs text-status-red">
                {{ alertsStore.noProgramAlerts.length }}
              </span>
            </h2>

            <ul class="flex flex-col gap-3">
              <li v-for="alert in alertsStore.noProgramAlerts" :key="alert.traineeId">
                <RouterLink
                  :to="`/training/${alert.traineeId}`"
                  class="flex items-center justify-between gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
                >
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-brand-black">{{ alert.traineeName }}</p>
                    <p class="mt-0.5 text-sm text-neutral-600">
                      אין למתאמן/ת זה תוכנית אימון פעילה כרגע
                    </p>
                  </div>
                  <span
                    class="shrink-0 rounded-lg bg-brand-green px-3 py-1.5 text-sm font-medium text-brand-white"
                  >
                    לצפייה בתוכנית
                  </span>
                </RouterLink>
              </li>
            </ul>
          </section>
        </div>
      </template>

      <!-- Manual coach -> trainee notifications: a separate feature from
      the automatic alerts above (different table, different store) --
      always shown regardless of the automatic alerts' loading/error/empty
      state, so a coach can send a notification even if that computation
      is still loading or failed. -->
      <SendNotificationSection />
    </div>
  </AppLayout>
</template>
