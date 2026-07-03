export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  if (Number.isNaN(n)) return String(value)
  return new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

/** Fecha calendario (AAAA-MM-DD) sin desfase UTC; evita mostrar domingo cuando es lunes. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const dateOnly = iso.trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [y, m, d] = dateOnly.split('-').map(Number)
    const local = new Date(y, m - 1, d)
    if (Number.isNaN(local.getTime())) return iso
    return local.toLocaleDateString('es-HN')
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-HN')
}

/** Fecha y hora en zona Honduras (cobros, facturas, emisión de reportes). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Solo hora (HH:MM) desde ISO datetime. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    hour: '2-digit',
    minute: '2-digit',
  })
}
