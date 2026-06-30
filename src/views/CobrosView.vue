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
import Tag from 'primevue/tag'

import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'
import { formatDate, formatMoney } from '@/utils/format'
import {
  fechaCobroModalNegocio,
  resolverDiaCobroOperativo,
} from '@/utils/cobroFechas'
import { montoAbonoCapitalInteres } from '@/utils/cobroPago'
import {
  abrirFacturaPago,
  buildPagoPorCuotaConFallback,
  buildPagoPorCuotaNumero,
} from '@/utils/facturaPago'
import EstadoCuentaPdfDialog from '@/components/EstadoCuentaPdfDialog.vue'
import { fetchEstadoCuentaPdfBlob } from '@/utils/estadoCuentaPdf'
import {
  compartirPdfPorWhatsApp,
  mensajeEstadoCuentaPdf,
} from '@/utils/whatsappCliente'
import type {
  Cliente,
  Pago,
  Paginated,
  Prestamo,
  PrestamoCuotaRow,
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

const DIA_COBRO_ETIQUETA: Record<DiaCobroCartera, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
}

function etiquetaDiaCobro(dia: string | null | undefined): string {
  if (!dia) return '—'
  return DIA_COBRO_ETIQUETA[dia as DiaCobroCartera] ?? dia
}

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
const hojaPreviewVisible = ref(false)
const hojaPreviewCargando = ref(false)
const hojaImprimiendo = ref(false)

const hojaTableFirst = computed(() => (hojaCobrosPage.value - 1) * hojaCobrosPageSize.value)

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
  monto_pendiente: number
  saldo_capital_programado: number
  saldo_inicial?: number
  saldo_actual?: number
} | null>(null)
const proximaCuotaSemanalMensaje = ref('')
const proximaCuotaAtrasadas = ref({ count: 0, numeros: '' })
const buscarClienteLoading = ref(false)
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
const estadoCuentaCuotasPlan = ref<PrestamoCuotaRow[]>([])

interface FilaCuotaEstadoCuenta {
  numero_cuota: number
  fecha_programada: string
  total_programado: string | number
  saldo_capital_programado: string | number
  estado: 'pendiente' | 'pagada'
  id_pago: number | null
  fecha_pago: string | null
  documento: string | null
}
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
  numeroPrestamo: '',
  montoPrestamo: 0,
  plazo: 0,
  cartera: '',
})

const estadoCuentaPagosOrdenados = computed(() =>
  [...estadoCuentaRows.value].sort((a, b) => {
    const ta = new Date(a.fecha_pago).getTime()
    const tb = new Date(b.fecha_pago).getTime()
    if (ta !== tb) return ta - tb
    return a.id_pago - b.id_pago
  }),
)

const estadoCuentaPagoPorCuota = computed(() =>
  buildPagoPorCuotaConFallback(estadoCuentaCuotasPlan.value, estadoCuentaPagosOrdenados.value),
)

const estadoCuentaFilasCuotas = computed((): FilaCuotaEstadoCuenta[] =>
  [...estadoCuentaCuotasPlan.value]
    .sort((a, b) => a.numero_cuota - b.numero_cuota)
    .map((cuota) => {
      const pago = estadoCuentaPagoPorCuota.value.get(cuota.numero_cuota)
      return {
        numero_cuota: cuota.numero_cuota,
        fecha_programada: cuota.fecha_programada,
        total_programado: cuota.total_programado,
        saldo_capital_programado: cuota.saldo_capital_programado,
        estado: pago ? 'pagada' : 'pendiente',
        id_pago: pago?.id_pago ?? null,
        fecha_pago: pago?.fecha_pago ?? null,
        documento: pago?.documento ?? null,
      }
    }),
)

const estadoCuentaCuotasPendientes = computed(() =>
  estadoCuentaFilasCuotas.value.filter((f) => f.estado === 'pendiente'),
)
const estadoCuentaCuotasPagadas = computed(() =>
  estadoCuentaFilasCuotas.value.filter((f) => f.estado === 'pagada'),
)
const estadoCuentaTotalAbonado = computed(() =>
  estadoCuentaPagosOrdenados.value.reduce(
    (sum, p) => sum + (Number(p.capital) || 0) + (Number(p.interes) || 0) + (Number(p.mora) || 0),
    0,
  ),
)
const cajaForm = ref({
  id_prestamo: null as number | null,
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
  mora: 0,
  saldo_inicial: 0,
  saldo_actual: 0,
  saldo: 0,
  monto_recibido: 0,
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

const hojaCarteras = ref<Cartera[]>([])

const carteraHojaOpciones = computed(() => {
  const opciones = hojaCarteras.value.map((c) => ({ label: c.nombre, value: c.id_cartera as number }))
  if (esCobrador.value) {
    return opciones.length > 1
      ? [{ label: 'Todas mis carteras', value: '' as const }, ...opciones]
      : opciones
  }
  return [{ label: 'Todas las carteras', value: '' as const }, ...opciones]
})

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

function formatNumeroHoja(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  if (Number.isNaN(n)) return String(value)
  return new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function cuotasAtrasadasDesdePlan(
  cuotas: PrestamoCuotaRow[],
  paid: Set<number>,
  hoyIso = getTodayISO(),
): { count: number; numeros: string } {
  const nums = cuotas
    .filter((row) => !paid.has(row.numero_cuota) && row.fecha_programada < hoyIso)
    .map((row) => row.numero_cuota)
  return {
    count: nums.length,
    numeros: nums.join(', '),
  }
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
      cuota: Number.parseFloat(r.total_cuota) || 0,
      saldoActual: Number.parseFloat(r.total_saldo_actual) || 0,
    }
  }
  return { saldoInicial: 0, cuota: 0, saldoActual: 0 }
})

