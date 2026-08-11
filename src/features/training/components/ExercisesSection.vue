<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useWorkoutExercisesStore } from '../store/exercises'

const props = defineProps({
  workoutId: { type: String, required: true },
})

const exercisesStore = useWorkoutExercisesStore()

const checking = ref(true)
const loadError = ref('')

const showAddForm = ref(false)
const addingExercise = ref(false)
const addError = ref('')
const addForm = reactive(emptyForm())

const editingId = ref(null)
const editForm = reactive(emptyForm())
const savingEdit = ref(false)
const editError = ref('')

const confirmDeleteId = ref(null)
const deletingId = ref(null)
const deleteError = ref('')

const movingId = ref(null)
const moveError = ref('')

function emptyForm() {
  return { name: '', sets: '', reps: '', weight_kg: '', rest_seconds: '', notes: '' }
}

onMounted(async () => {
  try {
    await exercisesStore.ensureLoaded(props.workoutId)
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }
})

const exercises = computed(() => exercisesStore.exercisesFor(props.workoutId))

function toPayload(form) {
  return {
    name: form.name.trim(),
    sets: Number(form.sets),
    reps: form.reps.trim(),
    weight_kg: form.weight_kg === '' ? null : Number(form.weight_kg),
    rest_seconds: form.rest_seconds === '' ? null : Number(form.rest_seconds),
    notes: form.notes.trim() === '' ? null : form.notes.trim(),
  }
}

async function handleAdd() {
  addError.value = ''
  addingExercise.value = true
  try {
    await exercisesStore.create(props.workoutId, toPayload(addForm))
    Object.assign(addForm, emptyForm())
    showAddForm.value = false
  } catch (err) {
    addError.value = err.message
  } finally {
    addingExercise.value = false
  }
}

