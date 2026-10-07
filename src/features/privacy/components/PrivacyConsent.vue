<script setup>
defineProps({ modelValue: { type: Boolean, required: true } })
defineEmits(['update:modelValue'])
</script>

<template>
  <label class="flex items-start gap-2 text-sm leading-relaxed text-neutral-600">
    <input
      :checked="modelValue"
      type="checkbox"
      required
      class="mt-1 size-4 shrink-0 accent-brand-green"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
    <span>
      קראתי ואני מסכים/ה
      <RouterLink class="font-medium text-brand-green underline" to="/privacy" target="_blank">
        למדיניות הפרטיות
      </RouterLink>
      , כולל שיתוף המידע עם המאמן/ת שלי ועם ספקי התשתית הדרושים להפעלת השירות.
    </span>
  </label>
</template>
