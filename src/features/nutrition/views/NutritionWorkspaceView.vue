<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../../../layouts/AppLayout.vue'
import TraineeStatusBadge from '../../trainees/components/TraineeStatusBadge.vue'
import NutritionSection from '../components/NutritionSection.vue'
import { useTraineesStore } from '../../trainees/store/trainees'

// Per-trainee nutrition workspace, reached from the "תזונה" main area
// (NutritionTraineesListView) rather than from the client-profile page.
// Renders the existing NutritionSection component as-is -- no duplicated
// nutrition logic lives here, this view only resolves :id -> trainee and
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
        <div class="mb-6 flex items-center gap-3">
          <h1 class="text-2xl font-bold text-brand-black sm:text-3xl">
            {{ trainee.full_name }}
          </h1>
          <TraineeStatusBadge :status="trainee.status" />
        </div>

        <NutritionSection :trainee-id="trainee.id" />
      </template>
    </section>
  </AppLayout>
</template>
