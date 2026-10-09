<script setup>
// Explicit name so <KeepAlive :include> in App.vue can match this view.
// The name Vite infers from the filename exists only in development
// builds, so relying on it would have made the whole keep-alive a
// silent no-op in production -- the screens would still have
// re-mounted and re-fetched on every swipe.
defineOptions({ name: 'TraineeTrainingView' })

import { computed, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref } from 'vue'
import TraineeLayout from '../layouts/TraineeLayout.vue'
import { useTraineeTrainingProgramStore } from '../store/traineeTrainingProgram'
import {
  useTraineeExerciseSubmissionsStore,
  validateSubmissionVideoFile,
} from '../store/traineeExerciseSubmissions'
import { workoutDisplayLabel } from '../../training/config/workoutDisplay'
import { startRest, normalizeRestSeconds, restState } from '../lib/restTimer'
import { useWorkoutSessionsStore } from '../store/workoutSessions'
import { formatWorkoutDuration, workoutSummary } from '../lib/workoutSummary'
import WorkoutSetEntry from '../components/WorkoutSetEntry.vue'

// Read-only trainee view of their own active training program
// (public.trainee_get_active_training_program(), 023_trainee_training_access.sql).
// No create/edit/reorder/status/archive/delete controls exist anywhere on
// this page for the program/workouts/exercises themselves -- the program
// store only ever calls the one read-only RPC, plus (for the coach's
// instructional video, 027_exercise_instructional_videos.sql) a read-only
// signed-URL fetch -- no upload/replace/remove control exists for it
// here, on this page or anywhere else a trainee can reach.
//
// The trainee's OWN performance video (030_trainee_exercise_submission_videos.sql)
// is a completely separate feature below -- separate store
// (traineeExerciseSubmissions.js), separate table, separate private
// Storage bucket ('exercise-submission-videos', never
// 'exercise-videos') -- with real upload/replace/delete controls, since
// that video is the trainee's own to manage.
const programStore = useTraineeTrainingProgramStore()
const submissionsStore = useTraineeExerciseSubmissionsStore()
const workoutSessionsStore = useWorkoutSessionsStore()
const expandedWorkoutId = ref(null)
const workoutActionBusy = ref(false)
const workoutActionError = ref('')
const completedSession = ref(null)
const now = ref(Date.now())
let elapsedInterval
const activeSession = computed(() => workoutSessionsStore.activeSession)
const completedSets = computed(() => completedSession.value
  ? workoutSessionsStore.setsForSession(completedSession.value.id) : [])
const completedSummary = computed(() => workoutSummary(completedSession.value, completedSets.value))

function elapsedFor(session) {
  return formatWorkoutDuration(Math.floor((now.value - Date.parse(session.started_at)) / 1000))
}

async function startWorkout(workout) {
  workoutActionError.value = ''
  workoutActionBusy.value = true
  try {
    await workoutSessionsStore.start(workout.id)
    expandedWorkoutId.value = workout.id
  } catch (err) {
    workoutActionError.value = err.message
  } finally {
    workoutActionBusy.value = false
  }
}

async function finishWorkout() {
  if (!activeSession.value) return
  workoutActionError.value = ''
  workoutActionBusy.value = true
  try {
    completedSession.value = await workoutSessionsStore.finish(activeSession.value.id)
  } catch (err) {
    workoutActionError.value = err.message
  } finally {
    workoutActionBusy.value = false
  }
}

// Mirrors the coach's own ExercisesSection.vue playback-error handling: a
// <video> element failing to play (e.g. an expired signed URL) sets this
// rather than auto-retrying, so a stale/broken link never loops -- just
// that one exercise shows a clear Hebrew message with an explicit retry,
// without breaking the rest of the training program.
const videoPlaybackError = reactive({})

function retryVideoLoad(exercise) {
  videoPlaybackError[exercise.id] = false
  programStore.fetchVideoSignedUrl(exercise.id, exercise.video_storage_path)
}

