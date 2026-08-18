<script setup>
import { ref } from 'vue'
import TraineeHeader from '../components/TraineeHeader.vue'
import TraineeSidebar from '../components/TraineeSidebar.vue'

// Trainee-only layout -- structurally mirrors src/layouts/AppLayout.vue
// (same header+sidebar+main shape, same mobile-friendly off-canvas
// sidebar) but built entirely from trainee-only components. Nothing here
// imports AppLayout, TheHeader, or TheSidebar, so a trainee's screens can
// never accidentally render the coach navigation. The router guard
// (router/index.js) also blocks a trainee from ever reaching a coach
// route -- this is belt-and-suspenders on the rendering side.
const isSidebarOpen = ref(false)
</script>

<template>
  <div class="min-h-screen bg-neutral-100">
    <TraineeHeader @toggle-sidebar="isSidebarOpen = !isSidebarOpen" />

    <TraineeSidebar :open="isSidebarOpen" @close="isSidebarOpen = false" />

    <main class="p-4 sm:p-6 lg:p-8">
      <slot />
    </main>
  </div>
</template>
