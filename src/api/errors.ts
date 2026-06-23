import type { AxiosError } from 'axios'

/** Extrae mensaje legible de errores DRF o del manejador `api.exceptions`. */
export function getApiErrorMessage(error: unknown, fallback = 'Error inesperado.'): string {
  if (!error || typeof error !== 'object') return fallback
  const ax = error as AxiosError<{ detail?: string; error?: { message?: string }; [k: string]: unknown }>
  const data = ax.response?.data
  if (!data) return ax.message || fallback
  if (typeof data === 'string') return data
  if (typeof data.error === 'object' && data.error && typeof data.error.message === 'string') {
    return data.error.message
  }
  if (typeof data.detail === 'string') return data.detail
  return fallback
}
