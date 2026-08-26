<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useWorkoutExercisesStore, validateExerciseVideoFile } from '../store/exercises'
import { useExerciseSubmissionsStore } from '../store/exerciseSubmissions'
import { useExerciseReferenceCatalogStore } from '../store/exerciseReferenceCatalog'
import { EXERCISE_CATEGORIES } from '../config/exerciseCategories'

const props = defineProps({
  workoutId: { type: String, required: true },
  // Needed to build each exercise's instructional-video Storage path
  // ({coachId}/{traineeId}/{exerciseId}.{ext}, 027's required structure).
  traineeId: { type: String, required: true },
  // True for a workout that was just created in this session (set by the
  // parent WorkoutsSection) -- opens the add-exercise form so a coach who
  // just created their first workout lands straight on the category/
  // exercise picker instead of having to spot and click the small
  // "+ הוסף תרגיל" link themselves.
  autoOpenAdd: { type: Boolean, default: false },
})

// Sentinel option value for "תרגיל מותאם אישית" inside the exercise
// <select> -- never sent to Supabase, only used to flip a form into
// isCustom mode (see handleExerciseSelect below).
const CUSTOM_OPTION_VALUE = '__custom__'

const exercisesStore = useWorkoutExercisesStore()
const submissionsStore = useExerciseSubmissionsStore()
const catalogStore = useExerciseReferenceCatalogStore()

const checking = ref(true)
const loadError = ref('')

// Catalog load state is tracked separately from the exercises list above:
// a slow/failed catalog fetch should degrade the add/edit forms to
// custom-name-only entry, not block viewing/editing the workout's
// existing exercises.
const catalogChecking = ref(true)
const catalogError = ref('')
const catalogUnavailable = computed(() => catalogError.value !== '')

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

// ---- Instructional video (027_exercise_instructional_videos.sql) ----
// videoBusyId: exercise currently uploading/replacing/removing (disables
// that exercise's own video controls only -- other exercises stay usable).
// videoErrorByExerciseId: upload/replace/remove error, per exercise.
// videoPlaybackError: true once a rendered <video> element itself failed
// to play (e.g. a signed URL that expired after being fetched) -- kept
// separate from the store's videoUrlErrorFor (its fetch-time error) so a
// playback failure never triggers an automatic refetch loop; it always
// waits for an explicit "נסה שוב" click.
// confirmRemoveVideoId: exercise currently showing the remove-video
// confirmation.
// pendingReplace: { exerciseId, file } staged while the replace
// confirmation is shown, or null -- a first-time attach (no existing
// video) skips this and uploads immediately.
const videoBusyId = ref(null)
const videoErrorByExerciseId = reactive({})
const videoPlaybackError = reactive({})
const confirmRemoveVideoId = ref(null)
const pendingReplace = ref(null)
// Plain (non-reactive) map of exercise id -> hidden <input type="file">
// element, populated via the template :ref callback -- only ever used
// imperatively to open the native file picker, same pattern
// WorkoutsSection.vue already uses for its own scroll-into-view map.
const videoInputEls = {}

function setVideoInputRef(exerciseId, el) {
  if (el) videoInputEls[exerciseId] = el
}

function triggerVideoInput(exerciseId) {
  videoInputEls[exerciseId]?.click()
}

function handleVideoFileChange(exercise, event) {
  const file = event.target.files?.[0] ?? null
  // Reset immediately so picking the exact same file again still fires
  // 'change' (the browser otherwise treats an identical selection as a
  // no-op).
  event.target.value = ''
  if (!file) return

  videoErrorByExerciseId[exercise.id] = ''
  const validationError = validateExerciseVideoFile(file)
  if (validationError) {
    videoErrorByExerciseId[exercise.id] = validationError
    return
  }

  if (exercise.video_storage_path) {
    // Replacing an existing video requires the coach's explicit
    // confirmation below before anything is uploaded.
    pendingReplace.value = { exerciseId: exercise.id, file }
  } else {
    runAttachVideo(exercise, file)
  }
}

async function runAttachVideo(exercise, file) {
  videoErrorByExerciseId[exercise.id] = ''
  videoPlaybackError[exercise.id] = false
  videoBusyId.value = exercise.id
  try {
    await exercisesStore.attachVideo(props.workoutId, exercise.id, props.traineeId, file)
    pendingReplace.value = null
  } catch (err) {
    videoErrorByExerciseId[exercise.id] = err.message
  } finally {
    videoBusyId.value = null
  }
}

