import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../features/dashboard/views/DashboardView.vue'
import LoginView from '../features/auth/views/LoginView.vue'
import TraineesListView from '../features/trainees/views/TraineesListView.vue'
import TraineeFormView from '../features/trainees/views/TraineeFormView.vue'
import TraineeDetailView from '../features/trainees/views/TraineeDetailView.vue'
import NutritionTraineesListView from '../features/nutrition/views/NutritionTraineesListView.vue'
import NutritionWorkspaceView from '../features/nutrition/views/NutritionWorkspaceView.vue'
import ProgressTraineesListView from '../features/progress/views/ProgressTraineesListView.vue'
import ProgressWorkspaceView from '../features/progress/views/ProgressWorkspaceView.vue'
import TrainingTraineesListView from '../features/training/views/TrainingTraineesListView.vue'
import TrainingProgramsListView from '../features/training/views/TrainingProgramsListView.vue'
import TrainingProgramDetailView from '../features/training/views/TrainingProgramDetailView.vue'
import AlertsView from '../features/alerts/views/AlertsView.vue'
import TraineeJoinView from '../features/trainee/views/TraineeJoinView.vue'
import TraineeLoginView from '../features/trainee/views/TraineeLoginView.vue'
import TraineeHomeView from '../features/trainee/views/TraineeHomeView.vue'
import TraineeNotificationsView from '../features/trainee/views/TraineeNotificationsView.vue'
import TraineeTrainingView from '../features/trainee/views/TraineeTrainingView.vue'
import TraineeNutritionView from '../features/trainee/views/TraineeNutritionView.vue'
import TraineeProgressView from '../features/trainee/views/TraineeProgressView.vue'
import TraineeMeasurementsView from '../features/trainee/views/TraineeMeasurementsView.vue'
import NoAccessView from '../features/trainee/views/NoAccessView.vue'
import { useAuthStore } from '../stores/auth'

