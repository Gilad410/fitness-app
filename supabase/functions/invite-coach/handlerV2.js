// Deno-agnostic invitation lifecycle orchestration. Tokens remain inside
// the Edge Function; resend generates a fresh Supabase invite link and
// delivers it through Resend without deleting the existing Auth user.
export async function handleInviteCoachRequest({
  asUser,
  admin,
  action = 'invite',
  email = '',
  invitationId = '',
  siteUrl,
  sendResendEmail,
}) {
  if (action === 'invite') return sendNewInvitation({ asUser, admin, email, siteUrl })
  if (action === 'resend') {
    return resendInvitation({ asUser, admin, invitationId, siteUrl, sendResendEmail })
  }
  if (action === 'cancel') return cancelInvitation({ asUser, admin, invitationId })
  return errorResult(400, 'הפעולה המבוקשת אינה נתמכת.')
}

async function sendNewInvitation({ asUser, admin, email, siteUrl }) {
  const { data, error } = await asUser.rpc('owner_get_or_invite_coach', { p_email: email })
  if (error) return errorResult(400, hebrewError(error.message))
  const issued = firstRow(data)
  if (!issued?.invite_token) return errorResult(500, 'יצירת ההזמנה נכשלה. נסו שוב.')
  const deliveryError = await deliverInitialInvite({
    admin,
    email,
    inviteToken: issued.invite_token,
    siteUrl,
  })
  if (deliveryError) return deliveryError
  return successResult({
    action: 'invite',
    invitationId: issued.invitation_id,
    email,
    expiresAt: issued.invite_expires_at,
    newlyIssued: issued.newly_issued === true,
  })
}

async function resendInvitation({ asUser, admin, invitationId, siteUrl, sendResendEmail }) {
  if (typeof sendResendEmail !== 'function') {
    return errorResult(500, 'שירות השליחה החוזרת עדיין אינו מוגדר.')
  }
  const caller = await verifiedCaller(asUser)
  if (caller.error) return caller.error
  const prepared = await prepareAdminAction({
    admin,
    ownerUserId: caller.userId,
    invitationId,
    action: 'resend',
  })
  if (prepared.error) return prepared.error
  const row = prepared.row

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: row.email,
    options: {
      redirectTo: `${siteUrl}/coach/join`,
      data: { coach_invite_token: row.invite_token },
    },
  })
  const actionLink = linkData?.properties?.action_link
  if (linkError || !actionLink) {
    return errorResult(502, `יצירת קישור ההזמנה נכשלה: ${hebrewError(linkError?.message)}`)
  }

  const sendError = await sendResendEmail({
    to: row.email,
    subject: 'הזמנה למערכת ניהול הכושר',
    html: invitationEmailHtml(actionLink),
  })
  if (sendError) return errorResult(502, `שליחת מייל ההזמנה נכשלה: ${sendError}`)

  return successResult({
    action: 'resend',
    invitationId: row.invitation_id,
    email: row.email,
    expiresAt: row.invite_expires_at,
  })
}

async function cancelInvitation({ asUser, admin, invitationId }) {
  const caller = await verifiedCaller(asUser)
  if (caller.error) return caller.error
  const prepared = await prepareAdminAction({
    admin,
    ownerUserId: caller.userId,
    invitationId,
    action: 'cancel',
  })
  if (prepared.error) return prepared.error
  const { error } = await admin.rpc('owner_admin_cancel_coach_invite', {
    p_owner_user_id: caller.userId,
    p_invitation_id: invitationId,
  })
  if (error) return errorResult(400, hebrewError(error.message))
  return successResult({ action: 'cancel', invitationId, email: prepared.row.email })
}

async function verifiedCaller(asUser) {
  const { data, error } = await asUser.auth.getUser()
  if (error || !data?.user?.id) {
    return { error: errorResult(401, 'החיבור פג. יש להתחבר מחדש ולנסות שוב.') }
  }
  return { userId: data.user.id }
}

async function prepareAdminAction({ admin, ownerUserId, invitationId, action }) {
  const { data, error } = await admin.rpc('owner_admin_prepare_coach_invite', {
    p_owner_user_id: ownerUserId,
    p_invitation_id: invitationId,
    p_action: action,
  })
  if (error) return { error: errorResult(400, hebrewError(error.message)) }
  const row = firstRow(data)
  if (!row?.invite_token || !row?.email) {
    return { error: errorResult(500, 'פרטי ההזמנה חסרים. רעננו את המסך ונסו שוב.') }
  }
  return { row }
}

async function deliverInitialInvite({ admin, email, inviteToken, siteUrl }) {
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/coach/join`,
    data: { coach_invite_token: inviteToken },
  })
  if (!error) return null
  const duplicate =
    error.code === 'email_exists' ||
    /already.*(registered|exists|invited)/i.test(error.message ?? '')
  return errorResult(
    duplicate ? 409 : 502,
    duplicate
      ? 'כבר קיים חשבון עם כתובת האימייל הזו.'
      : `שליחת מייל ההזמנה נכשלה: ${hebrewError(error.message)}`,
  )
}

function invitationEmailHtml(actionLink) {
  const safeLink = escapeHtml(actionLink)
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f6f7fb;font-family:Arial,sans-serif;color:#12153a"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb"><div style="background:#12153a;color:#fff;padding:22px 28px;font-size:20px;font-weight:700">ניהול כושר</div><div style="padding:30px 28px"><h1 style="font-size:24px;margin:0 0 16px">הזמנה למערכת ניהול הכושר</h1><p style="line-height:1.7;color:#4b5563">הוזמנת להצטרף כמאמן/ת. לחצו על הכפתור כדי להשלים את ההרשמה.</p><p style="text-align:center;margin:28px 0"><a href="${safeLink}" style="display:inline-block;background:#2f6fed;color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:10px">השלמת ההרשמה</a></p><p style="font-size:13px;line-height:1.6;color:#6b7280">אם לא ציפית למייל הזה, אפשר להתעלם ממנו.</p></div></div></body></html>`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data
}
function successResult({ action, invitationId, email, expiresAt = null, newlyIssued = false }) {
  return {
    status: 200,
    body: {
      ok: true,
      action,
      invitation_id: invitationId ?? null,
      invite_expires_at: expiresAt,
      email,
      newly_issued: newlyIssued,
    },
  }
}
function hebrewError(message = '') {
  if (/only the owner/i.test(message)) return 'רק בעל/ת המערכת רשאי/ת לבצע פעולה זו.'
  if (/no pending invitation/i.test(message)) return 'ההזמנה כבר אינה ממתינה.'
  if (/already confirmed/i.test(message)) return 'החשבון כבר אומת ואי אפשר לשלוח לו הזמנה נוספת.'
  if (/does not belong/i.test(message)) return 'החשבון הקיים אינו תואם להזמנה הזו.'
  if (/account already exists/i.test(message)) return 'כבר קיים חשבון עם כתובת האימייל הזו.'
  if (/authentication required/i.test(message)) return 'החיבור פג. יש להתחבר מחדש.'
  return message || 'הפעולה נכשלה. נסו שוב.'
}
function errorResult(status, message) {
  return { status, body: { error: { message } } }
}
