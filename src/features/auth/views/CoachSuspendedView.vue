<script setup>
import { useRouter } from 'vue-router'

// Landing page for a coach whose account was resolved as suspended by
// the router guard's live coach_get_own_status() re-check
// (056_owner_coach_administration.sql). Reachable only via that
// redirect, never linked to from anywhere in the UI.
//
// Deliberately reads NO account data. An earlier revision displayed
// authStore.user?.email here, which was doubly wrong: the router signs
// the session out (and clears every coach-data cache) BEFORE navigating
// here, so that value is empty in the normal case and the markup was
// dead; and retaining identifying coach data after a suspension is
// exactly what "do not retain authenticated coach data after
// suspension" rules out. The email was not re-introduced by stashing it
// somewhere before sign-out either -- it adds nothing for the person
// reading the screen, who already knows which account they just used.
const router = useRouter()

function goToLogin() {
  router.push('/login')
}
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 class="text-xl font-bold text-brand-black">הגישה לחשבון זה הושהתה</h1>
    <p class="text-sm text-neutral-600">
      הגישה לחשבון המאמן/ת הושהתה על ידי בעל/ת המערכת.
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
