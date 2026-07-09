<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteUpdate, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'

import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'
import { formatDate, formatDateTime, formatMoney } from '@/utils/format'
import { montoAbonoCapitalInteres } from '@/utils/cobroPago'
import { abrirFacturaPago } from '@/utils/facturaPago'
import type {
  Cliente,
  Pago,
  Paginated,
  Prestamo,
  ReporteIntegracionFila,
  ReporteIntegracionResumen,
  ReporteIntegracionResponse,
  Cartera,
  DiaCobroCartera,
} from '@/types/api'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { canWritePagos } = usePermissions()

const esCobrador = computed(() => auth.profile?.rol === 'cobrador')
const cobradorCarteraIds = computed(
  () => new Set((auth.profile?.carteras ?? []).map((c) => c.id_cartera)),
)

const hojaCobrosCarteraFiltro = ref<number | ''>('')
const hojaCobrosEstadoFiltro = ref<
  | ''
  | 'activo,pendiente_aprobacion,mora'
  | 'pendiente_aprobacion'
  | 'activo'
  | 'pagado'
  | 'mora'
  | 'cancelado'
>('activo,pendiente_aprobacion,mora')
const hojaCobrosLoading = ref(false)
const hojaCobrosCargada = ref(false)
const HOJA_COBROS_PAGE_SIZE = 10
const hojaCobrosPage = ref(1)
const hojaCobrosPageSize = ref(HOJA_COBROS_PAGE_SIZE)
const hojaCobrosTotal = ref(0)
const hojaCobrosFilas = ref<ReporteIntegracionFila[]>([])
const hojaCobrosResumen = ref<ReporteIntegracionResumen | null>(null)
const hojaCobrosFechaReporte = ref('')
const hojaCobrosGeneradoEn = ref('')

const hojaTableFirst = computed(() => (hojaCobrosPage.value - 1) * hojaCobrosPageSize.value)

const cajaVisible = ref(false)
const cajaLoading = ref(false)
const cajaSaving = ref(false)
const cajaError = ref('')
const cajaForm = ref({
  id_prestamo: null as number | null,
  numero_prestamo: '',
  cliente: '',
  dni: '',
  id_cartera: null as number | null,
  cartera_nombre: '',
  cartera_dia_cobro: '' as DiaCobroCartera | '',
  cliente_dia_cobro_semanal: '' as DiaCobroCartera | '',
  fecha_entrega: '',
  cuota_numero: 0,
  fecha_cuota: '',
  fecha_pago: '',
  capital: 0,
  interes: 0,
  monto_pendiente_cuota: 0,
  saldo_inicial: 0,
  saldo_actual: 0,
  saldo: 0,
  monto_recibido: 0,
})
const cajaFormError = ref('')

function getTodayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const hojaCarteras = ref<Cartera[]>([])
let carterasHojaCache: Cartera[] | null = null

const carteraHojaOpciones = computed(() =>
  hojaCarteras.value.map((c) => ({ label: c.nombre, value: c.id_cartera as number })),
)

function carteraHojaRequerida(): boolean {
  return hojaCobrosCarteraFiltro.value !== '' && hojaCobrosCarteraFiltro.value != null
}

function limpiarResultadosHojaCobros() {
  hojaCobrosFilas.value = []
  hojaCobrosResumen.value = null
  hojaCobrosTotal.value = 0
  hojaCobrosCargada.value = false
  hojaCobrosPage.value = 1
  hojaCobrosLoading.value = false
}

function reiniciarHojaCobrosSinCartera() {
  limpiarResultadosHojaCobros()
}

const estadoHojaOpciones = computed(() => [
  { label: 'Para cobro (activos, pendientes y mora)', value: 'activo,pendiente_aprobacion,mora' as const },
  { label: 'Todos los estados', value: '' as const },
  { label: 'Pendiente aprobación', value: 'pendiente_aprobacion' as const },
  { label: 'Activo', value: 'activo' as const },
  { label: 'Pagado', value: 'pagado' as const },
  { label: 'Mora', value: 'mora' as const },
  { label: 'Cancelado', value: 'cancelado' as const },
])

const hojaCobrosTituloCartera = computed(() => {
  if (hojaCobrosCarteraFiltro.value === '' || hojaCobrosCarteraFiltro.value == null) {
    return 'TODAS LAS CARTERAS'
  }
  const c = hojaCarteras.value.find((x) => x.id_cartera === hojaCobrosCarteraFiltro.value)
  return (c?.nombre ?? 'CARTERA').toUpperCase()
})

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

const DIAS_HOJA = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'] as const

function formatFechaHojaLegible(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso.toUpperCase()
  const dia = String(d.getDate()).padStart(2, '0')
  return `${DIAS_HOJA[d.getDay()]} ${dia} DE ${MESES_HOJA[d.getMonth()]} ${d.getFullYear()}`
}

const hojaCobrosFechaLegible = computed(() =>
  hojaCobrosFechaReporte.value ? formatFechaHojaLegible(hojaCobrosFechaReporte.value) : formatFechaHojaLegible(getTodayISO()),
)

