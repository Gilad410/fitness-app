<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import WorkoutsSection from '../components/WorkoutsSection.vue'
import { useTrainingProgramsStore } from '../store/trainingPrograms'

// The program "screen": edit name/notes/status, then manage its workouts
// (and, nested inside each, its exercises) via WorkoutsSection /
// ExercisesSection. Reached from TrainingProgramsListView at
// /training/:traineeId/:programId.
const route = useRoute()
const programsStore = useTrainingProgramsStore()

const checking = ref(true)
const loadError = ref('')

const showEditForm = ref(false)
const savingDetails = ref(false)
const detailsError = ref('')
const editForm = reactive({ name: '', notes: '' })

const updatingStatus = ref(false)
const statusError = ref('')

onMounted(async () => {
  try {
    await programsStore.ensureLoaded(route.params.traineeId)
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

const program = computed(() =>
  programsStore.programFor(route.params.traineeId, route.params.programId),
)

const statusLabels = { active: 'פעילה', inactive: 'לא פעילה' }
const statusClasses = {
  active: 'bg-brand-green/10 text-brand-green-dark',
  inactive: 'bg-neutral-100 text-neutral-600',
}

function startEditDetails() {
  detailsError.value = ''
  editForm.name = program.value.name
  editForm.notes = program.value.notes ?? ''
  showEditForm.value = true
}

async function saveDetails() {
  detailsError.value = ''
  savingDetails.value = true
  try {
    await programsStore.update(route.params.traineeId, route.params.programId, {
      name: editForm.name.trim(),
      notes: editForm.notes.trim() === '' ? null : editForm.notes.trim(),
    })
    showEditForm.value = false
  } catch (err) {
    detailsError.value = err.message
  } finally {
    savingDetails.value = false
  }
}

async function setStatus(status) {
  statusError.value = ''
  updatingStatus.value = true
  try {
    await programsStore.update(route.params.traineeId, route.params.programId, { status })
  } catch (err) {
    statusError.value = err.message
  } finally {
    updatingStatus.value = false
  }
}
</script>

<template>
  <AppLayout>
    <section class="mx-auto max-w-lg">
      <p v-if="checking" class="text-neutral-600">טוען...</p>
      <p v-else-if="loadError" class="text-sm text-status-red">{{ loadError }}</p>
      <p v-else-if="!program" class="text-neutral-600">התוכנית לא נמצאה.</p>

      <template v-else>
        <RouterLink
          :to="`/training/${route.params.traineeId}`"
          class="mb-4 inline-block text-sm text-neutral-600 hover:text-brand-black"
        >
          &larr; חזרה לתוכניות האימון
        </RouterLink>

        <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">{{ program.name }}</h1>
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
              :class="statusClasses[program.status]"
            >
              {{ statusLabels[program.status] }}
            </span>
          </div>
          <button
            v-if="!showEditForm"
            type="button"
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
            @click="startEditDetails"
          >
            ערוך
          </button>
        </div>

        <div class="flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
          <template v-if="showEditForm">
            <form class="flex flex-col gap-4" @submit.prevent="saveDetails">
              <label class="flex flex-col gap-1">
                <span class="text-sm text-neutral-600">שם התוכנית</span>
                <input
                  v-model="editForm.name"
                  type="text"
                  required
                  class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-sm text-neutral-600">הערות כלליות</span>
                <textarea
                  v-model="editForm.notes"
                  rows="3"
                  class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
                />
              </label>

              <p v-if="detailsError" class="text-sm text-status-red">{{ detailsError }}</p>

              <div class="flex flex-wrap gap-3">
                <button
                  type="submit"
                  :disabled="savingDetails"
                  class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
                >
                  {{ savingDetails ? 'שומר...' : 'שמירה' }}
                </button>
                <button
                  type="button"
                  :disabled="savingDetails"
                  class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                  @click="showEditForm = false"
                >
                  ביטול
                </button>
              </div>
            </form>
          </template>

          <template v-else>
            <div v-if="program.notes">
              <dt class="text-sm text-neutral-600">הערות כלליות</dt>
              <dd class="whitespace-pre-wrap text-brand-black">{{ program.notes }}</dd>
            </div>
            <p v-else class="text-sm text-neutral-600">אין הערות כלליות לתוכנית.</p>
          </template>

          <p v-if="statusError" class="text-sm text-status-red">{{ statusError }}</p>

          <div class="flex flex-wrap gap-3">
            <button
              v-if="program.status === 'active'"
              type="button"
              :disabled="updatingStatus"
              class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
              @click="setStatus('inactive')"
            >
              {{ updatingStatus ? 'מעדכן...' : 'סמן כלא פעילה' }}
            </button>
            <button
              v-else
              type="button"
              :disabled="updatingStatus"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
              @click="setStatus('active')"
            >
              {{ updatingStatus ? 'מעדכן...' : 'סמן כפעילה' }}
            </button>
          </div>
        </div>

        <WorkoutsSection :program-id="program.id" :trainee-id="route.params.traineeId" />
      </template>
    </section>
  </AppLayout>
</template>
