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

// ---------------------------------------------------------------------
// Payment + note editing
// ---------------------------------------------------------------------

// Mirrors owner_set_coach_note's server-side limit exactly. As always,
// the server is the authority; checking here only lets the owner see the
// problem while typing instead of after a failed round-trip.
export const NOTE_MAX_LENGTH = 2000

// Matches the server's accepted window in
// owner_set_coach_payment_status: 2020-01-01 .. today + 10 years. A
// typo'd year is the realistic failure these bounds catch.
const MIN_PAYMENT_DATE = '2020-01-01'

function maxPaymentDate(today = new Date()) {
  const d = new Date(today.getTime())
  d.setFullYear(d.getFullYear() + 10)
  return toDateString(d)
}

// yyyy-mm-dd in LOCAL time. toISOString() would be wrong here: it
// converts to UTC first, which shifts the date by a day for anyone east
// of Greenwich -- including this app's Israeli users, for whom a date
// picked late in the evening would be stored as the previous day.
export function toDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Returns '' when the form is valid, otherwise a Hebrew message. Empty
// dates are legitimate (both columns are nullable -- "not reviewed yet",
// "no paid-through date"), so only non-empty values are range-checked.
export function validatePaymentEdit(form, today = new Date()) {
  const status = form?.paymentStatus
  if (!isValidPaymentStatus(status)) return 'יש לבחור סטטוס תשלום תקין.'

  const reviewedAt = emptyToNull(form?.paymentReviewedAt)
  const paidThrough = emptyToNull(form?.paidThrough)
  const max = maxPaymentDate(today)

  for (const [value, label] of [
    [reviewedAt, 'תאריך בדיקת התשלום'],
    [paidThrough, 'תאריך התוקף'],
  ]) {
    if (value === null) continue
    if (!DATE_RE.test(value)) return `${label} אינו תקין.`
    if (value < MIN_PAYMENT_DATE || value > max) return `${label} מחוץ לטווח המותר.`
  }

  if (reviewedAt && paidThrough && paidThrough < reviewedAt) {
    return 'תאריך התוקף אינו יכול להקדים את תאריך בדיקת התשלום.'
  }
  return ''
}

export function validateOwnerNote(note) {
  if ((note ?? '').trim().length > NOTE_MAX_LENGTH) {
    return `ההערה ארוכה מדי (עד ${NOTE_MAX_LENGTH} תווים).`
  }
  return ''
}

// '' -> null so an emptied date field clears the column rather than
// being sent as an empty string, which Postgres would reject as an
// invalid date.
export function emptyToNull(value) {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

// True when the edit form differs from the stored row -- used to keep
// "save" inert when nothing changed, so a stray click does not write an
// identical row (and does not claim it saved something).
export function paymentEditIsDirty(form, coach) {
  return (
    form?.paymentStatus !== coach?.payment_status ||
    emptyToNull(form?.paymentReviewedAt) !== (coach?.payment_reviewed_at ?? null) ||
    emptyToNull(form?.paidThrough) !== (coach?.paid_through ?? null)
  )
}

export function noteEditIsDirty(note, coach) {
  return emptyToNull(note) !== (coach?.owner_note ?? null)
}

// ---------------------------------------------------------------------
// Pending invitations
// ---------------------------------------------------------------------

const INVITATION_STATE_LABEL_HE = { pending: 'ממתינה', expired: 'פגה' }

export function invitationStateLabelHe(state) {
  return INVITATION_STATE_LABEL_HE[state] ?? state
}

// Formats a timestamptz for display. Invalid/absent values render as a
// dash rather than "Invalid Date".
export function formatDateHe(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(d)
}
