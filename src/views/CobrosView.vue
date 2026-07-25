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
import { getApiErrorMessage, getApiErrorMessageAsync } from '@/api/errors'
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
const hojaCobrosFilasPrint = ref<ReporteIntegracionFila[]>([])
const hojaCobrosResumen = ref<ReporteIntegracionResumen | null>(null)
const hojaCobrosFechaReporte = ref('')
const hojaCobrosGeneradoEn = ref('')
const hojaPreviewVisible = ref(false)
const hojaPreviewCargando = ref(false)
const hojaImprimiendo = ref(false)
const hojaDescargandoPdf = ref(false)

const clienteSearch = ref('')
const buscarClienteLoading = ref(false)
const hasClientSearchExecuted = ref(false)
const searchResult = ref<{
  id_cliente: number
  nombre: string
  dni: string
  telefono: string
  direccion_residencia: string
  prestamoId: number | null
  prestamoLabel: string | null
  cuotaPendiente: number | null
  mensaje: string
} | null>(null)

const hojaTableFirst = computed(() => (hojaCobrosPage.value - 1) * hojaCobrosPageSize.value)

const cajaVisible = ref(false)
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
  hojaCobrosFilasPrint.value = []
  hojaCobrosResumen.value = null
  hojaCobrosTotal.value = 0
  hojaCobrosCargada.value = false
  hojaCobrosPage.value = 1
  hojaCobrosLoading.value = false
  hojaPreviewVisible.value = false
  clienteSearch.value = ''
  hasClientSearchExecuted.value = false
  searchResult.value = null
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

const hojaPreviewTotales = computed(() => {
  let cuota = 0
  for (const f of hojaCobrosFilasPrint.value) {
    const monto = f.cuota_siguiente_monto || f.cuota
    cuota += Number.parseFloat(String(monto ?? '')) || 0
  }
  return { registros: hojaCobrosFilasPrint.value.length, cuota }
})

function etiquetaEstadoHoja(estado: string | undefined | null): string {
  const key = (estado || '').trim()
  const map: Record<string, string> = {
    activo: 'Activo',
    pendiente_aprobacion: 'Pendiente',
    pagado: 'Pagado',
    mora: 'Mora',
    cancelado: 'Cancelado',
  }
  return map[key] || key || '—'
}

function valorCuotaHoja(fila: ReporteIntegracionFila): string {
  const monto = fila.cuota_siguiente_monto ?? fila.cuota
  const texto = formatNumeroHoja(monto)
  if (fila.cuota_siguiente_numero != null) {
    return `#${fila.cuota_siguiente_numero}  ${texto || '—'}`
  }
  return texto || '—'
}

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

async function cargarHojaCobrosFindeco(options?: {
  all?: boolean
  silentEmpty?: boolean
}): Promise<ReporteIntegracionFila[]> {
  if (!carteraHojaRequerida()) {
    reiniciarHojaCobrosSinCartera()
    if (!options?.silentEmpty && !options?.all) {
      toast.add({
        severity: 'warn',
        summary: 'Hoja de cobros',
        detail: 'Seleccione una cartera para consultar la hoja.',
        life: 4000,
      })
    }
    return []
  }
  if (!options?.all) hojaCobrosLoading.value = true
  try {
    const qs = buildHojaCobrosQuery(
      options?.all
        ? { all: '1' }
        : {
            page: String(hojaCobrosPage.value),
            page_size: String(hojaCobrosPageSize.value),
          },
    )
    const url = `/prestamos/reporte-integracion/?${qs.toString()}`
    const { data } = await api.get<ReporteIntegracionResponse>(url)
    if (options?.all) {
      hojaCobrosFechaReporte.value = data.fecha_reporte ?? getTodayISO()
      hojaCobrosGeneradoEn.value = data.generado_en ?? ''
      if (data.resumen) hojaCobrosResumen.value = data.resumen
      return data.filas ?? []
    }
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
    if (!options?.all) {
      toast.add({
        severity: 'error',
        summary: 'Hoja de cobros',
        detail: getApiErrorMessage(e),
        life: 6000,
      })
    } else {
      throw e
    }
  } finally {
    if (!options?.all) hojaCobrosLoading.value = false
  }
  return []
}

