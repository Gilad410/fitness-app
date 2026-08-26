<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useTrainingWorkoutsStore } from '../store/workouts'
import ExercisesSection from './ExercisesSection.vue'

const props = defineProps({
  programId: { type: String, required: true },
  // Threaded down to ExercisesSection.vue -- needed to build each
  // exercise's instructional-video Storage path
  // ({coachId}/{traineeId}/{exerciseId}.{ext}, 027's required structure).
  traineeId: { type: String, required: true },
})

const workoutsStore = useTrainingWorkoutsStore()

const checking = ref(true)
const loadError = ref('')

const showAddForm = ref(false)
const addingWorkout = ref(false)
const addError = ref('')
const addForm = reactive({ name: '', notes: '' })

// Set right after a workout is created (see handleAdd) so the newly added
// workout's ExercisesSection knows to auto-open its own "הוסף תרגיל" form
// and this component can scroll it into view -- without this, a coach who
// just created their first workout would land back on a page that still
// only shows a small "+ הוסף תרגיל" link, with no clear next step.
const lastCreatedWorkoutId = ref(null)
// Plain (non-reactive) map of workout id -> <li> element, populated via
// the template :ref callback below; only ever used imperatively for
// scrollIntoView, so it doesn't need to be reactive state.
const workoutEls = {}

const editingId = ref(null)
const editForm = reactive({ name: '', notes: '' })
const savingEdit = ref(false)
const editError = ref('')

const confirmDeleteId = ref(null)
const deletingId = ref(null)
const deleteError = ref('')

const movingId = ref(null)
const moveError = ref('')

