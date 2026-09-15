<script setup>
import { computed } from 'vue'

// Reusable radial progress ring -- shared by DesignPreviewHome.vue's
// "today" ring and DesignPreviewNutrition.vue's hero ring, so the exact
// same math (and the same reduced-motion-respecting transition, defined
// once in designPreview.css's .tp-ring-progress) backs both instead of
// two hand-rolled copies.
const props = defineProps({
  value: { type: Number, required: true },
  max: { type: Number, required: true },
  size: { type: Number, default: 148 },
  strokeWidth: { type: Number, default: 14 },
  color: { type: String, default: 'var(--tp-blue)' },
})

const radius = computed(() => (props.size - props.strokeWidth) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const ratio = computed(() => Math.min(1, Math.max(0, props.value / props.max)))
const dashOffset = computed(() => circumference.value * (1 - ratio.value))
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="tp-ring-svg" role="img" :aria-label="`${value} מתוך ${max}`">
    <circle class="tp-ring-track" :cx="size / 2" :cy="size / 2" :r="radius" :stroke-width="strokeWidth" />
    <circle
      class="tp-ring-progress"
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      :stroke-width="strokeWidth"
      :stroke="color"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="dashOffset"
    />
  </svg>
</template>
