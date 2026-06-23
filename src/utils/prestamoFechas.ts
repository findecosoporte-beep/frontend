import type { DiaCobroCartera } from '@/types/api'

/** Alineado con Python date.weekday(): lunes=0 … domingo=6. */
const DIA_COBRO_WEEKDAY: Record<DiaCobroCartera, number> = {
  lunes: 0,
  martes: 1,
  miercoles: 2,
  jueves: 3,
  viernes: 4,
  sabado: 5,
  domingo: 6,
}

function parseIsoDate(iso: string): Date {
  const d = new Date(`${iso}T00:00:00`)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISODate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addMonths(baseDate: Date, months: number): Date {
  const next = new Date(baseDate)
  const day = next.getDate()
  next.setDate(1)
  next.setMonth(next.getMonth() + months)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(day, lastDay))
  return next
}

function pyWeekdayFromDate(d: Date): number {
  return (d.getDay() + 6) % 7
}

function alignWeekdayOnOrAfter(baseDate: Date, weekday: number): Date {
  const next = new Date(baseDate)
  next.setHours(0, 0, 0, 0)
  const daysAhead = (weekday - pyWeekdayFromDate(next) + 7) % 7
  if (daysAhead > 0) next.setDate(next.getDate() + daysAhead)
  return next
}

function primeraFechaCuotaProgramada(
  fechaEntrega: Date,
  formaPago: string,
  weekday: number,
): Date {
  const diaAntesCobro = (weekday + 6) % 7
  const entregaWd = pyWeekdayFromDate(fechaEntrega)
  let primera: Date
  if (entregaWd === diaAntesCobro) {
    primera = alignWeekdayOnOrAfter(fechaEntrega, weekday)
  } else {
    const diaCobroEstaSemana = new Date(fechaEntrega)
    diaCobroEstaSemana.setDate(
      diaCobroEstaSemana.getDate() - ((entregaWd - weekday + 7) % 7),
    )
    primera = new Date(diaCobroEstaSemana)
    primera.setDate(primera.getDate() + 7)
  }
  if (formaPago === 'quincenal') {
    const minimo = new Date(fechaEntrega)
    minimo.setDate(minimo.getDate() + 15)
    if (primera.getTime() < minimo.getTime()) {
      primera = alignWeekdayOnOrAfter(minimo, weekday)
    }
  }
  return primera
}

function periodsFromMonths(plazoMeses: number, formaPago: string): number {
  if (formaPago === 'semanal') return plazoMeses * 4
  if (formaPago === 'quincenal') return plazoMeses * 2
  return plazoMeses
}

function calculateFechaCuota(
  fechaEntrega: Date,
  periodo: number,
  formaPago: string,
  diaCobro?: DiaCobroCartera | null,
): Date {
  const weekday = diaCobro ? DIA_COBRO_WEEKDAY[diaCobro] : undefined
  if (weekday === undefined) {
    const next = new Date(fechaEntrega)
    if (formaPago === 'semanal') {
      next.setDate(next.getDate() + periodo * 7)
      return next
    }
    if (formaPago === 'quincenal') {
      next.setDate(next.getDate() + periodo * 15)
      return next
    }
    return addMonths(fechaEntrega, periodo)
  }

  if (formaPago === 'semanal') {
    const primera = primeraFechaCuotaProgramada(fechaEntrega, formaPago, weekday)
    const result = new Date(primera)
    result.setDate(result.getDate() + (periodo - 1) * 7)
    return result
  }
  if (formaPago === 'quincenal') {
    const primera = primeraFechaCuotaProgramada(fechaEntrega, formaPago, weekday)
    const result = new Date(primera)
    result.setDate(result.getDate() + (periodo - 1) * 14)
    return result
  }
  return alignWeekdayOnOrAfter(addMonths(fechaEntrega, periodo), weekday)
}

/** Fecha de la última cuota; misma lógica que el API Django. */
export function calculateFechaVencimiento(
  fechaEntregaIso: string,
  plazoMeses: number,
  formaPago: string,
  diaCobro?: DiaCobroCartera | null,
): string {
  if (!fechaEntregaIso || plazoMeses <= 0) return ''
  const entrega = parseIsoDate(fechaEntregaIso)
  if (diaCobro) {
    const periodos = periodsFromMonths(plazoMeses, formaPago)
    return toISODate(calculateFechaCuota(entrega, periodos, formaPago, diaCobro))
  }
  if (formaPago === 'semanal') {
    const next = new Date(entrega)
    next.setDate(next.getDate() + plazoMeses * 4 * 7)
    return toISODate(next)
  }
  if (formaPago === 'quincenal') {
    const next = new Date(entrega)
    next.setDate(next.getDate() + plazoMeses * 2 * 15)
    return toISODate(next)
  }
  return toISODate(addMonths(entrega, plazoMeses))
}