async function abrirVistaPreviaHoja() {
  if (!carteraHojaRequerida()) {
    toast.add({
      severity: 'warn',
      summary: 'Hoja de cobros',
      detail: 'Seleccione una cartera para ver el listado.',
      life: 4000,
    })
    return
  }
  hojaPreviewCargando.value = true
  try {
    const filas = await cargarHojaCobrosFindeco({ all: true })
    if (!filas.length) {
      toast.add({
        severity: 'warn',
        summary: 'Hoja de cobros',
        detail: 'No hay préstamos para los filtros seleccionados.',
        life: 4000,
      })
      return
    }
    hojaCobrosFilasPrint.value = filas
    hojaPreviewVisible.value = true
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Hoja de cobros',
      detail: getApiErrorMessage(e, 'No se pudo cargar el listado.'),
      life: 6000,
    })
  } finally {
    hojaPreviewCargando.value = false
  }
}

function cerrarVistaPreviaHoja() {
  hojaPreviewVisible.value = false
}

function ejecutarImpresionDesdePreview() {
  hojaImprimiendo.value = true
  const cleanup = () => {
    document.body.classList.remove('printing-hoja-cobros')
    hojaImprimiendo.value = false
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  document.body.classList.add('printing-hoja-cobros')
  window.print()
}

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombre
  link.click()
  URL.revokeObjectURL(url)
}

function nombreDesdeContentDisposition(header: string | undefined, fallback: string): string {
  if (!header) return fallback
  const match = /filename="?([^";]+)"?/.exec(header)
  return match?.[1] ?? fallback
}

