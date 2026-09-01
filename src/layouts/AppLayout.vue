<script setup>
import { ref } from 'vue'
import TheHeader from '../components/layout/TheHeader.vue'
import TheSidebar from '../components/layout/TheSidebar.vue'

const isSidebarOpen = ref(false)
</script>

<template>
  <div class="coach-portal min-h-screen bg-neutral-100">
    <TheHeader @toggle-sidebar="isSidebarOpen = !isSidebarOpen" />

    <TheSidebar :open="isSidebarOpen" @close="isSidebarOpen = false" />

    <main class="p-4 sm:p-6 lg:p-8">
      <slot />
    </main>
  </div>
</template>
