import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { ACCESS_KEY, REFRESH_KEY, api } from '@/api/client'
import type { MeProfile } from '@/types/api'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(localStorage.getItem(ACCESS_KEY))
  const refreshToken = ref<string | null>(localStorage.getItem(REFRESH_KEY))
  const profile = ref<MeProfile | null>(null)

  const isAuthenticated = computed(() => !!accessToken.value)

  function setTokens(access: string, refresh: string) {
    accessToken.value = access
    refreshToken.value = refresh
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  }

  function clearTokens() {
    accessToken.value = null
    refreshToken.value = null
    profile.value = null
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  }

  async function fetchProfile() {
    const { data } = await api.get<MeProfile>('/me/')
    profile.value = data
  }

  async function login(username: string, password: string) {
    clearTokens()
    const { data } = await api.post<{ access: string; refresh: string }>('/token/', {
      username,
      password,
    })
    setTokens(data.access, data.refresh)
    await fetchProfile()
  }

  function logout() {
    clearTokens()
  }

  return {
    accessToken,
    refreshToken,
    profile,
    isAuthenticated,
    login,
    logout,
    fetchProfile,
  }
})
