import type { HistorialPagosCobrosFila } from '@/types/api'

export function parseMontoHistorial(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function sumarResumenFilas(filas: HistorialPagosCobrosFila[]): {
  registros: number
  totalCapital: number
  totalCobrado: number
} {
  let totalCapital = 0
  let totalCobrado = 0
  for (const fila of filas) {
    const capital = parseMontoHistorial(fila.capital)
    totalCapital += capital
    totalCobrado += parseMontoHistorial(fila.total)
  }
  return {
    registros: filas.length,
    totalCapital,
    totalCobrado,
  }
}

export function compararMontoHistorial(
  a: HistorialPagosCobrosFila,
  b: HistorialPagosCobrosFila,
  field: keyof HistorialPagosCobrosFila,
): number {
  return parseMontoHistorial(a[field] as string) - parseMontoHistorial(b[field] as string)
}

export interface HistorialQueryParams {
  modo: 'dia' | 'semana' | 'mes' | 'anio'
  fechaDia: string
  fechaInicioSemana: string
  fechaFinSemana: string
  mes: number
  anio: number
  cobradorFiltro: number | null
}

export function buildHistorialQueryString(params: HistorialQueryParams): string {
  const qs = new URLSearchParams({ modo: params.modo })
  if (params.modo === 'dia') {
    qs.set('fecha', params.fechaDia)
    qs.set('anio', String(new Date(`${params.fechaDia}T12:00:00`).getFullYear()))
  } else if (params.modo === 'semana') {
    qs.set('fecha_inicio', params.fechaInicioSemana)
    qs.set('fecha_fin', params.fechaFinSemana)
    qs.set('anio', String(new Date(`${params.fechaInicioSemana}T12:00:00`).getFullYear()))
  } else if (params.modo === 'mes') {
    qs.set('mes', String(params.mes))
    qs.set('anio', String(params.anio))
  } else {
    qs.set('anio', String(params.anio))
  }
  const cobradorId = normalizarCobradorFiltroId(params.cobradorFiltro)
  if (cobradorId != null) {
    qs.set('registrado_por', String(cobradorId))
  }
  return qs.toString()
}

export function normalizarCobradorFiltroId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return normalizarCobradorFiltroId((value as { value: unknown }).value)
  }
  const id = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

export function filtrarFilasPorCobradorSeleccionado(
  filas: HistorialPagosCobrosFila[],
  cobradorId: number | null | undefined,
  nombreCobrador?: string | null,
): HistorialPagosCobrosFila[] {
  const id = normalizarCobradorFiltroId(cobradorId)
  if (id == null) return filas

  const nombre = normalizarTextoBusqueda(nombreCobrador)

  return filas.filter((fila) => {
    if (normalizarCobradorFiltroId(fila.registrado_por) === id) return true
    if (!nombre) return false
    return normalizarTextoBusqueda(fila.registrado_por_nombre) === nombre
  })
}

export function validarRangoSemana(inicio: string, fin: string): string | null {
  if (!inicio || !fin) return 'Indique fecha de inicio y fecha final.'
  if (fin < inicio) return 'La fecha final no puede ser anterior a la de inicio.'
  return null
}

export interface FiltroColumnaHistorial {
  value: string | null
  matchMode?: string
}

export interface FiltrosTablaHistorial {
  global?: FiltroColumnaHistorial
  [campo: string]: FiltroColumnaHistorial | undefined
}

export type HistorialPagosCobrosFilaTabla = HistorialPagosCobrosFila & {
  _texto_cobrador: string
}

export function normalizarTextoBusqueda(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function textoCobradorBusqueda(fila: HistorialPagosCobrosFila): string {
  const partes = [
    fila.registrado_por_nombre?.trim(),
    fila.registrado_por_etiqueta?.trim(),
    fila.registrado_por != null ? String(fila.registrado_por) : '',
  ].filter(Boolean)
  return partes.join(' ')
}

export function enriquecerFilasHistorial(
  filas: HistorialPagosCobrosFila[],
): HistorialPagosCobrosFilaTabla[] {
  return filas.map((fila) => ({
    ...fila,
    _texto_cobrador: textoCobradorBusqueda(fila),
  }))
}

function contieneTexto(valor: unknown, filtro: string): boolean {
  const termino = normalizarTextoBusqueda(filtro)
  if (!termino) return true
  if (valor === null || valor === undefined) return false
  return normalizarTextoBusqueda(String(valor)).includes(termino)
}

function valorCampoFiltro(fila: HistorialPagosCobrosFilaTabla, campo: string): unknown {
  if (campo === '_texto_cobrador' || campo === 'registrado_por_nombre') {
    return fila._texto_cobrador
  }
  if (campo === 'registrado_en') {
    return fila.registrado_en || fila.cobrado_en || ''
  }
  if (campo === 'id_pago') {
    return fila.id_pago
  }
  return fila[campo as keyof HistorialPagosCobrosFila]
}

function filtroColumnaActivo(filtros: FiltrosTablaHistorial, campo: string): boolean {
  const valor = filtros[campo]?.value
  return valor != null && String(valor).trim() !== ''
}

export function hayFiltrosTablaHistorialActivos(
  filtros: FiltrosTablaHistorial,
  camposColumna: readonly string[],
): boolean {
  if (String(filtros.global?.value ?? '').trim()) return true
  return camposColumna.some((campo) => filtroColumnaActivo(filtros, campo))
}

export function filtrarFilasHistorial(
  filas: HistorialPagosCobrosFilaTabla[],
  filtros: FiltrosTablaHistorial,
  camposColumna: readonly string[],
  camposBusquedaGlobal: readonly string[],
): HistorialPagosCobrosFilaTabla[] {
  const global = String(filtros.global?.value ?? '').trim()
  const columnasActivas = camposColumna.filter((campo) => filtroColumnaActivo(filtros, campo))

  if (!global && columnasActivas.length === 0) {
    return filas
  }

  return filas.filter((fila) => {
    for (const campo of columnasActivas) {
      const termino = String(filtros[campo]?.value ?? '').trim()
      if (!contieneTexto(valorCampoFiltro(fila, campo), termino)) {
        return false
      }
    }

    if (global) {
      const coincide = camposBusquedaGlobal.some((campo) =>
        contieneTexto(valorCampoFiltro(fila, campo), global),
      )
      if (!coincide) return false
    }

    return true
  })
}
