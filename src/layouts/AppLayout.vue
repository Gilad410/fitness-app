<script setup>
import { ref } from 'vue'
import TheHeader from '../components/layout/TheHeader.vue'
import TheSidebar from '../components/layout/TheSidebar.vue'

const isSidebarOpen = ref(false)
</script>

<template>
  <div class="min-h-screen bg-neutral-100">
    <TheHeader @toggle-sidebar="isSidebarOpen = !isSidebarOpen" />

    <div class="flex items-start">
      <TheSidebar :open="isSidebarOpen" @close="isSidebarOpen = false" />

      <main class="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
