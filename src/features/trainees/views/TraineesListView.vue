<script setup>
import { computed, onMounted, ref } from 'vue'
import AppLayout from '../../../layouts/AppLayout.vue'
import LoadErrorState from '../../../components/feedback/LoadErrorState.vue'
import TraineeStatusBadge from '../components/TraineeStatusBadge.vue'
import { useTraineesStore } from '../store/trainees'

const traineesStore = useTraineesStore()

// A failure is rendered from traineesStore.error below; caught here only so
// it isn't also an unhandled rejection. ensureLoaded() doesn't cache a
// failed load, so the retry button genuinely refetches.
function loadTrainees() {
  traineesStore.ensureLoaded().catch(() => {})
}

onMounted(loadTrainees)

const statusFilter = ref('roster')

const filterOptions = [
  { value: 'roster', label: 'הכל' },
  { value: 'active', label: 'פעיל' },
  { value: 'paused', label: 'בהשהיה' },
  { value: 'archived', label: 'בארכיון' },
]

const filteredTrainees = computed(() => {
  if (statusFilter.value === 'roster') {
    return traineesStore.trainees.filter((t) => t.status !== 'archived')
  }
  return traineesStore.trainees.filter((t) => t.status === statusFilter.value)
})
</script>

<template>
  <AppLayout>
    <div class="mx-auto max-w-lg">
      <section class="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">מתאמנים</h1>
        <div class="flex flex-wrap gap-3">
          <RouterLink
            to="/trainees/invite"
            class="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white"
          >
            הזמן מתאמן
          </RouterLink>
          <RouterLink
            to="/trainees/new"
            class="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          >
            הוסף מתאמן
          </RouterLink>
        </div>
      </section>

      <p
        v-if="traineesStore.loading && !traineesStore.loaded"
        class="text-neutral-600"
        role="status"
      >
        טוען...
      </p>

      <LoadErrorState
        v-else-if="traineesStore.error"
        message="לא ניתן היה לטעון את רשימת המתאמנים. יש לבדוק את החיבור לאינטרנט ולנסות שוב."
        @retry="loadTrainees"
      />

      <template v-else-if="traineesStore.loaded">
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="option in filterOptions"
            :key="option.value"
            type="button"
            :aria-pressed="statusFilter === option.value ? 'true' : 'false'"
            class="inline-flex min-h-11 items-center justify-center rounded-full border px-3 py-1 text-sm font-medium"
            :class="
              statusFilter === option.value
                ? 'border-brand-green bg-brand-green/10 text-brand-green-dark'
                : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'
            "
            @click="statusFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <p v-if="traineesStore.trainees.length === 0" class="text-neutral-600">
          עדיין אין מתאמנים.
          <RouterLink to="/trainees/new" class="text-brand-green-dark hover:underline">
            הוסף מתאמן ראשון
          </RouterLink>
        </p>

        <p v-else-if="filteredTrainees.length === 0" class="text-neutral-600">
          אין מתאמנים בסטטוס הזה.
        </p>

        <ul v-else class="flex flex-col gap-3">
          <li v-for="trainee in filteredTrainees" :key="trainee.id">
            <RouterLink
              :to="`/trainees/${trainee.id}`"
              class="flex items-center justify-between gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
            >
              <div class="min-w-0">
                <p class="truncate font-semibold text-brand-black">{{ trainee.full_name }}</p>
                <p class="truncate text-sm text-neutral-600">
                  <bdi v-if="trainee.email || trainee.phone" dir="ltr">{{ trainee.email || trainee.phone }}</bdi>
                  <template v-else>—</template>
                </p>
              </div>
              <TraineeStatusBadge :status="trainee.status" />
            </RouterLink>
          </li>
        </ul>
      </template>
    </div>
  </AppLayout>
</template>
