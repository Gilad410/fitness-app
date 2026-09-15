<script setup>
import { ref } from 'vue'
import TheHeader from '../components/layout/TheHeader.vue'
import TheSidebar from '../components/layout/TheSidebar.vue'
import TheBottomNavElectric from '../components/layout/TheBottomNavElectric.vue'
import { useSelectedTraineeStore } from '../features/trainees/store/selectedTrainee'

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

// Restores the coach's remembered trainee selection (selectedTrainee.js)
// on every AppLayout mount -- i.e. on every coach page load, including a
// hard refresh/direct URL visit, since Pinia's own in-memory state starts
// fresh then. Cheap and idempotent to repeat on every SPA navigation too
// (same "remounts on every navigation" reasoning TheSidebar.vue's alerts
// refetch already relies on) -- it always re-reads from storage rather
// than trusting whatever the in-memory value already was, so it can never
// leak a stale value across a coach switch in the same tab either.
useSelectedTraineeStore().restore()
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
