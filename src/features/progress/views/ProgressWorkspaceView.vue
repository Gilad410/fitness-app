<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import BackLink from '../../../components/layout/BackLink.vue'
import TraineeStatusBadge from '../../trainees/components/TraineeStatusBadge.vue'
import TraineeProgressSection from '../components/TraineeProgressSection.vue'
import TraineeCircumferenceSection from '../components/TraineeCircumferenceSection.vue'
import TraineeProgressPhotosSection from '../components/TraineeProgressPhotosSection.vue'
import LoadErrorState from '../../../components/feedback/LoadErrorState.vue'
import { useTraineesStore } from '../../trainees/store/trainees'
import { useSelectedTraineeStore } from '../../trainees/store/selectedTrainee'
import { reconcileSelectionWithRoute } from '../../trainees/store/selectedTraineeStorage'

// Per-trainee progress workspace, reached from the "התקדמות" main area
// (ProgressTraineesListView) -- mirrors NutritionWorkspaceView.vue. Renders
// the existing progress/circumference/photos sections as-is (the same
// components already shown on the trainee-detail page) -- no duplicated
// progress logic lives here, this view only resolves :id -> trainee and
// shows a minimal header.
const route = useRoute()
const traineesStore = useTraineesStore()
const selectedTraineeStore = useSelectedTraineeStore()

const checking = ref(true)
const loadFailed = ref(false)

const trainee = computed(() => traineesStore.getById(route.params.id))

// Re-runnable (the retry button calls it again) -- a failed load must
// never leave the screen stuck on "טוען...", and must never reach the
// selection reconcile below, which would otherwise treat the not-yet-
// loaded trainee as deleted and clear the remembered selection.
async function loadTrainee() {
  checking.value = true
  loadFailed.value = false
  try {
    await traineesStore.ensureLoaded()
  } catch {
    loadFailed.value = true
    return
  } finally {
    checking.value = false
  }
  // See selectedTraineeStorage.js's reconcileSelectionWithRoute() for the
  // full precedence/stale-clear reasoning.
  const outcome = reconcileSelectionWithRoute({
    resolvedTraineeId: trainee.value?.id ?? null,
    routeParamId: route.params.id,
    rememberedId: selectedTraineeStore.traineeId,
  })
  if (outcome.type === 'select') selectedTraineeStore.select(outcome.traineeId)
  else if (outcome.type === 'clear') selectedTraineeStore.clear()
}

onMounted(loadTrainee)
</script>

<template>
  <AppLayout>
    <section class="mx-auto max-w-lg">
      <p v-if="checking" class="text-neutral-600" role="status">טוען...</p>

      <LoadErrorState
        v-else-if="loadFailed"
        message="לא ניתן היה לטעון את פרטי המתאמן. יש לבדוק את החיבור לאינטרנט ולנסות שוב."
        @retry="loadTrainee"
      />

      <p v-else-if="!trainee" class="text-neutral-600">המתאמן לא נמצא.</p>

      <template v-else>
        <BackLink to="/progress" />

        <div class="mb-6 flex items-center gap-3">
          <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">
            {{ trainee.full_name }}
          </h1>
          <TraineeStatusBadge :status="trainee.status" />
        </div>

        <TraineeProgressSection :trainee="trainee" />
        <TraineeCircumferenceSection :trainee="trainee" />
        <TraineeProgressPhotosSection :trainee="trainee" />
      </template>
    </section>
  </AppLayout>
</template>
