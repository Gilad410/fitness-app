<script setup>
// Error state for a screen/section whose data failed to load -- a clear
// Hebrew message (never the raw Supabase/browser error text) plus a retry
// button that re-runs the load in place, without a browser refresh.
defineProps({
  message: {
    type: String,
    default: 'לא ניתן היה לטעון את הנתונים. יש לבדוק את החיבור לאינטרנט ולנסות שוב.',
  },
  retrying: { type: Boolean, default: false },
})
defineEmits(['retry'])
</script>

<template>
  <div class="flex flex-col items-start gap-3" role="alert">
    <p class="text-sm text-status-red">{{ message }}</p>
    <button
      type="button"
      :disabled="retrying"
      class="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100 disabled:opacity-60"
      @click="$emit('retry')"
    >
      {{ retrying ? 'טוען...' : 'ניסיון חוזר' }}
    </button>
  </div>
</template>
