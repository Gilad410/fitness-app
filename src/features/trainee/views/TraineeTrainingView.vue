<script setup>
import TraineeLayout from '../layouts/TraineeLayout.vue'
import TraineeComingSoon from '../components/TraineeComingSoon.vue'
import IconDumbbell from '../../../components/icons/IconDumbbell.vue'
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">תוכנית האימונים שלי</h1>
        <p class="mt-1 text-sm text-neutral-600">התרגילים, הסטים והחזרות שהמאמן/ת הגדיר/ה עבורך</p>
      </section>

      <TraineeComingSoon
        :icon="IconDumbbell"
        description="כשהתכונה תופעל, תוכל/י לראות כאן את תוכנית האימונים הנוכחית שלך ישירות מהמאמן/ת, כולל תרגילים, קבוצות שרירים וסטים."
      />
    </div>
  </TraineeLayout>
</template>
