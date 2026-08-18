<script setup>
import TraineeLayout from '../layouts/TraineeLayout.vue'
import TraineeComingSoon from '../components/TraineeComingSoon.vue'
import IconRuler from '../../../components/icons/IconRuler.vue'
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">מדידות ותמונות</h1>
        <p class="mt-1 text-sm text-neutral-600">היקפי גוף ותמונות התקדמות פרטיות</p>
      </section>

      <TraineeComingSoon
        :icon="IconRuler"
        description="כשהתכונה תופעל, תוכל/י לראות כאן את היקפי הגוף ותמונות ההתקדמות הפרטיות שלך שהמאמן/ת מתעד/ת."
      />
    </div>
  </TraineeLayout>
</template>
