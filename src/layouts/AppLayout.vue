<script setup>
import { ref } from 'vue'
import TheHeader from '../components/layout/TheHeader.vue'
import TheSidebar from '../components/layout/TheSidebar.vue'
import TheBottomNavElectric from '../components/layout/TheBottomNavElectric.vue'

// Every coach screen (dashboard, trainees, nutrition, progress, training,
// alerts) renders through this one shared layout, so applying the
// "Electric Coach" visual design here -- rather than in each feature view
// -- is what makes it consistent across the whole coach portal without
// duplicating any feature view. `.coach-portal` (see style.css) is what
// actually repaints every existing bg-brand-*/text-brand-*/border-*
// utility already used throughout every coach view.
//
// On a phone-sized touch viewport, TheBottomNavElectric replaces the
// top-right hamburger (TheHeader/TheSidebar's drawer toggle) -- see the
// `.ec-menu-trigger`/`.ec-bottom-nav` media-query rules in style.css.
const isSidebarOpen = ref(false)
</script>

<template>
  <div class="coach-portal min-h-screen bg-neutral-100">
    <TheHeader @toggle-sidebar="isSidebarOpen = !isSidebarOpen" />

    <TheSidebar :open="isSidebarOpen" @close="isSidebarOpen = false" />

    <main class="ec-main p-4 sm:p-6 lg:p-8">
      <slot />
    </main>

    <TheBottomNavElectric />
  </div>
</template>
