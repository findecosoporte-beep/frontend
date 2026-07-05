import { isAxiosError, type AxiosError } from 'axios'

/** Extrae mensaje legible de errores DRF o del manejador `api.exceptions`. */
export function getApiErrorMessage(error: unknown, fallback = 'Error inesperado.'): string {
  if (error instanceof Error && !isAxiosError(error)) {
    return error.message || fallback
  }
  if (!error || typeof error !== 'object') return fallback
  const ax = error as AxiosError<{ detail?: string; error?: { message?: string }; [k: string]: unknown }>
  const data = ax.response?.data
  if (!data) return ax.message || fallback
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return fallback
  }
  if (typeof data === 'string') {
    if (data.includes('<!doctype html') || data.includes('<html')) {
      const status = ax.response?.status
      if (status === 404) {
        return 'El servidor no tiene este modulo disponible. Verifique que el backend este actualizado y desplegado.'
      }
      return fallback
    }
    return data
  }
  if (typeof data.error === 'object' && data.error && typeof data.error.message === 'string') {
    return data.error.message
  }
  if (typeof data.detail === 'string') return data.detail
  return fallback
}

/** Igual que getApiErrorMessage pero interpreta cuerpos Blob (p. ej. PDF/Excel con responseType blob). */
export async function getApiErrorMessageAsync(
  error: unknown,
  fallback = 'Error inesperado.',
): Promise<string> {
  if (error instanceof Error && !isAxiosError(error)) {
    return error.message || fallback
  }
  if (isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const text = await error.response.data.text()
      const trimmed = text.trimStart()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const json = JSON.parse(text) as {
          detail?: string
          error?: { message?: string }
        }
        return getApiErrorMessage({ response: { data: json, status: error.response.status } }, fallback)
      }
      if (trimmed.includes('<!doctype html') || trimmed.includes('<html')) {
        const status = error.response.status
        if (status === 502 || status === 504) {
          return 'El servidor tardó demasiado en generar el PDF. Intente de nuevo o use un periodo con menos datos.'
        }
        return fallback
      }
      if (trimmed) return trimmed.slice(0, 400)
    } catch {
      // continuar al fallback
    }
  }
  return getApiErrorMessage(error, fallback)
}

export { isAxiosError }
