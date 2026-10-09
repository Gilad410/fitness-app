<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  logs: { type: Array, default: () => [] },
  exerciseName: { type: String, default: '' },
})
const metric = ref('weight')
const unit = computed(() => metric.value === 'weight' ? 'ק״ג' : 'חזרות')

const points = computed(() => {
  const bySession = new Map()
  for (const log of props.logs) {
    const key = log.session_id
    const current = bySession.get(key)
    const weight = Number(log.weight_kg)
    const reps = Number(log.reps)
    if (!current) bySession.set(key, { weight, reps, at: log.recorded_at })
    else {
      current.weight = Math.max(current.weight, weight)
      current.reps = Math.max(current.reps, reps)
      if (Date.parse(log.recorded_at) > Date.parse(current.at)) current.at = log.recorded_at
    }
  }
  return [...bySession.values()]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-8)
})

const chart = computed(() => {
  const values = points.value
  if (!values.length) return []
  const min = 0
  const max = Math.max(1, ...values.map((point) => point[metric.value]))
  const range = Math.max(1, max - min)
  return values.map((point, index) => ({
    x: values.length === 1 ? 150 : 15 + (index / (values.length - 1)) * 270,
    y: 82 - ((point[metric.value] - min) / range) * 65,
    ...point,
  }))
})

const line = computed(() => chart.value.map((point) => `${point.x},${point.y}`).join(' '))
</script>

<template>
  <div v-if="points.length" class="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold text-brand-black">התקדמות{{ exerciseName ? ` · ${exerciseName}` : '' }}</p>
      <div class="flex rounded-lg border border-neutral-200 p-0.5 text-xs" aria-label="מדד הגרף">
        <button type="button" class="min-h-9 rounded-md px-2" :class="metric === 'weight' ? 'bg-brand-green text-brand-white' : 'text-neutral-600'" :aria-pressed="metric === 'weight'" @click="metric = 'weight'">משקל</button>
        <button type="button" class="min-h-9 rounded-md px-2" :class="metric === 'reps' ? 'text-brand-white' : 'text-neutral-600'" :style="metric === 'reps' ? { background: 'var(--ec-violet)' } : {}" :aria-pressed="metric === 'reps'" @click="metric = 'reps'">חזרות</button>
      </div>
    </div>
    <p class="mt-1 text-xs text-neutral-600">שיא לכל אימון · עד 8 אימונים</p>
    <svg
      class="mt-2 h-24 w-full"
      viewBox="0 0 300 100"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      :aria-label="`גרף ${metric === 'weight' ? 'משקל' : 'חזרות'} לאורך ${points.length} אימונים, מהאימון הראשון עד האחרון`"
    >
      <line x1="12" y1="83" x2="288" y2="83" stroke="#cbd5e1" stroke-width="1" />
      <polyline :points="line" fill="none" :stroke="metric === 'weight' ? 'var(--color-brand-green)' : 'var(--ec-violet)'" stroke-width="2.5" vector-effect="non-scaling-stroke" />
      <circle v-for="(point, index) in chart" :key="index" :cx="point.x" :cy="point.y" r="2.3" fill="var(--ec-violet)" />
    </svg>
    <div class="flex justify-between text-xs text-neutral-600">
      <span>{{ new Date(points[0].at).toLocaleDateString('he-IL') }}</span>
      <span class="font-semibold text-brand-black">{{ points.at(-1)[metric] }} {{ unit }}</span>
      <span>{{ new Date(points.at(-1).at).toLocaleDateString('he-IL') }}</span>
    </div>
  </div>
</template>