function startEdit(exercise) {
  editError.value = ''
  editingId.value = exercise.id
  editForm.name = exercise.name
  editForm.sets = String(exercise.sets)
  editForm.reps = exercise.reps
  editForm.weight_kg = exercise.weight_kg ?? ''
  editForm.rest_seconds = exercise.rest_seconds ?? ''
  editForm.notes = exercise.notes ?? ''
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(exerciseId) {
  editError.value = ''
  savingEdit.value = true
  try {
    await exercisesStore.update(props.workoutId, exerciseId, toPayload(editForm))
    editingId.value = null
  } catch (err) {
    editError.value = err.message
  } finally {
    savingEdit.value = false
  }
}

async function confirmDelete(exerciseId) {
  deleteError.value = ''
  deletingId.value = exerciseId
  try {
    await exercisesStore.remove(props.workoutId, exerciseId)
    confirmDeleteId.value = null
  } catch (err) {
    deleteError.value = err.message
  } finally {
    deletingId.value = null
  }
}

async function move(exerciseId, direction) {
  moveError.value = ''
  movingId.value = exerciseId
  try {
    await exercisesStore.move(props.workoutId, exerciseId, direction)
  } catch (err) {
    moveError.value = err.message
  } finally {
    movingId.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h4 class="text-sm font-semibold text-brand-black">תרגילים</h4>
      <button
        v-if="!showAddForm"
        type="button"
        class="rounded-lg border border-brand-green px-3 py-1.5 text-xs font-medium text-brand-green hover:bg-brand-green/10"
        @click="showAddForm = true"
      >
        + הוסף תרגיל
      </button>
    </div>

    <form
      v-if="showAddForm"
      class="flex flex-col gap-3 rounded-lg border border-neutral-300 p-3"
      @submit.prevent="handleAdd"
    >
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label class="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span class="text-xs text-neutral-600">שם התרגיל</span>
          <input
            v-model="addForm.name"
            type="text"
            required
            class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-neutral-600">סטים</span>
          <input
            v-model="addForm.sets"
            type="number"
            step="1"
            min="1"
            required
            dir="ltr"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm focus:border-brand-green focus:outline-none"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-neutral-600">חזרות</span>
          <input
            v-model="addForm.reps"
            type="text"
            required
            placeholder="לדוגמה: 8-12"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-neutral-600">משקל (ק"ג)</span>
          <input
            v-model="addForm.weight_kg"
            type="number"
            step="0.1"
            min="0.1"
            dir="ltr"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm focus:border-brand-green focus:outline-none"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-neutral-600">מנוחה (שניות)</span>
          <input
            v-model="addForm.rest_seconds"
            type="number"
            step="1"
            min="1"
            dir="ltr"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm focus:border-brand-green focus:outline-none"
          />
        </label>
      </div>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-neutral-600">הערות</span>
        <textarea
          v-model="addForm.notes"
          rows="2"
          class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
        />
      </label>

      <p v-if="addError" class="text-xs text-status-red">{{ addError }}</p>

      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          :disabled="addingExercise"
          class="rounded-lg bg-brand-green px-3 py-1.5 text-xs font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
        >
          {{ addingExercise ? 'שומר...' : 'שמור תרגיל' }}
        </button>
        <button
          type="button"
          :disabled="addingExercise"
          class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
          @click="showAddForm = false; Object.assign(addForm, emptyForm())"
        >
          ביטול
        </button>
      </div>
    </form>

    <p v-if="checking" class="text-xs text-neutral-600">טוען תרגילים...</p>
    <p v-else-if="loadError" class="text-xs text-status-red">{{ loadError }}</p>
    <p v-else-if="exercises.length === 0" class="text-xs text-neutral-600">
      אין עדיין תרגילים באימון הזה.
    </p>

    <p v-if="moveError" class="text-xs text-status-red">{{ moveError }}</p>
    <p v-if="deleteError" class="text-xs text-status-red">{{ deleteError }}</p>

    <ul v-if="!checking && !loadError && exercises.length > 0" class="flex flex-col gap-2">
      <li v-for="(exercise, index) in exercises" :key="exercise.id" class="rounded-lg border border-neutral-300 p-3">
        <template v-if="editingId === exercise.id">
          <form class="flex flex-col gap-3" @submit.prevent="saveEdit(exercise.id)">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label class="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <span class="text-xs text-neutral-600">שם התרגיל</span>
                <input
                  v-model="editForm.name"
                  type="text"
                  required
                  class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-neutral-600">סטים</span>
                <input
                  v-model="editForm.sets"
                  type="number"
                  step="1"
                  min="1"
                  required
                  dir="ltr"
                  class="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm focus:border-brand-green focus:outline-none"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-neutral-600">חזרות</span>
                <input
                  v-model="editForm.reps"
                  type="text"
                  required
                  class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-neutral-600">משקל (ק"ג)</span>
                <input
                  v-model="editForm.weight_kg"
                  type="number"
                  step="0.1"
                  min="0.1"
                  dir="ltr"
                  class="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm focus:border-brand-green focus:outline-none"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-neutral-600">מנוחה (שניות)</span>
                <input
                  v-model="editForm.rest_seconds"
                  type="number"
                  step="1"
                  min="1"
                  dir="ltr"
                  class="rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm focus:border-brand-green focus:outline-none"
                />
              </label>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-neutral-600">הערות</span>
              <textarea
                v-model="editForm.notes"
                rows="2"
                class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
              />
            </label>

            <p v-if="editError" class="text-xs text-status-red">{{ editError }}</p>

            <div class="flex flex-wrap gap-2">
              <button
                type="submit"
                :disabled="savingEdit"
                class="rounded-lg bg-brand-green px-3 py-1.5 text-xs font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
              >
                {{ savingEdit ? 'שומר...' : 'שמירה' }}
              </button>
              <button
                type="button"
                :disabled="savingEdit"
                class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
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
              <p class="font-medium text-brand-black">{{ exercise.name }}</p>
              <p class="text-sm text-neutral-600">
                {{ exercise.sets }} סטים &times; {{ exercise.reps }} חזרות
                <span v-if="exercise.weight_kg"> &middot; {{ exercise.weight_kg }} ק"ג</span>
                <span v-if="exercise.rest_seconds"> &middot; מנוחה {{ exercise.rest_seconds }} שנ'</span>
              </p>
              <p v-if="exercise.notes" class="mt-1 text-sm text-neutral-600">{{ exercise.notes }}</p>
            </div>

            <div class="flex shrink-0 flex-wrap items-center gap-1">
              <button
                type="button"
                :disabled="index === 0 || movingId === exercise.id"
                class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                aria-label="הזז תרגיל למעלה"
                @click="move(exercise.id, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                :disabled="index === exercises.length - 1 || movingId === exercise.id"
                class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                aria-label="הזז תרגיל למטה"
                @click="move(exercise.id, 1)"
              >
                ↓
              </button>

              <template v-if="confirmDeleteId === exercise.id">
                <button
                  type="button"
                  :disabled="deletingId === exercise.id"
                  class="rounded-md bg-status-red px-2 py-1 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                  @click="confirmDelete(exercise.id)"
                >
                  {{ deletingId === exercise.id ? 'מוחק...' : 'אישור מחיקה' }}
                </button>
                <button
                  type="button"
                  :disabled="deletingId === exercise.id"
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
                  @click="startEdit(exercise)"
                >
                  ערוך
                </button>
                <button
                  type="button"
                  class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-status-red hover:bg-status-red/10"
                  @click="confirmDeleteId = exercise.id"
                >
                  מחק
                </button>
              </template>
            </div>
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>
