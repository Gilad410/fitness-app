<script setup>
import { computed, ref, watch } from 'vue'
import { supabase } from '../../../lib/supabaseClient'
import ExerciseProgressChart from './ExerciseProgressChart.vue'
import { formatWorkoutDuration, workoutSummary } from '../../trainee/lib/workoutSummary'

const props = defineProps({
  workoutId: { type: String, required: true },
  traineeId: { type: String, required: true },
  exercises: { type: Array, default: () => [] },
})

const sessions = ref([])
const sets = ref([])
const loading = ref(false)
const error = ref('')
const completed = computed(() => sessions.value.filter((session) => session.status === 'completed'))

async function load() {
  const traineeId = props.traineeId
  const workoutId = props.workoutId
  sessions.value = []
  sets.value = []
  loading.value = true
  error.value = ''
  try {
    const { data: rows, error: sessionError } = await supabase
      .from('trainee_workout_sessions').select('*')
      .eq('trainee_id', traineeId).eq('workout_id', workoutId)
      .order('started_at', { ascending: false }).limit(30)
    if (sessionError) throw sessionError
    const ids = rows.map((row) => row.id)
    let loadedSets = []
    if (ids.length) {
      const { data, error: setError } = await supabase
        .from('trainee_workout_set_logs').select('*').in('session_id', ids)
      if (setError) throw setError
      loadedSets = data
    }
    if (props.traineeId === traineeId && props.workoutId === workoutId) {
      sessions.value = rows
      sets.value = loadedSets
    }
  } catch {
    error.value = 'לא ניתן לטעון את ביצועי המתאמן כרגע.'
  } finally {
    loading.value = false
  }
}

const setsFor = (sessionId) => sets.value.filter((set) => set.session_id === sessionId)
const logsFor = (exerciseId) => sets.value.filter((set) => set.exercise_id === exerciseId)
watch(() => [props.traineeId, props.workoutId], load, { immediate: true })
</script>

<template>
  <section class="mt-5 border-t border-neutral-200 pt-4">
    <div class="flex items-center justify-between gap-2">
      <h4 class="text-sm font-semibold text-brand-black">ביצועי המתאמן</h4>
      <button type="button" class="min-h-11 px-2 text-xs font-medium text-brand-green-dark underline" @click="load">רענן</button>
    </div>
    <p v-if="loading" role="status" class="text-xs text-neutral-600">טוען ביצועים...</p>
    <p v-if="error" role="alert" class="text-xs text-status-red">{{ error }}</p>
    <p v-else-if="!loading && !sessions.length" class="mt-2 text-xs text-neutral-600">עדיין אין אימונים מתועדים.</p>
    <div v-for="exercise in exercises" :key="exercise.id">
      <ExerciseProgressChart :logs="logsFor(exercise.id)" :exercise-name="exercise.name" />
    </div>
    <details v-for="session in completed.slice(0, 10)" :key="session.id" class="mt-2 rounded-lg border border-neutral-200 p-3">
      <summary class="cursor-pointer text-sm font-medium text-brand-black">
        {{ new Date(session.started_at).toLocaleDateString('he-IL') }} ·
        {{ formatWorkoutDuration(workoutSummary(session, setsFor(session.id)).durationSeconds) }} ·
        {{ setsFor(session.id).length }} סטים
      </summary>
      <ul class="mt-2 space-y-1 text-xs text-neutral-600">
        <li v-for="set in setsFor(session.id)" :key="set.id">
          {{ set.exercise_name }} · סט {{ set.set_number }} · {{ set.weight_kg }} ק״ג × {{ set.reps }} חזרות
          <p v-if="set.trainee_note" class="mt-1 text-brand-black">הערת המתאמן: {{ set.trainee_note }}</p>
        </li>
      </ul>
    </details>
  </section>
</template>
