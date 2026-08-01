import type { ReporteIntegracionFila } from '@/types/api'

export interface CobroResumenFila {
  numeroCuota: number
  numeroCuotaAnterior: number | null
  abonoAnterior: number
  montoCuotaProgramado: number
  totalAbonoMasCuota: number
  aCobrarHoy: number
  tieneAbonoAnterior: boolean
}

function num(value: string | number | null | undefined): number {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Abono de la cuota anterior + cuota programada actual (referencia en hoja de cobros). */
export function resumenCobroFila(fila: ReporteIntegracionFila): CobroResumenFila {
  const numeroCuota = fila.cuota_siguiente_numero ?? 1
  const capitalInteres = num(fila.cuota_siguiente_capital) + num(fila.cuota_siguiente_interes)
  const montoCuotaProgramado = num(
    fila.cuota_siguiente_monto_programado ?? (capitalInteres > 0 ? capitalInteres : fila.cuota),
  )
  const aCobrarHoy = num(fila.cuota_siguiente_monto ?? fila.cuota)
  const numeroCuotaAnterior =
    fila.cuota_anterior_numero != null ? fila.cuota_anterior_numero : numeroCuota > 1 ? numeroCuota - 1 : null

  let abonoAnterior = numeroCuota > 1 ? num(fila.cuota_anterior_abonado) : num(fila.cuota_siguiente_abonado)

  if (
    numeroCuota > 1 &&
    abonoAnterior <= 0.009 &&
    !fila.cuota_anterior_abonado &&
    Math.abs(aCobrarHoy - montoCuotaProgramado) < 0.02
  ) {
    abonoAnterior = num(fila.cuota)
  }

  const totalAbonoMasCuota = num(fila.total_abono_anterior_mas_cuota) || abonoAnterior + montoCuotaProgramado

  return {
    numeroCuota,
    numeroCuotaAnterior,
    abonoAnterior,
    montoCuotaProgramado,
    totalAbonoMasCuota,
    aCobrarHoy,
    tieneAbonoAnterior: numeroCuota > 1 || abonoAnterior > 0.009,
  }
}

/** Texto de cuota pendiente para pantalla de cobro. */
export function textoCuotaPendiente(input: {
  cuotaNumero?: number | null
  montoPendiente?: string | null
  montoProgramado?: string | null
  abonado?: string | null
  cuotasAtrasadas?: number
  cuotasAtrasadasNumeros?: string
}): string {
  const n = input.cuotaNumero
  const pendiente = Number.parseFloat(String(input.montoPendiente ?? ''))
  if (n == null || !Number.isFinite(pendiente) || pendiente <= 0) {
    return 'Sin cuota pendiente'
  }

  const programado = Number.parseFloat(String(input.montoProgramado ?? ''))
  const abonado = Number.parseFloat(String(input.abonado ?? '0'))
  const partes = [`Cuota #${n}`]

  if (Number.isFinite(programado) && programado > 0 && abonado > 0.009 && pendiente < programado - 0.009) {
    partes.push(`L ${pendiente.toFixed(2)} pendiente de L ${programado.toFixed(2)}`)
    partes.push(`(abonado L ${abonado.toFixed(2)})`)
  } else {
    partes.push(`L ${pendiente.toFixed(2)} pendiente`)
  }

  const atrasadas = input.cuotasAtrasadas ?? 0
  if (atrasadas > 0) {
    const nums = input.cuotasAtrasadasNumeros?.trim()
    partes.push(
      nums
        ? `${atrasadas} cuota(s) atrasada(s): ${nums}`
        : `${atrasadas} cuota(s) atrasada(s)`,
    )
  }

  return partes.join(' · ')
}
