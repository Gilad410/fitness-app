<script setup>
defineProps({
  status: { type: String, required: true },
})

const labels = {
  active: 'פעיל',
  paused: 'בהשהיה',
  archived: 'בארכיון',
}

const classes = {
  active: 'bg-brand-green/10 text-brand-green',
  paused: 'bg-status-yellow/10 text-status-yellow',
  archived: 'bg-neutral-100 text-neutral-600',
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
    :class="classes[status]"
  >
    {{ labels[status] }}
  </span>
</template>
