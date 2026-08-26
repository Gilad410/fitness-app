<script setup>
import { onMounted, reactive, ref } from 'vue'
import TraineeLayout from '../layouts/TraineeLayout.vue'
import { useTraineeTrainingProgramStore } from '../store/traineeTrainingProgram'
import {
  useTraineeExerciseSubmissionsStore,
  validateSubmissionVideoFile,
} from '../store/traineeExerciseSubmissions'

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
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">תוכנית האימונים שלי</h1>
        <p class="mt-1 text-sm text-neutral-600">התרגילים, הסטים והחזרות שהמאמן/ת הגדיר/ה עבורך</p>
      </section>

      <p v-if="programStore.loading && !programStore.loaded" class="text-neutral-600">טוען...</p>

      <div
        v-else-if="programStore.error"
        class="flex flex-col items-start gap-3 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm"
      >
        <p class="text-sm text-status-red">{{ programStore.error }}</p>
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
            v-for="workout in programStore.program.workouts"
            :key="workout.id"
            class="rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm sm:p-6"
          >
            <h3 class="font-semibold text-brand-black">{{ workout.name }}</h3>
            <p v-if="workout.notes" class="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
              {{ workout.notes }}
            </p>

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
                <p v-if="exercise.notes" class="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
                  {{ exercise.notes }}
                </p>

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
                      class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-40"
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
                      class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-status-red hover:bg-status-red/10 disabled:opacity-40"
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
                      class="rounded-md bg-brand-green px-2 py-1 text-xs font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
                      @click="confirmReplaceSubmission(exercise)"
                    >
                      {{ submissionBusyId === exercise.id ? 'מעלה...' : 'כן, החלף' }}
                    </button>
                    <button
                      type="button"
                      :disabled="submissionBusyId === exercise.id"
                      class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-brand-black hover:bg-neutral-100 disabled:opacity-60"
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

                  <p v-if="submissionErrorByExerciseId[exercise.id]" class="mt-2 text-xs text-status-red">
                    {{ submissionErrorByExerciseId[exercise.id] }}
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>
  </TraineeLayout>
</template>
