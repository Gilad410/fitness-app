import { supabase } from '../../lib/supabaseClient'

export const PRIVACY_POLICY_VERSION = '2026-10-07'

export async function recordPrivacyAcceptance() {
  const { error } = await supabase.rpc('record_privacy_acceptance', {
    p_policy_version: PRIVACY_POLICY_VERSION,
  })
  if (error) throw error
}
