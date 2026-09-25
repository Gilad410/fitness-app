// Pure validation/formatting logic backing OwnerCoachesView.vue --
// separated out so it can be unit-tested directly (matches this
// codebase's established pattern, e.g. categorizeSaveFailure.js,
// barcodeManualApprovalFlow.js: thin .vue, tested .js underneath).

export const ACCESS_STATUSES = ['pending', 'active', 'suspended']
export const PAYMENT_STATUSES = ['unpaid', 'trial', 'paid', 'overdue']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateInviteEmail(email) {
  const trimmed = (email ?? '').trim()
  if (!trimmed) return 'יש להזין כתובת אימייל.'
  if (!EMAIL_RE.test(trimmed)) return 'כתובת האימייל אינה תקינה.'
  return ''
}

// Mirrors owner_set_coach_status's own server-side requirement
// (056_owner_coach_administration.sql: "A reason is required when
// changing a coach's access status") -- checked client-side too so the
// confirmation dialog can show a clear Hebrew message before ever
// attempting the RPC, not just after it rejects. The server check remains
// authoritative regardless; this is a UX improvement, not the security
// boundary.
export function validateStatusChangeReason(newStatus, reason) {
  const trimmed = (reason ?? '').trim()
  if (newStatus === 'suspended' && !trimmed) {
    return 'יש לציין סיבה להשהיית הגישה.'
  }
  return ''
}

export function isValidAccessStatus(status) {
  return ACCESS_STATUSES.includes(status)
}

export function isValidPaymentStatus(status) {
  return PAYMENT_STATUSES.includes(status)
}

const STATUS_LABEL_HE = { pending: 'ממתין לאישור', active: 'פעיל', suspended: 'מושהה' }
const PAYMENT_LABEL_HE = { unpaid: 'לא שולם', trial: 'תקופת ניסיון', paid: 'שולם', overdue: 'באיחור' }

export function accessStatusLabelHe(status) {
  return STATUS_LABEL_HE[status] ?? status
}

export function paymentStatusLabelHe(status) {
  return PAYMENT_LABEL_HE[status] ?? status
}

// Case-insensitive substring match on email -- the dashboard's only
// search field (056's owner_list_coaches() never exposes anything more
// sensitive to search over).
export function filterCoachesByEmail(coaches, term) {
  const trimmed = (term ?? '').trim().toLowerCase()
  if (!trimmed) return coaches
  return coaches.filter((c) => c.email?.toLowerCase().includes(trimmed))
}

export function countByAccessStatus(coaches) {
  const counts = { pending: 0, active: 0, suspended: 0 }
  for (const c of coaches) {
    if (counts[c.access_status] !== undefined) counts[c.access_status] += 1
  }
  return counts
}
