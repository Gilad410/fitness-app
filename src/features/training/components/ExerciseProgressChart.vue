<script setup>
import { computed } from 'vue'

const props = defineProps({
  logs: { type: Array, default: () => [] },
  exerciseName: { type: String, default: '' },
})

const points = computed(() => {
  const bySession = new Map()
  for (const log of props.logs) {
    const key = log.session_id
    const current = bySession.get(key)
    const weight = Number(log.weight_kg)
    if (!current || weight > current.weight) {
      bySession.set(key, { weight, at: log.recorded_at })
    }
  }
  return [...bySession.values()]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-8)
})

const chart = computed(() => {
  const values = points.value
  if (!values.length) return []
  const min = Math.min(0, ...values.map((point) => point.weight))
  const max = Math.max(1, ...values.map((point) => point.weight))
  const range = Math.max(1, max - min)
  return values.map((point, index) => ({
    x: values.length === 1 ? 50 : 5 + (index / (values.length - 1)) * 90,
    y: 82 - ((point.weight - min) / range) * 65,
    ...point,
  }))
})

const line = computed(() => chart.value.map((point) => `${point.x},${point.y}`).join(' '))
</script>

<template>
  <div v-if="points.length" class="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
    <div class="flex items-baseline justify-between gap-2">
      <p class="text-xs font-semibold text-brand-black">התקדמות במשקל{{ exerciseName ? ` · ${exerciseName}` : '' }}</p>
      <p class="text-xs text-neutral-600">שיא לכל אימון · עד 8 אימונים</p>
    </div>
    <svg
      class="mt-2 h-24 w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      :aria-label="`גרף משקל לאורך ${points.length} אימונים, מהאימון הראשון עד האחרון`"
    >
      <line x1="4" y1="83" x2="96" y2="83" stroke="#cbd5e1" stroke-width="1" />
      <polyline :points="line" fill="none" stroke="var(--color-brand-green)" stroke-width="2.5" vector-effect="non-scaling-stroke" />
      <circle v-for="(point, index) in chart" :key="index" :cx="point.x" :cy="point.y" r="2.3" fill="var(--ec-violet)" />
    </svg>
    <div class="flex justify-between text-xs text-neutral-600">
      <span>{{ new Date(points[0].at).toLocaleDateString('he-IL') }}</span>
      <span class="font-semibold text-brand-black">{{ points.at(-1).weight }} ק״ג</span>
      <span>{{ new Date(points.at(-1).at).toLocaleDateString('he-IL') }}</span>
    </div>
  </div>
</template>
