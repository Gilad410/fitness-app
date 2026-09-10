// Supabase Edge Function: invite-trainee
// =====================================================================
// The only place in this app that ever touches the Supabase service-role
// key. Called by the coach's browser (src/features/trainees/store/
// traineeInvites.js, via supabase.functions.invoke) instead of the coach
// client issuing the invite RPC directly, so that issuing an invite and
// actually delivering it by email happen as one server-side step, with
// the privileged admin email call never reachable from client-side code.
//
// This file is deliberately thin: it only builds the two Supabase clients
// and turns Deno's Request/Response in and out of the actual logic, which
// lives in ./handler.js (handleInviteRequest) -- a plain, Deno-agnostic
// function that is also imported directly by handler.test.mjs and run
// under Node (`node --test`). See that file for what it does and why
// (issue-or-reuse via coach_get_or_issue_trainee_invite,
// supabase/sql/034_safe_trainee_invite_retry.sql -- and why a failed
// email send never auto-cancels the invite it was for) and its own test
// file for what has actually been verified to run correctly, and what has
// not (real Postgres, real GoTrue/inviteUserByEmail, real concurrency, real
// email delivery -- none of that runs under Node; see this feature's
// implementation notes for the full list of what is still unverified).
//
// Two Supabase clients are used for two different trust levels:
//   1. `asUser` -- created with the ANON key plus the caller's own
//      Authorization header forwarded as-is. Every read/write this client
//      makes runs AS the calling coach, fully subject to RLS and the
//      existing coach_get_or_issue_trainee_invite RPC's own
//      is_coach()/ownership checks (it is the only RPC this function
//      calls -- see handler.js for why there is no cancel/rollback call
//      here). This function deliberately does NOT re-implement "is this
//      caller a coach who owns this trainee" itself -- that would
//      duplicate (and risk drifting from) logic that is already written
//      once, already reviewed, and already the sole path allowed to
//      write trainees.invite_*/auth_user_id.
//   2. `admin` -- created with the SERVICE ROLE key, used for exactly one
//      privileged call: auth.admin.inviteUserByEmail(). This is the only
//      reason this function needs to exist as a server-side Edge Function
//      at all. The service-role key is read only from the Edge Function's
//      own runtime environment (auto-provisioned by Supabase as
//      SUPABASE_SERVICE_ROLE_KEY for every deployed function) and is
//      never logged, echoed back to the client, or written anywhere.
//
// Deploy: supabase functions deploy invite-trainee
// (see the coach-portal-invite-flow implementation notes for the exact
// required secrets and Dashboard configuration this function depends on.)

// @ts-nocheck -- this file runs on Deno (Supabase Edge Functions), not in
// this repo's Node/Vite toolchain, so npm-oriented tooling (eslint, the
// TS project this repo doesn't otherwise use) has no business type-checking
// it. jsr:/Deno.* are resolved at deploy time by the Supabase Edge Runtime.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleInviteRequest } from './handler.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function errorResponse(status, message) {
  return jsonResponse(status, { error: { message } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed.')
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse(401, 'Missing Authorization header.')
  }

  let body
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'Invalid JSON body.')
  }

  const traineeId = typeof body?.trainee_id === 'string' ? body.trainee_id.trim() : ''
  if (!traineeId) {
    return errorResponse(400, 'trainee_id is required.')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  // Where the deployed frontend actually lives -- an Edge Function has no
  // notion of "the browser's origin" the way client-side code does (it
  // isn't running in that browser), so this has to be configured
  // explicitly as a function secret. See implementation notes for the
  // exact `supabase secrets set SITE_URL=...` command required.
  const siteUrl = Deno.env.get('SITE_URL')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    // SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
    // auto-provisioned by Supabase for every deployed Edge Function --
    // missing here almost certainly means this is being run somewhere
    // that isn't a real deployed Supabase Edge Function environment.
    return errorResponse(500, 'Server is missing Supabase configuration.')
  }
  if (!siteUrl) {
    return errorResponse(
      500,
      'Server is missing the SITE_URL configuration required to build the invitation link.',
    )
  }

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result = await handleInviteRequest({ asUser, admin, traineeId, siteUrl })
  return jsonResponse(result.status, result.body)
})
