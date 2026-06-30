<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'

import { getApiErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    await router.push({ name: 'dashboard' })
  } catch (e: unknown) {
    error.value = getApiErrorMessage(e, 'Usuario o contraseña incorrectos.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <section class="login-panel">
      <header class="login-brand">
        <img
          src="/findeco-logo-light.svg"
          alt="FINDECO — Servicios Financieros Inmediatos"
          class="login-logo"
          width="260"
          height="98"
        />
        <h1 class="login-title">Iniciar sesión</h1>
      </header>

      <form class="login-form" @submit.prevent="onSubmit">
        <div class="field">
          <label class="field-label" for="login-user">Usuario</label>
          <InputText
            id="login-user"
            v-model="username"
            class="login-input"
            fluid
            autocomplete="username"
            :disabled="loading"
          />
        </div>

        <div class="field">
          <label class="field-label" for="login-pass">Contraseña</label>
          <Password
            id="login-pass"
            v-model="password"
            class="login-password"
            fluid
            :feedback="false"
            toggle-mask
            :disabled="loading"
            input-class="login-input w-full"
            :input-props="{ autocomplete: 'current-password' }"
          />
        </div>

        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

        <Button
          type="submit"
          label="Entrar"
          icon="pi pi-sign-in"
          class="login-submit"
          :loading="loading"
          fluid
        />
      </form>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  padding: max(1.25rem, env(safe-area-inset-top)) 1.25rem max(1.25rem, env(safe-area-inset-bottom));
  background: #ffffff;
}

.login-panel {
  width: 100%;
  max-width: 26rem;
  padding: 2rem 1.75rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 1.25rem;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.05);
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  margin-bottom: 1.75rem;
  text-align: center;
}

.login-logo {
  display: block;
  width: min(100%, 16.25rem);
  height: auto;
  object-fit: contain;
}

.login-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #0f172a;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #334155;
}

.login-panel :deep(.login-input),
.login-panel :deep(.p-password-input) {
  width: 100%;
  background: #ffffff !important;
  border: 1px solid #cbd5e1 !important;
  color: #0f172a !important;
  box-shadow: none !important;
}

.login-panel :deep(.login-input:enabled:focus),
.login-panel :deep(.p-password-input:enabled:focus) {
  border-color: #06b6d4 !important;
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15) !important;
}

.login-panel :deep(.login-input:-webkit-autofill),
.login-panel :deep(.p-password-input:-webkit-autofill) {
  -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
  -webkit-text-fill-color: #0f172a !important;
  caret-color: #0f172a;
}

.login-panel :deep(.p-password) {
  width: 100%;
}

.login-submit {
  margin-top: 0.25rem;
}

@media (max-width: 480px) {
  .login-panel {
    padding: 1.5rem 1.25rem;
    border-radius: 1rem;
  }

  .login-brand {
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
}
</style>
