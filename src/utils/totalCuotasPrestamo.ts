import type { ReporteIntegracionFila } from '@/types/api'

function cuotasEntreFechas(inicio?: string | null, fin?: string | null): number {
  if (!inicio?.trim() || !fin?.trim()) return 0
  const start = new Date(`${inicio.slice(0, 10)}T12:00:00`)
  const end = new Date(`${fin.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 86400000)))
}

function totalCuotasPrestamo(
  plazo: number,
  formaPago?: string | null,
  totalEnPlan?: number | null,
  plazoTotal?: number | null,
  fechas?: { inicio?: string | null; fin?: string | null },
): number {
  const candidatos: number[] = []

  if (totalEnPlan != null && totalEnPlan > 0) candidatos.push(totalEnPlan)
  if (plazoTotal != null && plazoTotal > 0) candidatos.push(plazoTotal)

  if (Number.isFinite(plazo) && plazo > 0) {
    const forma = (formaPago?.trim() || 'semanal').toLowerCase()
    candidatos.push(forma === 'quincenal' ? plazo * 2 : plazo)
  }

  const forma = (formaPago?.trim() || 'semanal').toLowerCase()
  if (forma === 'semanal' && fechas) {
    const porFechas = cuotasEntreFechas(fechas.inicio, fechas.fin)
    if (porFechas > 0) candidatos.push(porFechas)
  }

  if (!candidatos.length) return 0
  return Math.max(...candidatos)
}

export function totalCuotasDesdeReporte(item: ReporteIntegracionFila): number {
  let total = totalCuotasPrestamo(
    item.plazo ?? 0,
    item.forma_pago,
    item.total_cuotas_plan,
    item.plazo_total,
    { inicio: item.fecha_entrega, fin: item.fecha_vencimiento },
  )

  const cuotaActual = item.cuota_siguiente_numero ?? 0
  if (cuotaActual > total) total = cuotaActual

  const nums = item.cuotas_atrasadas_numeros?.trim()
  if (nums) {
    const maxAtrasada = nums
      .split(/[,;\s]+/)
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (maxAtrasada.length) {
      total = Math.max(total, ...maxAtrasada)
    }
  }

  return total
}

export function textoTotalCuotas(cantidad: number): string {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return '—'
  return `${cantidad} cuota${cantidad === 1 ? '' : 's'}`
}

export function textoCuotaDeTotal(cuotaActual: number, totalCuotas: number): string {
  if (totalCuotas > 0) {
    return `Cuota ${cuotaActual} de ${totalCuotas}`
  }
  return `Cuota #${cuotaActual}`
}
