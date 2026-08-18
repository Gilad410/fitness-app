<script setup>
// Shared placeholder body for a future trainee section -- deliberately
// shows no data (real, fake, or otherwise). 021_trainee_auth_and_roles.sql
// grants the trainee role no access to nutrition/progress/circumference/
// photos/training-programs tables at all, so these pages have nothing
// authorized to fetch yet; this makes that explicit instead of quietly
// leaving a blank page.
defineProps({
  icon: { type: [Object, Function], required: true },
  description: { type: String, required: true },
})
</script>

<template>
  <section
    class="flex flex-col items-center gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-8 text-center shadow-sm sm:p-10"
  >
    <span class="flex size-14 items-center justify-center rounded-2xl bg-brand-green/10 text-brand-green">
      <component :is="icon" class="size-7" />
    </span>
    <p class="max-w-sm text-sm text-neutral-600">{{ description }}</p>
    <span class="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
      בקרוב — האזור הזה עדיין לא זמין
    </span>
  </section>
</template>
