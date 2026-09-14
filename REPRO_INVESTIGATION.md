# Password-reset "invalid or expired link" -- investigation (RESOLVED)

**Status: RESOLVED, confirmed by the user.** The reported failure was not
an app bug: the account being tested had multiple recovery emails in
flight (from this investigation's own repeated manual testing), and an
older link -- whose token Supabase had already superseded by a later
`/recover` request -- was being opened instead of the newest one. The
user confirmed working password resets after opening the correct (latest)
link. No code change was made, or was needed, for the reset failure
itself.

This file is kept as the historical record of how that was diagnosed
(useful if a similar report ever recurs), plus the one real, minor timing
detail found along the way that legitimately was worth fixing on its own
merits (below). All temporary diagnostic logging added during the
investigation (`supabaseClient.js`, `router/index.js`) has since been
removed from the code -- it is not needed for anything going forward.

**What remains in the code from this investigation:** just the one
timing fix in `src/lib/useResetPassword.js` (a `setTimeout` wait in
`initialize()`) and its regression test (`REPRO 3` in
`useResetPassword.test.mjs`). An earlier pass in this investigation
wrongly claimed that fix explained the persistent failure -- it does not.
Independent review ran the real composable with real Vue reactivity and
showed the old code already self-corrects once a deferred
`PASSWORD_RECOVERY` event lands, so that timing window only ever risked a
brief, transient incorrect render, never a persistent one. The fix is
kept anyway since it's safe and closes even that transient window; see
that file's own header comment for the full, corrected account.

---

## Investigation history (for reference)

## Confirmed finding (from a real captured Safari attempt)

The captured diagnostics from one real attempt showed:
- `hasError: true`, `isRecoveryType: false` in the initial URL-hash flags.
- The very first auth event was `INITIAL_SESSION` with `hasSession: false`.
- No `PASSWORD_RECOVERY` event ever appeared.
- Navigation reached `trainee-reset-password` with no router redirect.

This is Supabase Auth's own redirect for `error=access_denied&
error_code=otp_expired` -- read directly against the installed
`@supabase/auth-js` source (`GoTrueClient.js`, `_getSessionFromURL`): when
the URL hash carries an `error`/`error_code`/`error_description` param,
the SDK throws before ever calling `_saveSession()` or scheduling any
notification -- which is exactly why no `PASSWORD_RECOVERY` event was
captured. **This is a server-side rejection of the token, not the app
losing or mishandling a valid one.** No further app-side code change can
fix this; nothing in this repository controls token expiry, the email
template, or the mail provider's link handling -- those are all
Supabase Dashboard / Resend Dashboard configuration, confirmed absent
from this codebase (no `supabase/config.toml`, no SMTP/Resend code
anywhere in `src/` or `supabase/`; the only email-sending code in this
repo, `supabase/functions/invite-trainee`, calls
`admin.auth.admin.inviteUserByEmail()` -- a different Supabase Auth
email, not the recovery one, and still just delegates delivery to
whatever provider is configured in the Dashboard).

`otp_expired` is GoTrue's error code for **both** a token past its
configured expiry window **and** a token that was already used/verified
once before (a consumed token can't be told apart from a stale one from
the confirmation endpoint's perspective) -- so this one error code covers
several different underlying causes, which is why dashboard/Resend
evidence is needed to tell them apart. Three concrete candidates, and how
to tell them apart:

1. **A stale link from an earlier request, not the newest one.** Every
   reset request in this investigation created a new email. Supabase
   allows only one live recovery token per user -- issuing a new one
   supersedes the previous one. If Gmail grouped several of these into
   one thread, or an older message was open in another tab, clicking
   anything but the very latest email reproduces exactly this error, on a
   link that looks "fresh" but isn't the one currently valid server-side.
   **This is the most mundane explanation and the easiest to rule out.**
2. **The token was already consumed before the real click** (an email
   security scanner, or a mail client's link-prefetch/preview feature,
   visiting the link automatically on delivery). Distinguishing evidence:
   Supabase Auth Logs or Resend's activity log showing a `verify`/click
   event at a timestamp *before* the user's own click, especially from an
   unfamiliar IP or a non-browser user agent.
3. **Resend's link click-tracking** rewriting the actual Supabase verify
   URL into a Resend-hosted redirect link. A tracking redirect is a far
   more common target for the kind of automated prefetching in (2) than a
   direct link would be, and adds a hop that can itself misbehave. If
   Resend is the project's configured SMTP provider (needs confirming --
   see the checklist below) and click tracking is enabled for this
   template, disabling it for the recovery/magic-link email specifically
   is a standard fix for exactly this failure mode.

None of the above can be confirmed further from this codebase or from
tools available in this environment -- there is no Supabase CLI installed
here, no Supabase/Resend API access, and no MCP tool for either service in
this session. The checklist below is what to check directly.

## Checklist -- please check these (I cannot access them from here)

**In the Supabase Dashboard:**
- **Authentication → Logs** (Auth Logs / Logs Explorer): filter around the
  time of the failing attempt. Look for: how many `recover`/`generate_link`
  events happened for this email address recently (confirms/denies
  candidate 1 -- multiple supersede each other), and how many `verify`
  attempts happened for the token that failed, and at what timestamps
  relative to when you actually clicked (confirms/denies candidate 2).
- **Authentication → Providers → Email**: the configured OTP/link expiry
  duration (default is 3600s/1 hour; if it's been set much shorter, a
  normal mail-delivery delay alone could exceed it).
- **Authentication → Email Templates → "Reset Password"**: confirm it
  still uses `{{ .ConfirmationURL }}` (or the raw token) as originally
  configured -- not something stale/customized that no longer matches
  what this app's `redirectTo` expects.
- **Project Settings → Authentication → SMTP Settings**: confirms whether
  a custom SMTP provider (e.g. Resend) is configured at all, versus
  Supabase's own built-in mailer.

**In Resend's dashboard (resend.com), if SMTP settings confirm Resend is
in use:**
- **Emails / Activity**: find the specific message, check its event
  timeline (sent/delivered/opened/clicked) for a click or open timestamp
  *before* your own manual click, and the associated IP/user agent if
  shown.
- **Settings → the relevant domain or API key**: whether **click
  tracking** and/or **open tracking** are enabled. If enabled, that's
  candidate 3 above.

Please paste back whatever these show (screenshots are fine) rather than
me guessing further -- and please don't trigger a fresh email for this
specifically; whatever the most recent one already sent is enough to
search the logs for.

## Second round of dashboard evidence -- still unproven, one specific ambiguity found

For one attempt: `POST /recover` at 23:39:54 (200, "request completed");
Resend confirms the same email sent+delivered at 23:39; the recovery
template uses `{{ .ConfirmationURL }}`; OTP expiry is the 3600s default.
At 23:40:13 -- **19 seconds later**, far under the 3600s expiry window, so
plain time-based expiry does not fit this attempt on its own -- there are
**two** `GET /verify` log lines at the same second: one `403`
("One-time token not found"), one `303` ("Request completed", GoTrue's
normal success status for `/verify` -- it redirects the browser onward
with the token exchanged). The browser that was actually being watched
received `access_denied`/`otp_expired`, no session -- i.e. it received the
`403` outcome, not the `303` one.

**Not concluded, and should not be:** whether this is one real request
logged twice (e.g. two log lines from different stages of GoTrue's own
handling of a single hit) or two genuinely separate requests reaching
`/verify` -- and if the latter, whether both came from the same client or
two different ones. Resend's domain page shows an "Enable tracking
metrics" control with a Configure button; whether click/open tracking is
actually ON was not confirmed (the toggle wasn't opened).

### Next smallest read-only check

Expand the full detail of those exact two `/verify` log lines (click into
each row in the Logs Explorer, or check whether a request/trace-id column
is already visible in the table) and compare, across the two:

1. **Request/trace id** -- same id on both lines means this was one
   underlying request logged at two stages, not two hits; different ids
   confirms two genuinely separate requests reached `/verify`.
2. **Source IP and User-Agent** -- if the ids differ, compare these next.
   Same IP+UA on both points at the same browser/device making two
   requests (e.g. a double navigation). Different IP/UA points at a
   second, separate agent (mail-side prefetch/scanner, or something else)
   hitting the link independently of the real click.
3. **The `303` line's redirect target/Location**, if the log shows it --
   this is what hash params that successful exchange actually carried,
   which is otherwise invisible to us (the browser that saw it, if any,
   wasn't the one we captured diagnostics from).
4. As a baseline for (2): the same fields on the `POST /recover` log line
   from 23:39:54 -- that request is known for certain to be the user's own
   browser, so its IP/UA is a known-good reference point to compare the
   two `/verify` lines against.

Exact IPs/UAs/ids can be shared as-is, or generalized (e.g. "residential
ISP" vs "datacenter/cloud", browser name only) if preferred -- what
matters is whether they match each other and the `/recover` baseline, not
the literal values.

Separately (lower priority, independent of the above): opening Resend's
"Configure" panel for tracking metrics is itself read-only and would
directly answer whether click/open tracking is currently enabled, without
changing anything.

No conclusion (expiry, prefetching, tracking, or user error) is drawn from
the evidence so far -- the check above is what would actually distinguish
between "one request, misleadingly logged twice" and "two real hits from
possibly two different agents," which the current evidence cannot yet
tell apart.

## Third round: the two `/verify` log lines are ONE request, not two

**Confirmed fact (raw JSON, checked by the user):** the `403` and `303`
`GET /verify` log lines at 23:40:13 share the identical `request_id`
(`01a09233-07dc-7a2a-bc29-cab0177bb0fe`). This is one request logged
twice, not two separate verification attempts. **The earlier "two hits,
possibly from two different agents" hypothesis is retracted** -- it does
not fit this fact.

**Confirmed fact:** a `303` from GoTrue's `/verify` endpoint is a redirect
status, not proof of a successful verification -- GoTrue redirects to
`redirectTo` on *either* outcome, carrying either the real session tokens
(success) or `error`/`error_code` params (failure) in the hash. Given the
`403 "One-time token not found"` log line under the same request, and the
browser callback that was actually captured (`access_denied`/
`otp_expired`, no session), the coherent reading is: one `/verify`
request, whose token lookup failed, redirected via `303` to the error
outcome. This is not itself new proof of *why* the lookup failed --
it just resolves the earlier two-lines ambiguity.

**Still confirmed, unchanged:** `POST /recover` completed at 23:39:54;
Resend shows the email sent+delivered at 23:39; the template uses
`{{ .ConfirmationURL }}`; OTP expiry is the 3600s default; the failing
`/verify` was 19 seconds after `/recover`, far under that expiry.

**The open question is now narrower:** why did GoTrue fail to find the
one-time token only 19 seconds after issuing it, well inside its expiry
window? A token can be superseded (made unfindable) by nothing other than
a *later* recovery request for the same account -- which reframes "was
the link consumed by something else" into "was a second `/recover` issued
between 23:39:54 and 23:40:13, invalidating the first token before it was
ever verified."

### Code inspection: duplicate-submission risk (CONFIRMED code gap, NOT yet confirmed as this incident's cause)

`src/features/auth/views/ForgotPasswordView.vue` and
`src/features/trainee/views/TraineeForgotPasswordView.vue` are identical
in this respect. `handleSubmit()`:

```js
async function handleSubmit() {
  error.value = ''
  if (!EMAIL_RE.test(email.value.trim())) { error.value = '...'; return }
  loading.value = true
  try {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(...)
    ...
  } finally {
    loading.value = false
  }
}
```

**Confirmed fact:** there is no `if (loading.value) return` guard at the
top of `handleSubmit()`. The only thing preventing a second call while one
is already in flight is the template's `:disabled="loading"` on the
submit button -- a DOM attribute, applied by Vue's reactive update, not a
synchronous code-level guard. Two gaps this leaves open:
- Vue's DOM patch (disabling the button) happens on the next reactive
  flush, not the instant `loading.value = true` is set -- a second
  *native* submit event arriving in that same window (a fast double-click,
  or a stray double-fire some browsers/input-method combinations produce)
  would still reach `handleSubmit()` a second time.
- Pressing **Enter** in the email field submits the form via the browser's
  default action regardless of the submit button's `disabled` state (the
  disabled attribute only blocks a *click* on that specific button, not a
  form-level Enter-key submission) -- so Enter, then Enter again (or
  Enter then a click) before the button visually greys out, is not
  guarded against.

This is a real, confirmed gap in the code as written. **What is NOT yet
confirmed:** whether this is what actually happened for the 23:39:54
attempt, or whether some other still-open recovery request from earlier
manual testing this session is what superseded it. Both would produce the
exact same "token not found" outcome from the recipient's side, and
nothing captured so far distinguishes them.

**No code change is proposed yet** -- per the current instruction, this
is reported as an inspection finding only.

### Proposed smallest controlled test

**Step 0 (read-only, no new email, do this first):** search Auth Logs for
every `POST /recover` entry for this trainee's email in a window around
23:39:54 (a few minutes before and after covers both a UI double-fire and
an earlier still-open manual test). If more than one appears, that alone
explains "token not found" for the 23:39:54 email without needing a new
test at all -- the earlier request's token was superseded by the later
one, and the email that got opened was for the earlier, already-dead
token.

**Step 1 (only if Step 0 shows a single, isolated `/recover` -- requires
sending exactly one new email, so only when you're ready):**
1. Confirm no other tab/window/device has this login flow open, and no
   other pending reset request exists for this account.
2. Submit the forgot-password form **exactly once** -- a single click,
   not Enter -- and wait for the visible "email sent" confirmation before
   touching anything else.
3. Immediately check Auth Logs and confirm **exactly one** `POST
   /recover` entry exists for this attempt (rules out an in-app
   double-fire for this specific test).
4. Open the email's link using the copy-link-into-an-already-inspected-tab
   method from earlier in this document, so the dev diagnostics
   (`window.__authDiag__`) are captured for this exact attempt.
5. Immediately check Auth Logs for the resulting `/verify` entry (its
   full raw JSON, not just status/message) and compare its `request_id`
   against the `/recover` request from step 2/3, and its timestamp gap.

This isolates one recovery request, confirmed singular by the logs
*before* the link is ever opened, from one verification attempt, with
full diagnostics on both the client and server side -- eliminating the
duplicate-submission hypothesis either way, cleanly, without relying on
any of the earlier, contaminated multi-attempt testing history.

I have not changed any code or settings, sent an email, committed,
pushed, or deployed anything as part of this update.

Temporary, dev-only diagnostics have been added to capture real evidence
from one manual attempt, instead of guessing further. They log **only**
boolean flags, enum-like values (event names, route names), and
sequence/timestamp numbers -- never tokens, passwords, full URLs, or
personal data. They are gated on `import.meta.env.DEV` and confirmed
absent from the production build (`npm run build` output was grepped for
the diagnostic markers; none present).

## What's instrumented

- `src/lib/supabaseClient.js` -- logs, on page load, whether the URL hash
  contained an access token / refresh token / a `type=` param / specifically
  `type=recovery` / an `error=` param (booleans only), plus whether this
  load was a fresh navigation, a reload, or a back/forward restore. Then
  logs every `onAuthStateChange` event: the event name, whether a session
  was present, `recoveryReady` immediately before and after that event
  (so you can see exactly which event, if any, cleared it), and whether
  the session's user matches whichever recovery user was on record right
  before that event (boolean only -- no ids logged).
- `src/router/index.js` -- logs the start and end of every router
  navigation: the route names involved and `recoveryReady` at each point,
  so a redirect or an in-app navigation that clears the context is
  visible even if it happens between two auth events.

Every entry is pushed to `window.__authDiag__` (in order, each with its
own `seq`/`t`) **in addition to** being printed via `console.debug`, so
it can be retrieved after the fact even if the Web Inspector wasn't open
for the very first lines (which log before a human can usually react to
a page that just loaded from an email link).

## How to capture one attempt in Safari

1. In Safari: **Safari menu → Settings → Advanced**, enable *"Show
   features for web developers"* (older Safari: *"Show Develop menu in
   menu bar"*).
2. Open a new Safari tab or window now, before doing anything else, and
   go to **Develop → Show JavaScript Console** (or ⌥⌘C) so a console is
   already open and ready.
3. In Mail, right-click the password-reset email's link and choose
   **Copy Link**, rather than clicking it directly -- this lets you paste
   it into the already-inspected tab from step 2, so the console captures
   every line from the very first page load. (If you'd rather click the
   link directly from Mail to reproduce that exact path too, that's a
   useful second attempt, but the console may miss its earliest lines
   since Safari only opens a new tab, not a new console -- do the
   copy/paste attempt first.)
4. Paste the link into the address bar of the already-inspected tab and
   press Return.
5. Let the page finish loading and show whatever it shows (including if
   it's the "invalid or expired" message).
6. In that same tab's console, run:
   ```js
   copy(window.__authDiag__)
   ```
   This copies the full captured sequence to your clipboard as JSON
   (Safari's console `copy()` helper). If `copy()` doesn't work in your
   Safari version, run `console.table(window.__authDiag__)` instead and
   send a screenshot of the table, or `JSON.stringify(window.__authDiag__)`
   and copy that string manually.
7. Paste what you copied back into the conversation. Please also note:
   which link this was (coach `/reset-password` or trainee
   `/trainee/reset-password`), and whether this was a brand-new email
   you'd never opened before.

No email will be sent by me as part of this -- please trigger the reset
request yourself from `/forgot-password` or `/trainee/forgot-password`
when you're ready to capture an attempt.
