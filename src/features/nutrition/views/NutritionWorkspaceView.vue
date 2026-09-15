<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import BackLink from '../../../components/layout/BackLink.vue'
import TraineeStatusBadge from '../../trainees/components/TraineeStatusBadge.vue'
import NutritionSection from '../components/NutritionSection.vue'
import NutritionPlanSection from '../components/NutritionPlanSection.vue'
import { useTraineesStore } from '../../trainees/store/trainees'
import { useSelectedTraineeStore } from '../../trainees/store/selectedTrainee'
import { reconcileSelectionWithRoute } from '../../trainees/store/selectedTraineeStorage'

// Per-trainee nutrition workspace, reached from the "תזונה" main area
// (NutritionTraineesListView) rather than from the client-profile page.
// Renders the existing NutritionSection component as-is -- no duplicated
// nutrition logic lives here, this view only resolves :id -> trainee and
// shows a minimal header.
const route = useRoute()
const traineesStore = useTraineesStore()
const selectedTraineeStore = useSelectedTraineeStore()

const checking = ref(true)

const trainee = computed(() => traineesStore.getById(route.params.id))

onMounted(async () => {
  await traineesStore.ensureLoaded()
  checking.value = false
  // See selectedTraineeStorage.js's reconcileSelectionWithRoute() for the
  // full precedence/stale-clear reasoning.
  const outcome = reconcileSelectionWithRoute({
    resolvedTraineeId: trainee.value?.id ?? null,
    routeParamId: route.params.id,
    rememberedId: selectedTraineeStore.traineeId,
  })
  if (outcome.type === 'select') selectedTraineeStore.select(outcome.traineeId)
  else if (outcome.type === 'clear') selectedTraineeStore.clear()
})
</script>

<template>
  <AppLayout>
    <section class="mx-auto max-w-lg">
      <p v-if="checking" class="text-neutral-600">טוען...</p>

      <p v-else-if="!trainee" class="text-neutral-600">המתאמן לא נמצא.</p>

      <template v-else>
        <BackLink to="/nutrition" />

        <div class="mb-6 flex items-center gap-3">
          <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">
            {{ trainee.full_name }}
          </h1>
          <TraineeStatusBadge :status="trainee.status" />
        </div>

        <NutritionPlanSection :trainee-id="trainee.id" />
        <NutritionSection :trainee-id="trainee.id" />
      </template>
    </section>
  </AppLayout>
</template>