function confirmReplaceVideo(exercise) {
  if (!pendingReplace.value || pendingReplace.value.exerciseId !== exercise.id) return
  runAttachVideo(exercise, pendingReplace.value.file)
}

function cancelReplaceVideo() {
  pendingReplace.value = null
}

function requestRemoveVideo(exerciseId) {
  videoErrorByExerciseId[exerciseId] = ''
  confirmRemoveVideoId.value = exerciseId
}

function cancelRemoveVideo() {
  confirmRemoveVideoId.value = null
}

async function confirmRemoveVideo(exercise) {
  videoBusyId.value = exercise.id
  try {
    await exercisesStore.removeVideo(props.workoutId, exercise.id)
    confirmRemoveVideoId.value = null
  } catch (err) {
    videoErrorByExerciseId[exercise.id] = err.message
  } finally {
    videoBusyId.value = null
  }
}

function retryVideoLoad(exercise) {
  videoPlaybackError[exercise.id] = false
  exercisesStore.fetchVideoSignedUrl(exercise.id, exercise.video_storage_path)
}

// ---- Trainee performance video, coach side (030_trainee_exercise_submission_videos.sql) ----
// Read-only playback + delete + mark-reviewed only -- there is NO upload
// or replace control here; a trainee's own performance video is uploaded
// exclusively by the trainee (TraineeTrainingView.vue /
// traineeExerciseSubmissions.js). Entirely separate state from the
// instructional-video block above -- separate store, separate busy/error/
// playback-error tracking, separate confirmation id -- so neither feature
// can interfere with the other even accidentally.
const submissionBusyId = ref(null)
const submissionErrorByExerciseId = reactive({})
const submissionPlaybackError = reactive({})
const confirmDeleteSubmissionId = ref(null)
// Coach-note textarea state (031_trainee_submission_coach_note.sql):
// undefined for an exercise means "show the submission's own current
// coach_note (or '' if none)"; once the coach types anything, this holds
// the live in-progress value instead -- avoids needing a separate
// onMounted seeding step for a field the submissions store may still be
// loading when this component first renders. Cleared back to undefined
// after a successful save so the textarea reverts to reflecting the
// server's (trimmed) value.
const noteDraftByExerciseId = reactive({})

const NOTE_MAX_LENGTH = 1000

const submissionDateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

function noteDraftFor(exercise) {
  if (Object.prototype.hasOwnProperty.call(noteDraftByExerciseId, exercise.id)) {
    return noteDraftByExerciseId[exercise.id]
  }
  return submissionsStore.submissionFor(exercise.id)?.coach_note ?? ''
}

function requestDeleteSubmission(exerciseId) {
  submissionErrorByExerciseId[exerciseId] = ''
  confirmDeleteSubmissionId.value = exerciseId
}

function cancelDeleteSubmission() {
  confirmDeleteSubmissionId.value = null
}

async function confirmDeleteSubmission(exercise) {
  submissionBusyId.value = exercise.id
  try {
    await submissionsStore.remove(exercise.id)
    confirmDeleteSubmissionId.value = null
    delete noteDraftByExerciseId[exercise.id]
  } catch (err) {
    submissionErrorByExerciseId[exercise.id] = err.message
  } finally {
    submissionBusyId.value = null
  }
}

// Serves both "mark reviewed" (first time, note optional) and "update the
// note later" (submission already reviewed) -- the same action either
// way, matching coach_mark_submission_reviewed(uuid, text)'s own design
// (031). Client-side length check backs up the textarea's own maxlength
// attribute (belt and suspenders, same convention as every other
// client-validated field in this app) with a clear Hebrew error instead
// of a raw RPC rejection.
async function markSubmissionReviewed(exercise) {
  submissionErrorByExerciseId[exercise.id] = ''
  const note = noteDraftFor(exercise)
  if (note.length > NOTE_MAX_LENGTH) {
    submissionErrorByExerciseId[exercise.id] = `ההערה ארוכה מדי (מקסימום ${NOTE_MAX_LENGTH} תווים).`
    return
  }

  submissionBusyId.value = exercise.id
  try {
    await submissionsStore.markReviewed(exercise.id, note)
    delete noteDraftByExerciseId[exercise.id]
  } catch (err) {
    submissionErrorByExerciseId[exercise.id] = err.message
  } finally {
    submissionBusyId.value = null
  }
}

