<script setup>
// Shared "חזור" back link for internal detail/create/edit screens that
// have no other equivalent back action. Reuses the styling/placement
// pattern already established by TrainingProgramDetailView.vue's own
// hand-written back link (kept as-is there since it already covers that
// screen) -- `to` is an explicit route (string or router location object),
// never browser history, so a directly opened URL still returns to the
// correct parent screen.
defineProps({
  to: { type: [String, Object], required: true },
})
</script>

<template>
  <RouterLink :to="to" class="mb-4 inline-block text-sm text-neutral-600 hover:text-brand-black">
    &larr; חזור
  </RouterLink>
</template>
