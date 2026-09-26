<script setup>
import { useRouter } from 'vue-router'

// Landing page for a coach whose account exists and holds the coach
// role, but whose access_status is still 'pending' -- i.e. they accepted
// an owner invitation and set a password, and the owner has not yet
// approved them (056_owner_coach_administration.sql: a newly linked
// coach is always created 'pending', never auto-'active').
//
// This screen exists because an earlier revision routed EVERY non-active
// coach to the suspension screen, which told a brand-new coach that
// their access had been "suspended by the owner" -- untrue, and a bad
// first experience for someone who had just completed onboarding
// correctly. Pending and suspended are different facts and get different
// wording.
//
// The router signs the session out before navigating here (the account
// cannot usefully do anything until approved, and holding an
// authenticated session would only invite confusing partial failures),
// so this component deliberately reads no account data -- see
// CoachSuspendedView.vue for the same reasoning.
const router = useRouter()

function goToLogin() {
  router.push('/login')
}
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 class="text-xl font-bold text-brand-black">החשבון ממתין לאישור</h1>
    <p class="text-sm text-neutral-600">
      ההרשמה הושלמה בהצלחה. החשבון ממתין כעת לאישור בעל/ת המערכת, ועד לאישור לא ניתן להיכנס לאזור
      המאמנים.
    </p>
    <p class="text-sm text-neutral-600">
      תישלח הודעה כשהחשבון יאושר. לאחר האישור ניתן להתחבר כרגיל עם אותו אימייל וסיסמה.
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
