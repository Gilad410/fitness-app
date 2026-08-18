<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'

// Minimum password length -- mirrors src/features/auth/views/SignupView.vue's
// existing `minlength="6"`, i.e. the same Supabase project password
// requirement the coach signup form already enforces client-side. The
// server (Supabase Auth) is the actual authority on this; this is only a
// same-page hint, same as the coach form.
const MIN_PASSWORD_LENGTH = 6
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const route = useRoute()
const authStore = useAuthStore()

// route.query.token can be undefined, a string, or (if the link is
// malformed with a repeated ?token=) an array -- only a plain string
// counts as present.
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token.trim() : ''))

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const loading = ref(false)
const error = ref('')
const submitted = ref(false)

function validate() {
  if (!token.value) return 'קישור ההזמנה אינו תקין. יש לבקש מהמאמן/ת קישור הזמנה חדש.'
  if (!EMAIL_RE.test(email.value.trim())) return 'יש להזין כתובת אימייל תקינה.'
  if (password.value.length < MIN_PASSWORD_LENGTH) {
    return `הסיסמה חייבת לכלול לפחות ${MIN_PASSWORD_LENGTH} תווים.`
  }
  if (password.value !== confirmPassword.value) return 'הסיסמאות אינן תואמות.'
  return ''
}

// Supabase/Postgres error text is never shown verbatim: (a) it can
// describe internal state, and (b) more importantly for this specific
// flow, echoing back *which* check failed would let someone probe
// whether a token or email is valid. The database trigger
// (021_trainee_auth_and_roles.sql) already deliberately gives NO signal
// back to the client about whether a token was valid/expired/already
// used, or whether the email matched -- signUp() succeeds the same way
// either way, and linking either silently happens or silently doesn't.
// This function only ever maps genuine Supabase Auth account-creation
// errors (bad email syntax, weak password, duplicate account, rate
// limiting) to a small set of generic Hebrew messages.
function safeErrorMessage(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('already registered') || msg.includes('already exists')) {
    return 'קיים כבר חשבון עם כתובת האימייל הזו. ניתן להתחבר במסך ההתחברות למתאמנים.'
  }
  if (msg.includes('password')) {
    return `הסיסמה אינה עומדת בדרישות (לפחות ${MIN_PASSWORD_LENGTH} תווים).`
  }
  if (msg.includes('email')) {
    return 'כתובת האימייל אינה תקינה.'
  }
  if (msg.includes('security purposes') || msg.includes('rate limit')) {
    return 'בוצעו יותר מדי ניסיונות. יש לנסות שוב בעוד מספר דקות.'
  }
  return 'אירעה שגיאה. יש לנסות שוב, ואם הבעיה נמשכת לפנות למאמן/ת לקבלת קישור הזמנה חדש.'
}

async function handleSubmit() {
  error.value = ''
  const validationError = validate()
  if (validationError) {
    error.value = validationError
    return
  }
  loading.value = true
  try {
    // The token travels ONLY through signup metadata, and only as an
    // opaque lookup key -- nothing here asserts it's valid, that the
    // email matches, or that anything is linked. The database trigger is
    // the sole authority on all of that (see the comment above).
    await authStore.signUpTrainee(email.value.trim(), password.value, token.value)
    submitted.value = true
  } catch (err) {
    error.value = safeErrorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
    <h1 class="text-2xl font-bold text-brand-black">הצטרפות מתאמן/ת</h1>

    <div
      v-if="authStore.isAuthenticated"
      class="flex flex-col gap-3 rounded-xl border border-status-yellow/40 bg-status-yellow/5 p-4 text-sm text-brand-black"
    >
      <p>
        יש כרגע חיבור פעיל בדפדפן זה ({{ authStore.user?.email }}). יש להתנתק לפני יצירת חשבון
        מתאמן/ת חדש.
      </p>
      <button
        type="button"
        class="self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-brand-black hover:bg-neutral-100"
        @click="authStore.signOut()"
      >
        התנתקות
      </button>
    </div>

    <p v-else-if="!token" class="text-sm text-status-red">
      קישור ההזמנה אינו תקין או חסר. יש לבקש מהמאמן/ת קישור הזמנה חדש.
    </p>

    <template v-else-if="submitted">
      <div
        class="flex flex-col gap-3 rounded-xl border border-brand-green/40 bg-brand-green/5 p-4 text-sm text-brand-black"
      >
        <p class="font-medium">נשלח אליך מייל לאישור כתובת האימייל.</p>
        <p>
          יש לפתוח את המייל וללחוץ על קישור האישור. החשבון יקושר לפרופיל אצל המאמן/ת רק לאחר אישור
          הכתובת ורק אם ההזמנה עדיין בתוקף — לפני כן לא ניתן להתחבר לאזור האישי.
        </p>
        <p>אם משהו לא הסתדר לאחר האישור, יש לפנות למאמן/ת לקבלת קישור הזמנה חדש.</p>
      </div>
      <RouterLink to="/trainee/login" class="text-sm text-brand-green hover:underline">
        מעבר למסך ההתחברות
      </RouterLink>
    </template>

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
            :minlength="MIN_PASSWORD_LENGTH"
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

      <label class="flex flex-col gap-1">
        <span class="text-sm text-neutral-600">אימות סיסמה</span>
        <div class="relative">
          <input
            v-model="confirmPassword"
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

      <p v-if="error" class="text-sm text-status-red">{{ error }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="rounded-lg bg-brand-green px-4 py-2 font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
      >
        {{ loading ? 'יוצר חשבון...' : 'יצירת חשבון' }}
      </button>
    </form>

    <p class="text-sm text-neutral-600">
      כבר יש לך חשבון מתאמן?
      <RouterLink to="/trainee/login" class="text-brand-green hover:underline">התחברות</RouterLink>
    </p>
  </section>
</template>
