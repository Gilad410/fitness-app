<script setup>
import { onMounted, reactive } from 'vue'
import TraineeLayout from '../layouts/TraineeLayout.vue'
import { useTraineeTrainingProgramStore } from '../store/traineeTrainingProgram'

// Read-only trainee view of their own active training program
// (public.trainee_get_active_training_program(), 023_trainee_training_access.sql).
// No create/edit/reorder/status/archive/delete controls exist anywhere on
// this page -- there is nothing here that writes anything; the store only
// ever calls the one read-only RPC, plus (for instructional videos,
// 027_exercise_instructional_videos.sql) a read-only signed-URL fetch --
// no upload/replace/remove control exists here for a video either.
const programStore = useTraineeTrainingProgramStore()

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

onMounted(() => {
  programStore
    .fetchActiveProgram()
    .then(() => {
      // Eagerly fetch a signed preview URL for every exercise that already
      // has a video -- fire-and-forget, each one updates the store
      // independently as it resolves.
      for (const workout of programStore.program?.workouts ?? []) {
        for (const exercise of workout.exercises) {
          if (exercise.video_storage_path) {
            programStore.fetchVideoSignedUrl(exercise.id, exercise.video_storage_path)
          }
        }
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

                <template v-if="exercise.video_storage_path">
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
                </template>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>
  </TraineeLayout>
</template>
