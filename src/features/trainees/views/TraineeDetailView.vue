<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import TraineeStatusBadge from '../components/TraineeStatusBadge.vue'
import { useTraineesStore } from '../store/trainees'
import { useProgressLogsStore } from '../../progress/store/progressLogs'

const route = useRoute()
const traineesStore = useTraineesStore()
const progressLogsStore = useProgressLogsStore()

const checking = ref(true)
const error = ref('')
const updating = ref(false)
const showArchiveConfirm = ref(false)

const logsChecking = ref(true)
const logsError = ref('')
const showAddMeasurement = ref(false)
const addingLog = ref(false)
const addLogError = ref('')
const logWeight = ref('')
const logDate = ref(todayIsoDate())
const logNote = ref('')

onMounted(async () => {
  await traineesStore.ensureLoaded()
  checking.value = false

  try {
    await progressLogsStore.ensureLoaded(route.params.id)
  } catch (err) {
    logsError.value = err.message
  } finally {
    logsChecking.value = false
  }
})

const trainee = computed(() => traineesStore.getById(route.params.id))
const logs = computed(() => progressLogsStore.logsFor(route.params.id))

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

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

async function handleAddLog() {
  addLogError.value = ''
  addingLog.value = true
  try {
    await progressLogsStore.addLog(trainee.value.id, {
      weight: Number(logWeight.value),
      logged_at: logDate.value,
      note: logNote.value.trim() === '' ? null : logNote.value.trim(),
    })
    logWeight.value = ''
    logDate.value = todayIsoDate()
    logNote.value = ''
    showAddMeasurement.value = false
  } catch (err) {
    addLogError.value = err.message
  } finally {
    addingLog.value = false
  }
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

        <div
          class="mt-8 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
        >
          <div class="flex flex-wrap items-center justify-between gap-4">
            <h2 class="font-semibold text-brand-black">היסטוריית התקדמות</h2>
            <button
              v-if="!showAddMeasurement"
              type="button"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
              @click="showAddMeasurement = true"
            >
              הוסף מדידה
            </button>
          </div>

          <form
            v-if="showAddMeasurement"
            class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
            @submit.prevent="handleAddLog"
          >
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">משקל (ק"ג)</span>
              <input
                v-model="logWeight"
                type="number"
                step="0.1"
                min="0.1"
                required
                dir="ltr"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-left focus:border-brand-green focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">תאריך</span>
              <input
                v-model="logDate"
                type="date"
                required
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">הערה</span>
              <textarea
                v-model="logNote"
                rows="2"
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>

            <p v-if="addLogError" class="text-sm text-status-red">{{ addLogError }}</p>

            <div class="flex flex-wrap gap-3">
              <button
                type="submit"
                :disabled="addingLog"
                class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
              >
                {{ addingLog ? 'שומר...' : 'שמור מדידה' }}
              </button>
              <button
                type="button"
                :disabled="addingLog"
                class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                @click="showAddMeasurement = false"
              >
                ביטול
              </button>
            </div>
          </form>

          <p v-if="logsChecking" class="text-sm text-neutral-600">טוען...</p>

          <p v-else-if="logsError" class="text-sm text-status-red">{{ logsError }}</p>

          <p v-else-if="logs.length === 0" class="text-sm text-neutral-600">אין עדיין מדידות.</p>

          <ul v-else class="flex flex-col gap-3">
            <li
              v-for="log in logs"
              :key="log.id"
              class="flex items-baseline justify-between gap-4 border-t border-neutral-300 pt-3 first:border-t-0 first:pt-0"
            >
              <div class="min-w-0">
                <p class="text-sm text-neutral-600">
                  {{ dateFormatter.format(new Date(log.logged_at)) }}
                </p>
                <p v-if="log.note" class="truncate text-sm text-neutral-600">{{ log.note }}</p>
              </div>
              <p class="shrink-0 font-semibold text-brand-black">{{ log.weight }} ק"ג</p>
            </li>
          </ul>
        </div>
      </template>
    </section>
  </AppLayout>
</template>
