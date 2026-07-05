import type { Pago, PagoDistribucionLinea } from '@/types/api'

import { extractCuotaNumeroDocumento } from '@/utils/facturaPago'

export type TipoMovimientoPago = 'cuota' | 'abono_capital'

export interface MovimientoPago {
  tipo: TipoMovimientoPago
  id_pago: number
  fecha_pago: string
  cobrado_en: string | null
  numero_factura?: string | null
  cuota?: number
  abono_capital?: boolean
  parcial?: boolean
  capital?: string
  interes?: string
  mora?: string
  total: string
  documento?: string
}

function montoLinea(item: PagoDistribucionLinea | Record<string, unknown>): number {
  if (item.total != null && item.total !== '') return Number(item.total) || 0
  return (
    (Number(item.capital) || 0) +
    (Number(item.interes) || 0) +
    (Number(item.mora) || 0)
  )
}

export function movimientosDesdePago(pago: Pago): MovimientoPago[] {
  const base = {
    id_pago: pago.id_pago,
    fecha_pago: pago.fecha_pago,
    cobrado_en: pago.cobrado_en ?? null,
    numero_factura: pago.numero_factura ?? null,
  }
  const detalle = pago.detalle_distribucion ?? []
  if (detalle.length) {
    const movimientos: MovimientoPago[] = []
    for (const item of detalle) {
      if (item.abono_capital) {
        movimientos.push({
          ...base,
          tipo: 'abono_capital',
          abono_capital: true,
          capital: item.capital,
          interes: item.interes,
          mora: item.mora,
          total: String(montoLinea(item)),
          documento: 'Abono a capital',
        })
      } else if (item.cuota != null) {
        movimientos.push({
          ...base,
          tipo: 'cuota',
          cuota: item.cuota,
          parcial: item.parcial,
          capital: item.capital,
          interes: item.interes,
          mora: item.mora,
          total: String(montoLinea(item)),
          documento: `Cuota ${item.cuota}`,
        })
      }
    }
    if (movimientos.length) return movimientos
  }

  const numero = extractCuotaNumeroDocumento(pago.documento)
  const capital = Number(pago.capital) || 0
  const interes = Number(pago.interes) || 0
  const mora = Number(pago.mora) || 0
  const total = capital + interes + mora
  if (numero != null) {
    return [
      {
        ...base,
        tipo: 'cuota',
        cuota: numero,
        capital: String(capital),
        interes: String(interes),
        mora: String(mora),
        total: String(total),
        documento: pago.documento ?? `Cuota ${numero}`,
      },
    ]
  }
  const doc = (pago.documento ?? '').toLowerCase()
  if (total > 0 && doc.includes('abono') && doc.includes('capital')) {
    return [
      {
        ...base,
        tipo: 'abono_capital',
        abono_capital: true,
        capital: String(capital),
        interes: String(interes),
        mora: String(mora),
        total: String(total),
        documento: pago.documento ?? 'Abono a capital',
      },
    ]
  }
  return []
}

export function pagoTieneVariosMovimientos(pago: Pago): boolean {
  return movimientosDesdePago(pago).length > 1
}

export function abonadoPorCuotaDesdeMovimientos(pagos: Pago[]): Map<number, number> {
  const abonado = new Map<number, number>()
  for (const pago of pagos) {
    for (const mov of movimientosDesdePago(pago)) {
      if (mov.tipo !== 'cuota' || mov.cuota == null) continue
      const prev = abonado.get(mov.cuota) ?? 0
      abonado.set(mov.cuota, prev + (Number(mov.total) || 0))
    }
  }
  return abonado
}

export function abonosCapitalDesdePagos(pagos: Pago[]): MovimientoPago[] {
  const filas: MovimientoPago[] = []
  for (const pago of pagos) {
    for (const mov of movimientosDesdePago(pago)) {
      if (mov.tipo === 'abono_capital') filas.push(mov)
    }
  }
  return filas.sort((a, b) => {
    const ta = new Date(a.fecha_pago).getTime()
    const tb = new Date(b.fecha_pago).getTime()
    if (ta !== tb) return ta - tb
    return a.id_pago - b.id_pago
  })
}

export function cuotaReferenciaDesdeMovimientos(
  pagos: Pago[],
): Map<number, { id_pago: number; fecha_pago: string; cobrado_en: string | null; documento: string; parcial?: boolean }> {
  const mapa = new Map<
    number,
    { id_pago: number; fecha_pago: string; cobrado_en: string | null; documento: string; parcial?: boolean }
  >()
  for (const pago of pagos) {
    for (const mov of movimientosDesdePago(pago)) {
      if (mov.tipo !== 'cuota' || mov.cuota == null || mapa.has(mov.cuota)) continue
      mapa.set(mov.cuota, {
        id_pago: mov.id_pago,
        fecha_pago: mov.fecha_pago,
        cobrado_en: mov.cobrado_en,
        documento: mov.documento ?? `Cuota ${mov.cuota}`,
        parcial: mov.parcial,
      })
    }
  }
  return mapa
}
