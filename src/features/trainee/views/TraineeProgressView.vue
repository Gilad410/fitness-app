<script setup>
import TraineeLayout from '../layouts/TraineeLayout.vue'
import TraineeComingSoon from '../components/TraineeComingSoon.vue'
import IconTrendingUp from '../../../components/icons/IconTrendingUp.vue'
</script>

<template>
  <TraineeLayout>
    <div class="mx-auto max-w-2xl">
      <section class="mb-6 sm:mb-8">
        <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">ההתקדמות שלי</h1>
        <p class="mt-1 text-sm text-neutral-600">מעקב משקל והתקדמות לאורך זמן</p>
      </section>

      <TraineeComingSoon
        :icon="IconTrendingUp"
        description="כשהתכונה תופעל, תוכל/י לראות כאן את היסטוריית המשקל שלך והתקדמות מול היעד שהוגדר עם המאמן/ת."
      />
    </div>
  </TraineeLayout>
</template>
