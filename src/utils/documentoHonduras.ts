/** DNI (identidad) y RTN de Honduras. */

export const DNI_HN_DIGITOS = 13
export const RTN_HN_DIGITOS = 14

export function soloDigitosDocumento(valor: string): string {
  return valor.replace(/\D/g, '')
}

export function formatearDniHn(digitos: string): string {
  if (digitos.length <= 4) return digitos
  if (digitos.length <= 8) return `${digitos.slice(0, 4)}-${digitos.slice(4)}`
  return `${digitos.slice(0, 4)}-${digitos.slice(4, 8)}-${digitos.slice(8)}`
}

/** Deja solo dígitos (máx. 13) y devuelve formato XXXX-XXXX-XXXXX. */
export function filtrarEntradaDniHn(valor: string): string {
  const digits = soloDigitosDocumento(valor).slice(0, DNI_HN_DIGITOS)
  return formatearDniHn(digits)
}

export function normalizarDniHn(valor: string | null | undefined): string {
  const digits = soloDigitosDocumento(valor ?? '')
  return formatearDniHn(digits)
}

export function esDniHnValido(valor: string | null | undefined): boolean {
  return soloDigitosDocumento(valor ?? '').length === DNI_HN_DIGITOS
}

export function mensajeDniHnInvalido(): string {
  return 'Ingrese 13 dígitos del DNI (formato XXXX-XXXX-XXXXX).'
}

export function filtrarEntradaRtnHn(valor: string): string {
  return soloDigitosDocumento(valor).slice(0, RTN_HN_DIGITOS)
}

export function normalizarRtnHn(valor: string | null | undefined): string {
  return filtrarEntradaRtnHn(valor ?? '')
}

export function esRtnHnValido(valor: string | null | undefined): boolean {
  return soloDigitosDocumento(valor ?? '').length === RTN_HN_DIGITOS
}

export function esRtnHnValidoOpcional(valor: string | null | undefined): boolean {
  const d = soloDigitosDocumento(valor ?? '')
  return d.length === 0 || d.length === RTN_HN_DIGITOS
}

export function mensajeRtnHnInvalido(): string {
  return 'Ingrese 14 dígitos del RTN.'
}
