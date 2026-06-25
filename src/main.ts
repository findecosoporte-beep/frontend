import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import 'primeicons/primeicons.css'

import { registerAuthFailureHandler } from '@/api/client'
import { poseidonPreset } from '@/theme/poseidon-preset'
import { useAuthStore } from '@/stores/auth'

import App from './App.vue'
import router from './router'

import './style.css'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: poseidonPreset,
    options: {
      // FINDECO usa fondo claro; evita tarjeta oscura en móviles con dark mode del sistema.
      darkModeSelector: false,
    },
  },
})
app.use(ToastService)
app.use(ConfirmationService)

registerAuthFailureHandler(() => {
  const auth = useAuthStore(pinia)
  auth.logout()
  void router.push({ name: 'login' })
})

app.mount('#app')
