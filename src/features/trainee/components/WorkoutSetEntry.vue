<script setup>
import { computed, reactive, ref, watch } from 'vue'
import ExerciseProgressChart from '../../training/components/ExerciseProgressChart.vue'
import { useWorkoutSessionsStore } from '../store/workoutSessions'

const props = defineProps({
  exercise: { type: Object, required: true },
  session: { type: Object, default: null },
})

const store = useWorkoutSessionsStore()
const form = reactive({ setNumber: 1, reps: '', weightKg: '', note: '' })
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const currentSets = computed(() => store.setsForSession(props.session?.id)
  .filter((set) => set.exercise_id === props.exercise.id)
  .sort((a, b) => a.set_number - b.set_number))
const history = computed(() => store.historyForExercise(props.exercise.id))

watch(() => props.session?.id, () => {
  form.setNumber = Math.min(100, Math.max(0, ...currentSets.value.map((set) => set.set_number)) + 1)
  form.reps = ''
  form.weightKg = ''
  form.note = ''
  saved.value = false
}, { immediate: true })

// A save in another exercise also replaces store.sets. Keep drafts intact.
watch(currentSets, () => {
  if (form.reps === '' && form.weightKg === '' && form.note === '') {
    form.setNumber = Math.min(100, Math.max(0, ...currentSets.value.map((set) => set.set_number)) + 1)
  }
})

async function save() {
  error.value = ''
  saved.value = false
  const reps = Number(form.reps)
  const weightKg = Number(form.weightKg)
  if (!Number.isInteger(reps) || reps < 1 || reps > 1000 ||
      form.weightKg === '' || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > 10000 ||
      Math.round(weightKg * 100) !== weightKg * 100 ||
      !Number.isInteger(Number(form.setNumber)) || Number(form.setNumber) < 1 || Number(form.setNumber) > 100) {
    error.value = 'יש להזין מספר סט, חזרות ומשקל תקינים.'
    return
  }
  saving.value = true
  try {
    await store.saveSet(props.session.id, props.exercise.id, {
      setNumber: Number(form.setNumber), reps, weightKg, note: form.note.trim(),
    })
    form.setNumber = Math.min(100, Math.max(0, ...currentSets.value.map((set) => set.set_number)) + 1)
    form.reps = ''
    form.weightKg = ''
    form.note = ''
    saved.value = true
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
    <p class="text-sm font-semibold text-brand-black">הביצוע שלי</p>
    <div v-if="currentSets.length" class="mt-2 flex flex-wrap gap-2">
      <span v-for="set in currentSets" :key="set.id" class="rounded-full bg-brand-green/10 px-3 py-1 text-xs font-medium text-brand-green-dark">
        סט {{ set.set_number }}: {{ set.weight_kg }} ק״ג × {{ set.reps }}
      </span>
    </div>
    <form v-if="session" class="mt-3 space-y-3" @submit.prevent="save">
      <div class="grid grid-cols-3 gap-2">
        <label class="text-xs text-neutral-600">סט
          <input v-model.number="form.setNumber" type="number" min="1" max="100" required class="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2 text-base text-brand-black" />
        </label>
        <label class="text-xs text-neutral-600">משקל בק״ג
          <input v-model="form.weightKg" type="number" inputmode="decimal" min="0" max="10000" step="0.01" required class="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2 text-base text-brand-black" />
        </label>
        <label class="text-xs text-neutral-600">חזרות
          <input v-model="form.reps" type="number" inputmode="numeric" min="1" max="1000" required class="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2 text-base text-brand-black" />
        </label>
      </div>
      <label class="block text-xs text-neutral-600">הערה שלי למאמן (לא חובה)
        <textarea v-model="form.note" maxlength="1000" rows="2" class="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2 text-base text-brand-black" placeholder="איך הרגיש הסט?" />
      </label>
      <button type="submit" :disabled="saving" class="min-h-11 rounded-lg bg-brand-green px-4 text-sm font-semibold text-brand-white disabled:opacity-60">
        {{ saving ? 'שומר...' : 'שמור סט' }}
      </button>
      <p v-if="saved" role="status" class="text-xs text-brand-green-dark">הסט נשמר והמאמן יכול לראות אותו.</p>
      <p v-if="error" role="alert" class="text-xs text-status-red">{{ error }}</p>
    </form>
    <p v-else class="mt-2 text-xs text-neutral-600">כדי לתעד משקל וחזרות, יש להתחיל אימון.</p>
    <ExerciseProgressChart :logs="history" :exercise-name="exercise.name" />
  </div>
</template>