function retrySubmissionVideoLoad(exercise, storagePath) {
  submissionPlaybackError[exercise.id] = false
  submissionsStore.fetchVideoSignedUrl(exercise.id, storagePath)
}

function emptyForm() {
  return {
    category: '',
    exerciseName: '',
    isCustom: false,
    customName: '',
    sets: '',
    reps: '',
    weight_kg: '',
    rest_seconds: '',
    notes: '',
  }
}

// `immediate: true` + a watch (rather than just reading props.autoOpenAdd
// once at setup) because the parent sets its "which workout did I just
// create" ref right after this component's own reactive dependencies
// already triggered a render -- by the time that ref flips, this
// component may already be mounted with autoOpenAdd still false. Watching
// keeps the form opening even when it flips true on a later tick instead
// of the exact one this component mounted on.
watch(
  () => props.autoOpenAdd,
  (autoOpen) => {
    if (autoOpen) showAddForm.value = true
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    await exercisesStore.ensureLoaded(props.workoutId)
    const loadedExercises = exercisesStore.exercisesFor(props.workoutId)
    // Eagerly fetch a signed preview URL for every exercise that already
    // has a video -- fire-and-forget, each one updates the store
    // independently as it resolves, so this never blocks the rest of the
    // section from rendering.
    for (const exercise of loadedExercises) {
      if (exercise.video_storage_path) {
        exercisesStore.fetchVideoSignedUrl(exercise.id, exercise.video_storage_path)
      }
    }

    // Trainee performance-video submissions, one batch fetch for the
    // whole workout -- a separate store/table/bucket, see the block above.
    try {
      await submissionsStore.ensureLoadedForWorkout(
        props.workoutId,
        loadedExercises.map((exercise) => exercise.id),
      )
      for (const exercise of loadedExercises) {
        const submission = submissionsStore.submissionFor(exercise.id)
        if (submission) {
          submissionsStore.fetchVideoSignedUrl(exercise.id, submission.storage_path)
        }
      }
    } catch {
      // Surfaced per-exercise via the submissions block itself falling
      // back to its own empty/error state; never blocks the rest of the
      // section (instructional videos, add/edit/delete/reorder) from
      // working.
    }
  } catch (err) {
    loadError.value = err.message
  } finally {
    checking.value = false
  }

  try {
    await catalogStore.ensureLoaded()
  } catch (err) {
    catalogError.value = err.message
  } finally {
    catalogChecking.value = false
  }
})

const exercises = computed(() => exercisesStore.exercisesFor(props.workoutId))

// Picking a category invalidates whatever exercise/custom-name choice was
// made under the previous category, so the two stay in sync. Wired to the
// select's native @change (not v-model + watch) so it only fires on real
// coach interaction -- startEdit below sets form.category directly, and
// must NOT trigger this reset.
function handleCategoryChange(form, category) {
  form.category = category
  form.exerciseName = ''
  form.isCustom = false
  form.customName = ''
}

function handleExerciseSelect(form, value) {
  if (value === CUSTOM_OPTION_VALUE) {
    form.isCustom = true
    form.exerciseName = ''
  } else {
    form.isCustom = false
    form.exerciseName = value
    form.customName = ''
  }
}

function backToList(form) {
  form.isCustom = false
  form.customName = ''
}

function toPayload(form) {
  const name = form.isCustom || catalogUnavailable.value ? form.customName.trim() : form.exerciseName
  return {
    name,
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
    const payload = toPayload(addForm)
    if (!payload.name) {
      throw new Error('יש לבחור תרגיל מהרשימה או להזין שם תרגיל מותאם אישית')
    }
    await exercisesStore.create(props.workoutId, payload)
    Object.assign(addForm, emptyForm())
    showAddForm.value = false
  } catch (err) {
    addError.value = err.message
  } finally {
    addingExercise.value = false
  }
}

