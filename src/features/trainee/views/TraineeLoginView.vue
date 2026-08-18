<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const showPassword = ref(false)

const authStore = useAuthStore()
const router = useRouter()

// A Supabase Auth session isn't role-specific -- this is the same
// signIn() the coach login uses. What differs is what happens after:
// the role is resolved and the trainee is sent to their own area, never
// assumed just because they signed in from this page.
async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    await authStore.signIn(email.value, password.value)
    await authStore.loadRole()
    if (authStore.isTrainee) {
      router.push('/trainee')
    } else if (authStore.isCoach) {
      router.push('/')
    } else {
      router.push('/no-access')
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
    <h1 class="text-2xl font-bold text-brand-black">כניסת מתאמנים</h1>

    <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
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
            autocomplete="current-password"
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
        class="rounded-lg bg-brand-green px-4 py-2 font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
      >
        {{ loading ? 'מתחבר/ת...' : 'התחברות' }}
      </button>
    </form>

    <p class="text-sm text-neutral-600">
      עדיין לא יצרת סיסמה? יש להשתמש בקישור ההצטרפות שקיבלת מהמאמן/ת.
    </p>
    <p class="text-sm text-neutral-600">
      מאמן/ת?
      <RouterLink to="/login" class="text-brand-green hover:underline">כניסת מאמנים</RouterLink>
    </p>
  </section>
</template>
