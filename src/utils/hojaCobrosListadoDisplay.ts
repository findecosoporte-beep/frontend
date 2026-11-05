import { formatDate, formatDateTime } from '@/utils/format'
import { plazoMesesDesdeReporte } from '@/utils/plazoPrestamoDisplay'
import type { ReporteIntegracionFila } from '@/types/api'

const MESES_HOJA = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
] as const

const DIAS_HOJA = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIÉRCOLES',
  'JUEVES',
  'VIERNES',
  'SÁBADO',
] as const

export function formatFechaHojaLegible(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso.toUpperCase()
  const dia = String(d.getDate()).padStart(2, '0')
  return `${DIAS_HOJA[d.getDay()]} ${dia} DE ${MESES_HOJA[d.getMonth()]} ${d.getFullYear()}`
}

export function formatNumeroHoja(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  if (Number.isNaN(n)) return String(value)
  return new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function valorMontoPrestamoHoja(fila: ReporteIntegracionFila): string {
  const raw = fila.monto ?? fila.saldo_inicial
  const texto = formatNumeroHoja(raw)
  return texto || '—'
}

export function valorPlazoMesesHoja(fila: ReporteIntegracionFila): string {
  return plazoMesesDesdeReporte(fila)
}

export function valorSaldoInicialHoja(fila: ReporteIntegracionFila): string {
  const texto = formatNumeroHoja(fila.saldo_inicial)
  return texto || '—'
}

export function valorSaldoPendienteHoja(fila: ReporteIntegracionFila): string {
  const texto = formatNumeroHoja(fila.saldo_actual)
  return texto || '—'
}

export function valorFechaInicialHoja(fila: ReporteIntegracionFila): string {
  const raw = fila.fecha_entrega?.trim()
  return raw ? formatDate(raw) : '—'
}

export function valorFechaFinalHoja(fila: ReporteIntegracionFila): string {
  const raw = fila.fecha_vencimiento?.trim()
  return raw ? formatDate(raw) : '—'
}

export function valorCuotaPendienteHoja(fila: ReporteIntegracionFila): string {
  const n = fila.cuota_siguiente_numero
  const monto = formatNumeroHoja(fila.cuota_siguiente_monto)
  if (n == null) return monto || '—'
  if (!monto) return `#${n}`
  return `#${n}  ${monto}`
}

export function hojaListadoTotalesDesdeFilas(filas: ReporteIntegracionFila[]): {
  cuota: number
  saldoPendiente: number
} {
  let cuota = 0
  let saldoPendiente = 0
  for (const f of filas) {
    const monto = f.cuota_siguiente_monto || f.cuota
    cuota += Number.parseFloat(String(monto ?? '')) || 0
    saldoPendiente += Number.parseFloat(String(f.saldo_actual ?? '')) || 0
  }
  return { cuota, saldoPendiente }
}

/** Celdas de una fila en el mismo orden que la tabla HTML de CobrosView. */
export function filaListadoHojaCobrosCeldas(fila: ReporteIntegracionFila, index: number): string[] {
  return [
    String(index + 1),
    String(fila.numero_prestamo ?? ''),
    String(fila.nombre_cliente ?? ''),
    valorMontoPrestamoHoja(fila),
    valorPlazoMesesHoja(fila),
    valorSaldoInicialHoja(fila),
    valorSaldoPendienteHoja(fila),
    valorFechaInicialHoja(fila),
    valorFechaFinalHoja(fila),
    valorCuotaPendienteHoja(fila),
    '',
  ]
}

export function filaTotalesListadoHojaCobros(filas: ReporteIntegracionFila[]): string[] {
  const { cuota, saldoPendiente } = hojaListadoTotalesDesdeFilas(filas)
  return [
    '',
    '',
    'TOTALES:',
    '',
    '',
    '',
    formatNumeroHoja(saldoPendiente),
    '',
    '',
    formatNumeroHoja(cuota),
    '',
  ]
}

export { formatDateTime }
