import { createClient } from '@supabase/supabase-js'
import { reactive } from 'vue'
import { createAuthEventState, applyAuthEvent } from './authEventState'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Tracks whether the browser's current session was actually established
// by a successful password-recovery callback, bound to the specific user
// id that recovery was verified for -- see authEventState.js for the full
// reasoning and the (unit-tested) event-handling logic itself, and
// src/lib/useResetPassword.js for how this is consumed.
//
// Wrapped in Vue's reactive() -- not a bare plain object -- specifically
// so a component reading `authEventState.recoveryReady` inside a
// `computed()` re-evaluates live whenever this listener mutates it,
// rather than only reflecting whatever it happened to be at one snapshot
// moment (e.g. inside onMounted). applyAuthEvent() itself stays a plain,
// framework-agnostic function -- it only ever does ordinary property
// assignment (`state.foo = ...`), which works identically whether `state`
// is a plain object (as in its own unit tests) or this reactive() proxy
// (in the real app): Vue's reactivity intercepts the assignment itself,
// not how or where it's called from.
//
// Registered here, at module load, immediately after the client is
// constructed -- not inside a Vue component's onMounted. Supabase's own
// client begins processing the current URL (including a recovery link's
// tokens) as part of its own construction-time initialization, and
// onAuthStateChange only notifies whoever is ALREADY subscribed at the
// moment an event fires -- it never replays a past event to a listener
// that subscribes later. A component-level listener attached only once
// its own onMounted runs -- after Vue app creation, router setup, and
// this app's router guard's own `await authStore.init()` (which itself
// waits on the exact same client-internal initialization) -- can easily
// lose that race and simply never see the event. Subscribing in this
// same synchronous module-evaluation tick, right after createClient(),
// is what guarantees this listener is already registered before any of
// that async initialization work has had a chance to run at all (nothing
// async can execute mid-way through a still-running synchronous script).
// Even so, useResetPassword.js's live computed (not a one-time snapshot)
// is what actually makes a LATE-arriving event (after a component has
// already mounted) still correctly update the UI -- the two mechanisms
// are complementary, not redundant: this one wins the subscription race,
// that one handles whatever timing the event actually arrives on.
export const authEventState = reactive(createAuthEventState())

supabase.auth.onAuthStateChange((event, session) => {
  applyAuthEvent(authEventState, event, session?.user?.id ?? null)
})
