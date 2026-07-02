/** Reglas de cálculo de préstamos (alineadas con `api.core.prestamo_calc`). */

export interface AmortizacionItem {
  periodo: number
  cuota: number
  capital: number
  interes: number
  saldo: number
}

export interface SimulacionPrestamoLocal {
  monto: number
  plazo: number
  forma_pago: string
  tasa_interes: number
  tasa_anual: number
  comision: number
  frecuencia_anual: number
  cuota_periodica: number
  total_interes: number
  comision_monto: number
  total_pagar: number
  amortizacion: AmortizacionItem[]
}

function frecuenciaAnual(formaPago: string): number {
  if (formaPago === 'quincenal') return 24
  if (formaPago === 'semanal') return 52
  return 12
}

function annualRateFromNominal(tasaNominalPct: number): number {
  return ((1 + tasaNominalPct / 100) ** 12 - 1) * 100
}

export function periodosDesdePlazo(plazo: number, formaPago: string): number {
  if (formaPago === 'semanal') return plazo
  if (formaPago === 'quincenal') return plazo * 2
  return plazo
}

/** Tasa semanal (%) según reglas FINDECO. */
export function tasaSemanalNegocio(semanas: number): number {
  if (semanas === 6 || semanas === 8 || semanas === 10 || semanas === 16) return 2.5
  return 10
}

/** Interés total del crédito (%) para préstamos semanales. */
export function interesTotalPctSemanal(semanas: number): number {
  return tasaSemanalNegocio(semanas) * semanas
}

export function tasaPeriodicaParaCalculo(
  tasaNominalPct: number,
  formaPago: string,
  plazo: number,
): number {
  if (formaPago === 'semanal') return tasaSemanalNegocio(plazo)
  if (formaPago === 'quincenal') return tasaNominalPct / 2
  return tasaNominalPct
}

export function roundMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function totalInteresDesdeCondiciones(
  monto: number,
  plazo: number,
  formaPago: string,
  tasaNominalPct: number,
): number {
  if (!Number.isFinite(monto) || monto <= 0 || plazo <= 0) return 0

  const periodos = periodosDesdePlazo(plazo, formaPago)
  const tasaPeriodica = tasaPeriodicaParaCalculo(tasaNominalPct, formaPago, plazo) / 100
  const capitalFijo = roundMoney2(monto / periodos)
  const interesFijo = roundMoney2(monto * tasaPeriodica)
  let saldo = monto
  let totalInteres = 0

  for (let periodo = 1; periodo <= periodos; periodo++) {
    let capital = capitalFijo
    if (periodo === periodos) capital = saldo
    saldo = roundMoney2(saldo - capital)
    if (saldo < 0) saldo = 0
    totalInteres += interesFijo
  }

  return roundMoney2(totalInteres)
}

export function etiquetaReglasTasaSemanal(semanas: number): string {
  if (semanas === 6) {
    return '6 semanas: 2.5% semanal (15% interés total).'
  }
  if (semanas === 8) {
    return '8 semanas: 2.5% semanal (20% interés total).'
  }
  if (semanas === 10) {
    return '10 semanas: 2.5% semanal (25% interés total).'
  }
  if (semanas === 16) {
    return '16 semanas: 2.5% semanal (40% interés total).'
  }
  return `${semanas} semanas: 10% semanal (${interesTotalPctSemanal(semanas)}% interés total).`
}

/** Simula cuota y tabla de amortización (misma lógica que `POST /prestamos/simular/`). */
export function simularPrestamo(params: {
  monto: number
  plazo: number
  tasa_interes: number
  forma_pago: string
  comision: number
}): SimulacionPrestamoLocal {
  const { monto, plazo, forma_pago, comision } = params
  const tasaNominalPct = params.tasa_interes

  const tasaAplicadaPct =
    forma_pago === 'semanal' ? tasaSemanalNegocio(plazo) : tasaNominalPct
  const tasaAnualPct =
    forma_pago === 'semanal' ? interesTotalPctSemanal(plazo) : annualRateFromNominal(tasaNominalPct)

  const periodos = periodosDesdePlazo(plazo, forma_pago)
  const tasaPeriodica = tasaPeriodicaParaCalculo(tasaNominalPct, forma_pago, plazo) / 100
  const capitalFijo = roundMoney2(monto / periodos)
  const interesFijo = roundMoney2(monto * tasaPeriodica)
  const cuota = roundMoney2(capitalFijo + interesFijo)

  let saldo = monto
  const amortizacion: AmortizacionItem[] = []
  let totalInteres = 0

  for (let periodo = 1; periodo <= periodos; periodo++) {
    let capital = capitalFijo
    let cuotaFinal = cuota
    const interes = interesFijo

    if (periodo === periodos) {
      capital = saldo
      cuotaFinal = roundMoney2(capital + interes)
    }

    saldo = roundMoney2(saldo - capital)
    if (saldo < 0) saldo = 0
    totalInteres += interes

    amortizacion.push({
      periodo,
      cuota: cuotaFinal,
      capital: roundMoney2(capital),
      interes,
      saldo,
    })
  }

  const comisionMonto = roundMoney2(monto * (comision / 100))

  return {
    monto: roundMoney2(monto),
    plazo: periodos,
    forma_pago,
    tasa_interes: roundMoney2(tasaAplicadaPct),
    tasa_anual: roundMoney2(tasaAnualPct),
    comision,
    frecuencia_anual: frecuenciaAnual(forma_pago),
    cuota_periodica: cuota,
    total_interes: roundMoney2(totalInteres),
    comision_monto: comisionMonto,
    total_pagar: roundMoney2(monto + roundMoney2(totalInteres) + comisionMonto),
    amortizacion,
  }
}
