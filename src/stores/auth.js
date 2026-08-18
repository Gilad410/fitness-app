import { defineStore } from 'pinia'
import { supabase } from '../lib/supabaseClient'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    initialized: false,
    initPromise: null,
    // Role read from public.user_roles (021_trainee_auth_and_roles.sql) --
    // 'coach', 'trainee', or null. null means either "not resolved yet"
    // (roleLoaded is false) or "resolved: this account genuinely has no
    // role" (roleLoaded is true) -- callers that need to tell those two
    // apart (the router guard) always await loadRole() first, so by the
    // time they read `role` it is authoritative.
    role: null,
    roleLoaded: false,
    roleLoadPromise: null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
    isCoach: (state) => state.role === 'coach',
    isTrainee: (state) => state.role === 'trainee',
    // Authenticated, role resolved, and genuinely holds neither role --
    // an orphan/no-role account (a leftover open signup, or a trainee
    // invite that was never accepted). Distinct from "still checking".
    hasNoRole: (state) => state.roleLoaded && state.role === null,
  },

  actions: {
    // Restores the session on app load and subscribes to future auth changes
    // (sign-in, sign-out, token refresh). Safe to call more than once —
    // subsequent calls reuse the same in-flight/resolved promise.
    init() {
      if (this.initPromise) return this.initPromise

      this.initPromise = supabase.auth.getSession().then(({ data }) => {
        this.user = data.session?.user ?? null
        this.initialized = true
      })

      supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user ?? null
        // A different (or newly absent) signed-in user invalidates
        // whatever role was cached for the previous one -- the next
        // loadRole() call must hit the database again rather than reuse
        // a stale value.
        if (nextUser?.id !== this.user?.id) {
          this.role = null
          this.roleLoaded = false
          this.roleLoadPromise = null
        }
        this.user = nextUser
      })

      return this.initPromise
    },

    // Resolves `role` from public.user_roles for the current user and
    // caches it for the rest of the session (invalidated on user change /
    // sign-out, see above). RLS (user_roles_select_own) already restricts
    // this query to the caller's own row, so there is nothing to filter
    // by client-side. maybeSingle(), not single(): zero rows is a valid,
    // expected outcome (no role yet), not an error.
    async loadRole() {
      if (!this.user) {
        this.role = null
        this.roleLoaded = true
        return this.role
      }
      if (this.roleLoaded) return this.role
      if (this.roleLoadPromise) return this.roleLoadPromise

      this.roleLoadPromise = supabase
        .from('user_roles')
        .select('role')
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error
          this.role = data?.role ?? null
          this.roleLoaded = true
          return this.role
        })
        .finally(() => {
          this.roleLoadPromise = null
        })
      return this.roleLoadPromise
    },

    // Coach self-signup path (used by SignupView, currently unreachable
    // via routing -- see router/index.js). Unchanged from before role
    // support existed: a bare signup like this now gets no row in
    // public.user_roles at all (021_trainee_auth_and_roles.sql), so it
    // grants no application access on its own.
    async signUp(email, password) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      this.user = data.user
      return data
    },

    // Trainee join path (TraineeJoinView). Deliberately separate from
    // signUp() above rather than a shared helper: the invite token is
    // passed only through auth signup metadata (raw_user_meta_data),
    // which the 021 migration's trigger treats purely as a lookup key --
    // it independently re-verifies the token is pending/unexpired and
    // that the confirmed account email matches the invited trainee's
    // email before linking anything or granting the trainee role. Nothing
    // client-side (this call included) can assign a role; this action
    // only ever creates the pending Auth account.
    //
    // this.user is set only if Supabase returns an active session
    // immediately (e.g. email confirmation disabled project-wide) -- the
    // normal case is no session yet (confirmation required), and this.user
    // is deliberately left untouched so the app doesn't believe the
    // browser is "logged in" before the account is even confirmed.
    async signUpTrainee(email, password, inviteToken) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { trainee_invite_token: inviteToken },
          // Sends the trainee back to their own login screen (not the
          // general coach /login) after they click the confirmation link
          // in the email, instead of Supabase's default Site URL. This
          // only takes effect if that exact origin+path is also added to
          // the Supabase project's Auth -> URL Configuration -> Redirect
          // URLs allow-list -- a dashboard setting this code cannot make
          // for you (see the implementation notes for the exact value).
          emailRedirectTo: `${window.location.origin}/trainee/login`,
        },
      })
      if (error) throw error
      if (data.session) {
        this.user = data.user
      }
      return data
    },

    // Shared by both the coach (/login) and trainee (/trainee/login)
    // sign-in forms -- a Supabase Auth session isn't role-specific, the
    // role lives in public.user_roles and is resolved separately via
    // loadRole() after this resolves.
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      this.user = data.user
      return data
    },

    // Role-gated sign-in used by both login forms (LoginView -> 'coach',
    // TraineeLoginView -> 'trainee'). Supabase Auth itself can't do this
    // check -- auth.users has no role, role lives only in
    // public.user_roles -- so it's layered on top here: sign in, resolve
    // the role, and if it doesn't match the page the caller used, undo
    // the sign-in (await signOut(), so this.user/role are already clear
    // by the time this throws) and throw a clear Hebrew error instead of
    // returning. The caller never navigates in that case, since the
    // await rejects before any router.push runs.
    //
    // This is a login-flow hygiene fix, not a new security boundary: the
    // router guard's meta.requiresRole checks and every RLS policy/RPC's
    // is_coach()/is_trainee() check are unchanged and remain the actual
    // enforcement. Today a wrong-role account already gets redirected
    // away with zero data access -- this only stops it from completing a
    // silent "successful" sign-in on the wrong page first.
    async signInWithRoleCheck(email, password, requiredRole) {
      await this.signIn(email, password)
      await this.loadRole()
      if (this.role === requiredRole) return

      const wrongRoleMessages = {
        trainee: 'זהו חשבון מתאמן. יש להתחבר דרך כניסת המתאמנים.',
        coach: 'זהו חשבון מאמן. יש להתחבר דרך כניסת המאמנים.',
      }
      // this.role reflects the account's actual role (or null), so this
      // picks the right message regardless of which page rejected it.
      const message = this.role ? wrongRoleMessages[this.role] : 'לחשבון זה אין הרשאת גישה.'

      await this.signOut()
      throw new Error(message)
    },

    async signOut() {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      this.user = null
      this.role = null
      this.roleLoaded = false
      this.roleLoadPromise = null
    },
  },
})
