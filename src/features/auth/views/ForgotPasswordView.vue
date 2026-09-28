<script setup>
import { ref } from 'vue'
import { supabase } from '../../../lib/supabaseClient'

// Coach-side "forgot password" request screen. Deliberately shows the
// exact same success message whether or not the email actually belongs to
// an account -- supabase.auth.resetPasswordForEmail() already does not
// error for an unknown email (GoTrue's own anti-enumeration behavior), and
// this view adds nothing on top that could leak that distinction (no
// separate "email not found" branch, no differently-worded outcome).
// redirectTo must exactly match an entry in the Supabase project's
// Auth -> URL Configuration -> Redirect URLs allow-list, or the link in
// the email will silently fall back to the project's default Site URL
// instead of landing on ResetPasswordView.vue.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const email = ref('')
const loading = ref(false)
const error = ref('')
const submitted = ref(false)

function useAnotherEmail() {
  submitted.value = false
  error.value = ''
}

function safeErrorMessage(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('security purposes') || msg.includes('rate limit')) {
    return 'בוצעו יותר מדי ניסיונות. יש לנסות שוב בעוד מספר דקות.'
  }
  // Never a more specific message here -- see the module comment above:
  // this must not distinguish "email not found" from any other failure.
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
      redirectTo: `${window.location.origin}/reset-password`,
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
  <section
    class="coach-portal mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-brand-white p-6"
  >
    <h1 class="text-2xl font-bold text-brand-black">שחזור סיסמה</h1>

    <template v-if="submitted">
      <div
        class="rounded-lg border border-brand-green/30 bg-brand-green/10 px-4 py-3 text-sm text-brand-black"
      >
        <p class="font-medium">בדקו את תיבת האימייל</p>
        <p class="mt-1">אם קיים חשבון מאמן/ת המשויך לכתובת הזו, נשלח אליו קישור לאיפוס הסיסמה.</p>
        <ul class="mt-3 list-inside list-disc space-y-1 text-xs text-neutral-600">
          <li>ההודעה עשויה להגיע בתוך כמה דקות.</li>
          <li>כדאי לבדוק גם בתיקיות ספאם וקידומי מכירות.</li>
          <li>מטעמי אבטחה, יש להשתמש בקישור האחרון שנשלח.</li>
        </ul>
      </div>
      <div class="flex flex-col gap-2 text-sm">
        <button
          type="button"
          class="self-start text-brand-green-dark hover:underline"
          @click="useAnotherEmail"
        >
          שימוש בכתובת אימייל אחרת
        </button>
        <RouterLink to="/login" class="text-brand-green-dark hover:underline">
          חזרה למסך ההתחברות
        </RouterLink>
      </div>
    </template>

    <form v-else class="flex flex-col gap-4" @submit.prevent="handleSubmit">
      <p class="text-sm text-neutral-600">
        יש להזין את כתובת האימייל של חשבון המאמן/ת -- אם קיים חשבון כזה, יישלח אליו קישור לאיפוס
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
        class="rounded-lg bg-brand-green px-4 py-2 font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
      >
        {{ loading ? 'שולח...' : 'שליחת קישור לאיפוס' }}
      </button>

      <RouterLink to="/login" class="text-sm text-neutral-600 hover:underline">
        חזרה למסך ההתחברות
      </RouterLink>
    </form>
  </section>
</template>
