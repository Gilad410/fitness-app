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
        <label class="flex flex-col gap-1">
          <span class="text-sm text-neutral-600">סיסמה</span>
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
