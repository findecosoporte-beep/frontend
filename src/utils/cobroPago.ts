import type { Pago } from '@/types/api'

import { extractCuotaNumeroDocumento } from '@/utils/facturaPago'

const CUOTA_PAGADA_TOLERANCIA = 0.01

/** Suma capital + interés + mora abonado por número de cuota. */
export function abonadoPorCuotaDesdePagos(pagos: Pago[]): Map<number, number> {
  const abonado = new Map<number, number>()
  for (const pg of pagos) {
    const numero = extractCuotaNumeroDocumento(pg.documento)
    if (numero == null) continue
    const prev = abonado.get(numero) ?? 0
    abonado.set(
      numero,
      prev + (Number(pg.capital) || 0) + (Number(pg.interes) || 0) + (Number(pg.mora) || 0),
    )
  }
  return abonado
}

export function cuotaEstaPagada(abonado: number, totalProgramado: number): boolean {
  return abonado >= totalProgramado - CUOTA_PAGADA_TOLERANCIA
}

/** Monto que aún falta por cubrir en una cuota (capital + interés programados). */
export function pendienteCuota(totalProgramado: number, abonado: number): number {
  const resto = totalProgramado - abonado
  if (resto <= CUOTA_PAGADA_TOLERANCIA) return 0
  return Math.round(resto * 100) / 100
}

/** Parte del monto recibido que abona capital + interés (excluye mora). */
export function montoAbonoCapitalInteres(montoRecibido: number, mora: number): number {
  return Math.max(0, Math.round((montoRecibido - mora) * 100) / 100)
}
