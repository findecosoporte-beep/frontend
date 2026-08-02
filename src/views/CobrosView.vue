<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteUpdate, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'

import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'

import CarteraDropdown from '@/components/CarteraDropdown.vue'
import CobroCajaDialog from '@/components/CobroCajaDialog.vue'
import type { CobroCajaFormView } from '@/components/CobroCajaDialog.vue'
import HojaCobroCard from '@/components/HojaCobroCard.vue'
import { api } from '@/api/client'
import { getApiErrorMessage, getApiErrorMessageAsync } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'
import { buscarClientes } from '@/utils/buscarClientes'
import { formatDateTime, formatMoney } from '@/utils/format'
import { abrirFacturaPago } from '@/utils/facturaPago'
import { totalCuotasDesdeReporte } from '@/utils/totalCuotasPrestamo'
import type {
  Cliente,
  Pago,
  Paginated,
  Prestamo,
  ReporteIntegracionFila,
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
const HOJA_COBROS_ESTADO = 'activo,pendiente_aprobacion,mora' as const
const hojaCobrosLoading = ref(false)
const hojaCobrosTotal = ref(0)
const hojaCobrosFilas = ref<ReporteIntegracionFila[]>([])
const hojaCobrosFechaReporte = ref('')
const hojaCobrosGeneradoEn = ref('')
const hojaImprimiendo = ref(false)
const hojaDescargandoPdf = ref(false)

const cajaVisible = ref(false)
const cajaSaving = ref(false)
const cajaError = ref('')
const cajaFormError = ref('')
const cajaMontoRecibido = ref('0')
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
  fecha_vencimiento: '',
  cuota_numero: 0,
  fecha_cuota: '',
  fecha_pago: '',
  capital: 0,
  interes: 0,
  monto_pendiente_cuota: 0,
  saldo_inicial: 0,
  saldo_actual: 0,
  saldo: 0,
  telefono: '',
  direccion_residencia: '',
  direccion_negocio: '',
  referencia: '',
  referencia_parentesco: '',
  referencia_telefono: '',
  monto_prestamo: 0,
  cuota_programada: 0,
  total_cuotas: 0,
  fecha_ultimo_pago: '',
  monto_ultimo_pago: '',
  cuota_pendiente_abonado: '',
  cuotas_atrasadas: 0,
  cuotas_atrasadas_numeros: '',
})

function getTodayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const hojaCarteras = ref<Cartera[]>([])
let carterasHojaCache: Cartera[] | null = null

const busquedaQuery = ref('')
const busquedaLoading = ref(false)
const busquedaError = ref('')
const busquedaResultados = ref<Cliente[]>([])
const busquedaCliente = ref<Cliente | null>(null)
const busquedaPrestamos = ref<ReporteIntegracionFila[]>([])

const mostrandoPrestamosBusqueda = computed(
  () => busquedaCliente.value != null && busquedaPrestamos.value.length > 0,
)
const mostrandoResultadosBusqueda = computed(
  () =>
    !mostrandoPrestamosBusqueda.value &&
    (busquedaResultados.value.length > 0 || (busquedaLoading.value && busquedaQuery.value.trim().length >= 2)),
)
const busquedaActiva = computed(
  () =>
    mostrandoPrestamosBusqueda.value ||
    mostrandoResultadosBusqueda.value ||
    busquedaError.value !== '',
)

function carteraHojaRequerida(): boolean {
  return hojaCobrosCarteraFiltro.value !== '' && hojaCobrosCarteraFiltro.value != null
}

function limpiarResultadosHojaCobros() {
  hojaCobrosFilas.value = []
  hojaCobrosTotal.value = 0
  hojaCobrosLoading.value = false
}

function reiniciarHojaCobrosSinCartera() {
  limpiarResultadosHojaCobros()
}

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

const DIAS_HOJA = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIÉRCOLES',
  'JUEVES',
  'VIERNES',
  'SÁBADO',
] as const