onMounted(async () => {
  try {
    await workoutsStore.ensureLoaded(props.programId)
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

const workouts = computed(() => workoutsStore.workoutsFor(props.programId))

async function handleAdd() {
  addError.value = ''
  addingWorkout.value = true
  try {
    const created = await workoutsStore.create(props.programId, {
      name: addForm.name.trim(),
      notes: addForm.notes.trim() === '' ? null : addForm.notes.trim(),
    })
    addForm.name = ''
    addForm.notes = ''
    showAddForm.value = false
    lastCreatedWorkoutId.value = created.id
    // Wait for the new <li> to actually render before scrolling to it.
    await nextTick()
    workoutEls[created.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } catch (err) {
    addError.value = err.message
  } finally {
    addingWorkout.value = false
  }
}

function startEdit(workout) {
  editError.value = ''
  editingId.value = workout.id
  editForm.name = workout.name
  editForm.notes = workout.notes ?? ''
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(workoutId) {
  editError.value = ''
  savingEdit.value = true
  try {
    await workoutsStore.update(props.programId, workoutId, {
      name: editForm.name.trim(),
      notes: editForm.notes.trim() === '' ? null : editForm.notes.trim(),
    })
    editingId.value = null
  } catch (err) {
    editError.value = err.message
  } finally {
    savingEdit.value = false
  }
}

async function confirmDelete(workoutId) {
  deleteError.value = ''
  deletingId.value = workoutId
  try {
    await workoutsStore.remove(props.programId, workoutId)
    confirmDeleteId.value = null
  } catch (err) {
    deleteError.value = err.message
  } finally {
    deletingId.value = null
  }
}

async function move(workoutId, direction) {
  moveError.value = ''
  movingId.value = workoutId
  try {
    await workoutsStore.move(props.programId, workoutId, direction)
  } catch (err) {
    moveError.value = err.message
  } finally {
    movingId.value = null
  }
}
</script>

<template>
  <div class="mt-8 flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h2 class="font-semibold text-brand-black">אימונים</h2>
      <button
        v-if="!showAddForm && workouts.length > 0"
        type="button"
        class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
        @click="showAddForm = true"
      >
        הוסף אימון
      </button>
    </div>

    <form
      v-if="showAddForm"
      class="flex flex-col gap-4 rounded-xl border border-neutral-300 p-4"
      @submit.prevent="handleAdd"
    >
      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">שם האימון</span>
        <input
          v-model="addForm.name"
          type="text"
          required
          class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">הערות</span>
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
          :disabled="addingWorkout"
          class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
        >
          {{ addingWorkout ? 'שומר...' : 'שמור אימון' }}
        </button>
        <button
          type="button"
          :disabled="addingWorkout"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
          @click="showAddForm = false; addForm.name = ''; addForm.notes = ''"
        >
          ביטול
        </button>
      </div>
    </form>

    <p v-if="checking" class="text-sm text-neutral-600">טוען...</p>
    <p v-else-if="loadError" class="text-sm text-status-red">{{ loadError }}</p>
    <p v-if="moveError" class="text-sm text-status-red">{{ moveError }}</p>
    <p v-if="deleteError" class="text-sm text-status-red">{{ deleteError }}</p>

    <div
      v-if="!checking && !loadError && workouts.length === 0 && !showAddForm"
      class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 p-6 text-center"
    >
      <p class="text-sm text-neutral-600">כדי להוסיף תרגילים, יש ליצור תחילה אימון</p>
      <button
        type="button"
        class="rounded-lg bg-brand-green px-5 py-2.5 text-sm font-semibold text-brand-white hover:bg-brand-green-dark"
        @click="showAddForm = true"
      >
        הוסף אימון ראשון
      </button>
    </div>

    <ul v-else-if="!checking && !loadError" class="flex flex-col gap-4">
      <li
        v-for="(workout, index) in workouts"
        :key="workout.id"
        :ref="(el) => { if (el) workoutEls[workout.id] = el }"
        class="rounded-xl border border-neutral-300 p-4"
        :class="{ 'ring-2 ring-brand-green': workout.id === lastCreatedWorkoutId }"
      >
        <template v-if="editingId === workout.id">
          <form class="flex flex-col gap-3" @submit.prevent="saveEdit(workout.id)">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">שם האימון</span>
              <input
                v-model="editForm.name"
                type="text"
                required
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm text-neutral-600">הערות</span>
              <textarea
                v-model="editForm.notes"
                rows="2"
                class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
              />
            </label>

            <p v-if="editError" class="text-sm text-status-red">{{ editError }}</p>

            <div class="flex flex-wrap gap-3">
              <button
                type="submit"
                :disabled="savingEdit"
                class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
              >
                {{ savingEdit ? 'שומר...' : 'שמירה' }}
              </button>
              <button
                type="button"
                :disabled="savingEdit"
                class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                @click="cancelEdit"
              >
                ביטול
              </button>
            </div>
          </form>
        </template>

        <template v-else>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="font-semibold text-brand-black">{{ workout.name }}</h3>
              <p v-if="workout.notes" class="mt-1 text-sm text-neutral-600">{{ workout.notes }}</p>
            </div>

            <div class="flex shrink-0 flex-wrap items-center gap-1">
              <button
                type="button"
                :disabled="index === 0 || movingId === workout.id"
                class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                aria-label="הזז אימון למעלה"
                @click="move(workout.id, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                :disabled="index === workouts.length - 1 || movingId === workout.id"
                class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                aria-label="הזז אימון למטה"
                @click="move(workout.id, 1)"
              >
                ↓
              </button>

              <template v-if="confirmDeleteId === workout.id">
                <button
                  type="button"
                  :disabled="deletingId === workout.id"
                  class="rounded-md bg-status-red px-2 py-1 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                  @click="confirmDelete(workout.id)"
                >
                  {{ deletingId === workout.id ? 'מוחק...' : 'אישור מחיקה' }}
                </button>
                <button
                  type="button"
                  :disabled="deletingId === workout.id"
                  class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                  @click="confirmDeleteId = null"
                >
                  ביטול
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100"
                  @click="startEdit(workout)"
                >
                  ערוך
                </button>
                <button
                  type="button"
                  class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-status-red hover:bg-status-red/10"
                  @click="confirmDeleteId = workout.id"
                >
                  מחק
                </button>
              </template>
            </div>
          </div>

          <div class="mt-4 border-t border-neutral-300 pt-4">
            <ExercisesSection
              :workout-id="workout.id"
              :trainee-id="traineeId"
              :auto-open-add="workout.id === lastCreatedWorkoutId"
            />
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>
