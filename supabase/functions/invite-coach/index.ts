// Supabase Edge Function: invite-coach
// =====================================================================
// The second place in this app (after invite-trainee) that ever touches
// the Supabase service-role key. Mirrors invite-trainee/index.ts's
// structure exactly -- thin glue only, all real logic lives in
// ./handlerV2.js (handleInviteCoachRequest), which is Deno-agnostic and
// directly unit-tested under Node (handlerV2.test.mjs).
//
// Two Supabase clients, same two trust levels as invite-trainee:
//   1. `asUser` -- ANON key + the caller's own Authorization header.
//      Every call this client makes runs AS the caller, fully subject to
//      RLS and owner_get_or_invite_coach's own is_owner() check
//      (056_owner_coach_administration.sql) -- this function does not
//      re-implement "is this caller the owner" itself.
//   2. `admin` -- SERVICE ROLE key, used for the narrow invitation RPCs
//      and Supabase Auth invite-link operations. The service-role key is
//      read only from the Edge Function runtime and is never logged,
//      echoed to the client, or written anywhere.
//
// Deploy: supabase functions deploy invite-coach --no-verify-jwt
// The function passes the caller's JWT to the RLS-bound client below, and
// owner_get_or_invite_coach performs the authoritative owner check. Disabling
// the gateway's legacy JWT verification also allows Supabase's current signing
// keys to reach that database authorization check.
// (requires the same SITE_URL secret invite-trainee already depends on --
// not a new configuration requirement.)

// @ts-nocheck -- Deno runtime, not this repo's Node/Vite toolchain.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleInviteCoachRequest } from './handlerV2.js'

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

  const action = typeof body?.action === 'string' ? body.action : 'invite'
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const invitationId = typeof body?.invitationId === 'string' ? body.invitationId : ''
  if (action === 'invite' && !email) return errorResponse(400, 'יש להזין כתובת אימייל.')
  if (!['invite', 'resend', 'cancel'].includes(action)) {
    return errorResponse(400, 'הפעולה המבוקשת אינה נתמכת.')
  }
  if (action !== 'invite' && !invitationId) return errorResponse(400, 'חסר מזהה הזמנה.')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const siteUrl = Deno.env.get('SITE_URL')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const resendFromEmail =
    Deno.env.get('RESEND_FROM_EMAIL') ?? 'Fitness App <no-reply@auth.fitness-app.online>'

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

  const sendResendEmail = resendApiKey
    ? async ({ to, subject, html }) => {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: resendFromEmail, to: [to], subject, html }),
        })
        if (response.ok) return null
        const result = await response.json().catch(() => null)
        return result?.message ?? `Resend returned ${response.status}`
      }
    : null

  const result = await handleInviteCoachRequest({
    asUser,
    admin,
    action,
    email,
    invitationId,
    siteUrl,
    sendResendEmail,
  })
  return jsonResponse(result.status, result.body)
})
