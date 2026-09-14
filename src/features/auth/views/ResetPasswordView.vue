<script setup>
import { onMounted, ref } from 'vue'
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

// Show/hide toggles -- same pattern as LoginView.vue's own password
// field (independent per field, starts hidden, never affects the
// underlying v-model value or submits the form -- purely the input's
// `type`).
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
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
          <div class="relative">
            <input
              v-model="newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              required
              :minlength="MIN_PASSWORD_LENGTH"
              autocomplete="new-password"
              class="w-full rounded-lg border border-neutral-300 px-3 py-2 pe-10 focus:border-brand-green focus:outline-none"
            />
            <button
              type="button"
              :aria-label="showNewPassword ? 'הסתר סיסמה' : 'הצג סיסמה'"
              :aria-pressed="showNewPassword"
              class="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-neutral-600 hover:text-brand-black"
              @click="showNewPassword = !showNewPassword"
            >
              <svg
                v-if="showNewPassword"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="size-5"
                aria-hidden="true"
              >
                <path
                  d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a13.2 13.2 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 1 12s4 7 11 7a10.4 10.4 0 0 0 5.39-1.61M1 1l22 22"
                />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="size-5"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">אימות סיסמה</span>
          <div class="relative">
            <input
              v-model="confirmNewPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              required
              :minlength="MIN_PASSWORD_LENGTH"
              autocomplete="new-password"
              class="w-full rounded-lg border border-neutral-300 px-3 py-2 pe-10 focus:border-brand-green focus:outline-none"
            />
            <button
              type="button"
              :aria-label="showConfirmPassword ? 'הסתר סיסמה' : 'הצג סיסמה'"
              :aria-pressed="showConfirmPassword"
              class="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-neutral-600 hover:text-brand-black"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <svg
                v-if="showConfirmPassword"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="size-5"
                aria-hidden="true"
              >
                <path
                  d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a13.2 13.2 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 1 12s4 7 11 7a10.4 10.4 0 0 0 5.39-1.61M1 1l22 22"
                />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="size-5"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
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
