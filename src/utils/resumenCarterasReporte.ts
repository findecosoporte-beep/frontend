import type { ReporteIntegracionFila, ReporteIntegracionResumen } from '@/types/api'

export type CarteraResumenListado = {
  clientes: number
  saldoPendiente: number
  cuotaCobrar: number
}

export function parseMontoReporte(value: string | number | null | undefined): number {
  const n = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Totales de una cartera desde el bloque `resumen` del reporte (rápido, sin recorrer filas). */
export function resumenListadoDesdeApi(
  resumen: ReporteIntegracionResumen,
  filasCount = 0,
): CarteraResumenListado {
  const clientes = resumen.prestamos ?? filasCount
  return {
    clientes: clientes > 0 ? clientes : filasCount,
    saldoPendiente: parseMontoReporte(resumen.total_saldo_actual),
    cuotaCobrar: parseMontoReporte(resumen.total_cuota),
  }
}

/** Totales por cartera (misma lógica que la hoja de cobros / pie TOTALES). */
export function resumenPorCarteraDesdeFilas(
  filas: ReporteIntegracionFila[],
  idsCarteraPermitidos?: Set<number>,
): Record<number, CarteraResumenListado> {
  const acc = new Map<number, CarteraResumenListado>()

  for (const fila of filas) {
    const id = fila.id_cartera
    if (id == null) continue
    if (idsCarteraPermitidos && !idsCarteraPermitidos.has(id)) continue

    const prev = acc.get(id) ?? { clientes: 0, saldoPendiente: 0, cuotaCobrar: 0 }
    prev.clientes += 1
    prev.saldoPendiente += parseMontoReporte(fila.saldo_actual)
    prev.cuotaCobrar += parseMontoReporte(fila.cuota_siguiente_monto ?? fila.cuota)
    acc.set(id, prev)
  }

  return Object.fromEntries(acc.entries())
}