// If the exercise's current name matches a catalog entry (case/whitespace
// -insensitive), preselect that category + exercise; otherwise fall back
// to custom-exercise mode prefilled with the existing name, exactly as
// required for names that predate this catalog or were always custom.
function startEdit(exercise) {
  editError.value = ''
  editingId.value = exercise.id

  const match = catalogStore.findByName(exercise.name)
  if (match) {
    editForm.category = match.category
    editForm.exerciseName = match.name
    editForm.isCustom = false
    editForm.customName = ''
  } else {
    editForm.category = ''
    editForm.exerciseName = ''
    editForm.isCustom = true
    editForm.customName = exercise.name
  }

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
    const payload = toPayload(editForm)
    if (!payload.name) {
      throw new Error('יש לבחור תרגיל מהרשימה או להזין שם תרגיל מותאם אישית')
    }
    await exercisesStore.update(props.workoutId, exerciseId, payload)
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
        class="rounded-lg bg-brand-green px-3 py-1.5 text-xs font-semibold text-brand-white hover:bg-brand-green-dark"
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
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-neutral-600">קטגוריה</span>
          <select
            v-if="!catalogUnavailable"
            :value="addForm.category"
            :disabled="catalogChecking"
            class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none disabled:opacity-60"
            @change="handleCategoryChange(addForm, $event.target.value)"
          >
            <option value="" disabled>{{ catalogChecking ? 'טוען קטגוריות...' : 'בחר קטגוריה' }}</option>
            <option v-for="cat in EXERCISE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </label>

        <p v-if="catalogUnavailable" class="text-xs text-status-red">
          לא ניתן לטעון את קטלוג התרגילים ({{ catalogError }}) — ניתן להזין שם תרגיל ידנית למטה.
        </p>

        <template v-if="!catalogUnavailable && addForm.category && !addForm.isCustom">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-neutral-600">תרגיל</span>
            <select
              :value="addForm.exerciseName"
              required
              class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
              @change="handleExerciseSelect(addForm, $event.target.value)"
            >
              <option value="" disabled>בחר תרגיל</option>
              <option :value="CUSTOM_OPTION_VALUE">תרגיל מותאם אישית</option>
              <option v-for="ex in catalogStore.exercisesFor(addForm.category)" :key="ex.id" :value="ex.name">
                {{ ex.name }}
              </option>
            </select>
          </label>
          <p v-if="catalogStore.exercisesFor(addForm.category).length === 0" class="text-xs text-neutral-600">
            אין תרגילים שמורים בקטגוריה זו — ניתן לבחור "תרגיל מותאם אישית".
          </p>
        </template>

        <div v-if="catalogUnavailable || addForm.isCustom" class="flex flex-col gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-neutral-600">שם תרגיל מותאם אישית</span>
            <input
              v-model="addForm.customName"
              type="text"
              required
              class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
            />
          </label>
          <button
            v-if="!catalogUnavailable && addForm.category"
            type="button"
            class="self-start text-xs font-medium text-brand-green hover:underline"
            @click="backToList(addForm)"
          >
            בחר מהרשימה
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-xs text-neutral-600">קטגוריה</span>
                <select
                  v-if="!catalogUnavailable"
                  :value="editForm.category"
                  :disabled="catalogChecking"
                  class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none disabled:opacity-60"
                  @change="handleCategoryChange(editForm, $event.target.value)"
                >
                  <option value="" disabled>{{ catalogChecking ? 'טוען קטגוריות...' : 'בחר קטגוריה' }}</option>
                  <option v-for="cat in EXERCISE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </label>

              <p v-if="catalogUnavailable" class="text-xs text-status-red">
                לא ניתן לטעון את קטלוג התרגילים ({{ catalogError }}) — ניתן להזין שם תרגיל ידנית למטה.
              </p>

              <template v-if="!catalogUnavailable && editForm.category && !editForm.isCustom">
                <label class="flex flex-col gap-1">
                  <span class="text-xs text-neutral-600">תרגיל</span>
                  <select
                    :value="editForm.exerciseName"
                    required
                    class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
                    @change="handleExerciseSelect(editForm, $event.target.value)"
                  >
                    <option value="" disabled>בחר תרגיל</option>
                    <option :value="CUSTOM_OPTION_VALUE">תרגיל מותאם אישית</option>
                    <option v-for="ex in catalogStore.exercisesFor(editForm.category)" :key="ex.id" :value="ex.name">
                      {{ ex.name }}
                    </option>
                  </select>
                </label>
                <p v-if="catalogStore.exercisesFor(editForm.category).length === 0" class="text-xs text-neutral-600">
                  אין תרגילים שמורים בקטגוריה זו — ניתן לבחור "תרגיל מותאם אישית".
                </p>
              </template>

              <div v-if="catalogUnavailable || editForm.isCustom" class="flex flex-col gap-2">
                <label class="flex flex-col gap-1">
                  <span class="text-xs text-neutral-600">שם תרגיל מותאם אישית</span>
                  <input
                    v-model="editForm.customName"
                    type="text"
                    required
                    class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none"
                  />
                </label>
                <button
                  v-if="!catalogUnavailable && editForm.category"
                  type="button"
                  class="self-start text-xs font-medium text-brand-green hover:underline"
                  @click="backToList(editForm)"
                >
                  בחר מהרשימה
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

          <div class="mt-3 rounded-lg border border-neutral-300 p-3">
            <span class="text-xs font-semibold text-brand-black">סרטון הדרכה</span>

            <template v-if="exercise.video_storage_path">
              <video
                v-if="exercisesStore.videoUrlFor(exercise.id) && !videoPlaybackError[exercise.id]"
                :src="exercisesStore.videoUrlFor(exercise.id)"
                controls
                preload="metadata"
                class="mt-2 w-full max-w-sm rounded-lg"
                @error="videoPlaybackError[exercise.id] = true"
              ></video>
              <p
                v-else-if="videoPlaybackError[exercise.id] || exercisesStore.videoUrlErrorFor(exercise.id)"
                class="mt-2 text-xs text-status-red"
              >
                {{ exercisesStore.videoUrlErrorFor(exercise.id) || 'לא ניתן להפעיל את הסרטון כרגע.' }}
                <button
                  type="button"
                  class="font-medium text-brand-green hover:underline"
                  @click="retryVideoLoad(exercise)"
                >
                  נסה שוב
                </button>
              </p>
              <p v-else class="mt-2 text-xs text-neutral-600">טוען סרטון...</p>
            </template>
            <p v-else class="mt-2 text-xs text-neutral-600">לא צורף סרטון הדרכה לתרגיל זה.</p>

            <input
              :ref="(el) => setVideoInputRef(exercise.id, el)"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              class="hidden"
              @change="handleVideoFileChange(exercise, $event)"
            />

            <div class="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                :disabled="videoBusyId === exercise.id"
                class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                @click="triggerVideoInput(exercise.id)"
              >
                {{
                  videoBusyId === exercise.id
                    ? 'מעלה...'
                    : exercise.video_storage_path
                      ? 'החלף סרטון'
                      : 'הוסף סרטון הדרכה'
                }}
              </button>
              <button
                v-if="exercise.video_storage_path"
                type="button"
                :disabled="videoBusyId === exercise.id"
                class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-status-red hover:bg-status-red/10 disabled:opacity-40"
                @click="requestRemoveVideo(exercise.id)"
              >
                הסר סרטון
              </button>
            </div>

            <div
              v-if="pendingReplace && pendingReplace.exerciseId === exercise.id"
              class="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-neutral-100 px-2 py-1.5 text-xs"
            >
              <span class="text-brand-black">להחליף את הסרטון הקיים ב&quot;{{ pendingReplace.file.name }}&quot;?</span>
              <button
                type="button"
                :disabled="videoBusyId === exercise.id"
                class="rounded-md bg-brand-green px-2 py-1 text-xs font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
                @click="confirmReplaceVideo(exercise)"
              >
                {{ videoBusyId === exercise.id ? 'מעלה...' : 'כן, החלף' }}
              </button>
              <button
                type="button"
                :disabled="videoBusyId === exercise.id"
                class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                @click="cancelReplaceVideo"
              >
                ביטול
              </button>
            </div>

            <div
              v-if="confirmRemoveVideoId === exercise.id"
              class="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-neutral-100 px-2 py-1.5 text-xs"
            >
              <span class="text-brand-black">להסיר את סרטון ההדרכה?</span>
              <button
                type="button"
                :disabled="videoBusyId === exercise.id"
                class="rounded-md bg-status-red px-2 py-1 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                @click="confirmRemoveVideo(exercise)"
              >
                {{ videoBusyId === exercise.id ? 'מוחק...' : 'כן, הסר' }}
              </button>
              <button
                type="button"
                :disabled="videoBusyId === exercise.id"
                class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                @click="cancelRemoveVideo"
              >
                ביטול
              </button>
            </div>

            <p v-if="videoErrorByExerciseId[exercise.id]" class="mt-2 text-xs text-status-red">
              {{ videoErrorByExerciseId[exercise.id] }}
            </p>
          </div>

          <div class="mt-3 rounded-lg border border-neutral-300 p-3">
            <span class="text-xs font-semibold text-brand-black">סרטון ביצוע של המתאמן</span>

            <template v-if="submissionsStore.submissionFor(exercise.id)">
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                <span>{{ submissionDateFormatter.format(new Date(submissionsStore.submissionFor(exercise.id).submitted_at)) }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="
                    submissionsStore.submissionFor(exercise.id).reviewed_at
                      ? 'bg-brand-green/10 text-brand-green'
                      : 'bg-status-red/10 text-status-red'
                  "
                >
                  {{ submissionsStore.submissionFor(exercise.id).reviewed_at ? 'נבדק על ידי המאמן' : 'ממתין לבדיקת המאמן' }}
                </span>
              </div>

              <video
                v-if="submissionsStore.videoUrlFor(exercise.id) && !submissionPlaybackError[exercise.id]"
                :src="submissionsStore.videoUrlFor(exercise.id)"
                controls
                preload="metadata"
                class="mt-2 w-full max-w-sm rounded-lg"
                @error="submissionPlaybackError[exercise.id] = true"
              ></video>
              <p
                v-else-if="submissionPlaybackError[exercise.id] || submissionsStore.videoUrlErrorFor(exercise.id)"
                class="mt-2 text-xs text-status-red"
              >
                {{ submissionsStore.videoUrlErrorFor(exercise.id) || 'לא ניתן להפעיל את הסרטון כרגע.' }}
                <button
                  type="button"
                  class="font-medium text-brand-green hover:underline"
                  @click="retrySubmissionVideoLoad(exercise, submissionsStore.submissionFor(exercise.id).storage_path)"
                >
                  נסה שוב
                </button>
              </p>
              <p v-else class="mt-2 text-xs text-neutral-600">טוען סרטון...</p>

              <label class="mt-2 flex flex-col gap-1">
                <span class="text-xs text-neutral-600">הערת מאמן – לא חובה</span>
                <textarea
                  :value="noteDraftFor(exercise)"
                  :disabled="submissionBusyId === exercise.id"
                  rows="2"
                  maxlength="1000"
                  placeholder="לדוגמה: שמור על גב ישר והאט את הירידה"
                  class="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none disabled:opacity-60"
                  @input="noteDraftByExerciseId[exercise.id] = $event.target.value"
                ></textarea>
                <span class="self-end text-xs text-neutral-600">{{ noteDraftFor(exercise).length }}/1000</span>
              </label>

              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  :disabled="submissionBusyId === exercise.id"
                  class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                  @click="markSubmissionReviewed(exercise)"
                >
                  {{
                    submissionBusyId === exercise.id
                      ? 'שומר...'
                      : submissionsStore.submissionFor(exercise.id).reviewed_at
                        ? 'עדכן הערת מאמן'
                        : 'שמור הערה וסמן כנבדק'
                  }}
                </button>
                <button
                  type="button"
                  :disabled="submissionBusyId === exercise.id"
                  class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-status-red hover:bg-status-red/10 disabled:opacity-40"
                  @click="requestDeleteSubmission(exercise.id)"
                >
                  מחק
                </button>
              </div>

              <div
                v-if="confirmDeleteSubmissionId === exercise.id"
                class="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-neutral-100 px-2 py-1.5 text-xs"
              >
                <span class="text-brand-black">למחוק את סרטון הביצוע של המתאמן/ת?</span>
                <button
                  type="button"
                  :disabled="submissionBusyId === exercise.id"
                  class="rounded-md bg-status-red px-2 py-1 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                  @click="confirmDeleteSubmission(exercise)"
                >
                  {{ submissionBusyId === exercise.id ? 'מוחק...' : 'כן, מחק' }}
                </button>
                <button
                  type="button"
                  :disabled="submissionBusyId === exercise.id"
                  class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                  @click="cancelDeleteSubmission"
                >
                  ביטול
                </button>
              </div>
            </template>
            <p v-else class="mt-2 text-xs text-neutral-600">המתאמן/ת עדיין לא העלה/תה סרטון ביצוע לתרגיל זה.</p>

            <p v-if="submissionErrorByExerciseId[exercise.id]" class="mt-2 text-xs text-status-red">
              {{ submissionErrorByExerciseId[exercise.id] }}
            </p>
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>