// ---- Trainee's own performance video ----
// submissionBusyId: exercise currently uploading/replacing/removing
// (disables that exercise's own submission controls only).
// submissionErrorByExerciseId: upload/replace/remove error, per exercise.
// submissionPlaybackError: a rendered <video> element itself failed to
// play -- kept separate from the store's own fetch-time error so a
// playback failure never auto-retries, matching the coach video block's
// exact convention.
// pendingSubmissionReplace: { exerciseId, file } staged while the replace
// confirmation is shown, or null -- a first-time upload (no existing
// submission) skips this and uploads immediately.
// confirmDeleteSubmissionId: exercise currently showing the
// remove-submission confirmation.
const submissionBusyId = ref(null)
const submissionErrorByExerciseId = reactive({})
const submissionPlaybackError = reactive({})
const pendingSubmissionReplace = ref(null)
const confirmDeleteSubmissionId = ref(null)
// Plain (non-reactive) map of exercise id -> hidden <input type="file">
// element, same pattern ExercisesSection.vue already uses for its own
// instructional-video file input.
const submissionInputEls = {}

const submissionDateFormatter = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

function setSubmissionInputRef(exerciseId, el) {
  if (el) submissionInputEls[exerciseId] = el
}

function triggerSubmissionInput(exerciseId) {
  submissionInputEls[exerciseId]?.click()
}

function handleSubmissionFileChange(exercise, event) {
  const file = event.target.files?.[0] ?? null
  // Reset immediately so picking the exact same file again still fires
  // 'change'.
  event.target.value = ''
  if (!file) return

  submissionErrorByExerciseId[exercise.id] = ''
  const validationError = validateSubmissionVideoFile(file)
  if (validationError) {
    submissionErrorByExerciseId[exercise.id] = validationError
    return
  }

  if (submissionsStore.submissionFor(exercise.id)) {
    // Replacing an existing submission requires explicit confirmation
    // before anything is uploaded.
    pendingSubmissionReplace.value = { exerciseId: exercise.id, file }
  } else {
    runAttachSubmission(exercise, file)
  }
}

async function runAttachSubmission(exercise, file) {
  submissionErrorByExerciseId[exercise.id] = ''
  submissionPlaybackError[exercise.id] = false
  submissionBusyId.value = exercise.id
  try {
    await submissionsStore.attachVideo(exercise.id, file)
    pendingSubmissionReplace.value = null
  } catch (err) {
    submissionErrorByExerciseId[exercise.id] = err.message
  } finally {
    submissionBusyId.value = null
  }
}

function confirmReplaceSubmission(exercise) {
  if (!pendingSubmissionReplace.value || pendingSubmissionReplace.value.exerciseId !== exercise.id) return
  runAttachSubmission(exercise, pendingSubmissionReplace.value.file)
}

