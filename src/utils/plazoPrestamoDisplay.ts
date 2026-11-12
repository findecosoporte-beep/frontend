const SEMANAS_POR_MES_PLAZO = 4

export function plazoMesesDesdeReporte(input: {
  plazo?: number
  plazo_total?: number | null
  forma_pago?: string | null
}): string {
  const forma = (input.forma_pago ?? 'semanal').trim().toLowerCase()
  const plazo = input.plazo_total ?? input.plazo ?? 0
  if (plazo <= 0) return '—'
  const meses =
    forma === 'semanal'
      ? Math.round((plazo / SEMANAS_POR_MES_PLAZO) * 100) / 100
      : plazo
  if (Number.isInteger(meses)) return String(meses)
  return String(Number(meses.toFixed(2)))
}
