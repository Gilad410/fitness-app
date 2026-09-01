<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const confirmationSent = ref(false)
const showPassword = ref(false)

const authStore = useAuthStore()
const router = useRouter()

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    const data = await authStore.signUp(email.value, password.value)
    // Supabase requires email confirmation by default — a session means it's off.
    if (data.session) {
      router.push('/')
    } else {
      confirmationSent.value = true
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="coach-portal mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-brand-white p-6">
    <h1 class="text-2xl font-bold text-brand-black">הרשמה</h1>

    <p v-if="confirmationSent" class="text-neutral-600">
      נשלח אליך מייל אישור. יש לאשר את הכתובת כדי להשלים את ההרשמה.
    </p>

    <form v-else class="flex flex-col gap-4" @submit.prevent="handleSubmit">
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

      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">סיסמה</span>
        <div class="relative">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            required
            minlength="6"
            autocomplete="new-password"
            class="w-full rounded-lg border border-neutral-300 px-3 py-2 pe-10 focus:border-brand-green focus:outline-none"
          />
          <button
            type="button"
            :aria-label="showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'"
            :aria-pressed="showPassword"
            class="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-neutral-600 hover:text-brand-black"
            @click="showPassword = !showPassword"
          >
            <svg
              v-if="showPassword"
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

      <p v-if="error" class="text-sm text-status-red">{{ error }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="rounded-lg bg-brand-green px-4 py-2 font-medium text-brand-black hover:bg-brand-green-dark hover:text-brand-white disabled:opacity-60"
      >
        {{ loading ? 'נרשם...' : 'הרשמה' }}
      </button>
    </form>

    <p class="text-sm text-neutral-600">
      כבר יש לך חשבון?
      <RouterLink to="/login" class="text-brand-green-dark hover:underline">התחברות</RouterLink>
    </p>
  </section>
</template>
