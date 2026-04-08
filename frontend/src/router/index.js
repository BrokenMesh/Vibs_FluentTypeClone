import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const routes = [
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    component: () => import('../views/RegisterView.vue'),
    meta: { public: true },
  },
  {
    path: '/dashboard',
    component: () => import('../views/DashboardView.vue'),
  },
  {
    path: '/profile/new',
    component: () => import('../views/NewProfileView.vue'),
  },
  {
    path: '/type',
    component: () => import('../views/TypingView.vue'),
  },
  {
    path: '/dictate',
    component: () => import('../views/DictationView.vue'),
  },
  {
    path: '/vocabulary',
    component: () => import('../views/VocabularyView.vue'),
  },
  {
    path: '/history',
    component: () => import('../views/HistoryView.vue'),
  },
  {
    path: '/admin',
    component: () => import('../views/AdminView.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();
  await auth.init();

  if (!to.meta.public && !auth.accessToken) {
    return next('/login');
  }
  if (to.meta.public && auth.accessToken) {
    return next('/dashboard');
  }
  next();
});

export default router;
