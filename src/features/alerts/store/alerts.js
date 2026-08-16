import { defineStore } from 'pinia'
import { supabase } from '../../../lib/supabaseClient'

// Coach-side alerts are derived, point-in-time facts read straight off
// existing tables (trainees, trainee_progress_logs,
// trainee_training_programs) -- there is no dedicated alerts table, and
// none is needed: RLS on all three already scopes every row to
// coach_id = auth.uid(), so a plain select here is automatically
// restricted to this coach's own trainees. An alert "clears" simply by no
// longer being computed on the next fetch -- nothing is ever marked
// read/dismissed, and there is no nutrition alert of any kind.

const MISSING_WEIGHT_THRESHOLD_DAYS = 3

// Parses a `date` column ('YYYY-MM-DD') or a timestamptz column (ISO
// string) as a local calendar date, ignoring time-of-day entirely, so the
// day-difference math below can't be thrown off by a UTC/local offset.
function parseDateOnly(value) {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function todayDateOnly() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function daysSince(dateValue) {
  const diffMs = todayDateOnly() - parseDateOnly(dateValue)
  return Math.round(diffMs / 86400000)
}

export const useAlertsStore = defineStore('alerts', {
  state: () => ({
    missingWeightAlerts: [],
    noProgramAlerts: [],
    loading: false,
    loaded: false,
    error: null,
  }),

  getters: {
    totalCount: (state) => state.missingWeightAlerts.length + state.noProgramAlerts.length,
  },

  actions: {
    // Always refetches -- there's no cache to invalidate when a weight
    // entry is recorded or a program is activated elsewhere in the app, so
    // every mount of the alerts page or the sidebar (which remounts on
    // every navigation, since AppLayout isn't a persistent route wrapper)
    // simply recomputes from scratch.
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        // Only active trainees are considered -- a paused or archived
        // trainee isn't being actively coached right now, so nagging about
        // their missing weigh-ins or programs would be noise.
        const [traineesRes, logsRes, programsRes] = await Promise.all([
          supabase.from('trainees').select('id, full_name, created_at').eq('status', 'active'),
          supabase
            .from('trainee_progress_logs')
            .select('trainee_id, logged_at')
            .order('logged_at', { ascending: false }),
          supabase.from('trainee_training_programs').select('trainee_id, status'),
        ])

        if (traineesRes.error) throw traineesRes.error
        if (logsRes.error) throw logsRes.error
        if (programsRes.error) throw programsRes.error

        // logsRes.data is sorted newest-first across ALL trainees, so the
        // first row seen for a given trainee_id is that trainee's latest
        // weigh-in.
        const latestLogByTrainee = new Map()
        for (const log of logsRes.data) {
          if (!latestLogByTrainee.has(log.trainee_id)) {
            latestLogByTrainee.set(log.trainee_id, log.logged_at)
          }
        }

        const traineesWithActiveProgram = new Set(
          programsRes.data.filter((p) => p.status === 'active').map((p) => p.trainee_id),
        )

        const missingWeightAlerts = []
        const noProgramAlerts = []

        for (const trainee of traineesRes.data) {
          const lastLoggedAt = latestLogByTrainee.get(trainee.id) ?? null
          // Never logged: fall back to signup date, so a brand-new trainee
          // gets the same grace period as anyone else instead of alerting
          // the moment they're created.
          const referenceDate = lastLoggedAt ?? trainee.created_at
          const days = daysSince(referenceDate)

          if (days >= MISSING_WEIGHT_THRESHOLD_DAYS) {
            missingWeightAlerts.push({
              traineeId: trainee.id,
              traineeName: trainee.full_name,
              daysMissing: days,
              lastLoggedAt,
            })
          }

          if (!traineesWithActiveProgram.has(trainee.id)) {
            noProgramAlerts.push({
              traineeId: trainee.id,
              traineeName: trainee.full_name,
            })
          }
        }

        missingWeightAlerts.sort((a, b) => b.daysMissing - a.daysMissing)
        noProgramAlerts.sort((a, b) => a.traineeName.localeCompare(b.traineeName, 'he'))

        this.missingWeightAlerts = missingWeightAlerts
        this.noProgramAlerts = noProgramAlerts
        this.loaded = true
      } catch (err) {
        this.error = err.message
        throw err
      } finally {
        this.loading = false
      }
    },
  },
})