const hojaPreviewTotales = computed(() => {
  let saldoInicial = 0
  let cuota = 0
  let saldoActual = 0
  for (const f of hojaCobrosFilasPrint.value) {
    saldoInicial += Number.parseFloat(f.saldo_inicial) || 0
    cuota += Number.parseFloat(f.cuota) || 0
    saldoActual += Number.parseFloat(f.saldo_actual) || 0
  }
  return { saldoInicial, cuota, saldoActual }
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

async function cargarHojaCobrosFindeco(options?: { all?: boolean; silentEmpty?: boolean }) {
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
      return data.filas ?? []
    }
    hojaCobrosFilas.value = (data.filas ?? []).slice(0, hojaCobrosPageSize.value)
    hojaCobrosResumen.value = data.resumen ?? null
    hojaCobrosFechaReporte.value = data.fecha_reporte ?? getTodayISO()
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
  if (!hojaCobrosTotal.value && !hojaCobrosFilas.value.length) {
    toast.add({ severity: 'warn', summary: 'Hoja de cobros', detail: 'No hay datos para imprimir.', life: 4000 })
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
      detail: getApiErrorMessage(e, 'No se pudo cargar la vista previa.'),
      life: 6000,
    })
  } finally {
    hojaPreviewCargando.value = false
    hojaCobrosLoading.value = false
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

function onHojaCobrosPage(e: { first: number; rows: number }) {
  if (hojaCobrosLoading.value) return
  hojaCobrosPageSize.value = e.rows
  hojaCobrosPage.value = Math.floor(e.first / e.rows) + 1
  void cargarHojaCobrosFindeco({ silentEmpty: true })
}

watch([hojaCobrosCarteraFiltro, hojaCobrosEstadoFiltro], () => {
  hojaCobrosPage.value = 1
  void cargarHojaCobrosFindeco({ silentEmpty: true })
})

async function cargarCatalogoCarterasHoja() {
  try {
    const todos: Cartera[] = []
    let nextUrl: string | null = '/carteras/?page_size=100'
    while (nextUrl) {
      const response = await api.get<Paginated<Cartera>>(nextUrl)
      const pg: Paginated<Cartera> = response.data
      todos.push(...pg.results)
      nextUrl = pg.next
    }
    const asignadas = auth.profile?.carteras ?? []
    if (esCobrador.value && asignadas.length > 0) {
      const ids = new Set(asignadas.map((c) => c.id_cartera))
      hojaCarteras.value = todos
        .filter((c) => ids.has(c.id_cartera))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      if (hojaCarteras.value.length === 1) {
        hojaCobrosCarteraFiltro.value = hojaCarteras.value[0].id_cartera
      }
      return
    }
    hojaCarteras.value = todos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
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

function calculateDaysDiff(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`)
  const to = new Date(`${toISO}T00:00:00`)
  const diff = to.getTime() - from.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

const facturaAbriendoId = ref<number | null>(null)
const pdfEstadoCuentaVisible = ref(false)
const pdfCompartiendo = ref(false)

async function verFacturaPago(idPago: number) {
  facturaAbriendoId.value = idPago
  try {
    await abrirFacturaPago(idPago)
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Factura',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    facturaAbriendoId.value = null
  }
}

async function compartirEstadoFinanciero() {
  const cliente = searchResult.value
  if (!cliente || cliente.prestamoId == null) return
  const pid = cliente.prestamoId

  const telefono = cliente.telefono?.trim() ?? ''
  if (!telefono) {
    pdfEstadoCuentaVisible.value = true
    return
  }

  pdfCompartiendo.value = true
  try {
    const blob = await fetchEstadoCuentaPdfBlob(pid)
    const numeroPrestamo =
      estadoCuentaResumen.value.numeroPrestamo || cliente.prestamoLabel || String(pid)
    const resultado = await compartirPdfPorWhatsApp({
      telefono,
      pdfBlob: blob,
      nombreArchivo: `estado-cuenta-${numeroPrestamo.replace(/\s+/g, '-')}.pdf`,
      mensaje: mensajeEstadoCuentaPdf(cliente.nombre, numeroPrestamo),
    })

    if (resultado.ok) {
      if (resultado.metodo === 'whatsapp-descarga') {
        toast.add({
          severity: 'info',
          summary: 'WhatsApp',
          detail: 'Se descargó el PDF y se abrió el chat. Adjunte el archivo al mensaje.',
          life: 6000,
        })
      }
      return
    }

    if (resultado.razon === 'telefono_invalido') {
      toast.add({
        severity: 'warn',
        summary: 'WhatsApp',
        detail: 'Teléfono inválido. Se abrirá la vista previa del PDF.',
        life: 5000,
      })
    }

    pdfEstadoCuentaVisible.value = true
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Estado financiero',
      detail: getApiErrorMessage(e, 'No se pudo generar el PDF del estado de cuenta.'),
      life: 5000,
    })
  } finally {
    pdfCompartiendo.value = false
  }
}

const cuotasPagoPorPeriodo = computed(() => buildPagoPorCuotaNumero(cuotasPagosRegistrados.value))

const cajaTotalCobrar = computed(() => {
  const pendiente = Number(cajaForm.value.monto_pendiente_cuota) || cajaCuotaPendiente.value
  const m = Number(cajaForm.value.mora) || 0
  return pendiente + m
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
  const mora = Number(cajaForm.value.mora) || 0
  return recibido - mora > cajaCuotaPendiente.value + 0.001
})

const cajaHayPagoParcial = computed(() => {
  const recibido = Number(cajaForm.value.monto_recibido) || 0
  if (recibido <= 0) return false
  return recibido + 0.001 < cajaTotalCobrar.value
})

const cajaPendienteCuotaTrasCobro = computed(() => {
  const mora = Number(cajaForm.value.mora) || 0
  const recibido = Number(cajaForm.value.monto_recibido) || 0
  const abono = montoAbonoCapitalInteres(recibido, mora)
  const pendiente = Number(cajaForm.value.monto_pendiente_cuota) || cajaCuotaPendiente.value
  return Math.max(0, Number((pendiente - abono).toFixed(2)))
})

/** Saldo pendiente tras el cobro (misma métrica que SALDO ACTUAL en la hoja). */
const cajaSaldoPosterior = computed(() => {
  const actual = Number(cajaForm.value.saldo_actual) || 0
  const recibido = Number(cajaForm.value.monto_recibido) || 0
  const mora = Number(cajaForm.value.mora) || 0
  const abono = montoAbonoCapitalInteres(recibido, mora)
  return Math.max(0, Number((actual - abono).toFixed(2)))
})

function puedeCobrarCartera(idCartera: number | null | undefined): boolean {
  if (!esCobrador.value) return true
  if (idCartera == null) return false
  return cobradorCarteraIds.value.has(idCartera)
}

const cajaCarteraBloqueada = computed(() => !puedeCobrarCartera(cajaForm.value.id_cartera))

const cajaCarteraAdvertencia = computed(() => {
  const f = cajaForm.value
  if (
    f.cliente_dia_cobro_semanal &&
    f.cartera_dia_cobro &&
    f.cliente_dia_cobro_semanal !== f.cartera_dia_cobro
  ) {
    return `El día de cobro del cliente (${etiquetaDiaCobro(f.cliente_dia_cobro_semanal)}) no coincide con la cartera del préstamo (${etiquetaDiaCobro(f.cartera_dia_cobro)}).`
  }
  return ''
})

const cajaCarteraEtiqueta = computed(() => {
  const nombre = cajaForm.value.cartera_nombre?.trim()
  if (!nombre) return 'Sin cartera asignada'
  const dia = etiquetaDiaCobro(cajaForm.value.cartera_dia_cobro)
  return `${nombre} (${dia})`
})

const cajaDiaCobroEtiqueta = computed(() =>
  etiquetaDiaCobro(
    resolverDiaCobroOperativo(cajaForm.value.cartera_dia_cobro, cajaForm.value.cliente_dia_cobro_semanal),
  ),
)

function montoRecibidoPorDefecto(montoPendienteCuota: number, mora: number) {
  return Number((montoPendienteCuota + mora).toFixed(2))
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

async function cargarProximaCuotaParaCobro(prestamoId: number | null) {
  proximaCuotaSemanalInfo.value = null
  proximaCuotaSemanalMensaje.value = ''
  proximaCuotaAtrasadas.value = { count: 0, numeros: '' }
  if (prestamoId == null) return

  proximaCuotaSemanalLoading.value = true
  try {
    const { data } = await api.get<ReporteIntegracionResponse>(
      `/prestamos/reporte-integracion/?id_prestamo=${prestamoId}&all=1`,
    )
    const fila = data.filas?.[0]
    if (!fila?.cuota_siguiente_numero) {
      proximaCuotaSemanalMensaje.value = 'Todas las cuotas de este préstamo ya figuran pagadas.'
      return
    }
    const capital = Number.parseFloat(fila.cuota_siguiente_capital ?? '') || 0
    const interes = Number.parseFloat(fila.cuota_siguiente_interes ?? '') || 0
    const montoPendiente = montoPendienteDesdeFilaReporte(fila)
    proximaCuotaSemanalInfo.value = {
      numero_cuota: fila.cuota_siguiente_numero,
      fecha_programada: fila.cuota_siguiente_fecha ?? '',
      capital_programado: capital,
      interes_programado: interes,
      total_programado: montoPendiente,
      monto_pendiente: montoPendiente,
      saldo_capital_programado: Number.parseFloat(fila.cuota_siguiente_saldo_capital ?? '') || 0,
      saldo_inicial: Number.parseFloat(fila.saldo_inicial) || 0,
      saldo_actual: Number.parseFloat(fila.saldo_actual) || 0,
    }
    proximaCuotaAtrasadas.value = {
      count: fila.cuotas_atrasadas ?? 0,
      numeros: fila.cuotas_atrasadas_numeros ?? '',
    }
  } catch (e) {
    proximaCuotaSemanalMensaje.value = getApiErrorMessage(e, 'No se pudo cargar la cuota pendiente.')
  } finally {
    proximaCuotaSemanalLoading.value = false
  }
}

function ensureSearchContextFromPrestamo(prestamoId: number) {
  const meta = prestamoMeta.value.find((p) => p.id_prestamo === prestamoId)
  if (!meta) return
  const cliente = clienteMeta.value.find((c) => c.id_cliente === meta.id_cliente)
  searchResult.value = {
    id_cliente: meta.id_cliente,
    nombre: meta.nombre,
    dni: meta.dni,
    telefono: cliente?.telefono ?? '',
    direccion_residencia: cliente?.direccion_residencia ?? '',
    actividad_economica: cliente?.actividad_economica ?? '',
    hasPrestamo: true,
    prestamoId: meta.id_prestamo,
    prestamoLabel: `${meta.numero_prestamo} (${meta.estado})`,
  }
}

function abrirDialogoCaja(payload: {
  id_prestamo: number
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
  mora?: number
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
  const mora = payload.mora ?? 0
  const saldoActual = payload.saldo_actual ?? payload.saldo ?? 0
  const saldoInicial = payload.saldo_inicial ?? saldoActual
  const montoPendienteCuota =
    payload.monto_pendiente_cuota ?? Number((payload.capital + payload.interes).toFixed(2))
  const fechaEntrega = payload.fecha_entrega?.trim().slice(0, 10) ?? ''
  const fechaProgramada = (payload.fecha_cuota ?? payload.fecha_pago)?.trim().slice(0, 10)
  const fechaCuota = fechaCobroModalNegocio({
    fecha_entrega: fechaEntrega || undefined,
    fecha_programada: fechaProgramada || undefined,
    cuota_numero: payload.cuota_numero,
    cartera_dia_cobro: payload.cartera_dia_cobro,
    cliente_dia_cobro_semanal: payload.cliente_dia_cobro_semanal,
  })
  const fechaPago = fechaCuota
  cajaForm.value = {
    id_prestamo: payload.id_prestamo,
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
    mora,
    saldo_inicial: saldoInicial,
    saldo_actual: saldoActual,
    saldo: saldoActual,
    monto_recibido: montoRecibidoPorDefecto(montoPendienteCuota, mora),
  }
  cajaVisible.value = true
}

async function resolverDniPrestamo(prestamoId: number): Promise<string> {
  const meta = prestamoMeta.value.find((p) => p.id_prestamo === prestamoId)
  if (meta?.dni) return meta.dni
  try {
    const resolved = await resolverClientePorPrestamo(prestamoId)
    return resolved.dni
  } catch {
    return ''
  }
}

function moraSugeridaDesdeCapital(capital: number, diasMora: number): number {
  if (diasMora <= 0 || capital <= 0) return 0
  return Number((capital * 0.02).toFixed(2))
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
    mora: moraSugeridaDesdeCapital(capital, fila.dias_mora ?? 0),
    saldo_inicial: Number.parseFloat(fila.saldo_inicial) || 0,
    saldo_actual: Number.parseFloat(fila.saldo_actual) || 0,
  })
}

async function buscarCliente() {
  const q = clienteSearch.value.trim()
  if (!q) {
    toast.add({
      severity: 'warn',
      summary: 'Buscar cliente',
      detail: 'Ingresa el DNI o nombre del cliente.',
      life: 3500,
    })
    return
  }
  buscarClienteLoading.value = true
  hasClientSearchExecuted.value = true
  searchResult.value = null
  proximaCuotaSemanalInfo.value = null
  proximaCuotaSemanalMensaje.value = ''
  proximaCuotaAtrasadas.value = { count: 0, numeros: '' }
  try {
    let cliente = clienteMeta.value.find((c) => c.dni === q)
    if (!cliente) {
      cliente = clienteMeta.value.find((c) => c.nombre.toLowerCase().includes(q.toLowerCase()))
    }
    if (!cliente) {
      const { data } = await api.get<Paginated<Cliente>>(
        `/clientes/?search=${encodeURIComponent(q)}&page_size=10`,
      )
      const hit = data.results[0]
      if (hit) {
        cliente = {
          id_cliente: hit.id_cliente,
          dni: hit.dni ?? '',
          nombre: hit.nombre ?? 'Cliente',
          telefono: hit.telefono ?? '',
          direccion_residencia: hit.direccion_residencia ?? '',
          actividad_economica: hit.actividad_economica ?? '',
        }
      }
    }
    if (!cliente) {
      toast.add({
        severity: 'info',
        summary: 'Sin resultados',
        detail: 'No se encontró un cliente con ese criterio.',
        life: 4000,
      })
      return
    }
    const prestamos = prestamoMeta.value.filter(
      (p) =>
        p.id_cliente === cliente.id_cliente &&
        p.estado !== 'cancelado' &&
        p.estado !== 'pagado',
    )
    const activo =
      prestamos.find((p) => p.estado === 'activo' || p.estado === 'mora') ?? prestamos[0] ?? null
    searchResult.value = {
      id_cliente: cliente.id_cliente,
      nombre: cliente.nombre,
      dni: cliente.dni,
      telefono: cliente.telefono,
      direccion_residencia: cliente.direccion_residencia,
      actividad_economica: cliente.actividad_economica,
      hasPrestamo: prestamos.length > 0,
      prestamoId: activo?.id_prestamo ?? null,
      prestamoLabel: activo ? `${activo.numero_prestamo} (${activo.estado})` : null,
    }
    if (activo?.id_prestamo) {
      await cargarProximaCuotaParaCobro(activo.id_prestamo)
    } else {
      proximaCuotaSemanalMensaje.value = 'El cliente no tiene préstamos activos para cobrar.'
    }
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
  if (!proximaCuotaSemanalInfo.value) {
    await cargarProximaCuotaParaCobro(pid)
  }
  const info = proximaCuotaSemanalInfo.value
  if (!info) {
    toast.add({
      severity: 'warn',
      summary: 'Sin cuota pendiente',
      detail: proximaCuotaSemanalMensaje.value || 'No hay cuota pendiente por cobrar.',
      life: 4500,
    })
    return
  }
  let diasMora = 0
  let carteraInfo: CarteraCobroInfo = {
    id_cartera: null,
    cartera_nombre: '',
    cartera_dia_cobro: '',
    cliente_dia_cobro_semanal: '',
    fecha_entrega: '',
  }
  try {
    const { data: pr } = await api.get<Prestamo>(`/prestamos/${pid}/`)
    diasMora = pr.dias_mora ?? 0
    carteraInfo = await resolverCarteraCobro(pid)
  } catch {
    diasMora = 0
  }
  const saldos = await cargarSaldosReportePrestamo(pid)
  abrirDialogoCaja({
    id_prestamo: pid,
    cliente: searchResult.value?.nombre ?? 'Cliente',
    dni: searchResult.value?.dni ?? '',
    ...carteraInfo,
    cuota_numero: info.numero_cuota,
    fecha_cuota: info.fecha_programada,
    capital: info.capital_programado,
    interes: info.interes_programado,
    monto_pendiente_cuota: info.monto_pendiente,
    mora: moraSugeridaDesdeCapital(info.capital_programado, diasMora),
    saldo_inicial: saldos?.saldo_inicial ?? info.saldo_actual ?? info.saldo_capital_programado,
    saldo_actual: saldos?.saldo_actual ?? info.saldo_actual ?? info.saldo_capital_programado,
  })
}

async function abrirEstadoCuenta(prestamoId?: number | null) {
  const pid = prestamoId ?? searchResult.value?.prestamoId
  if (pid == null) return
  ensureSearchContextFromPrestamo(pid)
  estadoCuentaVisible.value = true
  estadoCuentaLoading.value = true
  estadoCuentaError.value = ''
  estadoCuentaRows.value = []
  estadoCuentaCuotasPlan.value = []
  try {
    const [pagos, { data: pr }, cuotas] = await Promise.all([
      fetchAllPages<Pago>(`/pagos/?id_prestamo=${pid}&page_size=200`),
      api.get<Prestamo>(`/prestamos/${pid}/`),
      fetchAllPages<PrestamoCuotaRow>(
        `/prestamo-cuotas/?id_prestamo=${pid}&page_size=500&ordering=numero_cuota`,
      ),
    ])
    estadoCuentaRows.value = pagos.sort((a, b) => {
      const da = a.fecha_pago.localeCompare(b.fecha_pago)
      return da !== 0 ? da : b.id_pago - a.id_pago
    })
    estadoCuentaCuotasPlan.value = cuotas
    const meta = prestamoMeta.value.find((p) => p.id_prestamo === pid)
    estadoCuentaResumen.value = {
      totalPagos: pagos.length,
      totalCapital: pagos.reduce((s, p) => s + (Number(p.capital) || 0), 0),
      totalInteres: pagos.reduce((s, p) => s + (Number(p.interes) || 0), 0),
      totalMora: pagos.reduce((s, p) => s + (Number(p.mora) || 0), 0),
      tieneMoraVigente: pr.estado === 'mora' || (pr.dias_mora ?? 0) > 0,
      tuvoMoraPagada: pagos.some((p) => (Number(p.mora) || 0) > 0),
      diasMora: pr.dias_mora ?? 0,
      estadoPrestamo: pr.estado ?? '',
      numeroPrestamo: pr.numero_prestamo?.trim() || meta?.numero_prestamo || String(pid),
      montoPrestamo: Number(pr.monto) || 0,
      plazo: pr.plazo ?? 0,
      cartera: meta?.zona?.trim() || (pr.zona?.nombre ?? '').trim(),
    }
  } catch (e) {
    estadoCuentaError.value = getApiErrorMessage(e, 'No se pudo cargar el estado de cuenta.')
  } finally {
    estadoCuentaLoading.value = false
  }
}

async function abrirCuotas(prestamoId?: number | null) {
  const pid = prestamoId ?? searchResult.value?.prestamoId
  if (pid == null) return
  ensureSearchContextFromPrestamo(pid)
  cuotasVisible.value = true
  cuotasLoading.value = true
  cuotasError.value = ''
  cuotasRows.value = []
  cuotasPagosRegistrados.value = []
  cuotasPrestamoId.value = pid
  try {
    const [cuotas, pagos] = await Promise.all([
      fetchAllPages<PrestamoCuotaRow>(
        `/prestamo-cuotas/?id_prestamo=${pid}&page_size=500&ordering=numero_cuota`,
      ),
      fetchAllPages<Pago>(`/pagos/?id_prestamo=${pid}&page_size=500`),
    ])
    cuotasRows.value = cuotas.map((c) => ({
      periodo: c.numero_cuota,
      fecha_limite: c.fecha_programada,
      capital: Number(c.capital_programado),
      interes: Number(c.interes_programado),
      saldo: Number(c.saldo_capital_programado),
    }))
    cuotasPagosRegistrados.value = pagos
  } catch (e) {
    cuotasError.value = getApiErrorMessage(e, 'No se pudo cargar el calendario de cuotas.')
  } finally {
    cuotasLoading.value = false
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
  try {
    const { data } = await api.get<ReporteIntegracionResponse>(
      `/prestamos/reporte-integracion/?id_prestamo=${pid}&all=1`,
    )
    const fila = data.filas?.[0]
    fechaCuota = fila?.cuota_siguiente_fecha ?? undefined
    if (fila) montoPendiente = montoPendienteDesdeFilaReporte(fila)
  } catch {
    fechaCuota = undefined
    montoPendiente = undefined
  }

  abrirDialogoCaja({
    id_prestamo: pid,
    cliente: clienteNombre,
    dni: dniResolved,
    ...carteraInfo,
    cuota_numero: cuotaN,
    fecha_cuota: fechaCuota,
    capital,
    interes,
    monto_pendiente_cuota: montoPendiente ?? capital + interes,
    mora: 0,
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
    cajaForm.value.mora < 0 ||
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
      mora: cajaForm.value.mora,
      saldo: cajaSaldoPosterior.value,
      monto_recibido: montoRecibido.toFixed(2),
    }

    const { data: pagoCreado } = await api.post<Pago>('/pagos/', payload)

    let detail = `Se registró la cuota #${cajaForm.value.cuota_numero}.`
    if (pagoCreado.distribucion?.length) {
      const partes = pagoCreado.distribucion
        .map((linea) => `Cuota #${linea.cuota}: ${formatMoney(Number(linea.total))}`)
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
    await cargarProximaCuotaParaCobro(cajaForm.value.id_prestamo)
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

async function aplicarMoraDesdeAlerta(alerta: { periodo: number; capital: number; interes: number; saldo: number; mora_sugerida: number }) {
  if (cuotasPrestamoId.value == null || !searchResult.value) return
  const saldos = await cargarSaldosReportePrestamo(cuotasPrestamoId.value)
  let carteraInfo: CarteraCobroInfo = {
    id_cartera: null,
    cartera_nombre: '',
    cartera_dia_cobro: '',
    cliente_dia_cobro_semanal: '',
    fecha_entrega: '',
  }
  try {
    carteraInfo = await resolverCarteraCobro(cuotasPrestamoId.value)
  } catch {
    /* sin cartera */
  }
  const filaCuota = cuotasRows.value.find((row) => row.periodo === alerta.periodo)
  const fechaCuota = filaCuota?.fecha_limite
  let montoPendiente = alerta.capital + alerta.interes
  try {
    const { data } = await api.get<ReporteIntegracionResponse>(
      `/prestamos/reporte-integracion/?id_prestamo=${cuotasPrestamoId.value}&all=1`,
    )
    const fila = data.filas?.[0]
    if (fila) montoPendiente = montoPendienteDesdeFilaReporte(fila)
  } catch {
    /* sin reporte */
  }
  abrirDialogoCaja({
    id_prestamo: cuotasPrestamoId.value,
    cliente: searchResult.value.nombre,
    dni: searchResult.value.dni,
    ...carteraInfo,
    cuota_numero: alerta.periodo,
    fecha_cuota: fechaCuota,
    capital: alerta.capital,
    interes: alerta.interes,
    monto_pendiente_cuota: montoPendiente,
    mora: alerta.mora_sugerida,
    saldo_inicial: saldos?.saldo_inicial ?? alerta.saldo,
    saldo_actual: saldos?.saldo_actual ?? alerta.saldo,
  })
}

onMounted(async () => {
  if (auth.isAuthenticated && !auth.profile) {
    await auth.fetchProfile()
  }
  await cargarCatalogoCarterasHoja()
  resetClienteForm()
  resetPrestamoForm()
  try {
    await loadPrestamos()
  } catch (e) {
    toast.add({ severity: 'warn', summary: 'Préstamos', detail: getApiErrorMessage(e), life: 5000 })
  }

  await cargarHojaCobrosFindeco()

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
  <div class="page cobros-page">
    <section class="hoja-findeco-section">
      <div class="hoja-findeco-toolbar no-print">
        <Select
          v-model="hojaCobrosCarteraFiltro"
          :options="carteraHojaOpciones"
          option-label="label"
          option-value="value"
          placeholder="Cartera"
          class="hoja-cartera-select filtro-hoja-select"
          show-clear
        />
        <Select
          v-model="hojaCobrosEstadoFiltro"
          :options="estadoHojaOpciones"
          option-label="label"
          option-value="value"
          placeholder="Estado préstamo"
          class="hoja-estado-select filtro-hoja-select"
        />
        <Button
          label="Actualizar hoja"
          icon="pi pi-refresh"
          type="button"
          severity="secondary"
          :loading="hojaCobrosLoading"
          @click="() => void cargarHojaCobrosFindeco()"
        />
        <Button
          label="Imprimir"
          icon="pi pi-print"
          type="button"
          severity="success"
          outlined
          :loading="hojaPreviewCargando"
          :disabled="!hojaCobrosTotal || hojaCobrosLoading || hojaPreviewCargando"
          @click="abrirVistaPreviaHoja"
        />
        <span v-if="hojaCobrosTotal" class="hoja-findeco-contador no-print">
          {{ hojaCobrosTotal }} cliente{{ hojaCobrosTotal === 1 ? '' : 's' }}
        </span>
      </div>

      <article v-if="hojaCobrosCargada || hojaCobrosLoading" class="hoja-findeco-sheet">
        <header class="hoja-findeco-header">
          <h1 class="hoja-findeco-marca">FINDECO</h1>
          <p class="hoja-findeco-cartera">CARTERA: {{ hojaCobrosTituloCartera }}</p>
          <p class="hoja-findeco-fecha">FECHA: {{ hojaCobrosFechaLegible }}</p>
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
          <Column header="ABONO" style="width: 5.5rem" />
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
        </header>

        <div class="hoja-preview-scroll">
          <table class="hoja-findeco-table hoja-preview-table">
            <thead>
              <tr>
                <th class="col-n">N</th>
                <th class="col-nombre">NOMBRE CLIENTE</th>
                <th class="col-fecha">ENTREGA</th>
                <th class="col-fecha">VENCE</th>
                <th class="col-monto">SALDO INICIAL</th>
                <th class="col-monto">CUOTA</th>
                <th class="col-monto">CUOTA PEND.</th>
                <th class="col-monto">SALDO ACTUAL</th>
                <th class="col-abono">ABONO</th>
                <th class="col-cel">CELULAR</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(fila, index) in hojaCobrosFilasPrint" :key="`preview-${fila.id_prestamo}`">
                <td class="col-n">{{ index + 1 }}</td>
                <td class="col-nombre">{{ fila.nombre_cliente }}</td>
                <td class="col-fecha">{{ formatDate(fila.fecha_entrega) }}</td>
                <td class="col-fecha">{{ formatDate(fila.fecha_vencimiento) }}</td>
                <td class="col-monto">{{ formatNumeroHoja(fila.saldo_inicial) }}</td>
                <td class="col-monto">{{ formatNumeroHoja(fila.cuota) }}</td>
                <td class="col-monto col-cuota-pend">
                  <span>{{ formatNumeroHoja(fila.cuota_siguiente_monto) || '—' }}</span>
                  <span v-if="(fila.cuotas_atrasadas ?? 0) > 0" class="cuotas-atrasadas-tag-print">
                    {{ textoCuotasAtrasadas(fila) }}
                  </span>
                </td>
                <td class="col-monto">{{ formatNumeroHoja(fila.saldo_actual) }}</td>
                <td class="col-abono"></td>
                <td class="col-cel">{{ fila.telefono?.trim() || '' }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="hoja-findeco-totales">
                <td colspan="4" class="totales-label">TOTALES:</td>
                <td class="col-monto">{{ formatNumeroHoja(hojaPreviewTotales.saldoInicial) }}</td>
                <td class="col-monto">{{ formatNumeroHoja(hojaPreviewTotales.cuota) }}</td>
                <td class="col-monto"></td>
                <td class="col-monto">{{ formatNumeroHoja(hojaPreviewTotales.saldoActual) }}</td>
                <td colspan="2"></td>
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
            :loading="hojaImprimiendo"
            @click="ejecutarImpresionDesdePreview"
          />
        </div>
      </template>
    </Dialog>

    <section v-if="canWritePagos" class="gestion-cobros-section no-print">
      <h2 class="section-title">Gestión de cobro de cuotas</h2>
      <p class="hint-text">
        Busca un cliente por DNI o nombre, o pulsa <strong>Cobrar</strong> en la hoja de arriba para registrar el pago y
        generar la factura.
      </p>

      <div class="transacciones-panel">
        <div class="cobros-busqueda-stack">
          <div class="dni-search-wrap dni-busqueda-linea">
            <InputText
              v-model="clienteSearch"
              placeholder="DNI o nombre del cliente"
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
        </div>

        <p v-if="hasClientSearchExecuted && !searchResult && !buscarClienteLoading" class="gestion-sin-resultado">
          No se encontró cliente con ese criterio.
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

          <p v-if="proximaCuotaSemanalLoading" class="cuota-semanal-muted">Cargando cuota pendiente…</p>

          <div v-else-if="proximaCuotaSemanalInfo" class="cuota-semanal-card">
            <div class="cuota-semanal-head">
              <span class="cuota-semanal-titulo">Cuota #{{ proximaCuotaSemanalInfo.numero_cuota }} pendiente</span>
              <span class="cuota-semanal-monto">{{ formatMoney(proximaCuotaSemanalInfo.monto_pendiente) }}</span>
            </div>
            <p class="cuota-semanal-meta">
              Fecha programada: {{ formatDate(proximaCuotaSemanalInfo.fecha_programada) }} · Capital:
              {{ formatMoney(proximaCuotaSemanalInfo.capital_programado) }} · Interés:
              {{ formatMoney(proximaCuotaSemanalInfo.interes_programado) }} · Saldo actual:
              {{ formatMoney(proximaCuotaSemanalInfo.saldo_actual ?? proximaCuotaSemanalInfo.saldo_inicial ?? 0) }}
            </p>
            <p v-if="proximaCuotaAtrasadas.count > 0" class="cuotas-atrasadas-alerta">
              {{ proximaCuotaAtrasadas.count }} cuota{{ proximaCuotaAtrasadas.count === 1 ? '' : 's' }} vencida{{
                proximaCuotaAtrasadas.count === 1 ? '' : 's'
              }}
              sin cobro (#{{ proximaCuotaAtrasadas.numeros.replace(/,\s*/g, ', #') }})
            </p>
          </div>
          <p v-else-if="proximaCuotaSemanalMensaje" class="cuota-semanal-muted">{{ proximaCuotaSemanalMensaje }}</p>

          <div class="result-actions">
            <Button
              label="Cobrar cuota"
              icon="pi pi-wallet"
              type="button"
              severity="success"
              :disabled="!searchResult.prestamoId || proximaCuotaSemanalLoading"
              @click="abrirCobroDesdeBusqueda"
            />
            <Button
              label="Estado de cuenta"
              icon="pi pi-list"
              type="button"
              severity="secondary"
              outlined
              :disabled="!searchResult.prestamoId"
              @click="() => abrirEstadoCuenta()"
            />
            <Button
              label="Calendario de cuotas"
              icon="pi pi-calendar"
              type="button"
              severity="secondary"
              outlined
              :disabled="!searchResult.prestamoId"
              @click="() => abrirCuotas()"
            />
          </div>
        </div>
      </div>
    </section>

    <Dialog
      v-model:visible="estadoCuentaVisible"
      header="Estado de cuenta"
      modal
      :style="{ width: 'min(85rem, 98vw)' }"
      :content-style="{ maxHeight: '85vh', overflow: 'auto' }"
    >
      <div class="estado-cuenta-wrap">
        <p v-if="estadoCuentaError" class="estado-error">{{ estadoCuentaError }}</p>
        <template v-else>
          <div v-if="searchResult" class="estado-cliente-bar">
            <div class="estado-cliente-datos">
              <strong>{{ searchResult.nombre }}</strong>
              <span v-if="searchResult.dni"> · DNI {{ searchResult.dni }}</span>
              <span v-if="searchResult.telefono"> · {{ searchResult.telefono }}</span>
              <span v-if="estadoCuentaResumen.numeroPrestamo">
                · Préstamo {{ estadoCuentaResumen.numeroPrestamo }}
              </span>
              <span v-if="estadoCuentaResumen.cartera"> · {{ estadoCuentaResumen.cartera }}</span>
            </div>
            <Button
              label="Compartir estado financiero"
              icon="pi pi-share-alt"
              type="button"
              severity="secondary"
              outlined
              size="small"
              :loading="pdfCompartiendo"
              :disabled="estadoCuentaLoading || pdfCompartiendo || !!estadoCuentaError"
              @click="compartirEstadoFinanciero"
            />
          </div>
          <div class="estado-resumen-grid">
            <div class="estado-card">
              <strong>Monto préstamo:</strong> {{ formatMoney(estadoCuentaResumen.montoPrestamo) }}
            </div>
            <div class="estado-card"><strong>Plazo:</strong> {{ estadoCuentaResumen.plazo }} cuotas</div>
            <div class="estado-card">
              <strong>Total abonado:</strong> {{ formatMoney(estadoCuentaTotalAbonado) }}
            </div>
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
            <div class="estado-card">
              <strong>Cuotas pagadas:</strong> {{ estadoCuentaCuotasPagadas.length }}
            </div>
            <div class="estado-card">
              <strong>Cuotas pendientes:</strong> {{ estadoCuentaCuotasPendientes.length }}
            </div>
          </div>

          <h4 class="subsection-title">Cuotas pendientes</h4>
          <p v-if="!estadoCuentaLoading && !estadoCuentaCuotasPendientes.length" class="texto-muted">
            No hay cuotas pendientes en el plan de pago.
          </p>
          <DataTable
            v-else
            :value="estadoCuentaCuotasPendientes"
            data-key="numero_cuota"
            :loading="estadoCuentaLoading"
            size="small"
            striped-rows
            responsive-layout="scroll"
            class="estado-table"
          >
            <Column field="numero_cuota" header="N" style="width: 4rem" />
            <Column header="Fecha">
              <template #body="{ data }: { data: FilaCuotaEstadoCuenta }">
                {{ formatDate(data.fecha_programada) }}
              </template>
            </Column>
            <Column header="Cuota">
              <template #body="{ data }: { data: FilaCuotaEstadoCuenta }">
                {{ formatMoney(data.total_programado) }}
              </template>
            </Column>
            <Column header="Saldo">
              <template #body="{ data }: { data: FilaCuotaEstadoCuenta }">
                {{ formatMoney(data.saldo_capital_programado) }}
              </template>
            </Column>
            <Column header="Estado" style="width: 7rem">
              <template #body>
                <Tag severity="warn" value="Pendiente" />
              </template>
            </Column>
          </DataTable>

          <h4 class="subsection-title">Cuotas pagadas</h4>
          <p v-if="!estadoCuentaLoading && !estadoCuentaCuotasPagadas.length" class="texto-muted">
            Aún no hay cuotas pagadas registradas en este préstamo.
          </p>
          <DataTable
            v-else
            :value="estadoCuentaCuotasPagadas"
            data-key="numero_cuota"
            :loading="estadoCuentaLoading"
            size="small"
            striped-rows
            responsive-layout="scroll"
            class="estado-table"
          >
            <Column field="numero_cuota" header="N" style="width: 4rem" />
            <Column header="Fecha pago">
              <template #body="{ data }: { data: FilaCuotaEstadoCuenta }">
                {{ data.fecha_pago ? formatDate(data.fecha_pago) : '—' }}
              </template>
            </Column>
            <Column header="Cuota">
              <template #body="{ data }: { data: FilaCuotaEstadoCuenta }">
                {{ formatMoney(data.total_programado) }}
              </template>
            </Column>
            <Column header="Documento">
              <template #body="{ data }: { data: FilaCuotaEstadoCuenta }">
                {{ data.documento || `Cuota ${data.numero_cuota}` }}
              </template>
            </Column>
            <Column header="Factura" style="width: 8rem">
              <template #body="{ data }: { data: FilaCuotaEstadoCuenta }">
                <Button
                  v-if="data.id_pago"
                  icon="pi pi-file-pdf"
                  label="Ver"
                  size="small"
                  severity="secondary"
                  outlined
                  :loading="facturaAbriendoId === data.id_pago"
                  :disabled="facturaAbriendoId != null && facturaAbriendoId !== data.id_pago"
                  @click="verFacturaPago(data.id_pago)"
                />
                <span v-else class="texto-muted">—</span>
              </template>
            </Column>
          </DataTable>

          <h4 class="subsection-title">Historial de pagos</h4>
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
            <Column field="documento" header="Documento" />
            <Column header="Factura" style="width: 8rem">
              <template #body="{ data }: { data: Pago }">
                <Button
                  icon="pi pi-file-pdf"
                  label="Ver"
                  size="small"
                  severity="secondary"
                  outlined
                  :loading="facturaAbriendoId === data.id_pago"
                  :disabled="facturaAbriendoId != null && facturaAbriendoId !== data.id_pago"
                  @click="verFacturaPago(data.id_pago)"
                />
              </template>
            </Column>
          </DataTable>
        </template>
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
          <Column header="Factura" style="width: 8rem">
            <template #body="{ data }">
              <Button
                v-if="cuotasPagoPorPeriodo.get(data.periodo)"
                icon="pi pi-file-pdf"
                label="Ver"
                size="small"
                severity="secondary"
                outlined
                :loading="facturaAbriendoId === cuotasPagoPorPeriodo.get(data.periodo)!.id_pago"
                :disabled="facturaAbriendoId != null && facturaAbriendoId !== cuotasPagoPorPeriodo.get(data.periodo)!.id_pago"
                @click="verFacturaPago(cuotasPagoPorPeriodo.get(data.periodo)!.id_pago)"
              />
              <span v-else class="texto-muted">—</span>
            </template>
          </Column>
        </DataTable>
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
          <span class="caja-total-label">Total a cobrar (pendiente cuota + mora)</span>
          <strong class="caja-total-valor">{{ formatMoney(cajaTotalCobrar) }}</strong>
        </div>
        <p v-if="cajaHayPagoParcial" class="caja-excedente-hint">
          Pago parcial: se registrará {{ formatMoney(cajaForm.monto_recibido) }}. Quedará pendiente
          {{ formatMoney(cajaPendienteCuotaTrasCobro) }} en la cuota #{{ cajaForm.cuota_numero }} (sin interés adicional).
        </p>
        <p v-else-if="cajaHayExcedente" class="caja-excedente-hint">
          El monto recibido excede esta cuota; el sobrante se abonará a la(s) siguiente(s).
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
          <p v-else-if="cajaCarteraAdvertencia" class="caja-cartera-hint">{{ cajaCarteraAdvertencia }}</p>
          <div class="result-field">
            <label class="result-label" for="cj-prestamo">Préstamo</label>
            <InputText id="cj-prestamo" :model-value="String(cajaForm.id_prestamo ?? '')" readonly />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-cuota">Número de cuota</label>
            <InputText id="cj-cuota" :model-value="String(cajaForm.cuota_numero)" readonly />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-dia-cobro">Día de cobro</label>
            <InputText id="cj-dia-cobro" :model-value="cajaDiaCobroEtiqueta" readonly />
          </div>
          <div class="result-field">
            <label class="result-label" for="cj-fecha">Fecha de cobro ({{ cajaDiaCobroEtiqueta }})</label>
            <InputText id="cj-fecha" v-model="cajaForm.fecha_pago" type="date" />
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

    <EstadoCuentaPdfDialog
      v-model:visible="pdfEstadoCuentaVisible"
      :id-prestamo="searchResult?.prestamoId ?? null"
      :titulo-cliente="searchResult?.nombre"
      :telefono="searchResult?.telefono"
      :numero-prestamo="estadoCuentaResumen.numeroPrestamo || searchResult?.prestamoLabel || undefined"
    />
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

.hoja-cartera-select {
  min-width: 13rem;
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

.estado-cuenta-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.texto-muted {
  color: #94a3b8;
  font-size: 0.85rem;
}

.estado-resumen-grid {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.estado-cliente-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
}

.estado-cliente-datos {
  font-size: 0.9rem;
  color: #0f172a;
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

.hoja-findeco-section {
  margin-bottom: 1.25rem;
}

.hoja-findeco-section {
  margin-bottom: 1.25rem;
}

.gestion-cobros-section {
  margin-bottom: 1.5rem;
}

.gestion-sin-resultado {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 0.88rem;
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

.cuotas-atrasadas-alerta {
  margin: 0.5rem 0 0;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 0.82rem;
  font-weight: 600;
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

.hoja-findeco-print-table {
  display: none;
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

.hoja-preview-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  width: 100%;
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

.col-abono {
  width: 5.5rem;
  min-height: 1.4rem;
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

  .hoja-findeco-datatable,
  .hoja-findeco-totales-bar,
  .gestion-cobros-section {
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