const hojaCobrosGeneradoLegible = computed(() =>
  hojaCobrosGeneradoEn.value ? formatDateTime(hojaCobrosGeneradoEn.value) : formatDateTime(new Date().toISOString()),
)

function formatNumeroHoja(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  if (Number.isNaN(n)) return String(value)
  return new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function textoCuotasAtrasadas(fila: ReporteIntegracionFila): string {
  const n = fila.cuotas_atrasadas ?? 0
  if (n <= 0) return ''
  const nums = fila.cuotas_atrasadas_numeros?.trim()
  if (nums) return `${n} atrasada${n === 1 ? '' : 's'} (#${nums.replace(/,\s*/g, ', #')})`
  return `${n} atrasada${n === 1 ? '' : 's'}`
}

const hojaCobrosTotales = computed(() => {
  const r = hojaCobrosResumen.value
  if (r) {
    return {
      saldoInicial: Number.parseFloat(r.total_saldo_inicial) || 0,
      cuota: Number.parseFloat(r.total_cuota ?? '') || 0,
      saldoActual: Number.parseFloat(r.total_saldo_actual) || 0,
    }
  }
  return { saldoInicial: 0, cuota: 0, saldoActual: 0 }
})

function numeroFilaHoja(indexEnPagina: number): number {
  return hojaTableFirst.value + indexEnPagina + 1
}

function buildHojaCobrosQuery(extra?: Record<string, string>): URLSearchParams {
  const qs = new URLSearchParams()
  if (hojaCobrosCarteraFiltro.value !== '' && hojaCobrosCarteraFiltro.value != null) {
    qs.set('id_cartera', String(hojaCobrosCarteraFiltro.value))
  }
  if (hojaCobrosEstadoFiltro.value) {
    qs.set('estado', hojaCobrosEstadoFiltro.value)
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) qs.set(k, v)
  }
  return qs
}

async function cargarHojaCobrosFindeco(options?: { silentEmpty?: boolean }) {
  if (!carteraHojaRequerida()) {
    reiniciarHojaCobrosSinCartera()
    if (!options?.silentEmpty) {
      toast.add({
        severity: 'warn',
        summary: 'Hoja de cobros',
        detail: 'Seleccione una cartera para consultar la hoja.',
        life: 4000,
      })
    }
    return
  }
  hojaCobrosLoading.value = true
  try {
    const qs = buildHojaCobrosQuery({
      page: String(hojaCobrosPage.value),
      page_size: String(hojaCobrosPageSize.value),
    })
    const url = `/prestamos/reporte-integracion/?${qs.toString()}`
    const { data } = await api.get<ReporteIntegracionResponse>(url)
    hojaCobrosFilas.value = (data.filas ?? []).slice(0, hojaCobrosPageSize.value)
    hojaCobrosResumen.value = data.resumen ?? null
    hojaCobrosFechaReporte.value = data.fecha_reporte ?? getTodayISO()
    hojaCobrosGeneradoEn.value = data.generado_en ?? ''
    hojaCobrosTotal.value = data.count ?? data.resumen?.prestamos ?? hojaCobrosFilas.value.length
    if (typeof data.page === 'number') hojaCobrosPage.value = data.page
    hojaCobrosCargada.value = true
    if (!hojaCobrosTotal.value && !options?.silentEmpty) {
      toast.add({
        severity: 'info',
        summary: 'Hoja de cobros',
        detail: 'No hay préstamos para los filtros seleccionados.',
        life: 4000,
      })
    }
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Hoja de cobros',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    hojaCobrosLoading.value = false
  }
}

function onHojaCobrosPage(e: { first: number; rows: number }) {
  if (hojaCobrosLoading.value || !carteraHojaRequerida()) return
  hojaCobrosPageSize.value = e.rows
  hojaCobrosPage.value = Math.floor(e.first / e.rows) + 1
  void cargarHojaCobrosFindeco({ silentEmpty: true })
}

watch(hojaCobrosCarteraFiltro, () => {
  limpiarResultadosHojaCobros()
})

watch(hojaCobrosEstadoFiltro, () => {
  if (!carteraHojaRequerida() || !hojaCobrosCargada.value) return
  hojaCobrosPage.value = 1
  void cargarHojaCobrosFindeco({ silentEmpty: true })
})

