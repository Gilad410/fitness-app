import { computed, ref } from 'vue'
import {
  hasValidRecoveryContext as computeHasValidRecoveryContext,
  consumeRecoveryContext,
} from './authEventState.js'

const MIN_PASSWORD_LENGTH = 6

// Shared reactive logic behind ResetPasswordView.vue (coach) and
// TraineeResetPasswordView.vue (trainee) -- identical behavior for both,
// parameterized only by which login route to redirect to afterward. Pure
// UI-free composable (renders nothing itself, no template), so pulling it
// out into one shared module doesn't blur the established "coach and
// trainee components never share chrome" convention -- there is no chrome
// here to accidentally leak between them, only the state machine.
//
// =====================================================================
// The bug this fixes (independent review, second pass)
// =====================================================================
// An earlier version of both views called
// `computeHasValidRecoveryContext(...)` exactly ONCE, inside onMounted(),
// and cached the boolean result into a plain ref. Two problems followed:
//   1. handleSubmit() checked that SAME cached ref, not the live
//      authEventState -- so if the signed-in account changed (a
//      SIGNED_IN for a different user, which DOES correctly clear
//      authEventState.recoveryReady) after mount but before the coach/
//      trainee clicked submit, the stale cached `true` was still used,
//      and updateUser() was still invoked -- for the NEW, wrong account.
//   2. If PASSWORD_RECOVERY itself only arrived (was only actually
//      observed) after that one-time onMounted check had already run,
//      the form stayed stuck showing "invalid or expired link" forever,
//      even though a genuinely valid recovery had by then been
//      established.
//
// Fixed by making `hasValidRecoveryContext` a live `computed()` (not a
// one-time ref assignment) over `authEventState`, which is itself a
// Vue reactive() object (see supabaseClient.js) -- so the UI itself
// re-evaluates automatically on every relevant change, for as long as
// this composable's caller stays mounted. handleSubmit() additionally
// re-checks the SAME live sources directly (not the cached computed)
// immediately before ever calling updateUser() -- explicit, visible
// revalidation at the one moment that actually matters, not an
// assumption that the computed must already be fresh.
//
// =====================================================================
// A timing detail investigated during a since-resolved manual-test
// report ("invalid or expired" on a genuinely fresh recovery link).
// Kept, but scoped down to what it actually explains.
// =====================================================================
// The reported failure's real cause turned out to be unrelated to this
// app: the account being tested had multiple recovery emails in flight,
// and an OLDER link (whose token Supabase had already superseded when a
// newer request was issued) was being opened instead of the latest one
// -- confirmed against Supabase Auth logs and by the user. No code
// change was needed for that.
//
// While investigating, this real timing detail was found by reading the
// installed SDK's own source
// (node_modules/@supabase/auth-js/dist/main/GoTrueClient.js): for a
// URL-detected recovery callback (the implicit-flow hash tokens this
// app's redirectTo lands on), GoTrueClient's internal _initialize()
// does, in order: (1) validates the access_token via a real network call
// (_getUser), (2) awaits _saveSession(session) -- the session/user ARE
// already established in memory at this point -- and only THEN (3)
// schedules its own PASSWORD_RECOVERY notification via `setTimeout(fn,
// 0)`, deliberately BEFORE its internal `initializePromise` (the exact
// promise `getSession()` -- and so `authStore.init()` -- awaits)
// resolves. The SDK's own comments explain this is intentional, to avoid
// a deadlock if a subscriber callback itself calls getSession()/getUser().
//
// The consequence: `authStore.init()` resolving is proof the SESSION is
// already established, but is NOT proof the PASSWORD_RECOVERY event has
// reached `authEventState` yet. Without the `setTimeout` wait below,
// `checkingSession.value = false` is set (and the template first reads
// `hasValidRecoveryContext`) BEFORE that notification has necessarily
// arrived -- a real, deterministic window, not a rare race.
//
// This is only ever a possible BRIEF, TRANSIENT incorrect render for a
// link that's actually fine, never a persistent one: `hasValidRecoveryContext`
// above is a LIVE `computed()` over the reactive `authEventState`, so
// once the event lands (even one tick later), the template re-renders
// correctly with no remount needed (see REPRO 2 above, which already
// covers exactly this self-correcting path). REPRO 3 below covers the
// narrower transient window this wait closes.
//
// The wait below is kept since it's safe and removes even that transient
// flash: it waits for one further macrotask, via our own
// `setTimeout(resolve, 0)`, AFTER `authStore.init()` resolves, before
// ever reading `hasValidRecoveryContext`. Because the SDK's own
// notification timeout (when a callback is actually present in the URL)
// is registered strictly earlier (during `_initialize()`, before
// `initializePromise` -- and so `authStore.init()` -- could resolve),
// and same-delay timers fire in the order they were registered (a JS
// spec guarantee, not a timing heuristic), this new timeout is
// guaranteed to run AFTER the SDK's -- so by the time it fires,
// `authEventState` has already been updated if a recovery (or plain
// sign-in) callback was actually present in the URL. For the ordinary
// case (no callback in the URL at all), `_initialize()` never schedules
// any such timeout, so this wait adds one harmless, imperceptible extra
// tick before correctly showing "invalid".
export function useResetPassword({ authStore, authEventState, supabase, router, loginRouteName }) {
  const checkingSession = ref(true)
  const newPassword = ref('')
  const confirmNewPassword = ref('')
  const settingPassword = ref(false)
  const setPasswordError = ref('')
  const done = ref(false)

  const hasValidRecoveryContext = computed(() =>
    computeHasValidRecoveryContext(authStore.user?.id ?? null, authEventState),
  )

  // Deliberately NOT an onMounted() call in here -- lifecycle hooks only
  // register when there is an active component instance, which this
  // plain composable function does not have when unit-tested directly
  // under Node (see useResetPassword.test.mjs). The .vue file that uses
  // this calls `onMounted(initialize)` itself, from inside its own real
  // component context.
  async function initialize() {
    await authStore.init()
    // See the module header ("A timing detail investigated...") for
    // exactly why this wait is necessary and why it's guaranteed correct,
    // not a heuristic delay.
    await new Promise((resolve) => setTimeout(resolve, 0))
    checkingSession.value = false
  }

  function validate() {
    if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
      return `הסיסמה חייבת לכלול לפחות ${MIN_PASSWORD_LENGTH} תווים.`
    }
    if (newPassword.value !== confirmNewPassword.value) return 'הסיסמאות אינן תואמות.'
    return ''
  }

  // Deliberately signs out and sends the caller to the normal login
  // screen afterward rather than continuing straight into the app on
  // this session -- same reasoning as TraineeJoinView.vue's
  // handleSetPassword: "log in through the existing login page" stays
  // the one, real, tested path in, regardless of which route got them
  // here.
  async function handleSubmit() {
    setPasswordError.value = ''

    // Revalidate immediately before submitting, against the LIVE
    // authStore/authEventState -- never the cached `hasValidRecoveryContext`
    // computed above, and never assumed still true just because the
    // form was showing a moment ago. Catches a same-tab account change,
    // sign-out, or the context having already been consumed, between
    // mount and this exact submit.
    if (!computeHasValidRecoveryContext(authStore.user?.id ?? null, authEventState)) {
      setPasswordError.value = 'קישור איפוס הסיסמה אינו תקין או שפג תוקפו. יש לבקש קישור חדש.'
      return
    }

    const validationError = validate()
    if (validationError) {
      setPasswordError.value = validationError
      return
    }

    settingPassword.value = true
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword.value })
      if (updateError) throw updateError
      // One-time use: once this recovery has actually been spent,
      // further visits/submits in this same tab without clicking a
      // fresh link must go back to being denied.
      consumeRecoveryContext(authEventState)
      await authStore.signOut()
      done.value = true
      setTimeout(() => router.push({ name: loginRouteName, query: { reset: '1' } }), 1500)
    } catch {
      setPasswordError.value = 'שמירת הסיסמה נכשלה. יש לנסות שוב.'
    } finally {
      settingPassword.value = false
    }
  }

  return {
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
  }
}
