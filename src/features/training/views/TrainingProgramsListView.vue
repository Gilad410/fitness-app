<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import BackLink from '../../../components/layout/BackLink.vue'
import TraineeStatusBadge from '../../trainees/components/TraineeStatusBadge.vue'
import LoadErrorState from '../../../components/feedback/LoadErrorState.vue'
import { useTraineesStore } from '../../trainees/store/trainees'
import { useSelectedTraineeStore } from '../../trainees/store/selectedTrainee'
import { reconcileSelectionWithRoute } from '../../trainees/store/selectedTraineeStorage'
import { useTrainingProgramsStore } from '../store/trainingPrograms'

// Lists one trainee's training programs (a trainee can have more than
// one over time -- e.g. a new phase started while an old one is kept
// around, marked inactive rather than deleted). Reached from
// TrainingTraineesListView at /training/:traineeId; picking a program
// opens TrainingProgramDetailView at /training/:traineeId/:programId.
const route = useRoute()
const traineesStore = useTraineesStore()
const selectedTraineeStore = useSelectedTraineeStore()
const programsStore = useTrainingProgramsStore()

const checkingTrainee = ref(true)
const traineeLoadFailed = ref(false)
const checkingPrograms = ref(true)
const loadError = ref('')

const showAddForm = ref(false)
const addingProgram = ref(false)
const addError = ref('')
const addForm = reactive({ name: '', notes: '' })

const trainee = computed(() => traineesStore.getById(route.params.traineeId))

// Re-runnable (the retry button calls it again) -- a failed roster load
// must never leave the screen stuck on "טוען...", and must never reach the
// selection reconcile below, which would otherwise treat the not-yet-
// loaded trainee as deleted and clear the remembered selection.
async function loadTrainee() {
  checkingTrainee.value = true
  traineeLoadFailed.value = false
  try {
    await traineesStore.ensureLoaded()
  } catch {
    traineeLoadFailed.value = true
    return
  } finally {
    checkingTrainee.value = false
  }
  // See selectedTraineeStorage.js's reconcileSelectionWithRoute() for the
  // full precedence/stale-clear reasoning.
  const outcome = reconcileSelectionWithRoute({
    resolvedTraineeId: trainee.value?.id ?? null,
    routeParamId: route.params.traineeId,
    rememberedId: selectedTraineeStore.traineeId,
  })
  if (outcome.type === 'select') selectedTraineeStore.select(outcome.traineeId)
  else if (outcome.type === 'clear') selectedTraineeStore.clear()

  try {
    await programsStore.ensureLoaded(route.params.traineeId)
  } catch (err) {
    loadError.value = err.message
  } finally {
    checkingPrograms.value = false
  }
}

onMounted(loadTrainee)
const programs = computed(() => programsStore.programsFor(route.params.traineeId))

const statusLabels = { active: 'פעילה', inactive: 'לא פעילה' }
const statusClasses = {
  active: 'bg-brand-green/10 text-brand-green-dark',
  inactive: 'bg-neutral-100 text-neutral-600',
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

async function handleAdd() {
  addError.value = ''
  addingProgram.value = true
  try {
    await programsStore.create(route.params.traineeId, {
      name: addForm.name.trim(),
      notes: addForm.notes.trim() === '' ? null : addForm.notes.trim(),
    })
    addForm.name = ''
    addForm.notes = ''
    showAddForm.value = false
  } catch (err) {
    addError.value = err.message
  } finally {
    addingProgram.value = false
  }
}
</script>

<template>
  <AppLayout>
    <section class="mx-auto max-w-lg">
      <p v-if="checkingTrainee" class="text-neutral-600" role="status">טוען...</p>

      <LoadErrorState
        v-else-if="traineeLoadFailed"
        message="לא ניתן היה לטעון את פרטי המתאמן. יש לבדוק את החיבור לאינטרנט ולנסות שוב."
        @retry="loadTrainee"
      />

      <p v-else-if="!trainee" class="text-neutral-600">המתאמן לא נמצא.</p>

      <template v-else>
        <BackLink to="/training" />

        <div class="mb-6 flex items-center gap-3">
          <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">{{ trainee.full_name }}</h1>
          <TraineeStatusBadge :status="trainee.status" />
        </div>

        <div class="flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <h2 class="font-semibold text-brand-black">תוכניות אימון</h2>
            <button
              v-if="!showAddForm"
              type="button"
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white"
              @click="showAddForm = true"
            >
              תוכנית חדשה
            </button>
          </div>

          <form
            v-if="showAddForm"
            class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
            @submit.prevent="handleAdd"
          >
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">שם התוכנית</span>
              <input
                v-model="addForm.name"
                type="text"
                required
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">הערות כלליות</span>
              <textarea
                v-model="addForm.notes"
                rows="2"
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>

            <p v-if="addError" role="alert" class="text-sm text-status-red">{{ addError }}</p>

            <div class="flex flex-wrap gap-3">
              <button
                type="submit"
                :disabled="addingProgram"
                class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
              >
                {{ addingProgram ? 'שומר...' : 'שמור תוכנית' }}
              </button>
              <button
                type="button"
                :disabled="addingProgram"
                class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                @click="showAddForm = false; addForm.name = ''; addForm.notes = ''"
              >
                ביטול
              </button>
            </div>
          </form>

          <p v-if="checkingPrograms" class="text-sm text-neutral-600">טוען תוכניות...</p>
          <p v-else-if="loadError" role="alert" class="text-sm text-status-red">{{ loadError }}</p>
          <p v-else-if="programs.length === 0" class="text-sm text-neutral-600">
            עדיין לא נוצרה תוכנית אימון למתאמן הזה.
          </p>

          <ul v-else class="flex flex-col gap-3">
            <li v-for="program in programs" :key="program.id">
              <RouterLink
                :to="`/training/${trainee.id}/${program.id}`"
                class="flex items-center justify-between gap-4 rounded-xl border border-neutral-300 p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div class="min-w-0">
                  <p class="truncate font-semibold text-brand-black">{{ program.name }}</p>
                  <p class="truncate text-sm text-neutral-600">
                    נוצרה {{ dateFormatter.format(new Date(program.created_at)) }}
                  </p>
                </div>
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="statusClasses[program.status]"
                >
                  {{ statusLabels[program.status] }}
                </span>
              </RouterLink>
            </li>
          </ul>
        </div>
      </template>
    </section>
  </AppLayout>
</template>
