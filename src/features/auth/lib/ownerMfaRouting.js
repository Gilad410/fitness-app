export const OWNER_MFA_SETUP_ROUTE = 'owner-mfa-setup'
export const OWNER_MFA_CHALLENGE_ROUTE = 'owner-mfa-challenge'

const validLevel = (level) => (level === 'aal1' || level === 'aal2' ? level : null)

export function resolveOwnerMfaRoute(assurance, targetName) {
  const currentLevel = validLevel(assurance?.currentLevel)
  const nextLevel = validLevel(assurance?.nextLevel)

  if (!currentLevel || !nextLevel) {
    return { unavailable: true }
  }

  if (currentLevel === 'aal2') {
    if (targetName === OWNER_MFA_SETUP_ROUTE || targetName === OWNER_MFA_CHALLENGE_ROUTE) {
      return { route: { name: 'owner-coaches' } }
    }
    return null
  }

  if (nextLevel === 'aal2') {
    return targetName === OWNER_MFA_CHALLENGE_ROUTE
      ? null
      : { route: { name: OWNER_MFA_CHALLENGE_ROUTE } }
  }

  return targetName === OWNER_MFA_SETUP_ROUTE
    ? null
    : { route: { name: OWNER_MFA_SETUP_ROUTE } }
}

export function normalizeTotpCode(value) {
  return String(value ?? '').replace(/\s/g, '')
}

export function validateTotpCode(value) {
  return /^\d{6}$/.test(normalizeTotpCode(value)) ? '' : 'יש להזין קוד בן 6 ספרות.'
}
