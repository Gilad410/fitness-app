<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import BackLink from '../../../components/layout/BackLink.vue'
import TraineeStatusBadge from '../../trainees/components/TraineeStatusBadge.vue'
import TraineeProgressSection from '../components/TraineeProgressSection.vue'
import TraineeCircumferenceSection from '../components/TraineeCircumferenceSection.vue'
import TraineeProgressPhotosSection from '../components/TraineeProgressPhotosSection.vue'
import { useTraineesStore } from '../../trainees/store/trainees'

// Per-trainee progress workspace, reached from the "התקדמות" main area
// (ProgressTraineesListView) -- mirrors NutritionWorkspaceView.vue. Renders
// the existing progress/circumference/photos sections as-is (the same
// components already shown on the trainee-detail page) -- no duplicated
// progress logic lives here, this view only resolves :id -> trainee and
// shows a minimal header.
const route = useRoute()
const traineesStore = useTraineesStore()

const checking = ref(true)

onMounted(async () => {
  await traineesStore.ensureLoaded()
  checking.value = false
})

const trainee = computed(() => traineesStore.getById(route.params.id))
</script>

<template>
  <AppLayout>
    <section class="mx-auto max-w-lg">
      <p v-if="checking" class="text-neutral-600">טוען...</p>

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
