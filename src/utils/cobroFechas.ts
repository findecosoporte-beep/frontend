import type { DiaCobroCartera } from '@/types/api'

/** Alineado con Python `date.weekday()`: lunes=0 … domingo=6. */
const DIA_COBRO_PY_WEEKDAY: Record<DiaCobroCartera, number> = {
  lunes: 0,
  martes: 1,
  miercoles: 2,
  jueves: 3,
  viernes: 4,
  sabado: 5,
  domingo: 6,
}

function pyWeekdayFromIso(fechaIso: string): number {
  const d = new Date(`${fechaIso.slice(0, 10)}T12:00:00`)
  return (d.getDay() + 6) % 7
}

function isoDesdeDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function addDaysIso(fechaIso: string, days: number): string {
  const d = new Date(`${fechaIso.slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + days)
  return isoDesdeDate(d)
}

function alinearDiaCobroEnODespues(fechaIso: string, diaCobro: DiaCobroCartera): string {
  const cobroWd = DIA_COBRO_PY_WEEKDAY[diaCobro]
  const wd = pyWeekdayFromIso(fechaIso)
  const daysAhead = (cobroWd - wd + 7) % 7
  return addDaysIso(fechaIso, daysAhead)
}

/**
 * Primera fecha de cobro según entrega y día de cartera.
 * - Antes del día de cobro (p. ej. domingo): día de cobro inmediato (lunes).
 * - En el día de cobro o después: día de cobro de la semana siguiente.
 */
export function fechaPrimerCobroDesdeEntrega(
  fechaEntregaIso: string,
  diaCobro: DiaCobroCartera,
): string {
  const base = fechaEntregaIso.trim().slice(0, 10)
  const cobroWd = DIA_COBRO_PY_WEEKDAY[diaCobro]
  const entregaWd = pyWeekdayFromIso(base)
  const diaAntesCobro = (cobroWd + 6) % 7

  if (entregaWd === diaAntesCobro) {
    return alinearDiaCobroEnODespues(base, diaCobro)
  }

  const diaCobroEstaSemana = addDaysIso(base, -((entregaWd - cobroWd + 7) % 7))
  return addDaysIso(diaCobroEstaSemana, 7)
}

export function resolverDiaCobroOperativo(
  carteraDia?: DiaCobroCartera | '' | null,
  clienteDia?: DiaCobroCartera | '' | null,
): DiaCobroCartera | '' {
  return (carteraDia || clienteDia || '') as DiaCobroCartera | ''
}

/** Fecha de cuota y de cobro en el modal, según reglas de negocio FINDECO. */
export function fechaCobroModalNegocio(params: {
  fecha_entrega?: string | null
  fecha_programada?: string | null
  cuota_numero: number
  cartera_dia_cobro?: DiaCobroCartera | '' | null
  cliente_dia_cobro_semanal?: DiaCobroCartera | '' | null
  hoyIso?: string
}): string {
  const dia = resolverDiaCobroOperativo(params.cartera_dia_cobro, params.cliente_dia_cobro_semanal)
  const hoy = params.hoyIso ?? isoDesdeDate(new Date())

  if (!dia) {
    const prog = params.fecha_programada?.trim().slice(0, 10)
    return prog || hoy
  }

  let fechaCuota: string
  const entrega = params.fecha_entrega?.trim().slice(0, 10)
  const programada = params.fecha_programada?.trim().slice(0, 10)

  if (params.cuota_numero <= 1 && entrega) {
    fechaCuota = fechaPrimerCobroDesdeEntrega(entrega, dia)
  } else if (programada) {
    fechaCuota = alinearDiaCobroEnODespues(programada, dia)
  } else if (entrega) {
    const primera = fechaPrimerCobroDesdeEntrega(entrega, dia)
    fechaCuota = addDaysIso(primera, (params.cuota_numero - 1) * 7)
  } else {
    fechaCuota = alinearDiaCobroEnODespues(hoy, dia)
  }

  const proximaRuta = alinearDiaCobroEnODespues(hoy, dia)
  if (fechaCuota <= proximaRuta) {
    return proximaRuta
  }
  return fechaCuota
}