function formatFechaHojaLegible(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso.toUpperCase()
  const dia = String(d.getDate()).padStart(2, '0')
  return `${DIAS_HOJA[d.getDay()]} ${dia} DE ${MESES_HOJA[d.getMonth()]} ${d.getFullYear()}`
}

const hojaCobrosFechaLegible = computed(() =>
  hojaCobrosFechaReporte.value
    ? formatFechaHojaLegible(hojaCobrosFechaReporte.value)
    : formatFechaHojaLegible(getTodayISO()),
)

const hojaCobrosGeneradoLegible = computed(() =>
  hojaCobrosGeneradoEn.value
    ? formatDateTime(hojaCobrosGeneradoEn.value)
    : formatDateTime(new Date().toISOString()),
)

function formatNumeroHoja(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  if (Number.isNaN(n)) return String(value)
  return new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const hojaListadoTotales = computed(() => {
  let cuota = 0
  for (const f of hojaCobrosFilas.value) {
    const monto = f.cuota_siguiente_monto || f.cuota
    cuota += Number.parseFloat(String(monto ?? '')) || 0
  }
  return { registros: hojaCobrosFilas.value.length, cuota }
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

function buildHojaCobrosQuery(extra?: Record<string, string>): URLSearchParams {
  const qs = new URLSearchParams()
  if (hojaCobrosCarteraFiltro.value !== '' && hojaCobrosCarteraFiltro.value != null) {
    qs.set('id_cartera', String(hojaCobrosCarteraFiltro.value))
  }
  qs.set('estado', HOJA_COBROS_ESTADO)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) qs.set(k, v)
  }
  return qs
}

async function cargarHojaCobrosFindeco(options?: { silentEmpty?: boolean }): Promise<void> {
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
    const qs = buildHojaCobrosQuery({ all: '1' })
    const url = `/prestamos/reporte-integracion/?${qs.toString()}`
    const { data } = await api.get<ReporteIntegracionResponse>(url)
    hojaCobrosFilas.value = data.filas ?? []
    hojaCobrosTotal.value = hojaCobrosFilas.value.length
    hojaCobrosFechaReporte.value = data.fecha_reporte ?? getTodayISO()
    hojaCobrosGeneradoEn.value = data.generado_en ?? ''
    if (!hojaCobrosTotal.value && !options?.silentEmpty) {
      toast.add({
        severity: 'info',
        summary: 'Hoja de cobros',
        detail: 'No hay préstamos en esta cartera.',
        life: 4000,
      })
    }
  } catch (e) {
    hojaCobrosFilas.value = []
    hojaCobrosTotal.value = 0
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

function onFilaCobroClick(fila: ReporteIntegracionFila) {
  if (!canWritePagos.value) return
  if (fila.cuota_siguiente_numero == null) return
  void abrirCobroDesdeHoja(fila)
}

function ejecutarImpresionListado() {
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

function limpiarPrestamosBusqueda() {
  busquedaCliente.value = null
  busquedaPrestamos.value = []
}

function limpiarBusquedaCliente() {
  busquedaQuery.value = ''
  busquedaError.value = ''
  busquedaResultados.value = []
  limpiarPrestamosBusqueda()
}

function filtrarFilasBusqueda(filas: ReporteIntegracionFila[]): ReporteIntegracionFila[] {
  let resultado = filas
  if (carteraHojaRequerida()) {
    resultado = resultado.filter((f) => f.id_cartera === hojaCobrosCarteraFiltro.value)
  }
  if (esCobrador.value) {
    resultado = resultado.filter(
      (f) => f.id_cartera != null && cobradorCarteraIds.value.has(f.id_cartera),
    )
  }
  return resultado
}

async function buscarClienteEnCobros() {
  const q = busquedaQuery.value.trim()
  if (q.length < 2) {
    busquedaError.value = 'Ingresa al menos 2 caracteres del DNI o nombre del cliente.'
    return
  }
  busquedaLoading.value = true
  busquedaError.value = ''
  limpiarPrestamosBusqueda()
  busquedaResultados.value = []
  try {
    const lista = await buscarClientes(q)
    busquedaResultados.value = lista
    if (!lista.length) {
      busquedaError.value = 'No se encontraron clientes.'
    }
  } catch (e) {
    busquedaError.value = getApiErrorMessage(e, 'Error al buscar cliente.')
    busquedaResultados.value = []
  } finally {
    busquedaLoading.value = false
  }
}

async function seleccionarClienteBusqueda(cliente: Cliente) {
  busquedaLoading.value = true
  busquedaError.value = ''
  limpiarPrestamosBusqueda()
  try {
    const qs = new URLSearchParams({
      id_cliente: String(cliente.id_cliente),
      estado: HOJA_COBROS_ESTADO,
      all: '1',
    })
    const { data } = await api.get<ReporteIntegracionResponse>(
      `/prestamos/reporte-integracion/?${qs.toString()}`,
    )
    const filas = filtrarFilasBusqueda(data.filas ?? [])
    if (!filas.length) {
      const detalleCartera = carteraHojaRequerida()
        ? ' en la cartera seleccionada'
        : esCobrador.value
          ? ' en sus carteras asignadas'
          : ''
      busquedaError.value = `${cliente.nombre} no tiene préstamos activos para cobrar${detalleCartera}.`
      return
    }
    if (filas.length === 1) {
      await abrirCobroDesdeHoja(filas[0]!, { omitirFiltroCarteraHoja: true })
      limpiarBusquedaCliente()
      return
    }
    busquedaCliente.value = cliente
    busquedaPrestamos.value = filas
    busquedaResultados.value = []
  } catch (e) {
    busquedaError.value = getApiErrorMessage(e, 'No se pudieron cargar los préstamos del cliente.')
  } finally {
    busquedaLoading.value = false
  }
}

function volverResultadosBusqueda() {
  limpiarPrestamosBusqueda()
  if (busquedaQuery.value.trim().length >= 2) {
    void buscarClienteEnCobros()
  }
}

function onFilaBusquedaClick(fila: ReporteIntegracionFila) {
  if (!canWritePagos.value) return
  if (fila.cuota_siguiente_numero == null) return
  void abrirCobroDesdeHoja(fila, { omitirFiltroCarteraHoja: true })
}

watch(hojaCobrosCarteraFiltro, (idCartera) => {
  limpiarResultadosHojaCobros()
  if (idCartera !== '' && idCartera != null) {
    void cargarHojaCobrosFindeco()
  }
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

function puedeCobrarCartera(idCartera: number | null | undefined): boolean {
  if (!esCobrador.value) return true
  if (idCartera == null) return false
  return cobradorCarteraIds.value.has(idCartera)
}

const cajaCarteraBloqueada = computed(() => !puedeCobrarCartera(cajaForm.value.id_cartera))

const cajaFormView = computed((): CobroCajaFormView => ({
  cliente: cajaForm.value.cliente,
  dni: cajaForm.value.dni,
  numero_prestamo: cajaForm.value.numero_prestamo,
  cuota_numero: cajaForm.value.cuota_numero,
  telefono: cajaForm.value.telefono,
  direccion_residencia: cajaForm.value.direccion_residencia,
  direccion_negocio: cajaForm.value.direccion_negocio,
  referencia: cajaForm.value.referencia,
  referencia_parentesco: cajaForm.value.referencia_parentesco,
  referencia_telefono: cajaForm.value.referencia_telefono,
  monto_prestamo: cajaForm.value.monto_prestamo,
  cuota_programada: cajaForm.value.cuota_programada,
  total_cuotas: cajaForm.value.total_cuotas,
  fecha_entrega: cajaForm.value.fecha_entrega,
  fecha_vencimiento: cajaForm.value.fecha_vencimiento,
  fecha_ultimo_pago: cajaForm.value.fecha_ultimo_pago,
  monto_ultimo_pago: cajaForm.value.monto_ultimo_pago,
  cuota_pendiente_monto: cajaForm.value.monto_pendiente_cuota,
  cuota_pendiente_programada: cajaForm.value.cuota_programada,
  cuota_pendiente_abonado: cajaForm.value.cuota_pendiente_abonado,
  cuotas_atrasadas: cajaForm.value.cuotas_atrasadas,
  cuotas_atrasadas_numeros: cajaForm.value.cuotas_atrasadas_numeros,
  saldo_actual: cajaForm.value.saldo_actual,
}))

const cajaPuedeConfirmar = computed(
  () =>
    cajaForm.value.id_prestamo != null &&
    !!cajaForm.value.fecha_pago &&
    cajaForm.value.cuota_numero > 0,
)

function datosContactoDesdeCliente(cliente: Cliente | null | undefined) {
  return {
    telefono: cliente?.telefono?.trim() ?? '',
    direccion_residencia: cliente?.direccion_residencia?.trim() ?? '',
    direccion_negocio: cliente?.direccion_negocio?.trim() ?? '',
    referencia: cliente?.referencia?.trim() ?? '',
    referencia_parentesco: cliente?.referencia_parentesco?.trim() ?? '',
    referencia_telefono: cliente?.referencia_telefono?.trim() ?? '',
  }
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
  fecha_vencimiento?: string | null
  telefono?: string
  direccion_residencia?: string
  direccion_negocio?: string
  referencia?: string
  referencia_parentesco?: string
  referencia_telefono?: string
  monto_prestamo?: number
  cuota_programada?: number
  total_cuotas?: number
  fecha_ultimo_pago?: string
  monto_ultimo_pago?: string
  cuota_pendiente_abonado?: string
  cuotas_atrasadas?: number
  cuotas_atrasadas_numeros?: string
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
    fecha_vencimiento: payload.fecha_vencimiento?.trim().slice(0, 10) ?? '',
    cuota_numero: payload.cuota_numero,
    fecha_cuota: fechaCuota,
    fecha_pago: fechaPago,
    capital: payload.capital,
    interes: payload.interes,
    monto_pendiente_cuota: montoPendienteCuota,
    saldo_inicial: saldoInicial,
    saldo_actual: saldoActual,
    saldo: saldoActual,
    telefono: payload.telefono ?? '',
    direccion_residencia: payload.direccion_residencia ?? '',
    direccion_negocio: payload.direccion_negocio ?? '',
    referencia: payload.referencia ?? '',
    referencia_parentesco: payload.referencia_parentesco ?? '',
    referencia_telefono: payload.referencia_telefono ?? '',
    monto_prestamo: payload.monto_prestamo ?? saldoInicial,
    cuota_programada: payload.cuota_programada ?? montoPendienteCuota,
    total_cuotas: payload.total_cuotas ?? 0,
    fecha_ultimo_pago: payload.fecha_ultimo_pago ?? '',
    monto_ultimo_pago: payload.monto_ultimo_pago ?? '',
    cuota_pendiente_abonado: payload.cuota_pendiente_abonado ?? '',
    cuotas_atrasadas: payload.cuotas_atrasadas ?? 0,
    cuotas_atrasadas_numeros: payload.cuotas_atrasadas_numeros ?? '',
  }
  cajaMontoRecibido.value = '0'
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
  const totalCuotas = totalCuotasDesdeReporte(fila)

  let cliente: Cliente | null = null
  let prestamo: Prestamo | null = null
  let dni = ''
  try {
    const { data: pr } = await api.get<Prestamo>(`/prestamos/${fila.id_prestamo}/`)
    prestamo = pr
    const { data: cl } = await api.get<Cliente>(`/clientes/${pr.id_cliente}/`)
    cliente = cl
    dni = cl.dni ?? ''
  } catch {
    dni = await resolverDniPrestamo(fila.id_prestamo)
  }

  const contacto = datosContactoDesdeCliente(cliente)
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
    fecha_vencimiento: fila.fecha_vencimiento ?? undefined,
    cuota_numero: cuotaN,
    fecha_cuota: fila.cuota_siguiente_fecha ?? undefined,
    capital,
    interes,
    monto_pendiente_cuota: montoPendiente,
    saldo_inicial: Number.parseFloat(fila.saldo_inicial) || 0,
    saldo_actual: Number.parseFloat(fila.saldo_actual) || 0,
    telefono: contacto.telefono || fila.telefono || '',
    direccion_residencia: contacto.direccion_residencia,
    direccion_negocio: contacto.direccion_negocio,
    referencia: contacto.referencia,
    referencia_parentesco: contacto.referencia_parentesco,
    referencia_telefono: contacto.referencia_telefono,
    monto_prestamo:
      Number.parseFloat(String(fila.monto ?? prestamo?.monto ?? fila.saldo_inicial)) || 0,
    cuota_programada: Number.parseFloat(fila.cuota) || 0,
    total_cuotas: totalCuotas,
    cuota_pendiente_abonado: fila.cuota_siguiente_abonado ?? '',
    cuotas_atrasadas: fila.cuotas_atrasadas ?? 0,
    cuotas_atrasadas_numeros: fila.cuotas_atrasadas_numeros ?? '',
    omitirFiltroCarteraHoja: options?.omitirFiltroCarteraHoja,
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
  const totalCuotas = filaReporte ? totalCuotasDesdeReporte(filaReporte) : 0

  let cliente: Cliente | null = null
  try {
    const { data: pr } = await api.get<Prestamo>(`/prestamos/${pid}/`)
    const { data: cl } = await api.get<Cliente>(`/clientes/${pr.id_cliente}/`)
    cliente = cl
  } catch {
    cliente = null
  }
  const contacto = datosContactoDesdeCliente(cliente)

  abrirDialogoCaja({
    id_prestamo: pid,
    numero_prestamo: filaReporte?.numero_prestamo,
    cliente: clienteNombre,
    dni: dniResolved,
    ...carteraInfo,
    fecha_vencimiento: filaReporte?.fecha_vencimiento ?? undefined,
    cuota_numero: cuotaN,
    fecha_cuota: fechaCuota,
    capital,
    interes,
    monto_pendiente_cuota: montoPendiente ?? capital + interes,
    saldo_inicial: reporte?.saldo_inicial ?? saldo ?? 0,
    saldo_actual: reporte?.saldo_actual ?? saldo ?? 0,
    telefono: contacto.telefono || filaReporte?.telefono || '',
    direccion_residencia: contacto.direccion_residencia,
    direccion_negocio: contacto.direccion_negocio,
    referencia: contacto.referencia,
    referencia_parentesco: contacto.referencia_parentesco,
    referencia_telefono: contacto.referencia_telefono,
    monto_prestamo:
      Number.parseFloat(String(filaReporte?.monto ?? reporte?.saldo_inicial ?? saldo ?? 0)) || 0,
    cuota_programada: Number.parseFloat(filaReporte?.cuota ?? '') || montoPendiente || 0,
    total_cuotas: totalCuotas,
    fecha_ultimo_pago: filaReporte?.fecha_ultimo_pago ?? '',
    monto_ultimo_pago: filaReporte?.monto_ultimo_pago ?? '',
    cuota_pendiente_abonado: filaReporte?.cuota_siguiente_abonado ?? '',
    cuotas_atrasadas: filaReporte?.cuotas_atrasadas ?? 0,
    cuotas_atrasadas_numeros: filaReporte?.cuotas_atrasadas_numeros ?? '',
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
  const montoRecibido = Number.parseFloat(cajaMontoRecibido.value.replace(',', '.')) || 0
  if (montoRecibido <= 0) {
    cajaFormError.value = 'Indique el monto recibido del cliente.'
    return
  }
  cajaSaving.value = true
  try {
    const saldoPosterior = Math.max(0, cajaForm.value.saldo_actual - montoRecibido)
    const payload: Record<string, string | number> = {
      id_prestamo: cajaForm.value.id_prestamo,
      fecha_pago: cajaForm.value.fecha_pago,
      documento: `Cuota ${cajaForm.value.cuota_numero}`,
      capital: montoRecibido.toFixed(2),
      interes: '0.00',
      mora: 0,
      saldo: saldoPosterior.toFixed(2),
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
    }

    toast.add({
      severity: 'success',
      summary: 'Cobro registrado',
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
        <CarteraDropdown
          v-model="hojaCobrosCarteraFiltro"
          :carteras="hojaCarteras"
          :disabled="hojaCobrosLoading"
          :auto-open="!carteraHojaRequerida() && hojaCarteras.length > 0"
          class="hoja-cartera-dropdown filtro-hoja-select"
        />
        <Button
          label="Imprimir"
          icon="pi pi-print"
          type="button"
          severity="secondary"
          outlined
          class="no-print"
          :loading="hojaImprimiendo"
          :disabled="!carteraHojaRequerida() || hojaImprimiendo || !hojaCobrosFilas.length"
          title="Imprime el listado de la cartera seleccionada"
          @click="ejecutarImpresionListado"
        />
        <Button
          label="Descargar PDF"
          icon="pi pi-file-pdf"
          type="button"
          severity="success"
          outlined
          class="no-print"
          :loading="hojaDescargandoPdf"
          :disabled="!carteraHojaRequerida() || hojaDescargandoPdf || !hojaCobrosFilas.length"
          title="Descarga el PDF del listado de la cartera seleccionada"
          @click="() => void descargarHojaCobrosPdf()"
        />
        <span v-if="hojaCobrosTotal && !busquedaActiva" class="hoja-findeco-contador no-print">
          {{ hojaCobrosTotal }} cliente{{ hojaCobrosTotal === 1 ? '' : 's' }}
        </span>
      </div>

      <div class="hoja-buscar-cliente no-print">
        <label class="hoja-buscar-label" for="cobros-buscar-cliente">Buscar cliente</label>
        <div class="hoja-buscar-fila">
          <div class="hoja-buscar-input-wrap">
            <span class="hoja-buscar-icon" aria-hidden="true">
              <i class="pi pi-search" />
            </span>
            <input
              id="cobros-buscar-cliente"
              v-model="busquedaQuery"
              type="search"
              class="hoja-buscar-input"
              placeholder="DNI, nombre o teléfono..."
              autocomplete="off"
              :disabled="busquedaLoading"
              @keyup.enter="buscarClienteEnCobros"
              @input="busquedaError = ''"
            />
            <button
              v-if="busquedaQuery"
              type="button"
              class="hoja-buscar-clear"
              aria-label="Limpiar búsqueda"
              :disabled="busquedaLoading"
              @click="limpiarBusquedaCliente"
            >
              <i class="pi pi-times" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            class="hoja-buscar-btn"
            :disabled="busquedaLoading || busquedaQuery.trim().length < 2"
            @click="buscarClienteEnCobros"
          >
            <i v-if="busquedaLoading" class="pi pi-spin pi-spinner" aria-hidden="true" />
            <span v-else>Buscar</span>
          </button>
        </div>
        <p v-if="busquedaError" class="hoja-buscar-error">{{ busquedaError }}</p>
      </div>

      <div v-if="mostrandoPrestamosBusqueda" class="hoja-buscar-prestamos">
        <div class="hoja-buscar-prestamos-header">
          <h3 class="hoja-buscar-prestamos-title">Préstamos de {{ busquedaCliente?.nombre }}</h3>
          <button type="button" class="hoja-buscar-volver" @click="volverResultadosBusqueda">
            Volver
          </button>
        </div>
        <ul class="hoja-cobros-list">
          <li v-for="(fila, index) in busquedaPrestamos" :key="`busq-${fila.id_prestamo}`">
            <HojaCobroCard
              :fila="fila"
              :index="index"
              :class="{ 'hoja-cobro-card--readonly': !canWritePagos || fila.cuota_siguiente_numero == null }"
              @click="onFilaBusquedaClick(fila)"
            />
          </li>
        </ul>
      </div>

      <ul v-else-if="mostrandoResultadosBusqueda" class="hoja-buscar-resultados">
        <li v-if="busquedaLoading && !busquedaResultados.length" class="hoja-buscar-loading">
          <i class="pi pi-spin pi-spinner" aria-hidden="true" />
          <span>Buscando clientes…</span>
        </li>
        <li v-for="cliente in busquedaResultados" :key="cliente.id_cliente">
          <button
            type="button"
            class="hoja-buscar-resultado"
            :disabled="busquedaLoading"
            @click="seleccionarClienteBusqueda(cliente)"
          >
            <div class="hoja-buscar-resultado-main">
              <strong>{{ cliente.nombre }}</strong>
              <span v-if="cliente.dni?.trim()" class="hoja-buscar-resultado-meta">
                DNI: {{ cliente.dni.trim() }}
              </span>
              <span v-if="cliente.telefono?.trim()" class="hoja-buscar-resultado-meta">
                Tel: {{ cliente.telefono.trim() }}
              </span>
            </div>
            <i class="pi pi-chevron-right" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <p v-else-if="!carteraHojaRequerida()" class="hoja-findeco-aviso no-print">
        Seleccione una cartera para cargar los préstamos a cobrar, o busque un cliente arriba.
      </p>

      <div v-else class="hoja-cobros-list-wrap">
        <div v-if="hojaCobrosLoading && hojaCobrosFilas.length === 0" class="hoja-cobros-loading">
          <i class="pi pi-spin pi-spinner" aria-hidden="true" />
          <span>Cargando préstamos…</span>
        </div>

        <div v-else-if="hojaCobrosFilas.length === 0" class="hoja-cobros-empty">
          <i class="pi pi-file" aria-hidden="true" />
          <p>No hay préstamos en esta cartera.</p>
        </div>

        <div v-else class="hoja-listado-sheet">
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
                  <tr
                    v-for="(fila, index) in hojaCobrosFilas"
                    :key="fila.id_prestamo"
                    class="hoja-listado-row"
                    :class="{
                      'hoja-listado-row--clickable':
                        canWritePagos && fila.cuota_siguiente_numero != null,
                    }"
                    @click="onFilaCobroClick(fila)"
                  >
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
                      TOTALES ({{ hojaListadoTotales.registros }}):
                    </td>
                    <td></td>
                    <td class="col-monto">{{ formatNumeroHoja(hojaListadoTotales.cuota) }}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <p v-if="canWritePagos" class="hoja-listado-hint no-print">
            Pulse una fila para registrar el cobro de esa cuota.
          </p>
        </div>
      </div>
    </section>

    <CobroCajaDialog
      v-model:visible="cajaVisible"
      v-model:monto-recibido="cajaMontoRecibido"
      :form="cajaFormView"
      :saving="cajaSaving"
      :error="cajaError"
      :form-error="cajaFormError"
      :cartera-bloqueada="cajaCarteraBloqueada"
      :can-submit="cajaPuedeConfirmar"
      @confirm="confirmarPagoCuota"
      @cancel="cajaVisible = false"
    />
  </div>
</template>

<style scoped>
.page {
  max-width: 100%;
}

.hoja-cobros-list-wrap {
  margin-top: 0.5rem;
}

.hoja-listado-sheet {
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 3px rgb(15 23 42 / 8%);
}

.hoja-listado-sheet .hoja-preview-scroll {
  max-height: none;
  overflow-x: auto;
  border: none;
}

.hoja-listado-row--clickable {
  cursor: pointer;
}

.hoja-listado-row--clickable:hover td {
  background: #f0f9ff;
}

.hoja-listado-hint {
  margin: 0.75rem 0 0;
  font-size: 0.82rem;
  color: #64748b;
  text-align: center;
}

.hoja-cobros-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.hoja-cobros-loading,
.hoja-cobros-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 2.5rem 1rem;
  color: #64748b;
  text-align: center;
}

.hoja-cobros-loading i,
.hoja-cobros-empty i {
  font-size: 2rem;
  color: #94a3b8;
}

.hoja-cobros-empty p {
  margin: 0;
  font-size: 0.92rem;
}

:deep(.hoja-cobro-card--readonly) {
  cursor: default;
}

:deep(.hoja-cobro-card--readonly:hover) {
  border-color: #e2e8f0;
  box-shadow: 0 1px 3px rgb(15 23 42 / 8%);
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

.hoja-cartera-dropdown {
  min-width: 13rem;
}

.hoja-findeco-contador {
  font-size: 0.85rem;
  color: #64748b;
  margin-left: auto;
}

.hoja-buscar-cliente {
  margin-bottom: 1rem;
}

.hoja-buscar-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
}

.hoja-buscar-fila {
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.hoja-buscar-input-wrap {
  flex: 1 1 14rem;
  min-width: 0;
  display: flex;
  align-items: stretch;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  background: #fff;
  overflow: hidden;
}

.hoja-buscar-input-wrap:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgb(59 130 246 / 15%);
}

.hoja-buscar-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.65rem;
  background: #f8fafc;
  color: #64748b;
}

.hoja-buscar-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.55rem 0.75rem;
  border: none;
  font-size: 0.92rem;
  color: #0f172a;
  background: transparent;
}

.hoja-buscar-input:focus {
  outline: none;
}

.hoja-buscar-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.65rem;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.hoja-buscar-btn {
  flex: 0 0 auto;
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 0.5rem;
  background: #0f172a;
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.hoja-buscar-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hoja-buscar-error {
  margin: 0.45rem 0 0;
  font-size: 0.85rem;
  color: #b91c1c;
}

.hoja-buscar-resultados {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.hoja-buscar-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  color: #64748b;
}

.hoja-buscar-resultado {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.85rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.65rem;
  background: #fff;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}

.hoja-buscar-resultado:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.hoja-buscar-resultado:disabled {
  opacity: 0.6;
  cursor: wait;
}

.hoja-buscar-resultado-main {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.hoja-buscar-resultado-main strong {
  font-size: 0.95rem;
  color: #0f172a;
}

.hoja-buscar-resultado-meta {
  font-size: 0.82rem;
  color: #64748b;
}

.hoja-buscar-prestamos {
  margin-top: 0.25rem;
}

.hoja-buscar-prestamos-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.hoja-buscar-prestamos-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.hoja-buscar-volver {
  border: none;
  background: transparent;
  color: #2563eb;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.25rem 0.35rem;
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

  body.printing-hoja-cobros .hoja-buscar-cliente,
  body.printing-hoja-cobros .hoja-findeco-toolbar,
  body.printing-hoja-cobros .hoja-listado-hint,
  body.printing-hoja-cobros .hoja-buscar-prestamos,
  body.printing-hoja-cobros .hoja-buscar-resultados {
    display: none !important;
  }

  body.printing-hoja-cobros .hoja-listado-sheet {
    border: none;
    box-shadow: none;
    padding: 0;
  }

  body.printing-hoja-cobros .hoja-preview-print-area {
    display: block !important;
  }

  body.printing-hoja-cobros .hoja-preview-scroll {
    max-height: none !important;
    overflow: visible !important;
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
