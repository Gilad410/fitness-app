<script setup>
import { ref } from 'vue'
import { supabase } from '../../../lib/supabaseClient'

// Trainee-side "forgot password" request screen -- mirrors
// src/features/auth/views/ForgotPasswordView.vue (coach) exactly in
// behavior, kept as its own separate component so the trainee area never
// imports anything coach-side (same convention as every other
// coach/trainee pair in this app). Deliberately shows the exact same
// success message whether or not the email actually belongs to an
// account -- see that file's comment for why. redirectTo must exactly
// match an entry in the Supabase project's Auth -> URL Configuration ->
// Redirect URLs allow-list.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const email = ref('')
const loading = ref(false)
const error = ref('')
const submitted = ref(false)

function safeErrorMessage(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('security purposes') || msg.includes('rate limit')) {
    return 'בוצעו יותר מדי ניסיונות. יש לנסות שוב בעוד מספר דקות.'
  }
  return 'אירעה שגיאה. יש לנסות שוב.'
}

async function handleSubmit() {
  error.value = ''
  if (!EMAIL_RE.test(email.value.trim())) {
    error.value = 'יש להזין כתובת אימייל תקינה.'
    return
  }
  loading.value = true
  try {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.value.trim(), {
      redirectTo: `${window.location.origin}/trainee/reset-password`,
    })
    if (resetError) throw resetError
    submitted.value = true
  } catch (err) {
    error.value = safeErrorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="trainee-portal mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-brand-white p-6">
    <h1 class="text-2xl font-bold text-brand-black">שחזור סיסמה</h1>

    <template v-if="submitted">
      <p class="rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-2 text-sm text-brand-black">
        אם קיים חשבון מתאמן/ת המשויך לכתובת האימייל הזו, נשלח אליו מייל עם קישור לאיפוס הסיסמה.
      </p>
      <RouterLink to="/trainee/login" class="text-sm text-brand-green-dark hover:underline">
        חזרה למסך ההתחברות
      </RouterLink>
    </template>

    <form v-else class="flex flex-col gap-4" @submit.prevent="handleSubmit">
      <p class="text-sm text-neutral-600">
        יש להזין את כתובת האימייל של חשבון המתאמן/ת -- אם קיים חשבון כזה, יישלח אליו קישור לאיפוס
        הסיסמה.
      </p>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">אימייל</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
        />
      </label>

      <p v-if="error" class="text-sm text-status-red">{{ error }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="rounded-lg bg-brand-green px-4 py-2 font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
      >
        {{ loading ? 'שולח...' : 'שליחת קישור לאיפוס' }}
      </button>

      <RouterLink to="/trainee/login" class="text-sm text-neutral-600 hover:underline">
        חזרה למסך ההתחברות
      </RouterLink>
    </form>
  </section>
</template>