async function cargarCatalogoCarterasHoja() {
  try {
    const asignadas = auth.profile?.carteras ?? []
    if (esCobrador.value && asignadas.length > 0) {
      hojaCarteras.value = [...asignadas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      return
    }
    if (carterasHojaCache?.length) {
      hojaCarteras.value = carterasHojaCache
      return
    }
    const todos: Cartera[] = []
    let nextUrl: string | null = '/carteras/?page_size=100'
    while (nextUrl) {
      const response = await api.get<Paginated<Cartera>>(nextUrl)
      const pg: Paginated<Cartera> = response.data
      todos.push(...pg.results)
      nextUrl = pg.next
    }
    carterasHojaCache = todos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    hojaCarteras.value = carterasHojaCache
  } catch {
    hojaCarteras.value = []
  }
}

type CarteraCobroInfo = {
  id_cartera: number | null
  cartera_nombre: string
  cartera_dia_cobro: DiaCobroCartera | ''
  cliente_dia_cobro_semanal: DiaCobroCartera | ''
  fecha_entrega: string
}

function carteraDesdePrestamo(pr: Prestamo, clienteDia?: DiaCobroCartera | null): CarteraCobroInfo {
  const c = pr.cartera
  return {
    id_cartera: pr.id_cartera ?? c?.id_cartera ?? null,
    cartera_nombre: c?.nombre ?? '',
    cartera_dia_cobro: (c?.dia_cobro ?? '') as DiaCobroCartera | '',
    cliente_dia_cobro_semanal: (clienteDia ?? '') as DiaCobroCartera | '',
    fecha_entrega: pr.fecha_entrega ?? '',
  }
}

async function resolverCarteraCobro(prestamoId: number): Promise<CarteraCobroInfo> {
  const { data: pr } = await api.get<Prestamo>(`/prestamos/${prestamoId}/`)
  let clienteDia: DiaCobroCartera | null = null
  try {
    const { data: cl } = await api.get<Cliente>(`/clientes/${pr.id_cliente}/`)
    clienteDia = cl.dia_cobro_semanal
  } catch {
    clienteDia = null
  }
  return carteraDesdePrestamo(pr, clienteDia)
}

const cajaTotalCobrar = computed(() => {
  return Number(cajaForm.value.monto_pendiente_cuota) || cajaCuotaPendiente.value
})

const cajaCuotaPendiente = computed(() => {
  const pend = Number(cajaForm.value.monto_pendiente_cuota)
  if (pend > 0) return pend
  const c = Number(cajaForm.value.capital) || 0
  const i = Number(cajaForm.value.interes) || 0
  return c + i
})

const cajaHayExcedente = computed(() => {
  const recibido = Number(cajaForm.value.monto_recibido) || 0
  return recibido > cajaCuotaPendiente.value + 0.001
})

const cajaHayPagoParcial = computed(() => {
  const recibido = Number(cajaForm.value.monto_recibido) || 0
  if (recibido <= 0) return false
  return recibido + 0.001 < cajaTotalCobrar.value
})

const cajaPendienteCuotaTrasCobro = computed(() => {
  const recibido = Number(cajaForm.value.monto_recibido) || 0
  const abono = montoAbonoCapitalInteres(recibido)
  const pendiente = Number(cajaForm.value.monto_pendiente_cuota) || cajaCuotaPendiente.value
  return Math.max(0, Number((pendiente - abono).toFixed(2)))
})

/** Saldo pendiente tras el cobro (misma métrica que SALDO ACTUAL en la hoja). */
const cajaSaldoPosterior = computed(() => {
  const actual = Number(cajaForm.value.saldo_actual) || 0
  const recibido = Number(cajaForm.value.monto_recibido) || 0
  const abono = montoAbonoCapitalInteres(recibido)
  return Math.max(0, Number((actual - abono).toFixed(2)))
})

function puedeCobrarCartera(idCartera: number | null | undefined): boolean {
  if (!esCobrador.value) return true
  if (idCartera == null) return false
  return cobradorCarteraIds.value.has(idCartera)
}

const cajaCarteraBloqueada = computed(() => !puedeCobrarCartera(cajaForm.value.id_cartera))

const cajaCarteraEtiqueta = computed(() => {
  const nombre = cajaForm.value.cartera_nombre?.trim()
  if (!nombre) return 'Sin cartera asignada'
  return nombre
})

function montoRecibidoPorDefecto(montoPendienteCuota: number) {
  return Number(montoPendienteCuota.toFixed(2))
}

function montoPendienteDesdeFilaReporte(
  fila: Pick<ReporteIntegracionFila, 'cuota_siguiente_monto' | 'cuota_siguiente_capital' | 'cuota_siguiente_interes'>,
): number {
  const pendiente = Number.parseFloat(fila.cuota_siguiente_monto ?? '') || 0
  if (pendiente > 0) return pendiente
  return (
    (Number.parseFloat(fila.cuota_siguiente_capital ?? '') || 0) +
    (Number.parseFloat(fila.cuota_siguiente_interes ?? '') || 0)
  )
}

async function cargarSaldosReportePrestamo(
  prestamoId: number,
): Promise<{ saldo_inicial: number; saldo_actual: number } | null> {
  try {
    const { data } = await api.get<ReporteIntegracionResponse>(
      `/prestamos/reporte-integracion/?id_prestamo=${prestamoId}&all=1`,
    )
    const fila = data.filas?.[0]
    if (!fila) return null
    return {
      saldo_inicial: Number.parseFloat(fila.saldo_inicial) || 0,
      saldo_actual: Number.parseFloat(fila.saldo_actual) || 0,
    }
  } catch {
    return null
  }
}

function resolverNumeroPrestamoCaja(idPrestamo: number, numero?: string | null): string {
  const directo = (numero ?? '').trim()
  if (directo) return directo
  return String(idPrestamo)
}

function abrirDialogoCaja(payload: {
  id_prestamo: number
  numero_prestamo?: string | null
  cliente: string
  dni: string
  id_cartera?: number | null
  cartera_nombre?: string
  cartera_dia_cobro?: DiaCobroCartera | ''
  cliente_dia_cobro_semanal?: DiaCobroCartera | ''
  fecha_entrega?: string | null
  cuota_numero: number
  capital: number
  interes: number
  monto_pendiente_cuota?: number
  saldo_inicial?: number
  saldo_actual?: number
  saldo?: number
  fecha_cuota?: string
  fecha_pago?: string
}) {
  const idCartera = payload.id_cartera ?? null
  if (!puedeCobrarCartera(idCartera)) {
    toast.add({
      severity: 'error',
      summary: 'Cartera no asignada',
      detail: `Este préstamo pertenece a «${payload.cartera_nombre || 'otra cartera'}» y no está en sus carteras asignadas.`,
      life: 5000,
    })
    return
  }
  if (
    hojaCobrosCarteraFiltro.value !== '' &&
    idCartera != null &&
    hojaCobrosCarteraFiltro.value !== idCartera
  ) {
    toast.add({
      severity: 'warn',
      summary: 'Cartera distinta',
      detail: 'El préstamo no pertenece a la cartera seleccionada en la hoja de cobros.',
      life: 4500,
    })
    return
  }
  cajaFormError.value = ''
  cajaError.value = ''
  const saldoActual = payload.saldo_actual ?? payload.saldo ?? 0
  const saldoInicial = payload.saldo_inicial ?? saldoActual
  const montoPendienteCuota =
    payload.monto_pendiente_cuota ?? Number((payload.capital + payload.interes).toFixed(2))
  const fechaEntrega = payload.fecha_entrega?.trim().slice(0, 10) ?? ''
  const fechaPago = getTodayISO()
  cajaForm.value = {
    id_prestamo: payload.id_prestamo,
    numero_prestamo: resolverNumeroPrestamoCaja(payload.id_prestamo, payload.numero_prestamo),
    cliente: payload.cliente,
    dni: payload.dni,
    id_cartera: idCartera,
    cartera_nombre: payload.cartera_nombre ?? '',
    cartera_dia_cobro: payload.cartera_dia_cobro ?? '',
    cliente_dia_cobro_semanal: payload.cliente_dia_cobro_semanal ?? '',
    fecha_entrega: fechaEntrega,
    cuota_numero: payload.cuota_numero,
    fecha_cuota: fechaPago,
    fecha_pago: fechaPago,
    capital: payload.capital,
    interes: payload.interes,
    monto_pendiente_cuota: montoPendienteCuota,
    saldo_inicial: saldoInicial,
    saldo_actual: saldoActual,
    saldo: saldoActual,
    monto_recibido: montoRecibidoPorDefecto(montoPendienteCuota),
  }
  cajaVisible.value = true
}

async function resolverDniPrestamo(prestamoId: number): Promise<string> {
  try {
    const resolved = await resolverClientePorPrestamo(prestamoId)
    return resolved.dni
  } catch {
    return ''
  }
}

async function abrirCobroDesdeHoja(fila: ReporteIntegracionFila) {
  if (!canWritePagos.value) {
    toast.add({
      severity: 'warn',
      summary: 'Cobros',
      detail: 'Tu rol no puede registrar cobros.',
      life: 4000,
    })
    return
  }
  const cuotaN = fila.cuota_siguiente_numero
  if (cuotaN == null) {
    toast.add({
      severity: 'info',
      summary: 'Sin cuota pendiente',
      detail: 'Este préstamo no tiene cuota pendiente por cobrar.',
      life: 4000,
    })
    return
  }
  const capital = Number(fila.cuota_siguiente_capital ?? 0)
  const interes = Number(fila.cuota_siguiente_interes ?? 0)
  const montoPendiente = montoPendienteDesdeFilaReporte(fila)
  const dni = await resolverDniPrestamo(fila.id_prestamo)
  abrirDialogoCaja({
    id_prestamo: fila.id_prestamo,
    numero_prestamo: fila.numero_prestamo,
    cliente: fila.nombre_cliente,
    dni,
    id_cartera: fila.id_cartera ?? null,
    cartera_nombre: fila.cartera_nombre ?? '',
    cartera_dia_cobro: (fila.cartera_dia_cobro ?? '') as DiaCobroCartera | '',
    cliente_dia_cobro_semanal: (fila.cliente_dia_cobro_semanal ?? '') as DiaCobroCartera | '',
    fecha_entrega: fila.fecha_entrega ?? undefined,
    cuota_numero: cuotaN,
    fecha_cuota: fila.cuota_siguiente_fecha ?? undefined,
    capital,
    interes,
    monto_pendiente_cuota: montoPendiente,
    saldo_inicial: Number.parseFloat(fila.saldo_inicial) || 0,
    saldo_actual: Number.parseFloat(fila.saldo_actual) || 0,
  })
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
  const { data: pr } = await api.get<Prestamo>(`/prestamos/${pid}/`)
  const { data: cl } = await api.get<Cliente>(`/clientes/${pr.id_cliente}/`)
  return { nombre: cl.nombre ?? 'Cliente', dni: cl.dni ?? '' }
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
        'Faltan datos para abrir cobro desde integración. Completa los datos en Cobros o usa «Ir a cobrar» desde el reporte de préstamos.',
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
  const saldos = await cargarSaldosReportePrestamo(pid)
  let carteraInfo: CarteraCobroInfo = {
    id_cartera: null,
    cartera_nombre: '',
    cartera_dia_cobro: '',
    cliente_dia_cobro_semanal: '',
    fecha_entrega: '',
  }
  try {
    carteraInfo = await resolverCarteraCobro(pid)
  } catch {
    /* sin cartera en enlace */
  }
  let fechaCuota: string | undefined
  let montoPendiente: number | undefined
  let filaReporte: ReporteIntegracionFila | undefined
  try {
    const { data } = await api.get<ReporteIntegracionResponse>(
      `/prestamos/reporte-integracion/?id_prestamo=${pid}&all=1`,
    )
    filaReporte = data.filas?.[0]
    fechaCuota = filaReporte?.cuota_siguiente_fecha ?? undefined
    if (filaReporte) montoPendiente = montoPendienteDesdeFilaReporte(filaReporte)
  } catch {
    fechaCuota = undefined
    montoPendiente = undefined
  }

  abrirDialogoCaja({
    id_prestamo: pid,
    numero_prestamo: filaReporte?.numero_prestamo,
    cliente: clienteNombre,
    dni: dniResolved,
    ...carteraInfo,
    cuota_numero: cuotaN,
    fecha_cuota: fechaCuota,
    capital,
    interes,
    monto_pendiente_cuota: montoPendiente ?? capital + interes,
    saldo_inicial: saldos?.saldo_inicial ?? saldo ?? 0,
    saldo_actual: saldos?.saldo_actual ?? saldo ?? 0,
  })
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
  if (cajaCarteraBloqueada.value) {
    cajaFormError.value = 'No puede cobrar: el préstamo no pertenece a una cartera asignada a su usuario.'
    return
  }
  if (
    cajaForm.value.capital < 0 ||
    cajaForm.value.interes < 0 ||
    cajaForm.value.monto_recibido < 0
  ) {
    cajaFormError.value = 'Los montos no pueden ser negativos.'
    return
  }
  const montoRecibido = Number(cajaForm.value.monto_recibido) || 0
  if (montoRecibido <= 0) {
    cajaFormError.value = 'Indique el monto recibido del cliente.'
    return
  }
  cajaSaving.value = true
  try {
    const payload: Record<string, string | number> = {
      id_prestamo: cajaForm.value.id_prestamo,
      fecha_pago: cajaForm.value.fecha_pago,
      documento: `Cuota ${cajaForm.value.cuota_numero}`,
      capital: cajaForm.value.capital,
      interes: cajaForm.value.interes,
      mora: 0,
      saldo: cajaSaldoPosterior.value,
      monto_recibido: montoRecibido.toFixed(2),
    }

    const { data: pagoCreado } = await api.post<Pago>('/pagos/', payload)

    let detail = `Se registró la cuota #${cajaForm.value.cuota_numero}.`
    if (pagoCreado.numero_factura) {
      detail = `${detail} Factura SAR: ${pagoCreado.numero_factura}.`
    }
    if (pagoCreado.distribucion?.length) {
      const partes = pagoCreado.distribucion
        .map((linea) => {
          if (linea.abono_capital) {
            return `Abono a capital: ${formatMoney(Number(linea.total))}`
          }
          if (linea.parcial) {
            return `Abono parcial cuota #${linea.cuota}: ${formatMoney(Number(linea.total))}`
          }
          return `Cuota #${linea.cuota}: ${formatMoney(Number(linea.total))}`
        })
        .join('; ')
      detail = `Distribución: ${partes}`
    } else if (cajaPendienteCuotaTrasCobro.value > 0.01) {
      detail = `Se registró ${formatMoney(montoRecibido)}. Queda pendiente ${formatMoney(cajaPendienteCuotaTrasCobro.value)} en la cuota #${cajaForm.value.cuota_numero} (sin interés adicional).`
    }

    toast.add({
      severity: 'success',
      summary: 'Pago registrado',
      detail,
      life: 4500,
    })
    if (pagoCreado?.id_pago) {
      await abrirFacturaPago(pagoCreado.id_pago)
    }
    await cargarHojaCobrosFindeco({ silentEmpty: true })
    cajaVisible.value = false
  } catch (e) {
    const message = getApiErrorMessage(e, 'No se pudo registrar el pago de la cuota.')
    if (message.toLowerCase().includes('cuota') && message.toLowerCase().includes('pagada')) {
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

onMounted(async () => {
  if (auth.isAuthenticated && !auth.profile) {
    await auth.fetchProfile()
  }
  await cargarCatalogoCarterasHoja()
  await consumirDeepLinkIntegracionEnQuery()
})
</script>

<template>
  <div class="page cobros-page">
    <section class="hoja-findeco-section">
      <div class="hoja-findeco-toolbar no-print">
        <Select
          v-model="hojaCobrosCarteraFiltro"
          :options="carteraHojaOpciones"
          option-label="label"
          option-value="value"
          placeholder="Seleccione cartera"
          class="hoja-cartera-select filtro-hoja-select"
        />
        <Select
          v-model="hojaCobrosEstadoFiltro"
          :options="estadoHojaOpciones"
          option-label="label"
          option-value="value"
          placeholder="Estado préstamo"
          class="hoja-estado-select filtro-hoja-select"
          :disabled="!carteraHojaRequerida()"
        />
        <Button
          label="Actualizar hoja"
          icon="pi pi-refresh"
          type="button"
          severity="secondary"
          :loading="hojaCobrosLoading"
          :disabled="!carteraHojaRequerida()"
          @click="() => void cargarHojaCobrosFindeco()"
        />
        <span v-if="hojaCobrosTotal" class="hoja-findeco-contador no-print">
          {{ hojaCobrosTotal }} cliente{{ hojaCobrosTotal === 1 ? '' : 's' }}
        </span>
      </div>

      <p v-if="!carteraHojaRequerida()" class="hoja-findeco-aviso no-print">
        Seleccione una cartera y pulse «Actualizar hoja» para consultar los préstamos.
      </p>
      <p
        v-else-if="!hojaCobrosCargada && !hojaCobrosLoading"
        class="hoja-findeco-aviso no-print"
      >
        Pulse «Actualizar hoja» para cargar los préstamos de la cartera seleccionada.
      </p>

      <article v-else-if="hojaCobrosCargada || hojaCobrosLoading" class="hoja-findeco-sheet">
        <header class="hoja-findeco-header">
          <h1 class="hoja-findeco-marca">FINDECO</h1>
          <p class="hoja-findeco-cartera">CARTERA: {{ hojaCobrosTituloCartera }}</p>
          <p class="hoja-findeco-fecha">FECHA: {{ hojaCobrosFechaLegible }}</p>
          <p class="hoja-findeco-fecha">GENERADO: {{ hojaCobrosGeneradoLegible }}</p>
        </header>

        <DataTable
          :value="hojaCobrosFilas"
          :loading="hojaCobrosLoading"
          data-key="id_prestamo"
          lazy
          paginator
          :first="hojaTableFirst"
          :rows="hojaCobrosPageSize"
          :rows-per-page-options="[10, 20, 50]"
          :total-records="hojaCobrosTotal"
          paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport"
          current-page-report-template="{first} - {last} de {totalRecords} préstamos"
          striped-rows
          scrollable
          scroll-direction="horizontal"
          responsive-layout="scroll"
          class="hoja-findeco-datatable no-print-table"
          empty-message="No hay préstamos para los filtros seleccionados."
          @page="onHojaCobrosPage"
        >
          <Column header="N" style="width: 3rem; text-align: center">
            <template #body="{ index }: { index: number }">
              {{ numeroFilaHoja(index) }}
            </template>
          </Column>
          <Column field="nombre_cliente" header="NOMBRE CLIENTE" style="min-width: 11rem" />
          <Column header="ENTREGA" style="width: 6.5rem; text-align: center">
            <template #body="{ data }: { data: ReporteIntegracionFila }">
              {{ formatDate(data.fecha_entrega) }}
            </template>
          </Column>
          <Column header="VENCE" style="width: 6.5rem; text-align: center">
            <template #body="{ data }: { data: ReporteIntegracionFila }">
              {{ formatDate(data.fecha_vencimiento) }}
            </template>
          </Column>
          <Column header="SALDO INICIAL" style="width: 6.5rem; text-align: right">
            <template #body="{ data }: { data: ReporteIntegracionFila }">
              {{ formatNumeroHoja(data.saldo_inicial) }}
            </template>
          </Column>
          <Column header="CUOTA" style="width: 6.5rem; text-align: right">
            <template #body="{ data }: { data: ReporteIntegracionFila }">
              {{ formatNumeroHoja(data.cuota) }}
            </template>
          </Column>
          <Column header="CUOTA PEND." style="width: 8.5rem; text-align: right">
            <template #body="{ data }: { data: ReporteIntegracionFila }">
              <div class="cuota-pend-cell">
                <span class="cuota-pend-monto">
                  {{
                    data.cuota_siguiente_monto != null && data.cuota_siguiente_monto !== ''
                      ? formatNumeroHoja(data.cuota_siguiente_monto)
                      : '—'
                  }}
                </span>
                <span
                  v-if="(data.cuotas_atrasadas ?? 0) > 0"
                  class="cuotas-atrasadas-tag"
                  :title="textoCuotasAtrasadas(data)"
                >
                  {{ textoCuotasAtrasadas(data) }}
                </span>
                <span v-else-if="data.cuota_siguiente_fecha" class="cuota-pend-fecha">
                  Vence {{ formatDate(data.cuota_siguiente_fecha) }}
                </span>
              </div>
            </template>
          </Column>
          <Column header="SALDO ACTUAL" style="width: 6.5rem; text-align: right">
            <template #body="{ data }: { data: ReporteIntegracionFila }">
              {{ formatNumeroHoja(data.saldo_actual) }}
            </template>
          </Column>
          <Column header="Nº PRESTAMO" style="width: 6.5rem; text-align: center">
            <template #body="{ data }: { data: ReporteIntegracionFila }">
              {{ data.numero_prestamo }}
            </template>
          </Column>
          <Column header="CELULAR" style="width: 6.5rem; text-align: center">
            <template #body="{ data }: { data: ReporteIntegracionFila }">
              {{ data.telefono?.trim() || '' }}
            </template>
          </Column>
          <Column
            v-if="canWritePagos"
            header="COBRAR"
            style="width: 7.5rem; text-align: center"
            class="col-cobrar"
          >
            <template #body="{ data }: { data: ReporteIntegracionFila }">
              <Button
                v-if="data.cuota_siguiente_numero != null"
                label="Cobrar"
                icon="pi pi-wallet"
                size="small"
                severity="success"
                @click="abrirCobroDesdeHoja(data)"
              />
              <span v-else class="cuota-pagada-tag">—</span>
            </template>
          </Column>
        </DataTable>

        <div v-if="hojaCobrosTotal" class="hoja-findeco-totales-bar no-print">
          <span class="totales-label">TOTALES:</span>
          <span class="totales-monto">{{ formatNumeroHoja(hojaCobrosTotales.saldoInicial) }}</span>
          <span class="totales-monto">{{ formatNumeroHoja(hojaCobrosTotales.cuota) }}</span>
          <span class="totales-monto">{{ formatNumeroHoja(hojaCobrosTotales.saldoActual) }}</span>
        </div>
      </article>
    </section>

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
          <span class="caja-total-label">Total a cobrar (pendiente de cuota)</span>
          <strong class="caja-total-valor">{{ formatMoney(cajaTotalCobrar) }}</strong>
        </div>
        <p v-if="cajaHayPagoParcial" class="caja-excedente-hint">
          Pago parcial: se registrará {{ formatMoney(cajaForm.monto_recibido) }}. Quedará pendiente
          {{ formatMoney(cajaPendienteCuotaTrasCobro) }} en la cuota #{{ cajaForm.cuota_numero }} (sin interés adicional).
        </p>
        <p v-else-if="cajaHayExcedente" class="caja-excedente-hint">
          El monto recibido excede esta cuota; el sobrante se registrará como abono a capital.
        </p>
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
          <div class="result-field caja-field-full">
            <label class="result-label" for="cj-cartera">Cartera de cobro</label>
            <InputText id="cj-cartera" :model-value="cajaCarteraEtiqueta" readonly />
          </div>
          <p v-if="cajaCarteraBloqueada" class="estado-error">
            No puede cobrar: el préstamo no pertenece a una cartera asignada a su usuario.
          </p>
          <div class="result-field">
            <label class="result-label" for="cj-prestamo">Préstamo</label>
            <InputText id="cj-prestamo" :model-value="cajaForm.numero_prestamo" readonly />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-cuota">Número de cuota</label>
            <InputText id="cj-cuota" :model-value="String(cajaForm.cuota_numero)" readonly />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-fecha">Fecha de cobro</label>
            <InputText
              id="cj-fecha"
              :model-value="cajaForm.fecha_pago ? formatDate(cajaForm.fecha_pago) : '—'"
              readonly
            />
          </div>
          <div class="result-field caja-field-full">
            <label class="result-label" for="cj-recibido">Monto recibido del cliente</label>
            <InputNumber
              id="cj-recibido"
              v-model="cajaForm.monto_recibido"
              mode="decimal"
              :min="0"
              :min-fraction-digits="2"
              fluid
            />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-sal-ini">Saldo inicial (capital + interés)</label>
            <InputText
              id="cj-sal-ini"
              :model-value="formatMoney(cajaForm.saldo_inicial)"
              readonly
            />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-sal-act">Saldo actual</label>
            <InputText
              id="cj-sal-act"
              :model-value="formatMoney(cajaForm.saldo_actual)"
              readonly
            />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-sal">Saldo posterior al cobro</label>
            <InputText
              id="cj-sal"
              :model-value="formatMoney(cajaSaldoPosterior)"
              readonly
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
            cajaSaving ||
            cajaCarteraBloqueada ||
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

.hoja-cartera-select {
  min-width: 13rem;
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

.caja-excedente-hint {
  margin: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  background: #ecfdf5;
  color: #047857;
  font-size: 0.82rem;
}

.caja-cartera-hint {
  margin: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  background: #fffbeb;
  color: #b45309;
  font-size: 0.82rem;
  grid-column: 1 / -1;
}

.caja-field-full {
  grid-column: 1 / -1;
}

.caja-factura-hint {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
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
  .caja-form-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.hoja-findeco-section {
  margin-bottom: 1.25rem;
}

.cuota-pagada-tag {
  color: #94a3b8;
  font-size: 0.82rem;
}

.cuota-pend-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  line-height: 1.25;
}

.cuota-pend-monto {
  font-weight: 600;
}

.cuota-pend-fecha {
  font-size: 0.68rem;
  color: #64748b;
  white-space: nowrap;
}

.cuotas-atrasadas-tag,
.cuotas-atrasadas-tag-print {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  color: #b91c1c;
  white-space: normal;
  text-align: right;
  line-height: 1.2;
}

.col-cuota-pend {
  vertical-align: top;
}

.hoja-findeco-datatable :deep(.col-cobrar) {
  text-align: center;
}

.hoja-findeco-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  margin-bottom: 1rem;
}

.hoja-findeco-aviso {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border-radius: 0.5rem;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.9rem;
}

.filtro-hoja-select {
  flex: 1 1 11rem;
  min-width: 11rem;
}

.hoja-cartera-select {
  min-width: 13rem;
}

.hoja-findeco-contador {
  font-size: 0.85rem;
  color: #64748b;
  margin-left: auto;
}

.hoja-findeco-estado {
  margin: 0;
  padding: 1rem 0;
  color: #64748b;
  font-size: 0.92rem;
}

.hoja-findeco-sheet {
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 1.25rem 1rem 1rem;
  overflow-x: auto;
  box-shadow: 0 1px 3px rgb(15 23 42 / 8%);
}

.hoja-findeco-header {
  text-align: center;
  margin-bottom: 0.85rem;
}

.hoja-findeco-marca {
  margin: 0 0 0.35rem;
  font-size: 1.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #0f172a;
}

.hoja-findeco-logo {
  display: block;
  width: min(100%, 12.5rem);
  height: auto;
  margin: 0 auto 0.5rem;
  object-fit: contain;
}

.hoja-findeco-cartera,
.hoja-findeco-fecha {
  margin: 0.15rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #111827;
}

.hoja-findeco-datatable {
  min-width: 52rem;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 0.82rem;
}

.hoja-findeco-datatable :deep(.p-datatable-table) {
  border-collapse: collapse;
  min-width: 52rem;
}

.hoja-findeco-datatable :deep(.p-datatable-thead > tr > th) {
  background: #f3f4f6;
  border: 1px solid #111827;
  color: #111827;
  font-weight: 700;
  font-size: 0.74rem;
  text-align: center;
  padding: 0.35rem 0.45rem;
  white-space: nowrap;
}

.hoja-findeco-datatable :deep(.p-datatable-tbody > tr > td) {
  border: 1px solid #111827;
  padding: 0.35rem 0.45rem;
  color: #111827;
  font-size: 0.82rem;
}

.hoja-findeco-datatable :deep(.p-datatable-tbody > tr:nth-child(even) > td) {
  background: #fafafa;
}

.hoja-findeco-datatable :deep(.p-paginator) {
  border: 1px solid #dbe3ee;
  border-top: none;
  border-radius: 0 0 4px 4px;
  font-size: 0.82rem;
}

.hoja-findeco-totales-bar {
  display: flex;
  justify-content: flex-end;
  align-items: stretch;
  border: 1px solid #111827;
  border-top: none;
  background: #fafafa;
  font-weight: 700;
  font-size: 0.82rem;
}

.hoja-findeco-totales-bar .totales-label {
  flex: 1 1 auto;
  text-align: right;
  padding: 0.4rem 0.75rem;
  border-right: 1px solid #111827;
}

.hoja-findeco-totales-bar .totales-monto {
  flex: 0 0 6.5rem;
  text-align: right;
  padding: 0.4rem 0.45rem;
  border-right: 1px solid #111827;
}

.hoja-findeco-totales-bar .totales-monto:last-child {
  border-right: none;
}

.hoja-findeco-table {
  width: 100%;
  min-width: 52rem;
  border-collapse: collapse;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 0.82rem;
  color: #111827;
}

.hoja-findeco-table th,
.hoja-findeco-table td {
  border: 1px solid #111827;
  padding: 0.35rem 0.45rem;
  vertical-align: middle;
}

.hoja-findeco-table thead th {
  background: #f3f4f6;
  font-weight: 700;
  text-align: center;
  font-size: 0.74rem;
  line-height: 1.2;
}

.col-n {
  width: 2.2rem;
  text-align: center;
}

.col-nombre {
  min-width: 11rem;
  text-align: left;
  font-weight: 600;
}

.col-fecha {
  width: 6.5rem;
  text-align: center;
  white-space: nowrap;
}

.col-monto {
  width: 6.5rem;
  text-align: right;
  white-space: nowrap;
}

.col-prestamo {
  width: 6.5rem;
  text-align: center;
  white-space: nowrap;
  font-weight: 600;
}

.col-cel {
  width: 6.5rem;
  text-align: center;
  white-space: nowrap;
}

.hoja-findeco-totales td {
  font-weight: 700;
  background: #fafafa;
}

.totales-label {
  text-align: right;
  padding-right: 0.75rem;
}

@media print {
  .no-print {
    display: none !important;
  }
}
</style>
