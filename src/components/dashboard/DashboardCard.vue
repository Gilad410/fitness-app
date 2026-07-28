<script setup>
defineProps({
  icon: { type: [Object, Function], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  value: { type: String, default: '' },
})
</script>

<template>
  <article
    class="flex flex-col gap-4 rounded-2xl border border-neutral-300 bg-brand-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6"
  >
    <div class="flex items-start justify-between gap-3">
      <span
        class="flex size-10 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green"
      >
        <component :is="icon" class="size-5" />
      </span>
      <span class="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
        בקרוב
      </span>
    </div>

    <div>
      <h3 class="font-semibold text-brand-black">{{ title }}</h3>
      <p class="mt-1 text-sm text-neutral-600">{{ description }}</p>
    </div>

    <p v-if="value" class="text-2xl font-bold text-brand-black">{{ value }}</p>
  </article>
</template>
