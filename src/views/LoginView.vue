<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import Button from 'primevue/button'
import Card from 'primevue/card'
import FloatLabel from 'primevue/floatlabel'
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
    <Card class="login-card">
      <template #title>
        <div class="login-brand">
          <img
            src="/findeco-logo.png"
            alt="FINDECO — Servicios Financieros Inmediatos"
            class="login-logo"
            width="280"
            height="120"
          />
          <span class="login-title">Iniciar sesión</span>
        </div>
      </template>
      <template #content>
        <form class="form-stack" @submit.prevent="onSubmit">
          <FloatLabel>
            <InputText
              id="login-user"
              v-model="username"
              fluid
              autocomplete="username"
              :disabled="loading"
            />
            <label for="login-user">Usuario</label>
          </FloatLabel>
          <FloatLabel>
            <Password
              id="login-pass"
              v-model="password"
              fluid
              :feedback="false"
              toggle-mask
              :disabled="loading"
              input-class="w-full"
              :input-props="{ autocomplete: 'current-password' }"
            />
            <label for="login-pass">Contraseña</label>
          </FloatLabel>
          <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
          <Button
            type="submit"
            label="Entrar"
            icon="pi pi-sign-in"
            :loading="loading"
            fluid
          />
        </form>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.login-card {
  width: 100%;
  max-width: 28rem;
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}

.login-logo {
  display: block;
  width: min(100%, 17.5rem);
  height: auto;
  object-fit: contain;
}

.login-title {
  font-size: 1.25rem;
  font-weight: 600;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
</style>
