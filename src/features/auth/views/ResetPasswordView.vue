<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'
import { supabase, authEventState } from '../../../lib/supabaseClient'
import { useResetPassword } from '../../../lib/useResetPassword'

// Coach-side password-reset landing page -- the redirectTo target
// ForgotPasswordView.vue passes to supabase.auth.resetPasswordForEmail().
// All the actual state/logic lives in the shared useResetPassword.js
// composable (see its header for the full reasoning, including the
// "does not show the form just because a session exists" security
// requirement and the live-reactivity fix for a since-changed account).
// This file only supplies the coach-specific dependencies (this app's
// auth store, router, and which login route to land on afterward) and
// renders the template.
const router = useRouter()
const authStore = useAuthStore()

const {
  MIN_PASSWORD_LENGTH,
  checkingSession,
  hasValidRecoveryContext,
  newPassword,
  confirmNewPassword,
  settingPassword,
  setPasswordError,
  done,
  initialize,
  handleSubmit,
} = useResetPassword({ authStore, authEventState, supabase, router, loginRouteName: 'login' })

onMounted(initialize)
</script>

<template>
  <section class="coach-portal mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-brand-white p-6">
    <h1 class="text-2xl font-bold text-brand-black">הגדרת סיסמה חדשה</h1>

    <p v-if="checkingSession" class="text-sm text-neutral-600">טוען...</p>

    <p
      v-else-if="done"
      class="rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-2 text-sm text-brand-black"
    >
      הסיסמה עודכנה בהצלחה. מעביר למסך ההתחברות...
    </p>

    <template v-else-if="hasValidRecoveryContext">
      <p class="text-sm text-neutral-600">יש להזין סיסמה חדשה לחשבון.</p>

      <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">סיסמה חדשה</span>
          <input
            v-model="newPassword"
            type="password"
            required
            :minlength="MIN_PASSWORD_LENGTH"
            autocomplete="new-password"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">אימות סיסמה</span>
          <input
            v-model="confirmNewPassword"
            type="password"
            required
            :minlength="MIN_PASSWORD_LENGTH"
            autocomplete="new-password"
            class="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-green focus:outline-none"
          />
        </label>

        <p v-if="setPasswordError" class="text-sm text-status-red">{{ setPasswordError }}</p>

        <button
          type="submit"
          :disabled="settingPassword"
          class="rounded-lg bg-brand-green px-4 py-2 font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
        >
          {{ settingPassword ? 'שומר...' : 'שמירת סיסמה' }}
        </button>
      </form>
    </template>

    <template v-else>
      <p class="text-sm text-status-red">
        קישור איפוס הסיסמה אינו תקין או שפג תוקפו. יש לבקש קישור חדש.
      </p>
      <RouterLink to="/forgot-password" class="text-sm text-brand-green-dark hover:underline">
        בקשת קישור חדש
      </RouterLink>
    </template>
  </section>
</template>
