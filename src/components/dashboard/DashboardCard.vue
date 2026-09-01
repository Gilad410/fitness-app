<script setup>
import { computed } from 'vue'

const props = defineProps({
  icon: { type: [Object, Function], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  value: { type: String, default: '' },
  caption: { type: String, default: '' },
  comingSoon: { type: Boolean, default: true },
  to: { type: String, default: null },
  // Opt-in only -- this card is shared with the trainee home page
  // (TraineeHomeView.vue), which never passes this prop and so keeps
  // rendering with the exact original classes below. Only the coach
  // dashboard (DashboardView.vue) passes tone="coach", to swap the icon
  // color from the primary athletic green (weak contrast as small text on
  // its own soft-green circle) to the darker, more readable coach green.
  tone: { type: String, default: 'default' },
})

const iconWrapperClass = computed(() =>
  props.tone === 'coach'
    ? 'flex size-10 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green-dark'
    : 'flex size-10 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green',
)
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'article'"
    :to="to"
    class="flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6"
  >
    <div class="flex items-start justify-between gap-3">
      <span :class="iconWrapperClass">
        <component :is="icon" class="size-5" />
      </span>
      <span
        v-if="comingSoon"
        class="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
      >
        בקרוב
      </span>
    </div>

    <div>
      <h3 class="font-semibold text-brand-black">{{ title }}</h3>
      <p class="mt-1 text-sm text-neutral-600">{{ description }}</p>
    </div>

    <div v-if="value" class="flex items-baseline gap-2">
      <p class="text-2xl font-bold text-brand-black">{{ value }}</p>
      <p v-if="caption" class="text-xs text-neutral-500">{{ caption }}</p>
    </div>
  </component>
</template>
