import type { Pago, PrestamoCuotaRow } from '@/types/api'

import { abonadoPorCuotaDesdeMovimientos } from '@/utils/movimientosPago'

const CUOTA_PAGADA_TOLERANCIA = 0.01

/** Suma capital + interés + mora abonado por número de cuota (solo movimientos tipo cuota). */
export function abonadoPorCuotaDesdePagos(pagos: Pago[]): Map<number, number> {
  return abonadoPorCuotaDesdeMovimientos(pagos)
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

/** Parte del monto recibido que abona capital + interés. */
export function montoAbonoCapitalInteres(montoRecibido: number): number {
  return Math.max(0, Math.round(montoRecibido * 100) / 100)
}

/** Suma capital + interés + mora de TODOS los pagos del préstamo (incluye abono a capital). */
export function totalAbonadoPrestamo(pagos: Pago[]): number {
  return pagos.reduce(
    (s, p) => s + (Number(p.capital) || 0) + (Number(p.interes) || 0) + (Number(p.mora) || 0),
    0,
  )
}

/**
 * Cuotas cubiertas al consumir, en orden, TODO lo pagado en el préstamo (incluye
 * abonos a capital, sin importar con qué documento se registró cada pago).
 *
 * Sirve para saber qué cuotas ya no se pueden volver a cobrar cuando el cliente
 * adelantó varias cuotas de una sola vez.
 */
export function cuotasCubiertasPorPagoAcumulado(
  cuotas: PrestamoCuotaRow[],
  abonadoTotal: number,
): Set<number> {
  const cubiertas = new Set<number>()
  let acumuladoObjetivo = 0
  for (const cuota of [...cuotas].sort((a, b) => a.numero_cuota - b.numero_cuota)) {
    acumuladoObjetivo += Number(cuota.total_programado) || 0
    if (abonadoTotal >= acumuladoObjetivo - CUOTA_PAGADA_TOLERANCIA) {
      cubiertas.add(cuota.numero_cuota)
    } else {
      break
    }
  }
  return cubiertas
}
