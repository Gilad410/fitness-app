// Fetches the neighbouring screens' data during idle time, once per
// session, so the first swipe to a screen shows the screen rather than
// its "טוען..." state.
//
// prefetchRoutes.js already warms the CODE. This warms the DATA, which is
// the other half of the blank moment: every main view fetches on mount
// and renders a loading state until the network answers, so even with
// the chunk in memory the first visit still waits on a round trip.
//
// Three deliberate constraints:
//
//   · ONCE PER SESSION. These loaders are not all cached -- some refetch
//     on every call -- so running them on every layout mount would add
//     requests rather than remove waiting. A module-level flag makes the
//     warm-up exactly one extra burst per portal, per page load.
//   · IDLE ONLY. It must never compete with the screen in front of the
//     person, or with the first render.
//   · DYNAMIC IMPORTS. Pulling these stores in statically would drag
//     every screen's dependencies back into the layout chunk and undo
//     the code splitting this is meant to complement.
//
// Failures are swallowed on purpose: each view surfaces its own errors
// with its own retry, and a warm-up that failed simply leaves that view
// to fetch normally.

const warmed = { coach: false, trainee: false }

function onIdle(run) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 600)
  }
}

export function warmTraineeData() {
  if (warmed.trainee) return
  warmed.trainee = true

  onIdle(async () => {
    try {
      const [profile, program, nutrition, progress] = await Promise.all([
        import('../features/trainee/store/traineeProfile'),
        import('../features/trainee/store/traineeTrainingProgram'),
        import('../features/trainee/store/traineeNutrition'),
        import('../features/trainee/store/traineeProgressLogs'),
      ])
      // Fire together, settle independently: one slow endpoint must not
      // hold up the others' screens.
      void profile.useTraineeProfileStore().fetchProfile().catch(noop)
      void program.useTraineeTrainingProgramStore().fetchActiveProgram().catch(noop)
      void nutrition.useTraineeNutritionStore().fetchAll().catch(noop)
      void progress.useTraineeProgressLogsStore().ensureLoaded().catch(noop)
    } catch {
      // A chunk that would not load is not worth reporting here; the
      // view that needs it will load it again and show its own error.
    }
  })
}

export function warmCoachData() {
  if (warmed.coach) return
  warmed.coach = true

  onIdle(async () => {
    try {
      const [trainees, alerts] = await Promise.all([
        import('../features/trainees/store/trainees'),
        import('../features/alerts/store/alerts'),
      ])
      void trainees.useTraineesStore().ensureLoaded().catch(noop)
      void alerts.useAlertsStore().fetchAll().catch(noop)
    } catch {
      // as above
    }
  })
}

function noop() {}
