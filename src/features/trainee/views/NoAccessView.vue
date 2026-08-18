<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'

// Landing page for an authenticated account that resolved to no role at
// all (021_trainee_auth_and_roles.sql grants role='coach'/'trainee' only
// through an explicit backfill or an accepted invite -- never implicitly
// from just being able to log in). Reachable only via the router guard's
// redirect, never linked to from anywhere in the UI.
const authStore = useAuthStore()
const router = useRouter()

async function handleLogout() {
  await authStore.signOut()
  router.push('/login')
}
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 class="text-xl font-bold text-brand-black">לחשבון זה אין הרשאת גישה</h1>
    <p class="text-sm text-neutral-600">
      החשבון <span class="font-medium text-brand-black">{{ authStore.user?.email }}</span>
      מחובר בהצלחה, אך אין לו הרשאה לאף אזור באפליקציה כרגע.
    </p>
    <p class="text-sm text-neutral-600">
      אם זהו חשבון מאמן/ת — יש לפנות למנהל המערכת. אם זהו חשבון מתאמן/ת — יש לוודא שאושרה כתובת
      האימייל בקישור שנשלח, ושהזמנת ההצטרפות עדיין בתוקף.
    </p>
    <button
      type="button"
      class="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-brand-white hover:bg-brand-green-dark"
      @click="handleLogout"
    >
      התנתקות
    </button>
  </section>
</template>
