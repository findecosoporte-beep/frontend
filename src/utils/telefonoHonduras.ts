/** Teléfono celular Honduras: código de país 504 + 8 dígitos locales. */

export const PREFIJO_TELEFONO_HN = '504'
export const TELEFONO_HN_DIGITOS = 8

export function soloDigitosTelefono(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Deja solo los 8 dígitos locales (sin +504). */
export function filtrarEntradaTelefonoHn(valor: string): string {
  let digits = soloDigitosTelefono(valor)
  if (digits.startsWith(PREFIJO_TELEFONO_HN)) {
    digits = digits.slice(PREFIJO_TELEFONO_HN.length)
  }
  return digits.slice(0, TELEFONO_HN_DIGITOS)
}

export function normalizarTelefonoHn(valor: string | null | undefined): string {
  return filtrarEntradaTelefonoHn(valor ?? '')
}

export function esTelefonoHnValido(valor: string | null | undefined): boolean {
  return normalizarTelefonoHn(valor).length === TELEFONO_HN_DIGITOS
}

/** Vacío o exactamente 8 dígitos locales. */
export function esTelefonoHnValidoOpcional(valor: string | null | undefined): boolean {
  const d = normalizarTelefonoHn(valor)
  return d.length === 0 || d.length === TELEFONO_HN_DIGITOS
}

export function mensajeTelefonoHnInvalido(): string {
  return 'Ingrese 8 dígitos del celular en Honduras (+504).'
}

export function etiquetaTelefonoHn(valor: string | null | undefined): string {
  const d = normalizarTelefonoHn(valor)
  if (!d) return '—'
  if (d.length <= 4) return `+504 ${d}`
  return `+504 ${d.slice(0, 4)}-${d.slice(4)}`
}
