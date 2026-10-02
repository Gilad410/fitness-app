<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { buildNutritionDateStrip, isoDateToUtcDate } from '../lib/nutritionDateStrip.js'

const props = defineProps({
  modelValue: { type: String, required: true },
  today: { type: String, required: true },
})

const emit = defineEmits(['update:modelValue'])
const scroller = ref(null)
const dates = computed(() => buildNutritionDateStrip(props.today))

const weekdayFormatter = new Intl.DateTimeFormat('he-IL', {
  weekday: 'short',
  timeZone: 'UTC',
})
const dayFormatter = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  timeZone: 'UTC',
})
const rangeFormatter = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const rangeLabel = computed(() => {
  const first = dates.value[0]
  const last = dates.value.at(-1)
  return `${rangeFormatter.format(isoDateToUtcDate(first))} – ${rangeFormatter.format(isoDateToUtcDate(last))}`
})

function weekdayLabel(isoDate) {
  return weekdayFormatter.format(isoDateToUtcDate(isoDate)).replace(/^יום\s+/, '')
}

function dayLabel(isoDate) {
  return dayFormatter.format(isoDateToUtcDate(isoDate))
}

function selectDate(isoDate) {
  emit('update:modelValue', isoDate)
}

async function centerSelected(behavior = 'smooth') {
  await nextTick()
  const selected = scroller.value?.querySelector(`[data-date="${props.modelValue}"]`)
  selected?.scrollIntoView({ behavior, block: 'nearest', inline: 'center' })
}

onMounted(() => centerSelected('auto'))
watch(
  () => props.modelValue,
  () => centerSelected(),
)
</script>

<template>
  <section aria-labelledby="nutrition-date-strip-heading" class="min-w-0">
    <div class="mb-2 flex items-center justify-between gap-3 px-1">
      <h2 id="nutrition-date-strip-heading" class="text-sm font-semibold text-brand-black">
        {{ rangeLabel }}
      </h2>
      <span class="text-xs text-neutral-600">החלקה לבחירת יום</span>
    </div>

    <div
      ref="scroller"
      dir="ltr"
      class="date-strip -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
      aria-label="בחירת תאריך ביומן התזונה"
    >
      <button
        v-for="date in dates"
        :key="date"
        type="button"
        dir="rtl"
        :data-date="date"
        :aria-label="
          date === today
            ? `${weekdayLabel(date)}, ${dayLabel(date)}, היום`
            : `${weekdayLabel(date)}, ${dayLabel(date)}`
        "
        :aria-pressed="date === modelValue"
        :class="[
          'flex min-h-16 min-w-[3.4rem] flex-1 snap-center flex-col items-center justify-center rounded-lg border px-2 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
          date === modelValue
            ? 'border-brand-green bg-brand-green text-brand-white'
            : 'border-neutral-300 bg-brand-white text-brand-black hover:bg-neutral-100',
        ]"
        @click="selectDate(date)"
      >
        <span class="text-xs font-medium">{{ weekdayLabel(date) }}</span>
        <span class="ec-num mt-0.5 text-lg font-semibold">{{ dayLabel(date) }}</span>
        <span v-if="date === today" class="mt-0.5 text-[10px] leading-none">היום</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.date-strip {
  scrollbar-width: none;
  overscroll-behavior-inline: contain;
  touch-action: pan-x;
}

.date-strip::-webkit-scrollbar {
  display: none;
}
</style>
