<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'

// Landing page for a coach whose account was resolved as suspended by
// the router guard's live coach_get_own_status() re-check
// (056_owner_coach_administration.sql). Reachable only via that
// redirect, never linked to from anywhere in the UI. The router has
// already signed the session out and cleared every coach-data cache
// (clearCoachDataCaches.js) before navigating here -- this page is
// purely informational, it performs no further access attempt itself.
const authStore = useAuthStore()
const router = useRouter()

function goToLogin() {
  router.push('/login')
}
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 class="text-xl font-bold text-brand-black">הגישה לחשבון זה הושהתה</h1>
    <p class="text-sm text-neutral-600">
      הגישה לחשבון המאמן/ת<span v-if="authStore.user?.email"> ({{ authStore.user.email }})</span>
      הושהתה על ידי בעל/ת המערכת.
    </p>
    <p class="text-sm text-neutral-600">
      פרטי המתאמנים והנתונים ההיסטוריים נשמרים במלואם ואינם נמחקים. לחידוש הגישה יש לפנות לבעל/ת
      המערכת.
    </p>
    <button
      type="button"
      class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
      @click="goToLogin"
    >
      חזרה למסך ההתחברות
    </button>
  </section>
</template>
