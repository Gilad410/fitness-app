<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../../stores/auth'
import { supabase } from '../../../lib/supabaseClient'

// Onboarding landing page for an owner-issued coach invitation
// (owner_get_or_invite_coach / link_coach_on_email_confirmed,
// 056_owner_coach_administration.sql). Unlike TraineeJoinView.vue, there
// is deliberately NO self-serve "enter email+password+token" form here --
// a coach account can only ever be created by an owner-initiated
// invitation (see the router: /signup is not registered, and there is no
// public coach signup path), so this page only ever needs to handle the
// one real case: the invited person arrived via Supabase's own invite
// link, already authenticated, and just needs to set a password.
const MIN_PASSWORD_LENGTH = 6

const router = useRouter()
const authStore = useAuthStore()

const checkingSession = ref(true)
const newPassword = ref('')
const confirmNewPassword = ref('')
// Both default to false: a password field starts masked. Tracked per
// field so revealing one does not reveal the other.
const showNewPassword = ref(false)
const showConfirmNewPassword = ref(false)
const settingPassword = ref(false)
const setPasswordError = ref('')

onMounted(async () => {
  await authStore.init()
  if (authStore.isAuthenticated) {
    await authStore.loadRole()
  }
  checkingSession.value = false
})

function validateNewPassword() {
  if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
    return `הסיסמה חייבת לכלול לפחות ${MIN_PASSWORD_LENGTH} תווים.`
  }
  if (newPassword.value !== confirmNewPassword.value) return 'הסיסמאות אינן תואמות.'
  return ''
}

// Sets the password for the already-authenticated, already-linked (by
// the server-side trigger) account, then signs out and sends the coach
// to the normal /login screen -- the one real, tested path into the app,
// same reasoning as TraineeJoinView.vue's handleSetPassword(). The new
// coach's access_status is 'pending' at this point (granted by
// link_coach_on_email_confirmed, never 'active' automatically) -- signing
// in will succeed, but every coach-gated RLS check/RPC will correctly
// refuse them until the owner explicitly approves
// (owner_set_coach_status), which LoginView / the router surfaces as the
// normal "no access yet" state, not a bug in this page.
async function handleSetPassword() {
  setPasswordError.value = ''
  const validationError = validateNewPassword()
  if (validationError) {
    setPasswordError.value = validationError
    return
  }
  settingPassword.value = true
  try {
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword.value })
    if (updateError) throw updateError
    await authStore.signOut()
    router.push({ name: 'login', query: { onboarded: 'coach' } })
  } catch {
    setPasswordError.value = 'שמירת הסיסמה נכשלה. יש לנסות שוב.'
  } finally {
    settingPassword.value = false
  }
}
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-brand-white p-6">
    <h1 class="text-2xl font-bold text-brand-black">הצטרפות מאמן/ת</h1>

    <p v-if="checkingSession" class="text-sm text-neutral-600">טוען...</p>

    <template v-else-if="authStore.isAuthenticated">
      <p class="text-sm text-neutral-600">
        ברוך/ה הבא/ה{{ authStore.user?.email ? `, ${authStore.user.email}` : '' }}! נותר רק להגדיר
        סיסמה כדי להשלים את ההרשמה.
      </p>

      <form class="flex flex-col gap-4" @submit.prevent="handleSetPassword">
        <!--
          Show/hide toggles follow TraineeJoinView.vue's existing pattern
          exactly: type swapped between password/text, `pe-10` padding so
          the typed text never runs under the button, the button absolutely
          positioned at `end-0` (logical, so it sits correctly in RTL), and
          type="button" so it can never submit the form. Toggling only
          changes the input's `type` -- the v-model value is untouched.
        -->
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">סיסמה</span>
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
              :aria-label="showNewPassword ? 'הסתרת סיסמה' : 'הצגת סיסמה'"
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
              :type="showConfirmNewPassword ? 'text' : 'password'"
              required
              :minlength="MIN_PASSWORD_LENGTH"
              autocomplete="new-password"
              class="w-full rounded-lg border border-neutral-300 px-3 py-2 pe-10 focus:border-brand-green focus:outline-none"
            />
            <button
              type="button"
              :aria-label="showConfirmNewPassword ? 'הסתרת סיסמה' : 'הצגת סיסמה'"
              :aria-pressed="showConfirmNewPassword"
              class="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-neutral-600 hover:text-brand-black"
              @click="showConfirmNewPassword = !showConfirmNewPassword"
            >
              <svg
                v-if="showConfirmNewPassword"
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
          class="rounded-lg bg-brand-green px-4 py-2 font-medium text-brand-white hover:bg-brand-green-dark disabled:opacity-60"
        >
          {{ settingPassword ? 'שומר...' : 'שמירת סיסמה וכניסה' }}
        </button>

        <p class="text-xs text-neutral-500">
          לאחר יצירת הסיסמה, החשבון ימתין לאישור בעל/ת המערכת לפני קבלת גישה מלאה.
        </p>
      </form>
    </template>

    <p v-else class="text-sm text-status-red">
      קישור ההזמנה אינו תקף או שפג תוקפו. יש לפנות לבעל/ת המערכת לקבלת קישור הזמנה חדש.
    </p>
  </section>
</template>
