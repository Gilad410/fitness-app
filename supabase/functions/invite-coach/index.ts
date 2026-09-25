// Supabase Edge Function: invite-coach
// =====================================================================
// The second place in this app (after invite-trainee) that ever touches
// the Supabase service-role key. Mirrors invite-trainee/index.ts's
// structure exactly -- thin glue only, all real logic lives in
// ./handler.js (handleInviteCoachRequest), which is Deno-agnostic and
// directly unit-tested under Node (handler.test.mjs).
//
// Two Supabase clients, same two trust levels as invite-trainee:
//   1. `asUser` -- ANON key + the caller's own Authorization header.
//      Every call this client makes runs AS the caller, fully subject to
//      RLS and owner_get_or_invite_coach's own is_owner() check
//      (056_owner_coach_administration.sql) -- this function does not
//      re-implement "is this caller the owner" itself.
//   2. `admin` -- SERVICE ROLE key, used for exactly one privileged call:
//      auth.admin.inviteUserByEmail(). The service-role key is read only
//      from the Edge Function's own runtime environment and is never
//      logged, echoed to the client, or written anywhere.
//
// Deploy: supabase functions deploy invite-coach
// (requires the same SITE_URL secret invite-trainee already depends on --
// not a new configuration requirement.)

// @ts-nocheck -- Deno runtime, not this repo's Node/Vite toolchain.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleInviteCoachRequest } from './handler.js'

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

  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!email) {
    return errorResponse(400, 'email is required.')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const siteUrl = Deno.env.get('SITE_URL')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
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

  const result = await handleInviteCoachRequest({ asUser, admin, email, siteUrl })
  return jsonResponse(result.status, result.body)
})