function cancelReplaceSubmission() {
  pendingSubmissionReplace.value = null
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
    await submissionsStore.removeVideo(exercise.id)
    confirmDeleteSubmissionId.value = null
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

onMounted(() => {
  elapsedInterval = setInterval(() => { now.value = Date.now() }, 1000)
  workoutSessionsStore.loadMine().then(() => {
    if (activeSession.value) expandedWorkoutId.value = activeSession.value.workout_id
  }).catch(() => {})
  programStore
    .fetchActiveProgram()
    .then(async () => {
      const allExercises = (programStore.program?.workouts ?? []).flatMap((workout) => workout.exercises)

      // Eagerly fetch a signed preview URL for every exercise that already
      // has a coach instructional video -- fire-and-forget, each one
      // updates the store independently as it resolves.
      for (const exercise of allExercises) {
        if (exercise.video_storage_path) {
          programStore.fetchVideoSignedUrl(exercise.id, exercise.video_storage_path)
        }
      }

      // Trainee's own performance videos -- a separate store/table/bucket,
      // see the block above. Never blocks the rest of the page.
      try {
        await submissionsStore.ensureLoaded()
        for (const exercise of allExercises) {
          const submission = submissionsStore.submissionFor(exercise.id)
          if (submission) {
            submissionsStore.fetchVideoSignedUrl(exercise.id, submission.storage_path)
          }
        }
      } catch {
        // surfaced per-exercise via the submission block itself
      }
    })
    .catch(() => {
      // surfaced via programStore.error below
    })
})
onActivated(() => {
  now.value = Date.now()
  clearInterval(elapsedInterval)
  elapsedInterval = setInterval(() => { now.value = Date.now() }, 1000)
})
onDeactivated(() => clearInterval(elapsedInterval))
onUnmounted(() => clearInterval(elapsedInterval))
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">תוכנית האימונים שלי</h1>
        <p class="mt-1 text-sm text-neutral-600">התרגילים, הסטים והחזרות שהמאמן/ת הגדיר/ה עבורך</p>
      </section>

      <section v-if="activeSession && (programStore.error || !programStore.program?.workouts?.some((workout) => workout.id === activeSession.workout_id))" class="mb-4 rounded-2xl border border-brand-green/30 bg-brand-green/5 p-4">
        <p class="font-semibold text-brand-black">אימון פעיל: {{ activeSession.workout_name }}</p>
        <p class="mt-1 text-sm text-neutral-600">התוכנית השתנתה מאז שהתחלת. אפשר לסיים את האימון ולשמור את מה שתיעדת.</p>
        <div class="mt-3 flex items-center justify-between gap-3">
          <span class="ec-num text-xl text-brand-green-dark" dir="ltr">{{ elapsedFor(activeSession) }}</span>
          <button type="button" :disabled="workoutActionBusy" class="min-h-11 rounded-lg bg-brand-green px-4 text-sm font-semibold text-brand-white disabled:opacity-60" @click="finishWorkout">
            {{ workoutActionBusy ? 'שומר...' : 'סיים אימון' }}
          </button>
        </div>
        <p v-if="workoutActionError" role="alert" class="mt-2 text-sm text-status-red">{{ workoutActionError }}</p>
      </section>

      <p v-if="programStore.loading && !programStore.loaded" role="status" class="text-neutral-600">טוען...</p>

      <div
        v-else-if="programStore.error"
        class="flex flex-col items-start gap-3 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm"
      >
        <p role="alert" class="text-sm text-status-red">{{ programStore.error }}</p>
        <button
          type="button"
          class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
          @click="programStore.fetchActiveProgram()"
        >
          נסה שוב
        </button>
      </div>

      <div
        v-else-if="!programStore.program"
        class="flex flex-col items-center gap-2 rounded-2xl border border-neutral-300 bg-brand-white p-8 text-center shadow-sm"
      >
        <span class="text-3xl" aria-hidden="true">🏋️</span>
        <p class="font-semibold text-brand-black">עדיין אין תוכנית אימון פעילה</p>
        <p class="text-sm text-neutral-600">
          המאמן/ת שלך עדיין לא הקצה/תה לך תוכנית אימון פעילה. כשתוקצה תוכנית, היא תופיע כאן.
        </p>
      </div>

      <template v-else>
        <p v-if="workoutSessionsStore.error" role="alert" class="mb-4 text-sm text-status-red">
          {{ workoutSessionsStore.error }}
          <button type="button" class="underline" @click="workoutSessionsStore.loadMine()">נסה שוב</button>
        </p>
        <p v-if="workoutActionError" role="alert" class="mb-4 text-sm text-status-red">{{ workoutActionError }}</p>
        <section class="mb-6 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6">
          <h2 class="text-xl font-bold text-brand-black">{{ programStore.program.name }}</h2>
          <p v-if="programStore.program.notes" class="mt-2 whitespace-pre-wrap text-sm text-neutral-600">
            {{ programStore.program.notes }}
          </p>
        </section>

        <div
          v-if="programStore.program.workouts.length === 0"
          class="rounded-2xl border border-neutral-300 bg-brand-white p-5 text-center shadow-sm sm:p-6"
        >
          <p class="text-sm text-neutral-600">התוכנית עדיין לא כוללת אימונים.</p>
        </div>

        <section v-else class="flex flex-col gap-4">
          <div
            v-for="(workout, workoutIndex) in programStore.program.workouts"
            :key="workout.id"
            class="rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
          >
            <button
              type="button"
              class="flex min-h-11 w-full items-center justify-between gap-3 text-start"
              :aria-expanded="expandedWorkoutId === workout.id"
              @click="expandedWorkoutId = expandedWorkoutId === workout.id ? null : workout.id"
            >
              <span class="font-semibold text-brand-black">{{ workoutDisplayLabel(workout.name, workoutIndex) }}</span>
              <span class="flex items-center gap-2 text-xs text-brand-green-dark">
                <span v-if="activeSession?.workout_id === workout.id">פעיל · {{ elapsedFor(activeSession) }}</span>
                <span v-else>{{ workout.exercises.length }} תרגילים</span>
                <span aria-hidden="true">{{ expandedWorkoutId === workout.id ? '⌃' : '⌄' }}</span>
              </span>
            </button>
            <div v-if="expandedWorkoutId === workout.id">
            <p v-if="workout.notes" class="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
              {{ workout.notes }}
            </p>

            <div class="mt-4 rounded-xl border border-brand-green/20 bg-brand-green/5 p-3">
              <template v-if="activeSession?.workout_id === workout.id">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-brand-black">האימון שלך פעיל</p>
                    <p class="ec-num text-2xl text-brand-green-dark" dir="ltr">{{ elapsedFor(activeSession) }}</p>
                  </div>
                  <button type="button" :disabled="workoutActionBusy" class="min-h-11 rounded-lg bg-brand-green px-4 text-sm font-semibold text-brand-white disabled:opacity-60" @click="finishWorkout">
                    {{ workoutActionBusy ? 'שומר...' : 'סיים אימון' }}
                  </button>
                </div>
              </template>
              <template v-else>
                <button type="button" :disabled="workoutActionBusy || Boolean(activeSession) || workoutSessionsStore.loading || workout.exercises.length === 0" class="min-h-11 rounded-lg bg-brand-green px-4 text-sm font-semibold text-brand-white disabled:opacity-60" @click="startWorkout(workout)">
                  התחל אימון
                </button>
                <p v-if="activeSession" class="mt-1 text-xs text-neutral-600">יש אימון אחר פעיל. יש לסיים אותו לפני שמתחילים אימון חדש.</p>
              </template>
            </div>

            <p v-if="workout.exercises.length === 0" class="mt-3 text-sm text-neutral-600">
              אין עדיין תרגילים באימון הזה.
            </p>

            <ul v-else class="mt-4 flex flex-col gap-3 border-t border-neutral-300 pt-4">
              <li v-for="exercise in workout.exercises" :key="exercise.id">
                <p class="font-medium text-brand-black">{{ exercise.name }}</p>
                <p class="text-sm text-neutral-600">
                  {{ exercise.sets }} סטים &times; {{ exercise.reps }} חזרות
                  <span v-if="exercise.weight_kg"> &middot; {{ exercise.weight_kg }} ק"ג</span>
                  <span v-if="exercise.rest_seconds"> &middot; מנוחה {{ exercise.rest_seconds }} שנ'</span>
                </p>

                <!-- Counts down the coach's own rest_seconds; nothing new
                     is stored. The countdown itself renders in the sticky
                     bar (TraineeRestBar.vue) so it stays visible while the
                     trainee scrolls on to the next exercise. -->
                <button
                  type="button"
                  class="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
                  :class="
                    restState.running && restState.exerciseId === exercise.id
                      ? 'border-brand-green bg-brand-green/10 text-brand-green-dark'
                      : 'border-neutral-300 text-brand-black hover:bg-neutral-100'
                  "
                  @click="startRest(exercise)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="size-4 shrink-0"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2 2M9 2h6" />
                  </svg>
                  {{
                    restState.running && restState.exerciseId === exercise.id
                      ? 'מנוחה פעילה'
                      : `התחל מנוחה ${normalizeRestSeconds(exercise.rest_seconds)} שנ׳`
                  }}
                </button>
                <p v-if="exercise.notes" class="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
                  {{ exercise.notes }}
                </p>

                <WorkoutSetEntry
                  :exercise="exercise"
                  :session="activeSession?.workout_id === workout.id ? activeSession : null"
                />

                <div v-if="exercise.video_storage_path" class="mt-3 rounded-lg border border-neutral-300 p-3">
                  <span class="text-xs font-semibold text-brand-black">סרטון הסבר מהמאמן</span>
                  <video
                    v-if="programStore.videoUrlFor(exercise.id) && !videoPlaybackError[exercise.id]"
                    :src="programStore.videoUrlFor(exercise.id)"
                    controls
                    preload="metadata"
                    class="mt-2 w-full max-w-sm rounded-lg"
                    @error="videoPlaybackError[exercise.id] = true"
                  ></video>
                  <p
                    v-else-if="videoPlaybackError[exercise.id] || programStore.videoUrlErrorFor(exercise.id)"
                    class="mt-2 text-xs text-status-red"
                  >
                    {{ programStore.videoUrlErrorFor(exercise.id) || 'לא ניתן להפעיל את הסרטון כרגע.' }}
                    <button
                      type="button"
                      class="font-medium text-brand-green hover:underline"
                      @click="retryVideoLoad(exercise)"
                    >
                      נסה שוב
                    </button>
                  </p>
                  <p v-else class="mt-2 text-xs text-neutral-600">טוען סרטון...</p>
                </div>

                <div class="mt-3 rounded-lg border border-neutral-300 p-3">
                  <span class="text-xs font-semibold text-brand-black">סרטון הביצוע שלי</span>

                  <template v-if="submissionsStore.submissionFor(exercise.id)">
                    <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                      <span>{{
                        submissionDateFormatter.format(new Date(submissionsStore.submissionFor(exercise.id).submitted_at))
                      }}</span>
                      <span
                        class="rounded-full px-2 py-0.5 text-xs font-medium"
                        :class="
                          submissionsStore.submissionFor(exercise.id).reviewed_at
                            ? 'bg-brand-green/10 text-brand-green'
                            : 'bg-status-red/10 text-status-red'
                        "
                      >
                        {{
                          submissionsStore.submissionFor(exercise.id).reviewed_at
                            ? 'נבדק על ידי המאמן'
                            : 'ממתין לבדיקת המאמן'
                        }}
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

                    <div
                      v-if="submissionsStore.submissionFor(exercise.id).coach_note"
                      class="mt-2 rounded-lg bg-neutral-50 p-2"
                    >
                      <span class="text-xs font-semibold text-brand-black">הערת המאמן</span>
                      <p class="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
                        {{ submissionsStore.submissionFor(exercise.id).coach_note }}
                      </p>
                    </div>
                  </template>
                  <p v-else class="mt-2 text-xs text-neutral-600">עדיין לא העלית סרטון ביצוע לתרגיל זה.</p>

                  <input
                    :ref="(el) => setSubmissionInputRef(exercise.id, el)"
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    class="hidden"
                    @change="handleSubmissionFileChange(exercise, $event)"
                  />

                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      :disabled="submissionBusyId === exercise.id"
                      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
                      @click="triggerSubmissionInput(exercise.id)"
                    >
                      {{
                        submissionBusyId === exercise.id
                          ? 'מעלה...'
                          : submissionsStore.submissionFor(exercise.id)
                            ? 'החלף סרטון'
                            : 'העלה סרטון ביצוע'
                      }}
                    </button>
                    <button
                      v-if="submissionsStore.submissionFor(exercise.id)"
                      type="button"
                      :disabled="submissionBusyId === exercise.id"
                      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-status-red hover:bg-status-red/10 disabled:opacity-40"
                      @click="requestDeleteSubmission(exercise.id)"
                    >
                      מחק
                    </button>
                  </div>

                  <div
                    v-if="pendingSubmissionReplace && pendingSubmissionReplace.exerciseId === exercise.id"
                    class="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-neutral-100 px-2 py-1.5 text-xs"
                  >
                    <span class="text-brand-black"
                      >להחליף את הסרטון הקיים ב&quot;{{ pendingSubmissionReplace.file.name }}&quot;?</span
                    >
                    <button
                      type="button"
                      :disabled="submissionBusyId === exercise.id"
                      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-brand-green px-2 py-1 text-xs font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
                      @click="confirmReplaceSubmission(exercise)"
                    >
                      {{ submissionBusyId === exercise.id ? 'מעלה...' : 'כן, החלף' }}
                    </button>
                    <button
                      type="button"
                      :disabled="submissionBusyId === exercise.id"
                      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                      @click="cancelReplaceSubmission"
                    >
                      ביטול
                    </button>
                  </div>

                  <div
                    v-if="confirmDeleteSubmissionId === exercise.id"
                    class="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-neutral-100 px-2 py-1.5 text-xs"
                  >
                    <span class="text-brand-black">למחוק את סרטון הביצוע שלך?</span>
                    <button
                      type="button"
                      :disabled="submissionBusyId === exercise.id"
                      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-status-red px-2 py-1 text-xs font-medium text-brand-white hover:bg-status-red/90 disabled:opacity-60"
                      @click="confirmDeleteSubmission(exercise)"
                    >
                      {{ submissionBusyId === exercise.id ? 'מוחק...' : 'כן, מחק' }}
                    </button>
                    <button
                      type="button"
                      :disabled="submissionBusyId === exercise.id"
                      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-60"
                      @click="cancelDeleteSubmission"
                    >
                      ביטול
                    </button>
                  </div>

                  <p v-if="submissionErrorByExerciseId[exercise.id]" role="alert" class="mt-2 text-xs text-status-red">
                    {{ submissionErrorByExerciseId[exercise.id] }}
                  </p>
                </div>
              </li>
            </ul>
            </div>
          </div>
        </section>
      </template>

      <div v-if="completedSession" class="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/70 p-4" role="presentation" @click.self="completedSession = null">
        <section role="dialog" aria-modal="true" aria-labelledby="workout-summary-title" class="w-full max-w-md rounded-2xl bg-brand-white p-6 shadow-xl">
          <p class="text-sm font-semibold text-brand-green-dark">האימון הסתיים</p>
          <h2 id="workout-summary-title" class="mt-1 text-2xl font-bold text-brand-black">{{ completedSession.workout_name }}</h2>
          <div class="mt-5 grid grid-cols-2 gap-3 text-center">
            <div class="rounded-xl bg-brand-green/10 p-3"><p class="ec-num text-2xl text-brand-green-dark">{{ formatWorkoutDuration(completedSummary.durationSeconds) }}</p><p class="text-xs text-neutral-600">זמן אימון</p></div>
            <div class="rounded-xl p-3" style="background: rgb(139 92 246 / 10%)"><p class="ec-num text-2xl" style="color: var(--ec-violet)">{{ completedSummary.setCount }}</p><p class="text-xs text-neutral-600">סטים</p></div>
            <div class="rounded-xl bg-neutral-100 p-3"><p class="ec-num text-2xl text-brand-black">{{ completedSummary.totalReps }}</p><p class="text-xs text-neutral-600">חזרות</p></div>
            <div class="rounded-xl bg-neutral-100 p-3"><p class="ec-num text-2xl text-brand-black">{{ completedSummary.totalVolumeKg }}</p><p class="text-xs text-neutral-600">ק״ג נפח אימון</p></div>
          </div>
          <ul class="mt-4 max-h-36 space-y-1 overflow-auto text-sm text-neutral-600">
            <li v-for="set in completedSets" :key="set.id">{{ set.exercise_name }} · סט {{ set.set_number }} · {{ set.weight_kg }} ק״ג × {{ set.reps }}</li>
          </ul>
          <button type="button" class="mt-5 min-h-11 w-full rounded-lg bg-brand-green font-semibold text-brand-white" @click="completedSession = null">סגור סיכום</button>
        </section>
      </div>
    </div>
  </TraineeLayout>
</template>