async function descargarHojaCobrosPdf() {
  if (!carteraHojaRequerida()) {
    toast.add({
      severity: 'warn',
      summary: 'Hoja de cobros',
      detail: 'Seleccione una cartera para descargar el listado.',
      life: 4000,
    })
    return
  }
  hojaDescargandoPdf.value = true
  try {
    const qs = buildHojaCobrosQuery({ all: '1', vista: 'listado' })
    const response = await api.get<Blob>(`/prestamos/hoja-cobros-pdf/?${qs.toString()}`, {
      responseType: 'blob',
    })
    const cartera = String(hojaCobrosTituloCartera.value || 'cartera')
      .replace(/\s+/g, '_')
      .toLowerCase()
    const fecha = (hojaCobrosFechaReporte.value || getTodayISO()).replace(/-/g, '')
    const nombre = nombreDesdeContentDisposition(
      response.headers['content-disposition'],
      `hoja_cobros_${cartera}_${fecha}.pdf`,
    )
    descargarBlob(response.data, nombre)
    toast.add({
      severity: 'success',
      summary: 'PDF descargado',
      detail: 'Se descargó el listado completo de la cartera.',
      life: 3000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Hoja de cobros',
      detail: await getApiErrorMessageAsync(e, 'No se pudo descargar el PDF.'),
      life: 6000,
    })
  } finally {
    hojaDescargandoPdf.value = false
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
): Promise<{
  saldo_inicial: number
  saldo_actual: number
  fila: ReporteIntegracionFila | null
} | null> {
  try {
    const { data } = await api.get<ReporteIntegracionResponse>(
      `/prestamos/reporte-integracion/?id_prestamo=${prestamoId}&all=1`,
    )
    const fila = data.filas?.[0] ?? null
    if (!fila) return { saldo_inicial: 0, saldo_actual: 0, fila: null }
    return {
      saldo_inicial: Number.parseFloat(fila.saldo_inicial) || 0,
      saldo_actual: Number.parseFloat(fila.saldo_actual) || 0,
      fila,
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
  omitirFiltroCarteraHoja?: boolean
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
    !payload.omitirFiltroCarteraHoja &&
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
  const fechaCuota = payload.fecha_cuota?.trim().slice(0, 10) || fechaPago
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
    fecha_cuota: fechaCuota,
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

async function abrirCobroDesdeHoja(
  fila: ReporteIntegracionFila,
  options?: { omitirFiltroCarteraHoja?: boolean },
) {
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
    omitirFiltroCarteraHoja: options?.omitirFiltroCarteraHoja,
  })
}

function coincideNumeroPrestamo(numero: string, q: string): boolean {
  const normalizado = numero.trim().toLowerCase()
  const criterio = q.trim().toLowerCase()
  if (!normalizado || !criterio) return false
  return normalizado === criterio || normalizado.includes(criterio)
}

async function buscarPrestamoPorCriterio(q: string): Promise<{
  id_prestamo: number
  id_cliente: number
  numero_prestamo: string
  estado: string
} | null> {
  const idCartera =
    hojaCobrosCarteraFiltro.value !== '' && hojaCobrosCarteraFiltro.value != null
      ? Number(hojaCobrosCarteraFiltro.value)
      : null
  const carteraQs = idCartera != null ? `&id_cartera=${idCartera}` : ''

  const enHoja = hojaCobrosFilas.value.find(
    (f) =>
      coincideNumeroPrestamo(f.numero_prestamo ?? '', q) ||
      (f.numero_prestamo ?? '').trim().toLowerCase() === q.trim().toLowerCase() ||
      (f.nombre_cliente ?? '').toLowerCase().includes(q.toLowerCase()),
  )
  if (enHoja) {
    return {
      id_prestamo: enHoja.id_prestamo,
      id_cliente: 0,
      numero_prestamo: enHoja.numero_prestamo,
      estado: enHoja.estado ?? 'activo',
    }
  }

  const exacto = await api.get<Paginated<Prestamo>>(
    `/prestamos/?numero_prestamo=${encodeURIComponent(q)}${carteraQs}&page_size=5`,
  )
  if (exacto.data.results[0]) {
    const p = exacto.data.results[0]
    return {
      id_prestamo: p.id_prestamo,
      id_cliente: p.id_cliente,
      numero_prestamo: p.numero_prestamo,
      estado: p.estado ?? '',
    }
  }

  const { data } = await api.get<Paginated<Prestamo>>(
    `/prestamos/?search=${encodeURIComponent(q)}${carteraQs}&page_size=20`,
  )
  const criterio = q.trim().toLowerCase()
  const hit =
    data.results.find((p) => (p.numero_prestamo ?? '').trim().toLowerCase() === criterio) ??
    data.results.find((p) => coincideNumeroPrestamo(p.numero_prestamo ?? '', q)) ??
    null
  if (!hit) return null
  return {
    id_prestamo: hit.id_prestamo,
    id_cliente: hit.id_cliente,
    numero_prestamo: hit.numero_prestamo,
    estado: hit.estado ?? '',
  }
}

async function cargarResumenBusqueda(prestamoId: number, cliente: Cliente, numeroPrestamo: string, estado: string) {
  let cuotaPendiente: number | null = null
  let mensaje = ''
  if (estado === 'cancelado' || estado === 'pagado') {
    mensaje = 'El préstamo no está activo para cobrar.'
  } else {
    try {
      const { data } = await api.get<ReporteIntegracionResponse>(
        `/prestamos/reporte-integracion/?id_prestamo=${prestamoId}&all=1`,
      )
      const fila = data.filas?.[0]
      if (!fila || fila.cuota_siguiente_numero == null) {
        mensaje = 'Sin cuota pendiente por cobrar.'
      } else {
        cuotaPendiente = montoPendienteDesdeFilaReporte(fila)
      }
    } catch {
      mensaje = 'No se pudo cargar la cuota pendiente.'
    }
  }

  searchResult.value = {
    id_cliente: cliente.id_cliente,
    nombre: cliente.nombre ?? 'Cliente',
    dni: cliente.dni ?? '',
    telefono: cliente.telefono ?? '',
    direccion_residencia: cliente.direccion_residencia ?? '',
    prestamoId,
    prestamoLabel: `${numeroPrestamo} (${estado})`,
    cuotaPendiente,
    mensaje,
  }
}

async function buscarCliente() {
  const q = clienteSearch.value.trim()
  if (!q) {
    toast.add({
      severity: 'warn',
      summary: 'Buscar cliente',
      detail: 'Ingresa el DNI, nombre o número de préstamo.',
      life: 3500,
    })
    return
  }

  buscarClienteLoading.value = true
  hasClientSearchExecuted.value = true
  searchResult.value = null

  try {
    const prestamoHit = await buscarPrestamoPorCriterio(q)
    if (prestamoHit) {
      let cliente: Cliente
      try {
        if (prestamoHit.id_cliente > 0) {
          const { data } = await api.get<Cliente>(`/clientes/${prestamoHit.id_cliente}/`)
          cliente = data
        } else {
          const { data: pr } = await api.get<Prestamo>(`/prestamos/${prestamoHit.id_prestamo}/`)
          const { data } = await api.get<Cliente>(`/clientes/${pr.id_cliente}/`)
          cliente = data
        }
      } catch {
        const resolved = await resolverClientePorPrestamo(prestamoHit.id_prestamo)
        cliente = {
          id_cliente: prestamoHit.id_cliente || 0,
          nombre: resolved.nombre,
          dni: resolved.dni,
          telefono: null,
          rtn: null,
          direccion_residencia: null,
          direccion_negocio: null,
          referencia: null,
          referencia_parentesco: null,
          referencia_telefono: null,
          actividad_economica: null,
          dia_cobro_semanal: null,
        }
      }
      await cargarResumenBusqueda(
        prestamoHit.id_prestamo,
        cliente,
        prestamoHit.numero_prestamo,
        prestamoHit.estado,
      )
      return
    }

    const { data: clientesData } = await api.get<Paginated<Cliente>>(
      `/clientes/?search=${encodeURIComponent(q)}&page_size=10`,
    )
    const cliente =
      clientesData.results.find((c) => (c.dni ?? '').trim() === q) ??
      clientesData.results.find((c) => (c.dni ?? '').replace(/-/g, '') === q.replace(/-/g, '')) ??
      clientesData.results.find((c) => (c.nombre ?? '').toLowerCase().includes(q.toLowerCase())) ??
      clientesData.results[0] ??
      null

    if (!cliente) {
      toast.add({
        severity: 'info',
        summary: 'Sin resultados',
        detail: 'No se encontró cliente ni préstamo con ese criterio.',
        life: 4000,
      })
      return
    }

    const idCartera =
      hojaCobrosCarteraFiltro.value !== '' && hojaCobrosCarteraFiltro.value != null
        ? Number(hojaCobrosCarteraFiltro.value)
        : null
    const carteraQs = idCartera != null ? `&id_cartera=${idCartera}` : ''
    const { data: prestamosData } = await api.get<Paginated<Prestamo>>(
      `/prestamos/?id_cliente=${cliente.id_cliente}${carteraQs}&page_size=50&ordering=-fecha_entrega,-id_prestamo`,
    )
    const activos = prestamosData.results.filter((p) => p.estado !== 'cancelado' && p.estado !== 'pagado')
    const activo =
      activos.find((p) => p.estado === 'activo' || p.estado === 'mora') ?? activos[0] ?? null

    if (!activo) {
      searchResult.value = {
        id_cliente: cliente.id_cliente,
        nombre: cliente.nombre ?? 'Cliente',
        dni: cliente.dni ?? '',
        telefono: cliente.telefono ?? '',
        direccion_residencia: cliente.direccion_residencia ?? '',
        prestamoId: null,
        prestamoLabel: null,
        cuotaPendiente: null,
        mensaje: 'El cliente no tiene préstamos activos para cobrar.',
      }
      return
    }

    await cargarResumenBusqueda(activo.id_prestamo, cliente, activo.numero_prestamo, activo.estado ?? '')
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Buscar cliente',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    buscarClienteLoading.value = false
  }
}

async function abrirCobroDesdeBusqueda() {
  if (!canWritePagos.value) {
    toast.add({
      severity: 'warn',
      summary: 'Cobros',
      detail: 'Tu rol no puede registrar cobros.',
      life: 4000,
    })
    return
  }
  const pid = searchResult.value?.prestamoId
  if (pid == null) {
    toast.add({
      severity: 'warn',
      summary: 'Cobros',
      detail: 'El cliente no tiene un préstamo seleccionable.',
      life: 4000,
    })
    return
  }

  buscarClienteLoading.value = true
  try {
    const { data } = await api.get<ReporteIntegracionResponse>(
      `/prestamos/reporte-integracion/?id_prestamo=${pid}&all=1`,
    )
    const fila = data.filas?.[0]
    if (!fila) {
      toast.add({
        severity: 'warn',
        summary: 'Cobros',
        detail: 'No se encontró información de cobro para el préstamo.',
        life: 4000,
      })
      return
    }
    await abrirCobroDesdeHoja(fila, { omitirFiltroCarteraHoja: true })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Cobros',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    buscarClienteLoading.value = false
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
  const reporte = await cargarSaldosReportePrestamo(pid)
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
  const filaReporte = reporte?.fila ?? undefined
  const fechaCuota = filaReporte?.cuota_siguiente_fecha ?? undefined
  const montoPendiente = filaReporte ? montoPendienteDesdeFilaReporte(filaReporte) : undefined

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
    saldo_inicial: reporte?.saldo_inicial ?? saldo ?? 0,
    saldo_actual: reporte?.saldo_actual ?? saldo ?? 0,
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
        <Button
          label="Ver listado"
          icon="pi pi-eye"
          type="button"
          severity="success"
          outlined
          :loading="hojaPreviewCargando"
          :disabled="!carteraHojaRequerida() || hojaPreviewCargando"
          title="Abre el listado completo de la cartera para imprimir o descargar PDF"
          @click="() => void abrirVistaPreviaHoja()"
        />
        <Button
          label="Descargar PDF"
          icon="pi pi-file-pdf"
          type="button"
          severity="success"
          :loading="hojaDescargandoPdf"
          :disabled="!carteraHojaRequerida() || hojaDescargandoPdf || hojaPreviewCargando"
          title="Descarga el PDF completo de la cartera seleccionada"
          @click="() => void descargarHojaCobrosPdf()"
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

        <section v-if="canWritePagos" class="gestion-cobros-section no-print">
          <h2 class="section-title">Buscar cliente</h2>
          <p class="hint-text">
            Busca por DNI, nombre o número de préstamo dentro de la cartera cargada.
          </p>

          <div class="dni-search-wrap">
            <InputText
              v-model="clienteSearch"
              placeholder="DNI, nombre o número de préstamo"
              class="campo-buscar-cliente"
              @keyup.enter="buscarCliente"
            />
            <Button
              label="Buscar cliente"
              icon="pi pi-search"
              type="button"
              :loading="buscarClienteLoading"
              @click="buscarCliente"
            />
          </div>

          <p
            v-if="hasClientSearchExecuted && !searchResult && !buscarClienteLoading"
            class="gestion-sin-resultado"
          >
            No se encontró cliente ni préstamo con ese criterio en esta cartera.
          </p>

          <div v-if="searchResult" class="result-box">
            <h3 class="result-title">{{ searchResult.nombre }}</h3>
            <div class="result-form-grid">
              <div class="result-field">
                <span class="result-label">DNI</span>
                <InputText :model-value="searchResult.dni || '—'" readonly />
              </div>
              <div class="result-field">
                <span class="result-label">Teléfono</span>
                <InputText :model-value="searchResult.telefono || '—'" readonly />
              </div>
              <div class="result-field">
                <span class="result-label">Préstamo</span>
                <InputText :model-value="searchResult.prestamoLabel || 'Sin préstamo activo'" readonly />
              </div>
              <div class="result-field">
                <span class="result-label">Dirección</span>
                <InputText :model-value="searchResult.direccion_residencia || '—'" readonly />
              </div>
            </div>

            <p v-if="searchResult.cuotaPendiente != null" class="cuota-busqueda-monto">
              Cuota pendiente: <strong>{{ formatMoney(searchResult.cuotaPendiente) }}</strong>
            </p>
            <p v-else-if="searchResult.mensaje" class="gestion-sin-resultado">{{ searchResult.mensaje }}</p>

            <div class="result-actions">
              <Button
                label="Cobrar cuota"
                icon="pi pi-wallet"
                type="button"
                severity="success"
                :loading="buscarClienteLoading"
                :disabled="!searchResult.prestamoId || searchResult.cuotaPendiente == null"
                @click="abrirCobroDesdeBusqueda"
              />
            </div>
          </div>
        </section>
      </article>
    </section>

    <Dialog
      v-model:visible="hojaPreviewVisible"
      modal
      :show-header="false"
      class="hoja-preview-dialog no-print"
      :style="{ width: 'min(96vw, 78rem)' }"
      :draggable="false"
      @hide="cerrarVistaPreviaHoja"
    >
      <div class="hoja-preview-print-area">
        <header class="hoja-findeco-header hoja-preview-header">
          <img
            src="/findeco-logo.png"
            alt="FINDECO"
            class="hoja-findeco-logo"
            width="200"
            height="52"
          />
          <p class="hoja-findeco-cartera">CARTERA: {{ hojaCobrosTituloCartera }}</p>
          <p class="hoja-findeco-fecha">FECHA: {{ hojaCobrosFechaLegible }}</p>
          <p class="hoja-findeco-fecha">GENERADO: {{ hojaCobrosGeneradoLegible }}</p>
        </header>

        <div class="hoja-preview-scroll">
          <table class="hoja-findeco-table hoja-preview-table hoja-preview-table-simple">
            <thead>
              <tr>
                <th class="col-n">N</th>
                <th class="col-prestamo">Nº PRÉSTAMO</th>
                <th class="col-nombre">NOMBRE CLIENTE</th>
                <th class="col-estado">ESTADO</th>
                <th class="col-monto">CUOTA</th>
                <th class="col-espacio">ESPACIO</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(fila, index) in hojaCobrosFilasPrint" :key="`preview-${fila.id_prestamo}`">
                <td class="col-n">{{ index + 1 }}</td>
                <td class="col-prestamo">{{ fila.numero_prestamo }}</td>
                <td class="col-nombre">{{ fila.nombre_cliente }}</td>
                <td class="col-estado">{{ etiquetaEstadoHoja(fila.estado) }}</td>
                <td class="col-monto">{{ valorCuotaHoja(fila) }}</td>
                <td class="col-espacio"></td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="hoja-findeco-totales">
                <td colspan="3" class="totales-label">
                  TOTALES ({{ hojaPreviewTotales.registros }}):
                </td>
                <td></td>
                <td class="col-monto">{{ formatNumeroHoja(hojaPreviewTotales.cuota) }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <template #footer>
        <div class="hoja-preview-dialog-actions">
          <Button label="Cerrar" severity="secondary" text @click="cerrarVistaPreviaHoja" />
          <Button
            label="Imprimir"
            icon="pi pi-print"
            severity="secondary"
            outlined
            :loading="hojaImprimiendo"
            @click="ejecutarImpresionDesdePreview"
          />
          <Button
            label="Descargar PDF"
            icon="pi pi-download"
            :loading="hojaDescargandoPdf"
            @click="() => void descargarHojaCobrosPdf()"
          />
        </div>
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
          :loading="cajaSaving"
          :disabled="
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

.gestion-cobros-section {
  margin-top: 1.25rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 10px;
  background: var(--p-content-background, #fff);
}

.gestion-cobros-section .section-title {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
  font-weight: 700;
}

.gestion-cobros-section .hint-text {
  margin: 0 0 0.85rem;
  color: var(--p-text-muted-color);
  font-size: 0.92rem;
}

.dni-search-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}

.campo-buscar-cliente {
  flex: 1 1 16rem;
  min-width: 12rem;
}

.gestion-sin-resultado {
  margin: 0.75rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.92rem;
}

.result-box {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 8px;
  background: #fafafa;
}

.result-title {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}

.result-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
}

.result-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.result-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.cuota-busqueda-monto {
  margin: 0.85rem 0 0;
  font-size: 0.95rem;
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.85rem;
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

.hoja-preview-scroll {
  max-height: min(70vh, 42rem);
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
}

.hoja-preview-header {
  margin-bottom: 0.85rem;
}

.hoja-preview-table {
  display: table;
  width: 100%;
}

.hoja-preview-table-simple .col-prestamo {
  width: 12%;
  text-align: center;
}

.hoja-preview-table-simple .col-nombre {
  width: 38%;
  text-align: left;
}

.hoja-preview-table-simple .col-estado {
  width: 14%;
  text-align: center;
}

.hoja-preview-table-simple .col-monto {
  width: 16%;
}

.hoja-preview-table-simple .col-espacio {
  width: 16%;
  min-height: 1.4rem;
}

.hoja-preview-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  width: 100%;
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

.col-abono {
  width: 7rem;
  min-height: 1.6rem;
}

.col-espacio {
  width: 8rem;
  min-height: 1.6rem;
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

  .hoja-findeco-datatable,
  .hoja-findeco-totales-bar {
    display: none !important;
  }

  body.printing-hoja-cobros .p-dialog-mask,
  body.printing-hoja-cobros .hoja-preview-dialog-actions,
  body.printing-hoja-cobros .hoja-findeco-toolbar,
  body.printing-hoja-cobros .p-dialog-header,
  body.printing-hoja-cobros .p-dialog-footer {
    display: none !important;
  }

  body.printing-hoja-cobros .p-dialog {
    position: static !important;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
    transform: none !important;
  }

  body.printing-hoja-cobros .p-dialog-content {
    padding: 0 !important;
    overflow: visible !important;
  }

  body.printing-hoja-cobros .hoja-preview-scroll {
    max-height: none !important;
    overflow: visible !important;
    border: none !important;
  }

  body.printing-hoja-cobros .hoja-preview-print-area {
    display: block !important;
  }

  body.printing-hoja-cobros .hoja-findeco-section {
    display: none !important;
  }

  .hoja-findeco-sheet {
    border: none;
    box-shadow: none;
    padding: 0;
  }

  .hoja-findeco-section {
    margin: 0;
  }
}
</style>
