<script setup>
defineProps({
  link: { type: Object, required: true },
})
</script>

<template>
  <a
    :href="link.url"
    target="_blank"
    rel="noopener noreferrer"
    class="flex flex-col gap-0.5 rounded-lg border border-neutral-300 bg-brand-white px-3 py-2 text-start hover:bg-neutral-100"
  >
    <span class="flex items-center gap-1 text-sm font-medium text-brand-black">
      {{ link.label }}
      <span aria-hidden="true">↗</span>
    </span>
    <span class="text-xs text-neutral-600">{{ link.note }}</span>
    <span class="text-xs text-neutral-600">נפתח בכרטיסייה חדשה באתר חיצוני</span>
  </a>
</template>
