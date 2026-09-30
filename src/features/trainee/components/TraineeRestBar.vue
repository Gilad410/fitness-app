<script setup>
import { computed } from 'vue'
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
</script>

<template>
  <div
    v-if="visible"
    class="ec-rest-bar fixed inset-x-0 z-30 mx-auto max-w-2xl px-4 sm:px-6"
    role="status"
    aria-live="polite"
  >
    <div
      class="flex items-center gap-3 rounded-2xl border bg-brand-white p-3 shadow-lg"
      :class="restState.finished ? 'border-brand-green' : 'border-neutral-300'"
    >
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs text-neutral-600">
          <span v-if="restState.finished" class="font-semibold text-brand-green">המנוחה הסתיימה</span>
          <span v-else>מנוחה</span>
          <span v-if="restState.exerciseName"> &middot; {{ restState.exerciseName }}</span>
        </p>

        <p
          class="text-2xl font-extrabold tabular-nums leading-none"
          :class="restState.finished ? 'text-brand-green' : 'text-brand-black'"
        >
          {{ clock }}
        </p>

        <!-- Drains left to right as the rest elapses. -->
        <div class="mt-2 h-1 overflow-hidden rounded-full bg-neutral-100">
          <div
            class="ec-rest-fill h-full rounded-full bg-brand-green"
            :style="{ width: `${progress * 100}%` }"
          ></div>
        </div>
      </div>

      <button
        v-if="restState.running"
        type="button"
        class="min-h-11 shrink-0 rounded-lg border border-neutral-300 px-3 text-sm font-medium text-brand-black hover:bg-neutral-100"
        @click="addRest(30)"
      >
        +30 שנ׳
      </button>

      <button
        type="button"
        class="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold"
        :class="
          restState.finished
            ? 'bg-brand-green text-brand-white hover:bg-brand-green-dark'
            : 'border border-neutral-300 text-brand-black hover:bg-neutral-100'
        "
        @click="stopRest"
      >
        {{ restState.finished ? 'סיום' : 'דלג' }}
      </button>
    </div>
  </div>
</template>
