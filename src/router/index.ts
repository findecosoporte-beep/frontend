import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'clientes/registrar-clientes-findeco',
          name: 'registrar-clientes-findeco',
          component: () => import('@/views/ClientesView.vue'),
        },
        {
          path: 'clientes/ver-clientes-findeco',
          name: 'ver-clientes-findeco',
          component: () => import('@/views/VerClientesFindecoView.vue'),
        },
        {
          path: 'clientes',
          redirect: { name: 'registrar-clientes-findeco' },
        },
        {
          path: 'clientes/findeco',
          redirect: { name: 'registrar-clientes-findeco' },
        },
        {
          path: 'prestamos/gestion',
          name: 'prestamos-gestion',
          component: () => import('@/views/PrestamosView.vue'),
        },
        {
          path: 'prestamos/desembolsos-findeco',
          name: 'desembolsos-findeco',
          component: () => import('@/views/DesembolsosFindecoView.vue'),
        },
        {
          path: 'prestamos/estado-cuenta-findeco',
          name: 'estado-cuenta-findeco',
          component: () => import('@/views/EstadoCuentaFindecoView.vue'),
        },
        {
          path: 'prestamos',
          redirect: { name: 'prestamos-gestion' },
        },
        {
          path: 'cobros',
          name: 'cobros',
          component: () => import('@/views/CobrosView.vue'),
        },
        {
          path: 'cobros/historial-pagos',
          name: 'historial-pagos-cobros',
          component: () => import('@/views/HistorialPagosCobrosView.vue'),
        },
        {
          path: 'pagos',
          redirect: { name: 'cobros' },
        },
        {
          path: 'historial',
          redirect: { name: 'dashboard' },
        },
        {
          path: 'usuarios',
          name: 'usuarios',
          component: () => import('@/views/UsuariosView.vue'),
        },
      ],
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }
  if (to.meta.requiresAuth && auth.isAuthenticated && !auth.profile) {
    void auth.fetchProfile().catch(() => {
      auth.logout()
      void router.replace({ name: 'login' })
    })
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }
  return true
})

export default router
