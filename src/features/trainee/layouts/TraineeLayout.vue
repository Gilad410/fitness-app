<script setup>
import { ref } from 'vue'
import TraineeHeader from '../components/TraineeHeader.vue'
import TraineeSidebar from '../components/TraineeSidebar.vue'
import TraineeBottomNavElectric from '../components/TraineeBottomNavElectric.vue'

// Trainee-only layout -- structurally mirrors src/layouts/AppLayout.vue
// (same header+sidebar+bottom-nav+main shape, same "Electric Coach" visual
// design applied via the `.trainee-portal` CSS scope -- see style.css) but
// built entirely from trainee-only components. Nothing here imports
// AppLayout, TheHeader, or TheSidebar, so a trainee's screens can never
// accidentally render the coach navigation. The router guard
// (router/index.js) also blocks a trainee from ever reaching a coach
// route -- this is belt-and-suspenders on the rendering side.
const isSidebarOpen = ref(false)
</script>

<template>
  <div class="trainee-portal min-h-screen bg-neutral-100">
    <TraineeHeader @toggle-sidebar="isSidebarOpen = !isSidebarOpen" />

    <TraineeSidebar :open="isSidebarOpen" @close="isSidebarOpen = false" />

    <main class="ec-main p-4 sm:p-6 lg:p-8">
      <slot />
    </main>

    <TraineeBottomNavElectric />
  </div>
</template>
