import { createRouter, createWebHistory } from 'vue-router'
import HelloWorld from '../components/HelloWorld.vue'
import LoginView from '../features/auth/views/LoginView.vue'
import SignupView from '../features/auth/views/SignupView.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HelloWorld, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/signup', name: 'signup', component: SignupView },
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
