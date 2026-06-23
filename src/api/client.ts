import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'

export const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1'

/**
 * Rutas públicas del backend (/media/, estáticos) no deben pedirse con baseURL `/api/v1`
 * porque Axios produciría `/api/v1/media/...` → 404.
 */
export function resolveBackendAssetUrl(url: string): string {
  const u = url.trim()
  if (!u) return u
  if (/^https?:\/\//i.test(u)) return u
  const origin = baseURL.replace(/\/api\/v1\/?$/, '')
  return u.startsWith('/') ? `${origin}${u}` : `${origin}/${u}`
}

export const ACCESS_KEY = 'access_token'
export const REFRESH_KEY = 'refresh_token'

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

let authFailureHandler: (() => void) | null = null

export function registerAuthFailureHandler(fn: () => void) {
  authFailureHandler = fn
}

function isAuthPath(url: string) {
  return url.includes('/token/') || url.endsWith('/token') || url.includes('/token/refresh')
}

api.interceptors.request.use((config) => {
  const path = config.url ?? ''
  if (isAuthPath(path)) {
    delete config.headers.Authorization
    return config
  }
  const token = localStorage.getItem(ACCESS_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRefreshing = false
let failedQueue: Array<(token: string | null) => void> = []

function processQueue(token: string | null) {
  failedQueue.forEach((cb) => cb(token))
  failedQueue = []
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const url = original?.url ?? ''

    if (
      !original ||
      error.response?.status !== 401 ||
      original._retry ||
      isAuthPath(url)
    ) {
      return Promise.reject(error)
    }

    const refresh = localStorage.getItem(REFRESH_KEY)
    if (!refresh) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push((token) => {
          if (!token) {
            reject(error)
            return
          }
          original.headers.Authorization = `Bearer ${token}`
          resolve(api(original))
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const { data } = await axios.post<{ access: string }>(`${baseURL}/token/refresh/`, {
        refresh,
      })
      localStorage.setItem(ACCESS_KEY, data.access)
      processQueue(data.access)
      original.headers.Authorization = `Bearer ${data.access}`
      return api(original)
    } catch {
      processQueue(null)
      localStorage.removeItem(ACCESS_KEY)
      localStorage.removeItem(REFRESH_KEY)
      authFailureHandler?.()
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  },
)
