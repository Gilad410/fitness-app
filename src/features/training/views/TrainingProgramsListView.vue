<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import BackLink from '../../../components/layout/BackLink.vue'
import TraineeStatusBadge from '../../trainees/components/TraineeStatusBadge.vue'
import { useTraineesStore } from '../../trainees/store/trainees'
import { useTrainingProgramsStore } from '../store/trainingPrograms'

// Lists one trainee's training programs (a trainee can have more than
// one over time -- e.g. a new phase started while an old one is kept
// around, marked inactive rather than deleted). Reached from
// TrainingTraineesListView at /training/:traineeId; picking a program
// opens TrainingProgramDetailView at /training/:traineeId/:programId.
const route = useRoute()
const traineesStore = useTraineesStore()
const programsStore = useTrainingProgramsStore()

const checkingTrainee = ref(true)
const checkingPrograms = ref(true)
const loadError = ref('')

const showAddForm = ref(false)
const addingProgram = ref(false)
const addError = ref('')
const addForm = reactive({ name: '', notes: '' })

onMounted(async () => {
  await traineesStore.ensureLoaded()
  checkingTrainee.value = false

  try {
    await programsStore.ensureLoaded(route.params.traineeId)
  } catch (err) {
    loadError.value = err.message
  } finally {
    checkingPrograms.value = false
  }
})

const trainee = computed(() => traineesStore.getById(route.params.traineeId))
const programs = computed(() => programsStore.programsFor(route.params.traineeId))

const statusLabels = { active: 'פעילה', inactive: 'לא פעילה' }
const statusClasses = {
  active: 'bg-brand-green/10 text-brand-green',
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
      <p v-if="checkingTrainee" class="text-neutral-600">טוען...</p>

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
              class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
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

            <p v-if="addError" class="text-sm text-status-red">{{ addError }}</p>

            <div class="flex flex-wrap gap-3">
              <button
                type="submit"
                :disabled="addingProgram"
                class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
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
          <p v-else-if="loadError" class="text-sm text-status-red">{{ loadError }}</p>
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
