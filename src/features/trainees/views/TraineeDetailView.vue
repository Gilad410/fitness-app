<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import TraineeStatusBadge from '../components/TraineeStatusBadge.vue'
import TraineeProgressSection from '../../progress/components/TraineeProgressSection.vue'
import { useTraineesStore } from '../store/trainees'

const route = useRoute()
const traineesStore = useTraineesStore()

const checking = ref(true)
const error = ref('')
const updating = ref(false)
const showArchiveConfirm = ref(false)

onMounted(async () => {
  await traineesStore.ensureLoaded()
  checking.value = false
})

const trainee = computed(() => traineesStore.getById(route.params.id))

const goalLabels = {
  fat_loss: 'ירידה במשקל',
  muscle_gain: 'עלייה במסת שריר',
  maintenance: 'שמירה על משקל',
  custom: 'אחר',
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

async function setStatus(status) {
  error.value = ''
  updating.value = true
  try {
    await traineesStore.update(trainee.value.id, { status })
  } catch (err) {
    error.value = err.message
  } finally {
    updating.value = false
  }
}

async function confirmArchive() {
  showArchiveConfirm.value = false
  await setStatus('archived')
}
</script>

<template>
  <AppLayout>
    <section class="mx-auto max-w-lg">
      <p v-if="checking" class="text-neutral-600">טוען...</p>

      <p v-else-if="!trainee" class="text-neutral-600">המתאמן לא נמצא.</p>

      <template v-else>
        <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">
              {{ trainee.full_name }}
            </h1>
            <TraineeStatusBadge :status="trainee.status" />
          </div>
          <RouterLink
            :to="`/trainees/${trainee.id}/edit`"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          >
            ערוך
          </RouterLink>
        </div>

        <dl
          class="flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
        >
          <div v-if="trainee.email">
            <dt class="text-sm text-neutral-600">אימייל</dt>
            <dd class="text-brand-black">{{ trainee.email }}</dd>
          </div>
          <div v-if="trainee.phone">
            <dt class="text-sm text-neutral-600">טלפון</dt>
            <dd class="text-brand-black">{{ trainee.phone }}</dd>
          </div>
          <div v-if="trainee.start_date">
            <dt class="text-sm text-neutral-600">תאריך התחלה</dt>
            <dd class="text-brand-black">
              {{ dateFormatter.format(new Date(trainee.start_date)) }}
            </dd>
          </div>
          <div v-if="trainee.goal">
            <dt class="text-sm text-neutral-600">מטרה</dt>
            <dd class="text-brand-black">{{ goalLabels[trainee.goal] }}</dd>
          </div>
          <div v-if="trainee.starting_weight">
            <dt class="text-sm text-neutral-600">משקל התחלתי</dt>
            <dd class="text-brand-black">{{ trainee.starting_weight }} ק"ג</dd>
          </div>
          <div v-if="trainee.target_weight">
            <dt class="text-sm text-neutral-600">משקל מטרה</dt>
            <dd class="text-brand-black">{{ trainee.target_weight }} ק"ג</dd>
          </div>
          <div v-if="trainee.notes">
            <dt class="text-sm text-neutral-600">הערות</dt>
            <dd class="whitespace-pre-wrap text-brand-black">{{ trainee.notes }}</dd>
          </div>
        </dl>

        <p v-if="error" class="mt-4 text-sm text-status-red">{{ error }}</p>

        <div
          v-if="showArchiveConfirm"
          class="mt-6 flex flex-col gap-3 rounded-2xl border border-neutral-300 bg-brand-white p-4 sm:p-5"
        >
          <p class="text-sm text-brand-black">להעביר את {{ trainee.full_name }} לארכיון?</p>
          <div class="flex flex-wrap gap-3">
            <button
              type="button"
              :disabled="updating"
              class="rounded-lg bg-status-red px-4 py-2 text-sm font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
              @click="confirmArchive"
            >
              {{ updating ? 'מעביר לארכיון...' : 'כן, העבר לארכיון' }}
            </button>
            <button
              type="button"
              :disabled="updating"
              class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
              @click="showArchiveConfirm = false"
            >
              ביטול
            </button>
          </div>
        </div>

        <div v-else class="mt-6 flex flex-wrap gap-3">
          <template v-if="trainee.status === 'active'">
            <button
              type="button"
              :disabled="updating"
              class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
              @click="setStatus('paused')"
            >
              השהה
            </button>
            <button
              type="button"
              :disabled="updating"
              class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
              @click="showArchiveConfirm = true"
            >
              העבר לארכיון
            </button>
          </template>

          <template v-else-if="trainee.status === 'paused'">
            <button
              type="button"
              :disabled="updating"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
              @click="setStatus('active')"
            >
              הפעל מחדש
            </button>
            <button
              type="button"
              :disabled="updating"
              class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
              @click="showArchiveConfirm = true"
            >
              העבר לארכיון
            </button>
          </template>

          <template v-else>
            <button
              type="button"
              :disabled="updating"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
              @click="setStatus('active')"
            >
              שחזר
            </button>
          </template>
        </div>

        <TraineeProgressSection :trainee="trainee" />
      </template>
    </section>
  </AppLayout>
</template>