// NOTE on /signup: public coach self-signup (src/features/auth/views/SignupView.vue)
// is intentionally NOT registered as a route. 021_trainee_auth_and_roles.sql
// deliberately backfilled coach role only for accounts already referenced by
// an existing trainees row, and grants no role at all to a bare new signup --
// so leaving /signup reachable would let a stranger create an Auth account
// that has zero application access anyway, just with confusing UX (a
// "successful" signup that goes nowhere). The component file is kept
// (unused/unreachable) rather than deleted, in case a proper coach-invite
// flow reuses it later. Any stale link/bookmark to /signup now falls through
// to the catch-all redirect below.

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: DashboardView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
    },
    { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
    {
      path: '/trainees',
      name: 'trainees',
      component: TraineesListView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
    },
    {
      path: '/trainees/new',
      name: 'trainee-new',
      component: TraineeFormView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
    },
    {
      path: '/trainees/:id',
      name: 'trainee-detail',
      component: TraineeDetailView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
      props: true,
    },
    {
      path: '/trainees/:id/edit',
      name: 'trainee-edit',
      component: TraineeFormView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
      props: true,
    },
    {
      path: '/nutrition',
      name: 'nutrition-trainees',
      component: NutritionTraineesListView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
    },
    {
      path: '/nutrition/:id',
      name: 'nutrition-workspace',
      component: NutritionWorkspaceView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
      props: true,
    },
    {
      path: '/progress',
      name: 'progress-trainees',
      component: ProgressTraineesListView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
    },
    {
      path: '/progress/:id',
      name: 'progress-workspace',
      component: ProgressWorkspaceView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
      props: true,
    },
    {
      path: '/training',
      name: 'training-trainees',
      component: TrainingTraineesListView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
    },
    {
      path: '/training/:traineeId',
      name: 'training-programs',
      component: TrainingProgramsListView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
      props: true,
    },
    {
      path: '/training/:traineeId/:programId',
      name: 'training-program-detail',
      component: TrainingProgramDetailView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
      props: true,
    },
    {
      path: '/alerts',
      name: 'alerts',
      component: AlertsView,
      meta: { requiresAuth: true, requiresRole: 'coach' },
    },

    // Trainee side. /trainee/join is deliberately public (no requiresAuth/
    // guestOnly) -- it's where a brand-new trainee account is created from
    // an emailed link, so there is no session yet in the normal case; the
    // view itself warns and blocks the form if the browser already holds an
    // unrelated session instead of the router turning it away.
    { path: '/trainee/join', name: 'trainee-join', component: TraineeJoinView },
    {
      path: '/trainee/login',
      name: 'trainee-login',
      component: TraineeLoginView,
      meta: { guestOnly: true },
    },
    {
      path: '/trainee',
      name: 'trainee-home',
      component: TraineeHomeView,
      meta: { requiresAuth: true, requiresRole: 'trainee' },
    },
    {
      path: '/trainee/notifications',
      name: 'trainee-notifications',
      component: TraineeNotificationsView,
      meta: { requiresAuth: true, requiresRole: 'trainee' },
    },
    // Future trainee sections -- placeholder pages only (TraineeComingSoon.vue).
    // None of these fetch nutrition/progress/circumference/photos/training-
    // programs data: 021_trainee_auth_and_roles.sql grants the trainee role
    // no access to any of those tables yet (see the migration-plan analysis
    // this milestone produced). The routes exist now purely to give the
    // trainee nav somewhere real to point, per this milestone's scope.
    {
      path: '/trainee/training',
      name: 'trainee-training',
      component: TraineeTrainingView,
      meta: { requiresAuth: true, requiresRole: 'trainee' },
    },
    {
      path: '/trainee/nutrition',
      name: 'trainee-nutrition',
      component: TraineeNutritionView,
      meta: { requiresAuth: true, requiresRole: 'trainee' },
    },
    {
      path: '/trainee/progress',
      name: 'trainee-progress',
      component: TraineeProgressView,
      meta: { requiresAuth: true, requiresRole: 'trainee' },
    },
    {
      path: '/trainee/measurements',
      name: 'trainee-measurements',
      component: TraineeMeasurementsView,
      meta: { requiresAuth: true, requiresRole: 'trainee' },
    },

    // Authenticated but role-less landing (orphan account, or an invite
    // that was never accepted) -- reachable only via redirect, never linked
    // to from anywhere in the UI.
    {
      path: '/no-access',
      name: 'no-access',
      component: NoAccessView,
      meta: { requiresAuth: true },
    },

    // Catch-all: an unmatched path (including a stale /signup link) lands
    // on the coach login rather than a blank page.
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await authStore.init()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    // Anonymous users are sent to the login page matching the area they
    // tried to reach, so a bookmarked /trainee URL doesn't dead-end on the
    // coach login form.
    return { name: to.meta.requiresRole === 'trainee' ? 'trainee-login' : 'login' }
  }

  if (!authStore.isAuthenticated) {
    // Anonymous on a route with no auth requirement at all (public pages
    // such as /trainee/join, or /login itself) -- nothing further to check.
    return
  }

  // From here on the visitor is authenticated. Resolve role once (cached
  // by the store -- see loadRole()) before any role-based decision below,
  // so a trainee can never slip past a coach-only route (or vice versa)
  // just because the role hadn't loaded yet.
  await authStore.loadRole()

  // Where a signed-in user belongs: their own area if they have a
  // resolved role, the access-denied screen if they genuinely have none.
  // Anonymous users never reach this helper (handled above).
  function ownAreaRoute() {
    if (authStore.isCoach) return { name: 'home' }
    if (authStore.isTrainee) return { name: 'trainee-home' }
    return { name: 'no-access' }
  }

  if (to.meta.guestOnly) {
    // An already-authenticated user has no business on /login or
    // /trainee/login -- send them to whatever they actually have access to.
    return ownAreaRoute()
  }

  if (to.meta.requiresRole === 'coach' && !authStore.isCoach) {
    return ownAreaRoute()
  }
  if (to.meta.requiresRole === 'trainee' && !authStore.isTrainee) {
    return ownAreaRoute()
  }
})

export default router
