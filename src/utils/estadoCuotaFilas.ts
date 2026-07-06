import type { Pago, PrestamoCuotaRow } from '@/types/api'

import {
  cuotaEstaPagada,
  cuotasCubiertasPorPagoAcumulado,
  totalAbonadoPrestamo,
} from '@/utils/cobroPago'
import {
  abonadoPorCuotaDesdeMovimientos,
  cuotaReferenciaDesdeMovimientos,
} from '@/utils/movimientosPago'

export interface FilaCuotaEstado {
  numero_cuota: number
  fecha_programada: string
  total_programado: string | number
  saldo_capital_programado: string | number
  capital_programado: string | number
  interes_programado: string | number
  estado: 'pendiente' | 'pagada'
  id_pago: number | null
  id_pago_factura: number | null
  cobrado_en: string | null
  fecha_pago: string | null
  documento: string | null
}

export function pagosVigentes(pagos: Pago[]): Pago[] {
  return pagos.filter((p) => !p.anulado)
}

export function ordenarPagosPrestamo(pagos: Pago[]): Pago[] {
  return [...pagos].sort((a, b) => {
    const ta = new Date(a.fecha_pago).getTime()
    const tb = new Date(b.fecha_pago).getTime()
    if (ta !== tb) return ta - tb
    return a.id_pago - b.id_pago
  })
}

/** Filas de cuotas con estado pagada/pendiente alineado a movimientos y abonos acumulados. */
export function buildFilasCuotaEstado(
  cuotas: PrestamoCuotaRow[],
  pagos: Pago[],
): FilaCuotaEstado[] {
  const pagosOrd = ordenarPagosPrestamo(pagosVigentes(pagos))
  const abonadoPorCuota = abonadoPorCuotaDesdeMovimientos(pagosOrd)
  const referenciaCuota = cuotaReferenciaDesdeMovimientos(pagosOrd)
  const abonadoTotal = totalAbonadoPrestamo(pagosOrd)
  const cubiertasPorAcumulado = cuotasCubiertasPorPagoAcumulado(cuotas, abonadoTotal)
  const ultimoPago = pagosOrd.at(-1)
  const pagoPorId = new Map(pagosOrd.map((p) => [p.id_pago, p]))

  function facturaRef(idPago: number | null): number | null {
    if (idPago == null) return null
    const pago = pagoPorId.get(idPago)
    return pago?.id_pago_factura ?? null
  }

  return [...cuotas]
    .sort((a, b) => a.numero_cuota - b.numero_cuota)
    .map((cuota) => {
      const abonado = abonadoPorCuota.get(cuota.numero_cuota) ?? 0
      const totalProg = Number(cuota.total_programado) || 0
      const ref = referenciaCuota.get(cuota.numero_cuota)
      const base = {
        numero_cuota: cuota.numero_cuota,
        fecha_programada: cuota.fecha_programada,
        total_programado: cuota.total_programado,
        saldo_capital_programado: cuota.saldo_capital_programado,
        capital_programado: cuota.capital_programado,
        interes_programado: cuota.interes_programado,
      }

      if (ref || cuotaEstaPagada(abonado, totalProg)) {
        const fuente = ref ?? {
          id_pago: ultimoPago?.id_pago ?? null,
          fecha_pago: ultimoPago?.fecha_pago ?? null,
          cobrado_en: ultimoPago?.cobrado_en ?? null,
          documento: `Cuota ${cuota.numero_cuota}`,
        }
        const idPago = fuente.id_pago
        return {
          ...base,
          estado: 'pagada' as const,
          id_pago: idPago,
          id_pago_factura: facturaRef(idPago),
          cobrado_en: fuente.cobrado_en,
          fecha_pago: fuente.fecha_pago,
          documento: fuente.documento,
        }
      }

      if (cubiertasPorAcumulado.has(cuota.numero_cuota) && ultimoPago) {
        return {
          ...base,
          estado: 'pagada' as const,
          id_pago: ultimoPago.id_pago,
          id_pago_factura: facturaRef(ultimoPago.id_pago),
          cobrado_en: ultimoPago.cobrado_en ?? null,
          fecha_pago: ultimoPago.fecha_pago,
          documento: `Cuota ${cuota.numero_cuota}`,
        }
      }

      return {
        ...base,
        estado: 'pendiente' as const,
        id_pago: null,
        id_pago_factura: null,
        cobrado_en: null,
        fecha_pago: null,
        documento: null,
      }
    })
}

export interface FilaPlanEstadoCuentaModal {
  numero_cuota: number
  fecha_programada: string
  fecha_cancelo: string | null
  hora_pago: string | null
  cobrado_en: string | null
  total_programado: number
  estado: string
  documento: string | null
  id_pago: number | null
  id_pago_factura: number | null
}

export function filasCuotaEstadoAModalPlan(filas: FilaCuotaEstado[]): FilaPlanEstadoCuentaModal[] {
  return filas.map((fila) => ({
    numero_cuota: fila.numero_cuota,
    fecha_programada: fila.fecha_programada,
    fecha_cancelo: fila.fecha_pago,
    hora_pago: null,
    cobrado_en: fila.cobrado_en,
    total_programado: Number(fila.total_programado) || 0,
    estado: fila.estado === 'pagada' ? 'Pagada' : 'Pendiente',
    documento: fila.documento,
    id_pago: fila.id_pago,
    id_pago_factura: fila.id_pago_factura,
  }))
}

export function pagoPorCuotaDesdeFilas(
  filas: FilaCuotaEstado[],
  pagos: Pago[],
): Map<number, Pago> {
  const pagosPorId = new Map(ordenarPagosPrestamo(pagosVigentes(pagos)).map((p) => [p.id_pago, p]))
  const mapa = new Map<number, Pago>()
  for (const fila of filas) {
    if (fila.id_pago == null) continue
    const pago = pagosPorId.get(fila.id_pago)
    if (pago) mapa.set(fila.numero_cuota, pago)
  }
  return mapa
}
