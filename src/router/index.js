import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../features/dashboard/views/DashboardView.vue'
import LoginView from '../features/auth/views/LoginView.vue'
import SignupView from '../features/auth/views/SignupView.vue'
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
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: DashboardView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/signup', name: 'signup', component: SignupView },
    {
      path: '/trainees',
      name: 'trainees',
      component: TraineesListView,
      meta: { requiresAuth: true },
    },
    {
      path: '/trainees/new',
      name: 'trainee-new',
      component: TraineeFormView,
      meta: { requiresAuth: true },
    },
    {
      path: '/trainees/:id',
      name: 'trainee-detail',
      component: TraineeDetailView,
      meta: { requiresAuth: true },
      props: true,
    },
    {
      path: '/trainees/:id/edit',
      name: 'trainee-edit',
      component: TraineeFormView,
      meta: { requiresAuth: true },
      props: true,
    },
    {
      path: '/nutrition',
      name: 'nutrition-trainees',
      component: NutritionTraineesListView,
      meta: { requiresAuth: true },
    },
    {
      path: '/nutrition/:id',
      name: 'nutrition-workspace',
      component: NutritionWorkspaceView,
      meta: { requiresAuth: true },
      props: true,
    },
    {
      path: '/progress',
      name: 'progress-trainees',
      component: ProgressTraineesListView,
      meta: { requiresAuth: true },
    },
    {
      path: '/progress/:id',
      name: 'progress-workspace',
      component: ProgressWorkspaceView,
      meta: { requiresAuth: true },
      props: true,
    },
    {
      path: '/training',
      name: 'training-trainees',
      component: TrainingTraineesListView,
      meta: { requiresAuth: true },
    },
    {
      path: '/training/:traineeId',
      name: 'training-programs',
      component: TrainingProgramsListView,
      meta: { requiresAuth: true },
      props: true,
    },
    {
      path: '/training/:traineeId/:programId',
      name: 'training-program-detail',
      component: TrainingProgramDetailView,
      meta: { requiresAuth: true },
      props: true,
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await authStore.init()

  const isGuestOnlyPage = to.name === 'login' || to.name === 'signup'

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' }
  }
  if (isGuestOnlyPage && authStore.isAuthenticated) {
    return { name: 'home' }
  }
})

export default router
