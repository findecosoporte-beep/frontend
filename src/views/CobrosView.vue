<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteUpdate, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Panel from 'primevue/panel'
import Select from 'primevue/select'
import Toolbar from 'primevue/toolbar'

import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { formatDate, formatMoney } from '@/utils/format'
import type {
  Cliente,
  HojaSemanalColumna,
  HojaSemanalCuotaCelda,
  HojaSemanalCuotasResponse,
  HojaSemanalFila,
  Pago,
  Paginated,
  Prestamo,
  PrestamoCuotaRow,
  ReporteIntegracionFila,
  ReporteIntegracionResponse,
  Zona,
} from '@/types/api'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const { canWritePagos } = usePermissions()
const hojaCobrosPrinting = ref(false)
const hojaCobrosZonaFiltro = ref<number | ''>('')
/** Filtro antes de imprimir hoja de cobros: '' = todos los estados */
const hojaCobrosEstadoFiltro = ref<
  | ''
  | 'pendiente_aprobacion'
  | 'activo'
  | 'pagado'
  | 'mora'
  | 'cancelado'
>('')

const clienteSearch = ref('')

const prestamoOptions = ref<{ id_prestamo: number; label: string }[]>([])
const usuarioOptions = ref<{ id_usuario: number; nombre: string }[]>([])
const prestamoMeta = ref<
  Array<{
    id_prestamo: number
    id_cliente: number
    id_zona: number | null
    dni: string
    nombre: string
    zona: string
    forma_pago: string
    numero_prestamo: string
    estado: string
  }>
>([])

const proximaCuotaSemanalLoading = ref(false)
const proximaCuotaSemanalInfo = ref<{
  numero_cuota: number
  fecha_programada: string
  capital_programado: number
  interes_programado: number
  total_programado: number
  saldo_capital_programado: number
} | null>(null)
const proximaCuotaSemanalMensaje = ref('')
const clienteMeta = ref<
  Array<{
    id_cliente: number
    dni: string
    nombre: string
    telefono: string
    direccion_residencia: string
    actividad_economica: string
  }>
>([])

const clienteForm = ref({
  nombre: '',
  dni: '',
  telefono: '',
  direccion_residencia: '',
  actividad_economica: '',
})

const prestamoForm = ref({
  numero_prestamo: '',
  id_cliente: null as number | null,
  id_usuario: null as number | null,
  monto: null as number | null,
  plazo: 12,
  tasa_interes: null as number | null,
  forma_pago: 'mensual',
  forma_desembolso: 'efectivo',
  comision: 0,
  fecha_entrega: '',
  estado: 'activo',
})

const hasClientSearchExecuted = ref(false)
const estadoCuentaVisible = ref(false)
const estadoCuentaLoading = ref(false)
const estadoCuentaError = ref('')
const estadoCuentaRows = ref<Pago[]>([])
const cuotasVisible = ref(false)
const cuotasLoading = ref(false)
const cuotasError = ref('')
const cuotasRows = ref<Array<{ periodo: number; fecha_limite: string; capital: number; interes: number; saldo: number }>>(
  [],
)
const cuotasPagosRegistrados = ref<Pago[]>([])
const cuotasPrestamoId = ref<number | null>(null)
const cuotasTotal = computed(() => cuotasRows.value.length)
const cuotasPagadasRows = computed(() => {
  const paidPeriods = new Set<number>()
  for (const pago of cuotasPagosRegistrados.value) {
    const match = (pago.documento ?? '').match(/cuota\s*(\d+)/i)
    if (match) paidPeriods.add(Number.parseInt(match[1], 10))
  }
  if (!paidPeriods.size) {
    return cuotasRows.value.slice(0, cuotasPagosRegistrados.value.length)
  }
  return cuotasRows.value.filter((item) => paidPeriods.has(item.periodo))
})
const cuotasAlertasRows = computed(() => {
  const paidPeriods = new Set(cuotasPagadasRows.value.map((item) => item.periodo))
  const today = getTodayISO()
  return cuotasRows.value
    .filter((item) => !paidPeriods.has(item.periodo) && item.fecha_limite < today)
    .map((item) => ({
      ...item,
      dias_atraso: Math.max(0, calculateDaysDiff(item.fecha_limite, today)),
      mora_sugerida: Number((item.capital * 0.02).toFixed(2)),
    }))
})
const cajaVisible = ref(false)
const cajaLoading = ref(false)
const cajaSaving = ref(false)
const cajaError = ref('')
const estadoCuentaResumen = ref({
  totalPagos: 0,
  totalCapital: 0,
  totalInteres: 0,
  totalMora: 0,
  tieneMoraVigente: false,
  tuvoMoraPagada: false,
  diasMora: 0,
  estadoPrestamo: '',
})
const cajaForm = ref({
  id_prestamo: null as number | null,
  cliente: '',
  dni: '',
  cuota_numero: 0,
  fecha_pago: '',
  capital: 0,
  interes: 0,
  mora: 0,
  saldo: 0,
})
const cajaFormError = ref('')
const searchResult = ref<{
  id_cliente: number
  nombre: string
  dni: string
  telefono: string
  direccion_residencia: string
  actividad_economica: string
  hasPrestamo: boolean
  prestamoId: number | null
  prestamoLabel: string | null
} | null>(null)
const form = ref({
  id_prestamo: null as number | null,
  fecha_pago: '',
  documento: '',
  capital: null as number | null,
  interes: null as number | null,
  mora: 0,
  saldo: null as number | null,
})

function getTodayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function shiftCalendarDaysFromIso(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  d.setDate(d.getDate() + deltaDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function inicializarRangoHojaSemanalPorDefecto() {
  const hoy = getTodayISO()
  hojaFechaCuotaDesde.value = shiftCalendarDaysFromIso(hoy, -42)
  hojaFechaCuotaHasta.value = shiftCalendarDaysFromIso(hoy, 56)
}

const hojaFechaCuotaDesde = ref('')
const hojaFechaCuotaHasta = ref('')
const hojaIdZonaFiltro = ref<number | ''>('')
const hojaZonas = ref<Zona[]>([])
const hojaLoading = ref(false)
const hojaError = ref('')
const hojaColumnas = ref<HojaSemanalColumna[]>([])
const hojaFilas = ref<HojaSemanalFila[]>([])
const hojaCargadoOk = ref(false)

const zonaHojaOpciones = computed(() => [
  { label: 'Todas las zonas', value: '' as const },
  ...hojaZonas.value.map((z) => ({ label: z.nombre, value: z.id_zona as number })),
])

const zonaImpresionOpciones = computed(() => [
  { label: 'Todas las zonas', value: '' as const },
  ...hojaZonas.value.map((z) => ({ label: z.nombre, value: z.id_zona as number })),
])

const estadoImpresionOpciones = computed(() => [
  { label: 'Todos los estados', value: '' as const },
  { label: 'Pendiente aprobación', value: 'pendiente_aprobacion' as const },
  { label: 'Activo', value: 'activo' as const },
  { label: 'Pagado', value: 'pagado' as const },
  { label: 'Mora', value: 'mora' as const },
  { label: 'Cancelado', value: 'cancelado' as const },
])

async function cargarCatalogoZonasHoja() {
  try {
    const todos: Zona[] = []
    let nextUrl: string | null = '/zonas/?page_size=100'
    while (nextUrl) {
      const response = await api.get<Paginated<Zona>>(nextUrl)
      const pg: Paginated<Zona> = response.data
      todos.push(...pg.results)
      nextUrl = pg.next
    }
    hojaZonas.value = todos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  } catch {
    hojaZonas.value = []
  }
}

async function cargarHojaSemanalCuotas() {
  hojaLoading.value = true
  hojaError.value = ''
  hojaCargadoOk.value = false
  try {
    if (!hojaFechaCuotaDesde.value.trim() || !hojaFechaCuotaHasta.value.trim()) {
      hojaError.value = 'Indica fecha de cuotas desde y hasta.'
      return
    }
    const qs = new URLSearchParams({
      fecha_cuota_desde: hojaFechaCuotaDesde.value.trim(),
      fecha_cuota_hasta: hojaFechaCuotaHasta.value.trim(),
    })
    if (hojaIdZonaFiltro.value !== '' && hojaIdZonaFiltro.value != null) {
      qs.set('id_zona', String(hojaIdZonaFiltro.value))
    }
    const { data } = await api.get<HojaSemanalCuotasResponse>(`/pagos/hoja-semanal-cuotas/?${qs.toString()}`)
    hojaColumnas.value = data.columnas ?? []
    hojaFilas.value = data.filas ?? []
    hojaCargadoOk.value = true
  } catch (e) {
    hojaColumnas.value = []
    hojaFilas.value = []
    hojaError.value = getApiErrorMessage(e)
    toast.add({ severity: 'error', summary: 'Hoja semanal', detail: hojaError.value, life: 6000 })
  } finally {
    hojaLoading.value = false
  }
}

function celdaHoja(fila: HojaSemanalFila, fechaCue: string): HojaSemanalCuotaCelda | null {
  return fila.cuotas[fechaCue] ?? null
}

function abrirRegistroCuotaDesdeHoja(fila: HojaSemanalFila, fechaCue: string) {
  if (!canWritePagos.value) return
  const celda = celdaHoja(fila, fechaCue)
  if (!celda || celda.pagado) return
  cajaFormError.value = ''
  cajaError.value = ''
  cajaVisible.value = true
  searchResult.value = {
    id_cliente: fila.id_cliente ?? 0,
    nombre: fila.nombre_cliente,
    dni: fila.dni_cliente,
    telefono: 'N/A',
    direccion_residencia: 'N/A',
    actividad_economica: '',
    hasPrestamo: true,
    prestamoId: fila.id_prestamo,
    prestamoLabel: `${fila.numero_prestamo} — ${filasEstadoBonito(fila.estado_prestamo)}`,
  }
  const cap = Number(celda.capital_programado)
  const inte = Number(celda.interes_programado)
  const saldo = Number(celda.saldo_capital_programado)
  cajaForm.value = {
    id_prestamo: fila.id_prestamo,
    cliente: fila.nombre_cliente,
    dni: fila.dni_cliente,
    cuota_numero: celda.numero_cuota,
    fecha_pago: getTodayISO(),
    capital: cap,
    interes: inte,
    mora: 0,
    saldo,
  }
}

function filasEstadoBonito(estado: string): string {
  switch (estado) {
    case 'activo':
      return 'activo'
    case 'mora':
      return 'en mora'
    case 'pendiente_aprobacion':
      return 'pendiente'
    default:
      return estado
  }
}

function calculateDaysDiff(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`)
  const to = new Date(`${toISO}T00:00:00`)
  const diff = to.getTime() - from.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

async function abrirFacturaPago(idPago: number, ticketFormat: '58' | '80' = '58') {
  const response = await api.get(`/pagos/${idPago}/factura-pdf/?ticket=${ticketFormat}`, {
    responseType: 'blob',
  })
  const pdfBlob = new Blob([response.data], { type: 'application/pdf' })
  const pdfUrl = URL.createObjectURL(pdfBlob)
  const pdfWindow = window.open(pdfUrl, '_blank')
  if (pdfWindow) {
    setTimeout(() => {
      pdfWindow.focus()
      pdfWindow.print()
    }, 700)
  }
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 15000)
}

function extractCuotaFromDocumento(documento: string | null | undefined): number | null {
  if (!documento) return null
  const match = documento.match(/cuota\s*(\d+)/i)
  if (!match) return null
  const cuota = Number.parseInt(match[1], 10)
  return Number.isFinite(cuota) ? cuota : null
}

const cajaTotalCobrar = computed(() => {
  const c = Number(cajaForm.value.capital) || 0
  const i = Number(cajaForm.value.interes) || 0
  const m = Number(cajaForm.value.mora) || 0
  return c + i + m
})

/**
 * Calcula la cuota pendiente de cobrar: GET plan por préstamo y GET pagos; primera cuota del plan sin "Cuota N" en pagos.
 * @see cargarProximaCuotaSemanalParaPrestamo UI: bloque "Cuota semanal a pagar" tras buscar cliente
 */
async function cargarProximaCuotaSemanalParaPrestamo(prestamoId: number | null) {
  proximaCuotaSemanalInfo.value = null
  proximaCuotaSemanalMensaje.value = ''
  if (prestamoId == null) return
  const meta = prestamoMeta.value.find((p) => p.id_prestamo === prestamoId)
  if (!meta || meta.forma_pago !== 'semanal') return

  proximaCuotaSemanalLoading.value = true
  try {
    const { data: cuotasData } = await api.get<Paginated<PrestamoCuotaRow>>(
      `/prestamo-cuotas/?id_prestamo=${prestamoId}&page_size=500&ordering=numero_cuota`,
    )
    const cuotas = cuotasData.results
    if (!cuotas.length) {
      proximaCuotaSemanalMensaje.value =
        'Préstamo semanal sin plan de cuotas en el sistema. Revisa el préstamo o usa la hoja semanal.'
      return
    }
    const { data: pagosData } = await api.get<Paginated<Pago>>(`/pagos/?id_prestamo=${prestamoId}&page_size=500`)
    const paid = new Set<number>()
    for (const p of pagosData.results) {
      const n = extractCuotaFromDocumento(p.documento)
      if (n != null) paid.add(n)
    }
    const siguiente = cuotas.find((row) => !paid.has(row.numero_cuota))
    if (!siguiente) {
      proximaCuotaSemanalMensaje.value = 'Todas las cuotas de este préstamo ya figuran pagadas.'
      return
    }
    proximaCuotaSemanalInfo.value = {
      numero_cuota: siguiente.numero_cuota,
      fecha_programada: siguiente.fecha_programada,
      capital_programado: Number(siguiente.capital_programado),
      interes_programado: Number(siguiente.interes_programado),
      total_programado: Number(siguiente.total_programado),
      saldo_capital_programado: Number(siguiente.saldo_capital_programado),
    }
  } catch (e) {
    proximaCuotaSemanalMensaje.value = getApiErrorMessage(e, 'No se pudo cargar la cuota.')
  } finally {
    proximaCuotaSemanalLoading.value = false
  }
}

function parseQueryNumber(value: unknown): number | null {
  let v = value
  if (Array.isArray(v)) v = v[0]
  if (typeof v !== 'string') return null
  const parsed = Number.parseFloat(v.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function firstQueryString(query: RouteLocationNormalized['query'], key: string): string {
  const raw = query[key]
  if (raw == null) return ''
  const s = Array.isArray(raw) ? raw.find((x): x is string => typeof x === 'string') : raw
  return typeof s === 'string' ? s.trim() : ''
}

async function resolverClientePorPrestamo(pid: number): Promise<{ nombre: string; dni: string }> {
  const row = prestamoMeta.value.find((p) => p.id_prestamo === pid)
  if (row) return { nombre: row.nombre, dni: row.dni }
  const { data: pr } = await api.get<Prestamo>(`/prestamos/${pid}/`)
  const { data: cl } = await api.get<Cliente>(`/clientes/${pr.id_cliente}/`)
  return { nombre: cl.nombre ?? 'Cliente', dni: cl.dni ?? '' }
}

async function fetchAllPages<T>(initialPath: string): Promise<T[]> {
  const items: T[] = []
  let nextUrl: string | null = initialPath
  while (nextUrl) {
    const response: { data: Paginated<T> } = await api.get<Paginated<T>>(nextUrl)
    const page: Paginated<T> = response.data
    items.push(...page.results)
    nextUrl = page.next
  }
  return items
}

async function loadPrestamos() {
  const [prestamos, clientes, usuarios] = await Promise.all([
    fetchAllPages<Prestamo>('/prestamos/?page_size=200'),
    fetchAllPages<Cliente>('/clientes/?page_size=200'),
    fetchAllPages<{ id_usuario: number; nombre: string }>('/usuarios/?page_size=200'),
  ])
  const clientesById = new Map(
    clientes.map((cliente) => [cliente.id_cliente, cliente] as const),
  )
  clienteMeta.value = clientes.map((cliente) => ({
    id_cliente: cliente.id_cliente,
    dni: cliente.dni ?? '',
    nombre: cliente.nombre ?? 'Cliente',
    telefono: cliente.telefono ?? '',
    direccion_residencia: cliente.direccion_residencia ?? '',
    actividad_economica: cliente.actividad_economica ?? '',
  }))
  usuarioOptions.value = usuarios.map((usuario) => ({
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
  }))

  prestamoMeta.value = prestamos.map((prestamo) => {
    const cliente = clientesById.get(prestamo.id_cliente)
    return {
      id_prestamo: prestamo.id_prestamo,
      id_cliente: prestamo.id_cliente,
      id_zona: prestamo.id_zona ?? null,
      dni: cliente?.dni ?? '',
      nombre: cliente?.nombre ?? 'Cliente',
      zona: (prestamo.zona?.nombre ?? prestamo.sucursal ?? '').trim(),
      forma_pago: prestamo.forma_pago ?? 'mensual',
      numero_prestamo: prestamo.numero_prestamo ?? '',
      estado: prestamo.estado ?? '',
    }
  })

  prestamoOptions.value = prestamos.map((prestamo) => {
    const cliente = clientesById.get(prestamo.id_cliente)
    const dni = cliente?.dni ?? 'Sin DNI'
    const nombre = cliente?.nombre ?? 'Cliente'
    return {
      id_prestamo: prestamo.id_prestamo,
      label: `${prestamo.numero_prestamo} (#${prestamo.id_prestamo}) - ${nombre} [DNI: ${dni}]`,
    }
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function imprimirHojaCobrosPrestamos() {
  if (!prestamoMeta.value.length) {
    toast.add({ severity: 'warn', summary: 'Hoja de cobros', detail: 'No hay préstamos cargados para imprimir.', life: 4000 })
    return
  }
  const zonaSeleccionadaId = hojaCobrosZonaFiltro.value === '' ? null : Number(hojaCobrosZonaFiltro.value)
  const zonaSeleccionadaNombre =
    zonaSeleccionadaId == null ? 'Todas las zonas' : hojaZonas.value.find((z) => z.id_zona === zonaSeleccionadaId)?.nombre ?? 'Zona'
  const estadoFiltro = hojaCobrosEstadoFiltro.value
  const estadoImpresionLabel =
    estadoFiltro === ''
      ? 'Todos los estados'
      : estadoImpresionOpciones.value.find((o) => o.value === estadoFiltro)?.label ?? estadoFiltro

  const prestamosFiltrados = prestamoMeta.value.filter((p) => {
    const okZona = zonaSeleccionadaId == null || p.id_zona === zonaSeleccionadaId
    const okEstado = estadoFiltro === '' || p.estado === estadoFiltro
    return okZona && okEstado
  })
  if (!prestamosFiltrados.length) {
    toast.add({
      severity: 'warn',
      summary: 'Hoja de cobros',
      detail:
        zonaSeleccionadaId != null && estadoFiltro !== ''
          ? 'No hay préstamos para la zona y el estado seleccionados.'
          : zonaSeleccionadaId != null
            ? 'No hay préstamos para la zona seleccionada.'
            : estadoFiltro !== ''
              ? 'No hay préstamos con el estado seleccionado.'
              : 'No hay préstamos que coincidan con los filtros.',
      life: 4000,
    })
    return
  }

  hojaCobrosPrinting.value = true
  try {
    let numeroImpresion: number | null = null
    try {
      const { data } = await api.post<{ numero_impresion: number }>(
        '/prestamos/registrar-impresion-hoja-cobros/',
        { total_registros: prestamosFiltrados.length },
      )
      numeroImpresion = Number(data.numero_impresion)
    } catch (e) {
      toast.add({
        severity: 'warn',
        summary: 'Hoja de cobros',
        detail: `No se pudo guardar el correlativo en BD: ${getApiErrorMessage(e)}`,
        life: 5000,
      })
    }
    const reporteMap = new Map<
      number,
      { cuotaNumero: number | null; fechaCobro: string | null; montoCobrar: number | null }
    >()
    try {
      const qs = new URLSearchParams()
      if (zonaSeleccionadaId != null) qs.set('id_zona', String(zonaSeleccionadaId))
      if (estadoFiltro) qs.set('estado', estadoFiltro)
      const url = qs.toString() ? `/prestamos/reporte-integracion/?${qs.toString()}` : '/prestamos/reporte-integracion/'
      const { data } = await api.get<ReporteIntegracionResponse>(url)
      for (const row of data.filas ?? []) {
        const monto = row.cuota_siguiente_monto != null ? Number.parseFloat(String(row.cuota_siguiente_monto)) : null
        reporteMap.set(row.id_prestamo, {
          cuotaNumero: row.cuota_siguiente_numero ?? null,
          fechaCobro: row.cuota_siguiente_fecha ?? null,
          montoCobrar: Number.isFinite(monto ?? Number.NaN) ? monto : null,
        })
      }
    } catch {
      // Si falla el reporte, igual imprimimos hoja base sin bloquear operación.
    }

    const rows = [...prestamosFiltrados]
      .sort((a, b) => a.numero_prestamo.localeCompare(b.numero_prestamo, 'es', { numeric: true }))
      .map((p, index) => {
        const forma = p.forma_pago === 'semanal' ? 'Semanal' : p.forma_pago === 'quincenal' ? 'Quincenal' : 'Mensual'
        const estado = p.estado || '—'
        const zona = p.zona || '—'
        const rep = reporteMap.get(p.id_prestamo)
        const cuotaNumero = rep?.cuotaNumero ?? null
        const fechaCobro = rep?.fechaCobro ?? null
        const montoCobrar = rep?.montoCobrar ?? null
        return `<tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(p.numero_prestamo || '—')}</td>
          <td>${escapeHtml(p.nombre || 'Cliente')}</td>
          <td>${escapeHtml(p.dni || '—')}</td>
          <td>${escapeHtml(zona)}</td>
          <td>${escapeHtml(forma)}</td>
          <td>${escapeHtml(estado)}</td>
          <td>${cuotaNumero != null ? escapeHtml(String(cuotaNumero)) : '—'}</td>
          <td>${fechaCobro ? escapeHtml(formatDate(fechaCobro)) : '—'}</td>
          <td>${montoCobrar != null ? escapeHtml(formatMoney(montoCobrar)) : '—'}</td>
          <td></td>
          <td></td>
        </tr>`
      })
      .join('')

    const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Hoja de cobros</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 18px; color: #111827; }
          h1 { margin: 0 0 4px; font-size: 18px; }
          .meta { margin: 0 0 12px; font-size: 12px; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #9ca3af; padding: 5px 6px; }
          th { background: #f3f4f6; text-align: left; }
          td { vertical-align: middle; }
          @media print { body { margin: 8px; } }
        </style>
      </head>
      <body>
        <h1>Hoja de cobros - Todos los préstamos</h1>
        <p class="meta">Impresión N.º ${numeroImpresion ?? 'N/A'} | Generado: ${escapeHtml(new Date().toLocaleString())} | Zona: ${escapeHtml(zonaSeleccionadaNombre)} | Estado: ${escapeHtml(estadoImpresionLabel)} | Registros: ${prestamosFiltrados.length}</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Número préstamo</th>
              <th>Cliente</th>
              <th>DNI</th>
              <th>Zona</th>
              <th>Forma pago</th>
              <th>Estado</th>
              <th># Cuota</th>
              <th>Fecha cobro</th>
              <th>Monto a cobrar</th>
              <th>Firma</th>
              <th>Observación</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>`

    const win = window.open('', '_blank', 'width=1200,height=820')
    if (!win) {
      toast.add({ severity: 'error', summary: 'Hoja de cobros', detail: 'El navegador bloqueó la ventana de impresión.', life: 5000 })
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  } finally {
    hojaCobrosPrinting.value = false
  }
}

function resetClienteForm() {
  clienteForm.value = {
    nombre: '',
    dni: '',
    telefono: '',
    direccion_residencia: '',
    actividad_economica: '',
  }
}

function resetPrestamoForm() {
  prestamoForm.value = {
    numero_prestamo: '',
    id_cliente: clienteMeta.value[0]?.id_cliente ?? null,
    id_usuario: usuarioOptions.value[0]?.id_usuario ?? null,
    monto: null,
    plazo: 12,
    tasa_interes: null,
    forma_pago: 'mensual',
    forma_desembolso: 'efectivo',
    comision: 0,
    fecha_entrega: getTodayISO(),
    estado: 'activo',
  }
}

function openCreateFromQuery() {
  const queryPrestamo = parseQueryNumber(route.query.id_prestamo)
  const queryCapital = parseQueryNumber(route.query.capital)
  const queryInteres = parseQueryNumber(route.query.interes)
  const querySaldo = parseQueryNumber(route.query.saldo)
  const queryFecha = typeof route.query.fecha_pago === 'string' ? route.query.fecha_pago : ''

  clienteSearch.value = ''
  hasClientSearchExecuted.value = true
  searchResult.value = null
  form.value = {
    id_prestamo: queryPrestamo ?? prestamoOptions.value[0]?.id_prestamo ?? null,
    fecha_pago: queryFecha,
    documento: '',
    capital: queryCapital,
    interes: queryInteres,
    mora: 0,
    saldo: querySaldo,
  }
}

/** Deep link desde integración préstamos: abre diálogo caja listo para cobrar. */
async function aplicarDeepLinkIntegracionDesdeQuery(
  query: RouteLocationNormalized['query'],
): Promise<boolean> {
  const pid = parseQueryNumber(query.id_prestamo)
  const cuotaN = parseQueryNumber(query.cuota)
  const capital = parseQueryNumber(query.capital)
  const interes = parseQueryNumber(query.interes)
  const saldo = parseQueryNumber(query.saldo)
  const clienteQs = firstQueryString(query, 'cliente')

  if (pid == null || cuotaN == null || capital == null || interes == null || saldo == null) {
    toast.add({
      severity: 'warn',
      summary: 'Enlace incompleto',
      detail:
        'Faltan datos para abrir cobro desde integración. Vuelve a usar «Ir a cobrar» desde la hoja semanal o completa los datos en Cobros.',
      life: 5000,
    })
    return false
  }

  let dniResolved = ''
  let nombreResolved = 'Cliente'

  try {
    const resolved = await resolverClientePorPrestamo(pid)
    nombreResolved = resolved.nombre
    dniResolved = resolved.dni
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Préstamo',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
    return false
  }

  const clienteNombre = clienteQs || nombreResolved

  cajaFormError.value = ''
  cajaError.value = ''
  cajaForm.value = {
    id_prestamo: pid,
    cliente: clienteNombre,
    dni: dniResolved,
    cuota_numero: cuotaN,
    fecha_pago: getTodayISO(),
    capital,
    interes,
    mora: 0,
    saldo,
  }
  cajaVisible.value = true
  return true
}

async function consumirDeepLinkIntegracionEnQuery(targetRoute?: RouteLocationNormalized) {
  const r = targetRoute ?? route
  if (String(r.query.fromIntegracion) !== '1') return

  const nextQuery = { ...r.query }
  delete nextQuery.fromIntegracion
  delete nextQuery.id_prestamo
  delete nextQuery.cuota
  delete nextQuery.capital
  delete nextQuery.interes
  delete nextQuery.saldo
  delete nextQuery.cliente

  if (!canWritePagos.value) {
    toast.add({ severity: 'warn', summary: 'Cobros', detail: 'Tu rol no puede registrar cobros desde aquí.', life: 4000 })
    await router.replace({ path: r.path, query: nextQuery })
    return
  }
  await aplicarDeepLinkIntegracionDesdeQuery(r.query)
  await router.replace({ path: r.path, query: nextQuery })
}

onBeforeRouteUpdate(async (to) => {
  if (String(to.query.fromIntegracion) !== '1') return
  await consumirDeepLinkIntegracionEnQuery(to)
})

async function confirmarPagoCuota() {
  if (cajaForm.value.id_prestamo == null) return
  cajaFormError.value = ''
  if (cajaForm.value.capital < 0 || cajaForm.value.interes < 0 || cajaForm.value.mora < 0 || cajaForm.value.saldo < 0) {
    cajaFormError.value = 'Los montos no pueden ser negativos.'
    return
  }
  cajaSaving.value = true
  try {
    const { data: pagosData } = await api.get<Paginated<Pago>>(
      `/pagos/?id_prestamo=${cajaForm.value.id_prestamo}&page_size=500`,
    )
    const cuotaDuplicada = pagosData.results.some((item) => {
      const cuota = extractCuotaFromDocumento(item.documento)
      return cuota === cajaForm.value.cuota_numero
    })
    if (cuotaDuplicada) {
      cajaFormError.value = `La cuota #${cajaForm.value.cuota_numero} ya fue registrada.`
      return
    }

    const { data: pagoCreado } = await api.post<Pago>('/pagos/', {
      id_prestamo: cajaForm.value.id_prestamo,
      fecha_pago: cajaForm.value.fecha_pago,
      documento: `Cuota ${cajaForm.value.cuota_numero}`,
      capital: cajaForm.value.capital,
      interes: cajaForm.value.interes,
      mora: cajaForm.value.mora,
      saldo: cajaForm.value.saldo,
    })
    toast.add({
      severity: 'success',
      summary: 'Pago registrado',
      detail: `Se registró la cuota #${cajaForm.value.cuota_numero}.`,
      life: 3500,
    })
    if (pagoCreado?.id_pago) {
      await abrirFacturaPago(pagoCreado.id_pago)
    }
    await cargarProximaCuotaSemanalParaPrestamo(cajaForm.value.id_prestamo)
    if (hojaCargadoOk.value) {
      await cargarHojaSemanalCuotas()
    }
    cajaVisible.value = false
  } catch (e) {
    const message = getApiErrorMessage(e, 'No se pudo registrar el pago de la cuota.')
    if (message.toLowerCase().includes('cuota') && message.toLowerCase().includes('ya fue registrada')) {
      cajaFormError.value = message
      toast.add({
        severity: 'warn',
        summary: 'Cuota ya registrada',
        detail: message,
        life: 4200,
      })
      return
    }
    cajaError.value = message
  } finally {
    cajaSaving.value = false
  }
}

function aplicarMoraDesdeAlerta(alerta: { periodo: number; capital: number; interes: number; saldo: number; mora_sugerida: number }) {
  if (cuotasPrestamoId.value == null || !searchResult.value) return
  cajaVisible.value = true
  cajaLoading.value = false
  cajaError.value = ''
  cajaForm.value = {
    id_prestamo: cuotasPrestamoId.value,
    cliente: searchResult.value.nombre,
    dni: searchResult.value.dni,
    cuota_numero: alerta.periodo,
    fecha_pago: getTodayISO(),
    capital: alerta.capital,
    interes: alerta.interes,
    mora: alerta.mora_sugerida,
    saldo: alerta.saldo,
  }
}

onMounted(async () => {
  inicializarRangoHojaSemanalPorDefecto()
  await cargarCatalogoZonasHoja()
  resetClienteForm()
  resetPrestamoForm()
  try {
    await loadPrestamos()
  } catch (e) {
    toast.add({ severity: 'warn', summary: 'Préstamos', detail: getApiErrorMessage(e), life: 5000 })
  }

  await consumirDeepLinkIntegracionEnQuery()

  if (route.query.fromPrestamo === '1' && canWritePagos.value) {
    openCreateFromQuery()
    const cleanedQuery = { ...route.query }
    delete cleanedQuery.fromPrestamo
    delete cleanedQuery.id_prestamo
    delete cleanedQuery.fecha_pago
    delete cleanedQuery.capital
    delete cleanedQuery.interes
    delete cleanedQuery.saldo
    await router.replace({ query: cleanedQuery })
  }
})
</script>

<template>
  <div class="page">
    <section class="transacciones-panel">
      <div class="form-stack">
        <div class="cobros-busqueda-stack">
          <div class="hoja-print-cobros-top">
            <Button
              label="Imprimir hoja de cobros"
              icon="pi pi-print"
              type="button"
              severity="success"
              rounded
              raised
              :loading="hojaCobrosPrinting"
              @click="imprimirHojaCobrosPrestamos"
            />
          </div>
          <div class="hoja-impresion-toolbar">
            <Select
              v-model="hojaCobrosZonaFiltro"
              :options="zonaImpresionOpciones"
              option-label="label"
              option-value="value"
              placeholder="Zona impresión"
              class="hoja-zone-select filtro-print-select"
              show-clear
            />
            <Select
              v-model="hojaCobrosEstadoFiltro"
              :options="estadoImpresionOpciones"
              option-label="label"
              option-value="value"
              placeholder="Estado préstamo"
              class="hoja-estado-select filtro-print-select"
              show-clear
            />
          </div>
        </div>
      </div>
    </section>

    <Panel header="Hoja semanal por fecha de cuota" class="hoja-sem-panel">
      <p class="hoja-intro">
        Préstamos con forma de pago <strong>semanal</strong>: cada columna muestra la <strong>fecha programada</strong> de
        la cuota. Al registrar desde «Registrar», los montos se rellenan según plan; cambia la
        <strong>fecha de pago</strong> en caja si el depósito no es hoy.
      </p>
      <Toolbar class="toolbar hoja-sem-toolbar mb-3">
        <template #start>
          <label class="hoja-lbl" for="hfc-desde">Cuotas desde</label>
          <InputText id="hfc-desde" v-model="hojaFechaCuotaDesde" type="date" class="hoja-date" />
          <label class="hoja-lbl" for="hfc-hasta">hasta</label>
          <InputText id="hfc-hasta" v-model="hojaFechaCuotaHasta" type="date" class="hoja-date" />
          <Select
            v-model="hojaIdZonaFiltro"
            :options="zonaHojaOpciones"
            option-label="label"
            option-value="value"
            placeholder="Zona préstamo"
            class="hoja-zone-select"
            show-clear
          />
          <Button
            label="Cargar hoja"
            icon="pi pi-calendar"
            :loading="hojaLoading"
            severity="secondary"
            @click="cargarHojaSemanalCuotas"
          />
        </template>
      </Toolbar>
      <Message v-if="hojaError" severity="error" class="mb-2" :closable="false">{{ hojaError }}</Message>
      <div v-if="hojaFilas.length" class="hoja-sheet-wrap">
        <DataTable
          :value="hojaFilas"
          scrollable
          scroll-direction="horizontal"
          data-key="id_prestamo"
          striped-rows
          size="small"
          class="hoja-datatable"
          :loading="hojaLoading"
        >
          <Column field="numero_prestamo" header="Préstamo" frozen style="min-width: 6.5rem" />
          <Column header="Cliente" frozen style="min-width: 9rem">
            <template #body="{ data }">
              <span class="cli-cell">{{ (data as HojaSemanalFila).nombre_cliente }}</span>
              <small class="dni-mini">{{ (data as HojaSemanalFila).dni_cliente }}</small>
            </template>
          </Column>
          <Column header="Territorio" style="width: 5.5rem">
            <template #body="{ data }">{{ (data as HojaSemanalFila).nombre_zona || '—' }}</template>
          </Column>
          <Column v-for="col in hojaColumnas" :key="col.fecha_cuota" style="min-width: 6rem">
            <template #header>
              <div class="hoja-col-h">{{ col.titulo }}</div>
              <div class="hoja-col-sub">{{ formatDate(col.fecha_cuota) }}</div>
            </template>
            <template #body="{ data }">
              <span v-if="!celdaHoja(data as HojaSemanalFila, col.fecha_cuota)" class="muted-dash">—</span>
              <div v-else-if="celdaHoja(data as HojaSemanalFila, col.fecha_cuota)!.pagado" class="celda-pagado">
                <small class="monto-mini">{{
                  formatMoney(celdaHoja(data as HojaSemanalFila, col.fecha_cuota)!.total_programado)
                }}</small>
                <span class="ok-tag">Pagó {{ formatDate(celdaHoja(data as HojaSemanalFila, col.fecha_cuota)!.fecha_pago ?? '') }}</span>
                <Button
                  v-if="celdaHoja(data as HojaSemanalFila, col.fecha_cuota)!.id_pago"
                  icon="pi pi-file-pdf"
                  text
                  rounded
                  size="small"
                  title="Ver factura PDF"
                  aria-label="Factura PDF"
                  type="button"
                  @click="abrirFacturaPago(celdaHoja(data as HojaSemanalFila, col.fecha_cuota)!.id_pago as number)"
                />
              </div>
              <div v-else-if="canWritePagos" class="celda-pendiente">
                <small class="monto-mini">{{
                  formatMoney(celdaHoja(data as HojaSemanalFila, col.fecha_cuota)!.total_programado)
                }}</small>
                <small class="sub-mini">#{{ celdaHoja(data as HojaSemanalFila, col.fecha_cuota)!.numero_cuota }}</small>
                <Button
                  label="Registrar"
                  size="small"
                  outlined
                  type="button"
                  @click="abrirRegistroCuotaDesdeHoja(data as HojaSemanalFila, col.fecha_cuota)"
                />
              </div>
              <div v-else class="celda-readonly">
                {{ formatMoney(celdaHoja(data as HojaSemanalFila, col.fecha_cuota)!.total_programado) }}
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
      <p v-else-if="!hojaLoading && !hojaError && hojaCargadoOk" class="muted-hint-hoja">
        No hay cuotas semanales con fecha entre el rango (o ningún préstamo semanal en la zona seleccionada).
      </p>
    </Panel>

    <Dialog
      v-model:visible="estadoCuentaVisible"
      header="Estado de cuenta"
      modal
      :style="{ width: 'min(72rem, 98vw)' }"
    >
      <div class="estado-cuenta-wrap">
        <p v-if="estadoCuentaError" class="estado-error">{{ estadoCuentaError }}</p>
        <div v-else class="estado-resumen-grid">
          <div class="estado-card"><strong>Cobros registrados:</strong> {{ estadoCuentaResumen.totalPagos }}</div>
          <div class="estado-card"><strong>Capital pagado:</strong> {{ formatMoney(estadoCuentaResumen.totalCapital) }}</div>
          <div class="estado-card"><strong>Interés pagado:</strong> {{ formatMoney(estadoCuentaResumen.totalInteres) }}</div>
          <div class="estado-card"><strong>Mora pagada:</strong> {{ formatMoney(estadoCuentaResumen.totalMora) }}</div>
          <div class="estado-card"><strong>Estado préstamo:</strong> {{ estadoCuentaResumen.estadoPrestamo || 'N/A' }}</div>
          <div class="estado-card"><strong>Días en mora:</strong> {{ estadoCuentaResumen.diasMora }}</div>
          <div class="estado-card">
            <strong>¿Tiene mora vigente?:</strong>
            {{ estadoCuentaResumen.tieneMoraVigente ? 'Sí' : 'No' }}
          </div>
          <div class="estado-card">
            <strong>¿Tuvo mora pagada?:</strong>
            {{ estadoCuentaResumen.tuvoMoraPagada ? 'Sí' : 'No' }}
          </div>
        </div>
        <DataTable
          :value="estadoCuentaRows"
          :loading="estadoCuentaLoading"
          paginator
          :rows="10"
          responsive-layout="scroll"
          class="estado-table"
        >
          <Column field="id_pago" header="ID pago" style="width: 6rem" />
          <Column header="Fecha">
            <template #body="{ data }">{{ formatDate(data.fecha_pago) }}</template>
          </Column>
          <Column header="Capital">
            <template #body="{ data }">{{ formatMoney(data.capital) }}</template>
          </Column>
          <Column header="Interés">
            <template #body="{ data }">{{ formatMoney(data.interes) }}</template>
          </Column>
          <Column header="Mora">
            <template #body="{ data }">{{ formatMoney(data.mora) }}</template>
          </Column>
          <Column header="Saldo">
            <template #body="{ data }">{{ formatMoney(data.saldo) }}</template>
          </Column>
        </DataTable>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="estadoCuentaVisible = false" />
      </template>
    </Dialog>
    <Dialog
      v-model:visible="cuotasVisible"
      header="Calendario de cuotas"
      modal
      :style="{ width: 'min(72rem, 98vw)' }"
    >
      <div class="estado-cuenta-wrap">
        <p v-if="cuotasError" class="estado-error">{{ cuotasError }}</p>
        <div v-else class="estado-card">
          <strong>Total de cuotas:</strong> {{ cuotasTotal }}
        </div>
        <DataTable
          :value="cuotasRows"
          :loading="cuotasLoading"
          responsive-layout="scroll"
          class="estado-table"
        >
          <Column field="periodo" header="Cuota" style="width: 5rem" />
          <Column header="Fecha de pago">
            <template #body="{ data }">{{ formatDate(data.fecha_limite) }}</template>
          </Column>
          <Column header="Capital">
            <template #body="{ data }">{{ formatMoney(data.capital) }}</template>
          </Column>
          <Column header="Interés">
            <template #body="{ data }">{{ formatMoney(data.interes) }}</template>
          </Column>
          <Column header="Saldo">
            <template #body="{ data }">{{ formatMoney(data.saldo) }}</template>
          </Column>
        </DataTable>
        <h4 class="subsection-title">Cuotas pagadas</h4>
        <DataTable :value="cuotasPagadasRows" responsive-layout="scroll" class="estado-table">
          <Column field="periodo" header="Cuota" style="width: 5rem" />
          <Column header="Fecha límite">
            <template #body="{ data }">{{ formatDate(data.fecha_limite) }}</template>
          </Column>
          <Column header="Capital">
            <template #body="{ data }">{{ formatMoney(data.capital) }}</template>
          </Column>
          <Column header="Interés">
            <template #body="{ data }">{{ formatMoney(data.interes) }}</template>
          </Column>
          <Column header="Saldo">
            <template #body="{ data }">{{ formatMoney(data.saldo) }}</template>
          </Column>
        </DataTable>
        <h4 class="subsection-title">Alertas de mora por vencimiento</h4>
        <p class="mora-rule-note">Regla de mora aplicada: 2% del capital de la cuota vencida.</p>
        <DataTable :value="cuotasAlertasRows" responsive-layout="scroll" class="estado-table">
          <Column field="periodo" header="Cuota" style="width: 5rem" />
          <Column header="Fecha vencida">
            <template #body="{ data }">{{ formatDate(data.fecha_limite) }}</template>
          </Column>
          <Column header="Días atraso">
            <template #body="{ data }">{{ data.dias_atraso }}</template>
          </Column>
          <Column header="Mora sugerida">
            <template #body="{ data }">{{ formatMoney(data.mora_sugerida) }}</template>
          </Column>
          <Column header="Acción" style="width: 9rem">
            <template #body="{ data }">
              <Button
                label="Aplicar mora"
                icon="pi pi-exclamation-triangle"
                size="small"
                severity="danger"
                outlined
                @click="aplicarMoraDesdeAlerta(data)"
              />
            </template>
          </Column>
        </DataTable>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="cuotasVisible = false" />
      </template>
    </Dialog>
    <Dialog
      v-model:visible="cajaVisible"
      header="Caja - Pago de cuota"
      modal
      :style="{ width: 'min(42rem, 95vw)' }"
    >
      <div class="caja-wrap">
        <p v-if="cajaError" class="estado-error">{{ cajaError }}</p>
        <p v-if="cajaFormError" class="estado-error">{{ cajaFormError }}</p>
        <div class="caja-total-banner">
          <span class="caja-total-label">Total a cobrar (capital + interés + mora)</span>
          <strong class="caja-total-valor">{{ formatMoney(cajaTotalCobrar) }}</strong>
        </div>
        <p class="caja-factura-hint">Al confirmar se registra el pago y se abre el PDF de factura para imprimir o guardar.</p>
        <div class="caja-form-grid">
          <div class="result-field">
            <label class="result-label" for="cj-cliente">Cliente</label>
            <InputText id="cj-cliente" :model-value="cajaForm.cliente" readonly />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-dni">DNI</label>
            <InputText id="cj-dni" :model-value="cajaForm.dni" readonly />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-prestamo">Préstamo</label>
            <InputText id="cj-prestamo" :model-value="String(cajaForm.id_prestamo ?? '')" readonly />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-cuota">Número de cuota</label>
            <InputText id="cj-cuota" :model-value="String(cajaForm.cuota_numero)" readonly />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-fecha">Fecha de pago</label>
            <InputText id="cj-fecha" v-model="cajaForm.fecha_pago" type="date" />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-cap">Capital</label>
            <InputNumber
              id="cj-cap"
              v-model="cajaForm.capital"
              mode="decimal"
              :min="0"
              :min-fraction-digits="2"
              fluid
            />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-int">Interés</label>
            <InputNumber
              id="cj-int"
              v-model="cajaForm.interes"
              mode="decimal"
              :min="0"
              :min-fraction-digits="2"
              fluid
            />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-mor">Mora</label>
            <InputNumber
              id="cj-mor"
              v-model="cajaForm.mora"
              mode="decimal"
              :min="0"
              :min-fraction-digits="2"
              fluid
            />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-sal">Saldo posterior</label>
            <InputNumber
              id="cj-sal"
              v-model="cajaForm.saldo"
              mode="decimal"
              :min="0"
              :min-fraction-digits="2"
              fluid
            />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="cajaVisible = false" />
        <Button
          label="Cobrar y generar factura"
          icon="pi pi-check"
          :loading="cajaSaving || cajaLoading"
          :disabled="
            cajaLoading ||
            cajaForm.id_prestamo == null ||
            !cajaForm.fecha_pago ||
            cajaForm.cuota_numero <= 0
          "
          @click="confirmarPagoCuota"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.page {
  max-width: 100%;
}

.section-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.transacciones-panel {
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  background: #ffffff;
  padding: 0.9rem;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.transacciones-filtros {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.transacciones-buscar {
  min-width: 0;
}

.transacciones-actions {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.datagrid-controls {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
}

.datagrid-left,
.datagrid-right {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.small-label {
  font-size: 0.8rem;
  color: #334155;
}

.small-select {
  min-height: 1.85rem;
  border: 1px solid #b5c0cc;
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
  background: #fff;
}

.small-search {
  max-width: 12rem;
}

.column-filter-grid {
  display: grid;
  gap: 0.4rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.tx-summary {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  font-size: 0.84rem;
  color: #334155;
}

.tx-summary-filtered {
  color: #0f766e;
  font-weight: 600;
}

.th-filter {
  width: 100%;
  min-height: 2rem;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.74rem;
}

.badge-tipo {
  background: #22c55e;
  color: #fff;
  border-radius: 12px;
  font-size: 0.66rem;
  padding: 0.06rem 0.45rem;
  display: inline-block;
}

.tx-prime-table {
  border: 1px solid #d2d8de;
  border-radius: 4px;
  overflow: hidden;
}

.tx-prime-table :deep(.p-datatable-thead > tr > th) {
  font-size: 0.78rem;
  background: #f4f7f9;
}

.tx-prime-table :deep(.p-datatable-tbody > tr > td) {
  font-size: 0.78rem;
}

.toolbar {
  flex-wrap: wrap;
  gap: 0.5rem;
}

.registro-accordion {
  margin-bottom: 1rem;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  padding-top: 0.35rem;
}

.lbl {
  display: block;
  font-size: 0.78rem;
  margin-bottom: 0.5rem;
  opacity: 0.85;
}

.mr-1 {
  margin-right: 0.25rem;
}

.form-stack :deep(input[type='date']) {
  min-height: 2.65rem;
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: #0f172a;
}

.row-two {
  max-width: 18rem;
}

.cobros-busqueda-stack {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
}

.dni-search-wrap {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.dni-busqueda-linea {
  flex-wrap: wrap;
}

.campo-buscar-cliente {
  flex: 1 1 12rem;
  min-width: 0;
}

.hoja-print-cobros-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}

.hoja-impresion-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
}

.filtro-print-select {
  flex: 1 1 12rem;
  min-width: 11rem;
}

.hint-text {
  display: block;
  color: #475569;
  font-size: 0.85rem;
}

.result-box {
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  background: #f8fafc;
  padding: 0.9rem;
}

.result-title {
  margin: 0 0 0.8rem;
  font-size: 0.95rem;
  color: #0f172a;
}

.result-form-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.result-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.result-label {
  font-size: 0.8rem;
  color: #334155;
}

.result-field :deep(input[readonly]) {
  background: #ffffff;
  color: #0f172a;
}

.native-select {
  min-height: 2.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.45rem 0.65rem;
  background: #fff;
  color: #0f172a;
}

.result-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.6rem;
}

.cuota-semanal-cta {
  margin-top: 1rem;
}

.cuota-semanal-source-hint {
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #475569;
}

.cuota-semanal-source-hint code {
  font-size: 0.74rem;
  padding: 0.05rem 0.28rem;
  border-radius: 4px;
  background: #e2e8f0;
  color: #0f172a;
}

.cuota-semanal-card {
  margin-top: 0.75rem;
  border: 1px solid #93c5fd;
  border-radius: 10px;
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
  padding: 0.95rem 1rem;
}

.cuota-semanal-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.cuota-semanal-titulo {
  font-size: 0.92rem;
  font-weight: 700;
  color: #1e3a8a;
}

.cuota-semanal-monto {
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.cuota-semanal-meta {
  margin: 0.5rem 0 0.75rem;
  font-size: 0.86rem;
  color: #334155;
  line-height: 1.45;
}

.cuota-semanal-muted {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: #64748b;
}

.caja-total-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  background: #0f172a;
  color: #f8fafc;
}

.caja-total-label {
  font-size: 0.82rem;
  opacity: 0.92;
}

.caja-total-valor {
  font-size: 1.15rem;
  letter-spacing: -0.02em;
}

.caja-factura-hint {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
}

.estado-cuenta-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.estado-resumen-grid {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.estado-card {
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  background: #f8fafc;
  padding: 0.65rem 0.75rem;
  font-size: 0.9rem;
  color: #1f2937;
}

.estado-error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.9rem;
}

.field-error {
  color: #b91c1c;
  font-size: 0.78rem;
}

.subsection-title {
  margin: 0.35rem 0 0.2rem;
  font-size: 0.95rem;
  color: #0f172a;
}

.mora-rule-note {
  margin: 0 0 0.4rem;
  font-size: 0.85rem;
  color: #475569;
}

.caja-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.caja-form-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.accordion-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

@media (min-width: 760px) {
  .transacciones-filtros {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .column-filter-grid {
    grid-template-columns: repeat(9, minmax(0, 1fr));
  }

  .form-stack {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    column-gap: 1rem;
    row-gap: 1.35rem;
    align-items: start;
  }

  .row-two {
    max-width: 100%;
  }

  .form-stack > :not(.row-two) {
    grid-column: 1 / -1;
  }

  .compact-field {
    max-width: 20rem;
  }

  .result-form-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .caja-form-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .estado-resumen-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.hoja-sem-panel {
  border: 1px solid #dbe3ee;
  border-radius: 10px;
}

.hoja-intro {
  margin: 0 0 0.75rem;
  font-size: 0.86rem;
  color: #475569;
  max-width: 52rem;
}
.hoja-sem-toolbar {
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem;
}
.hoja-lbl {
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
}
.hoja-date {
  min-height: 2.4rem;
  max-width: 10.5rem;
}
.hoja-zone-select {
  min-width: 13rem;
}
.hoja-sheet-wrap {
  overflow-x: auto;
  max-width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.hoja-datatable :deep(.p-datatable-thead > tr > th) {
  vertical-align: bottom;
  white-space: nowrap;
  font-size: 0.72rem;
}
.hoja-col-h {
  font-weight: 700;
  color: #0f172a;
}
.hoja-col-sub {
  font-weight: 400;
  opacity: 0.75;
  font-size: 0.66rem;
}
.cli-cell {
  display: block;
  font-weight: 600;
}
.dni-mini {
  display: block;
  font-size: 0.66rem;
  color: #64748b;
}
.celda-pagado,
.celda-pendiente {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  align-items: stretch;
}
.monto-mini {
  font-size: 0.74rem;
  font-weight: 600;
  color: #0f172a;
}
.sub-mini {
  font-size: 0.65rem;
  color: #64748b;
}
.ok-tag {
  font-size: 0.65rem;
  color: #166534;
}
.celda-readonly {
  font-size: 0.76rem;
}
.muted-dash {
  color: #94a3b8;
  font-size: 0.85rem;
}
.muted-hint-hoja {
  margin: 0.5rem 0 0;
  color: #64748b;
  font-size: 0.86rem;
}
</style>
