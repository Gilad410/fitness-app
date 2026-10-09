<script setup>
import { computed, ref, watch } from 'vue'
import { restState, stopRest, addRest, formatClock, restProgress } from '../lib/restTimer'

// Sticky countdown that appears above the bottom nav while a rest is
// running, and stays for a moment once it finishes.
//
// It sits at the bottom rather than inline next to the exercise so it
// survives scrolling: in the gym you start the rest, then look at the
// next exercise, and the clock has to still be visible while you do.
const clock = computed(() => formatClock(restState.remaining))
const progress = computed(() => restProgress(restState.remaining, restState.total))
const visible = computed(() => restState.running || restState.finished)
const expanded = ref(false)
watch(() => restState.startedCount, () => { expanded.value = true })
watch(() => [restState.running, restState.finished], ([running, finished]) => {
  if (!running && !finished) expanded.value = false
})
const ringStyle = computed(() => ({
  background: `conic-gradient(var(--color-brand-green) ${progress.value * 100}%, var(--ec-violet) ${progress.value * 100}%, #e8eaf4 0)`,
}))
</script>

<template>
  <button v-if="visible && !expanded" type="button" class="ec-rest-bar fixed inset-x-4 z-30 mx-auto flex max-w-2xl min-h-14 items-center justify-between rounded-2xl border border-brand-green bg-brand-white px-4 shadow-lg" @click="expanded = true">
    <span class="text-sm font-semibold text-brand-black">{{ restState.finished ? 'המנוחה הסתיימה' : `מנוחה · ${restState.exerciseName}` }}</span>
    <span class="ec-num text-xl text-brand-green-dark" dir="ltr">{{ clock }}</span>
  </button>

  <div v-if="visible && expanded" class="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/70 p-4" role="presentation" @click.self="expanded = false">
    <section role="dialog" aria-modal="true" aria-label="שעון מנוחה" class="w-full max-w-sm rounded-3xl bg-brand-white p-6 text-center shadow-xl">
      <div class="flex items-center justify-between gap-3 text-start">
        <div>
          <p class="text-xs font-semibold text-brand-green-dark">שעון מנוחה</p>
          <p class="text-sm text-neutral-600">{{ restState.exerciseName }}</p>
        </div>
        <button type="button" class="min-h-11 rounded-lg px-3 text-sm text-neutral-600" aria-label="מזער שעון מנוחה" @click="expanded = false">מזער</button>
      </div>
      <div class="mx-auto mt-5 flex size-52 items-center justify-center rounded-full p-3" :style="ringStyle">
        <div class="flex size-full flex-col items-center justify-center rounded-full bg-brand-white">
          <span class="ec-num text-5xl text-brand-green-dark" dir="ltr" role="timer">{{ clock }}</span>
          <span class="mt-1 text-sm text-neutral-600">{{ restState.finished ? 'המנוחה הסתיימה' : 'נותרו למנוחה' }}</span>
        </div>
      </div>
      <div class="mt-6 flex justify-center gap-3">
        <button v-if="restState.running" type="button" class="min-h-11 rounded-lg border border-neutral-300 px-5 text-sm font-medium text-brand-black" @click="addRest(30)">+30 שנ׳</button>
        <button type="button" class="min-h-11 rounded-lg bg-brand-green px-5 text-sm font-semibold text-brand-white" @click="stopRest">{{ restState.finished ? 'סגור' : 'דלג' }}</button>
      </div>
    </section>
  </div>
</template>
