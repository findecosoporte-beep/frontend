<script setup lang="ts">
import { computed, ref } from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import DniHondurasInput from '@/components/DniHondurasInput.vue'
import EstadoCuentaPdfDialog from '@/components/EstadoCuentaPdfDialog.vue'
import { esDniHnValido, mensajeDniHnInvalido, normalizarDniHn } from '@/utils/documentoHonduras'
import { compartirEstadoCuentaPdf, fetchEstadoCuentaPdfBlob } from '@/utils/estadoCuentaPdf'
import { formatDate, formatMoney, formatTime } from '@/utils/format'
import { abrirFacturaPago, esPagoFacturaSecundario } from '@/utils/facturaPago'
import { pendienteCuota } from '@/utils/cobroPago'
import {
  buildFilasCuotaEstado,
  type FilaCuotaEstado,
} from '@/utils/estadoCuotaFilas'
import {
  abonadoPorCuotaDesdeMovimientos,
  abonosCapitalDesdePagos,
} from '@/utils/movimientosPago'
import type { Cartera, Cliente, Paginated, Pago, Prestamo, PrestamoCuotaRow } from '@/types/api'

const toast = useToast()

const loading = ref(false)
const error = ref('')
const info = ref('')

/** Valores de los campos de búsqueda y resultado. */
const campos = ref({
  n: '',
  cartera: '',
  cliente: '',
  identidad: '',
  telefono: '',
})

const carteraNombrePorZonaId = ref<Record<number, string>>({})
let carterasCargadas = false
let carterasCargaPromise: Promise<void> | null = null

const idPrestamoActivo = ref<number | null>(null)
const estadoPrestamoActivo = ref<string | null>(null)
const idClienteActivo = ref<number | null>(null)
const prestamoActivo = ref<Prestamo | null>(null)
const clienteActivo = ref<Cliente | null>(null)
const cuotasPlan = ref<PrestamoCuotaRow[]>([])
const abonos = ref<Pago[]>([])
const historialPrestamos = ref<Prestamo[]>([])
const loadingPlan = ref(false)
const loadingHistorialPrestamos = ref(false)
const facturaAbriendoId = ref<number | null>(null)
const pdfEstadoCuentaVisible = ref(false)
const pdfCompartiendo = ref(false)

const ETIQUETAS_ESTADO_PRESTAMO: Record<string, string> = {
  pendiente_aprobacion: 'Pendiente aprobación',
  activo: 'Activo',
  pagado: 'Pagado',
  mora: 'Mora',
  cancelado: 'Cancelado',
}

function etiquetaEstadoPrestamo(estado: string): string {
  return ETIQUETAS_ESTADO_PRESTAMO[estado] ?? estado
}

function severidadEstadoPrestamo(
  estado: string,
): 'success' | 'warn' | 'danger' | 'secondary' | 'info' | 'contrast' {
  if (estado === 'activo') return 'success'
  if (estado === 'pagado') return 'info'
  if (estado === 'mora') return 'danger'
  if (estado === 'cancelado') return 'secondary'
  if (estado === 'pendiente_aprobacion') return 'warn'
  return 'secondary'
}

const historialPrestamosOrdenado = computed(() =>
  [...historialPrestamos.value].sort((a, b) => {
    const ta = new Date(a.fecha_entrega).getTime()
    const tb = new Date(b.fecha_entrega).getTime()
    if (ta !== tb) return tb - ta
    return b.id_prestamo - a.id_prestamo
  }),
)

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

async function verEstadoFinancieroPdf() {
  if (idPrestamoActivo.value == null) return
  pdfEstadoCuentaVisible.value = true
}

async function compartirEstadoFinanciero() {
  const idPrestamo = idPrestamoActivo.value
  if (idPrestamo == null) return

  const telefono = campos.value.telefono.trim()
  if (!telefono) {
    pdfEstadoCuentaVisible.value = true
    return
  }

  pdfCompartiendo.value = true
  try {
    const blob = await fetchEstadoCuentaPdfBlob(idPrestamo)
    const result = await compartirEstadoCuentaPdf({
      telefono,
      nombreCliente: campos.value.cliente || 'Cliente',
      numeroPrestamo: campos.value.n || null,
      pdfBlob: blob,
    })

    if (result === 'shared' || result === 'whatsapp') {
      if (result === 'whatsapp') {
        toast.add({
          severity: 'info',
          summary: 'WhatsApp',
          detail: 'Se abrió WhatsApp y se descargó el PDF. Adjúntelo al chat con el cliente.',
          life: 6000,
        })
      }
      return
    }

    toast.add({
      severity: 'warn',
      summary: 'WhatsApp',
      detail: 'Teléfono inválido. Se abrirá la vista previa del PDF.',
      life: 5000,
    })
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

const pagosOrdenados = computed(() =>
  [...abonos.value].sort((a, b) => {
    const ta = new Date(a.fecha_pago).getTime()
    const tb = new Date(b.fecha_pago).getTime()
    if (ta !== tb) return ta - tb
    return a.id_pago - b.id_pago
  }),
)

const abonadoPorCuota = computed(() => abonadoPorCuotaDesdeMovimientos(pagosOrdenados.value))
const abonosCapital = computed(() => abonosCapitalDesdePagos(pagosOrdenados.value))

const filasCuotasEstado = computed((): FilaCuotaEstado[] =>
  buildFilasCuotaEstado(cuotasPlan.value, abonos.value),
)

const cuotasPendientes = computed(() => filasCuotasEstado.value.filter((f) => f.estado === 'pendiente'))
const cuotasPagadas = computed(() => filasCuotasEstado.value.filter((f) => f.estado === 'pagada'))

const totalesPlanDesembolso = computed(() => {
  let capital = 0
  let interes = 0
  for (const cuota of cuotasPlan.value) {
    capital += numMonto(cuota.capital_programado)
    interes += numMonto(cuota.interes_programado)
  }
  return {
    capital: Math.round(capital * 100) / 100,
    interes: Math.round(interes * 100) / 100,
  }
})

const ETIQUETAS_FORMA_PAGO: Record<string, string> = {
  semanal: 'SEMANAL',
  quincenal: 'QUINCENAL',
  mensual: 'MENSUAL',
}

const ETIQUETAS_FORMA_DESEMBOLSO: Record<string, string> = {
  efectivo: 'Efectivo (E)',
  transferencia: 'Transferencia (T)',
  cheque: 'Cheque (C)',
}

function numMonto(value: string | number | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function desgloseCuota(cuota: PrestamoCuotaRow) {
  return {
    capital: numMonto(cuota.capital_programado),
    intereses: numMonto(cuota.interes_programado),
    servicios: numMonto(cuota.servicios_programado) + numMonto(cuota.otros_programado),
    moratorios: 0,
  }
}

function desglosePendienteCuota(cuota: PrestamoCuotaRow, abonado: number) {
  const base = desgloseCuota(cuota)
  const total = base.capital + base.intereses + base.servicios
  const pendiente = pendienteCuota(total, abonado)
  if (pendiente <= 0 || total <= 0) {
    return { capital: 0, intereses: 0, servicios: 0, moratorios: 0 }
  }
  const ratio = pendiente / total
  return {
    capital: Math.round(base.capital * ratio * 100) / 100,
    intereses: Math.round(base.intereses * ratio * 100) / 100,
    servicios: Math.round(base.servicios * ratio * 100) / 100,
    moratorios: 0,
  }
}

function sumarDesglose(
  a: { capital: number; intereses: number; servicios: number; moratorios: number },
  b: { capital: number; intereses: number; servicios: number; moratorios: number },
) {
  return {
    capital: Math.round((a.capital + b.capital) * 100) / 100,
    intereses: Math.round((a.intereses + b.intereses) * 100) / 100,
    servicios: Math.round((a.servicios + b.servicios) * 100) / 100,
    moratorios: Math.round((a.moratorios + b.moratorios) * 100) / 100,
  }
}

function restarDesglose(
  inicial: { capital: number; intereses: number; servicios: number; moratorios: number },
  abonos: { capital: number; intereses: number; servicios: number; moratorios: number },
) {
  return {
    capital: Math.max(0, Math.round((inicial.capital - abonos.capital) * 100) / 100),
    intereses: Math.max(0, Math.round((inicial.intereses - abonos.intereses) * 100) / 100),
    servicios: Math.max(0, Math.round((inicial.servicios - abonos.servicios) * 100) / 100),
    moratorios: Math.max(0, Math.round((inicial.moratorios - abonos.moratorios) * 100) / 100),
  }
}

function totalDesglose(d: { capital: number; intereses: number; servicios: number; moratorios: number }) {
  return Math.round((d.capital + d.intereses + d.servicios + d.moratorios) * 100) / 100
}

function etiquetaFormaPago(forma: string | null | undefined): string {
  if (!forma) return '—'
  return ETIQUETAS_FORMA_PAGO[forma] ?? forma.toUpperCase()
}

function etiquetaFormaDesembolso(forma: string | null | undefined): string {
  if (!forma) return '—'
  return ETIQUETAS_FORMA_DESEMBOLSO[forma] ?? forma
}

function textoClienteFicha(cliente: Cliente | null, fallbackNombre: string): string {
  if (!cliente) return fallbackNombre || '—'
  const nombre = (cliente.nombre ?? fallbackNombre).trim()
  return `${cliente.id_cliente}-${nombre}`
}

function hoyLocalIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface FilaResumenSaldos {
  etiqueta: string
  inicial: number
  abonos: number
  actual: number
  vencido: number
  esTotal?: boolean
}

const resumenSaldos = computed((): { filas: FilaResumenSaldos[]; fechaPagoVencido: string | null } => {
  const cuotas = cuotasPlan.value
  const pagos = pagosOrdenados.value.filter((p) => !p.anulado)
  const hoy = hoyLocalIso()

  let inicial = { capital: 0, intereses: 0, servicios: 0, moratorios: 0 }
  for (const cuota of cuotas) {
    inicial = sumarDesglose(inicial, desgloseCuota(cuota))
  }

  let abonosSum = { capital: 0, intereses: 0, servicios: 0, moratorios: 0 }
  for (const pago of pagos) {
    abonosSum.capital += numMonto(pago.capital)
    abonosSum.intereses += numMonto(pago.interes)
    abonosSum.moratorios += numMonto(pago.mora)
  }
  abonosSum.capital = Math.round(abonosSum.capital * 100) / 100
  abonosSum.intereses = Math.round(abonosSum.intereses * 100) / 100
  abonosSum.moratorios = Math.round(abonosSum.moratorios * 100) / 100

  for (const fila of filasCuotasEstado.value) {
    if (fila.estado !== 'pagada') continue
    const cuota = cuotas.find((c) => c.numero_cuota === fila.numero_cuota)
    if (!cuota) continue
    const serv = numMonto(cuota.servicios_programado) + numMonto(cuota.otros_programado)
    abonosSum.servicios = Math.round((abonosSum.servicios + serv) * 100) / 100
  }

  const actual = restarDesglose(inicial, abonosSum)

  let vencido = { capital: 0, intereses: 0, servicios: 0, moratorios: 0 }
  let fechaPagoVencido: string | null = null
  for (const fila of cuotasPendientes.value) {
    const fecha = fila.fecha_programada.slice(0, 10)
    if (fecha > hoy) continue
    const cuota = cuotas.find((c) => c.numero_cuota === fila.numero_cuota)
    if (!cuota) continue
    const abonado = abonadoPorCuota.value.get(fila.numero_cuota) ?? 0
    vencido = sumarDesglose(vencido, desglosePendienteCuota(cuota, abonado))
    if (!fechaPagoVencido || fecha < fechaPagoVencido) fechaPagoVencido = fecha
  }

  if (!fechaPagoVencido) {
    const proxima = [...cuotasPendientes.value].sort((a, b) =>
      a.fecha_programada.localeCompare(b.fecha_programada),
    )[0]
    fechaPagoVencido = proxima?.fecha_programada?.slice(0, 10) ?? null
  }

  const filas: FilaResumenSaldos[] = [
    {
      etiqueta: 'Capital',
      inicial: inicial.capital,
      abonos: abonosSum.capital,
      actual: actual.capital,
      vencido: vencido.capital,
    },
    {
      etiqueta: 'Intereses',
      inicial: inicial.intereses,
      abonos: abonosSum.intereses,
      actual: actual.intereses,
      vencido: vencido.intereses,
    },
    {
      etiqueta: 'Servicios',
      inicial: inicial.servicios,
      abonos: abonosSum.servicios,
      actual: actual.servicios,
      vencido: vencido.servicios,
    },
    {
      etiqueta: 'Intereses Moratorios',
      inicial: inicial.moratorios,
      abonos: abonosSum.moratorios,
      actual: actual.moratorios,
      vencido: vencido.moratorios,
    },
    {
      etiqueta: 'Total',
      inicial: totalDesglose(inicial),
      abonos: totalDesglose(abonosSum),
      actual: totalDesglose(actual),
      vencido: totalDesglose(vencido),
      esTotal: true,
    },
  ]

  return { filas, fechaPagoVencido }
})

async function fetchAllPages<T>(initialPath: string): Promise<T[]> {
  const items: T[] = []
  let nextUrl: string | null = initialPath
  while (nextUrl) {
    const response = await api.get<Paginated<T>>(nextUrl)
    const pageData = response.data as Paginated<T>
    items.push(...pageData.results)
    nextUrl = pageData.next
  }
  return items
}

async function cargarCarterasPorZona() {
  try {
    const carteras = await fetchAllPages<Cartera>('/carteras/?page_size=100')
    const map: Record<number, string> = {}
    for (const c of carteras) {
      const zid = c.id_zona
      if (zid != null && zid > 0) map[zid] = c.nombre.trim()
    }
    carteraNombrePorZonaId.value = map
  } catch {
    carteraNombrePorZonaId.value = {}
  }
}

/** Solo pide carteras cuando hay resultados que mostrar (no al abrir la página). */
async function ensureCarterasCargadas() {
  if (carterasCargadas) return
  if (!carterasCargaPromise) {
    carterasCargaPromise = cargarCarterasPorZona().finally(() => {
      carterasCargadas = true
    })
  }
  await carterasCargaPromise
}

function textoCarteraDesdePrestamo(p: Prestamo): string {
  const idZ = p.id_zona ?? p.zona?.id_zona
  if (idZ != null && idZ > 0) {
    const nom = carteraNombrePorZonaId.value[idZ]
    if (nom) return nom
    return p.zona?.nombre?.trim() || ''
  }
  return p.zona?.nombre?.trim() || ''
}

async function cargarHistorialPrestamos(idCliente: number) {
  loadingHistorialPrestamos.value = true
  historialPrestamos.value = []
  try {
    historialPrestamos.value = await fetchAllPages<Prestamo>(
      `/prestamos/?id_cliente=${idCliente}&page_size=100&ordering=-fecha_entrega,-id_prestamo`,
    )
  } catch {
    historialPrestamos.value = []
  } finally {
    loadingHistorialPrestamos.value = false
  }
}

async function seleccionarPrestamoHistorial(p: Prestamo) {
  if (p.id_prestamo === idPrestamoActivo.value) return
  await ensureCarterasCargadas()
  idPrestamoActivo.value = p.id_prestamo
  estadoPrestamoActivo.value = p.estado ?? null
  prestamoActivo.value = p
  campos.value.n = p.numero_prestamo?.trim() ?? campos.value.n
  const cartera = textoCarteraDesdePrestamo(p)
  if (cartera) campos.value.cartera = cartera
  await cargarPlanYPagos(p.id_prestamo)
}

async function cargarPlanYPagos(idPrestamo: number) {
  loadingPlan.value = true
  cuotasPlan.value = []
  abonos.value = []
  try {
    const [cuotas, pagosRows] = await Promise.all([
      fetchAllPages<PrestamoCuotaRow>(
        `/prestamo-cuotas/?id_prestamo=${idPrestamo}&page_size=100&ordering=numero_cuota`,
      ),
      fetchAllPages<Pago>(`/pagos/?id_prestamo=${idPrestamo}&page_size=100&ordering=fecha_pago,id_pago`),
    ])
    cuotasPlan.value = cuotas
    abonos.value = pagosRows
  } catch {
    cuotasPlan.value = []
    abonos.value = []
  } finally {
    loadingPlan.value = false
  }
}

async function cargarCliente(idCliente: number): Promise<Cliente> {
  const { data } = await api.get<Cliente>(`/clientes/${idCliente}/`)
  return data
}

async function aplicarPrestamoYCliente(p: Prestamo, c: Cliente, avisoVarios?: string) {
  await ensureCarterasCargadas()
  campos.value = {
    n: p.numero_prestamo?.trim() ?? '',
    cartera: textoCarteraDesdePrestamo(p),
    cliente: c.nombre?.trim() ?? '',
    identidad: c.dni?.trim() ?? '',
    telefono: (c.telefono ?? '').trim(),
  }
  info.value = avisoVarios ?? ''
  idPrestamoActivo.value = p.id_prestamo
  estadoPrestamoActivo.value = p.estado ?? null
  idClienteActivo.value = p.id_cliente
  prestamoActivo.value = p
  clienteActivo.value = c
  void cargarPlanYPagos(p.id_prestamo)
  void cargarHistorialPrestamos(p.id_cliente)
}

async function primerPrestamoDesdeListado(params: URLSearchParams): Promise<Prestamo | null> {
  params.set('page_size', '10')
  params.set('ordering', '-id_prestamo')
  const { data } = await api.get<Paginated<Prestamo>>(`/prestamos/?${params.toString()}`)
  if (!data.results.length) return null
  return data.results[0]!
}

function requiereValor(raw: string, etiqueta: string): string | null {
  const v = raw.trim()
  if (!v) {
    error.value = `Ingresa un valor en ${etiqueta} para buscar.`
    return null
  }
  return v
}

async function buscarPorNumeroPrestamo() {
  const v = requiereValor(campos.value.n, 'N')
  if (v == null) return
  const params = new URLSearchParams({ numero_prestamo: v })
  const p = await primerPrestamoDesdeListado(params)
  if (!p) {
    error.value = 'No se encontró préstamo con ese número.'
    return
  }
  const c = await cargarCliente(p.id_cliente)
  await aplicarPrestamoYCliente(p, c)
}

async function buscarPorCartera() {
  const v = requiereValor(campos.value.cartera, 'CARTERA')
  if (v == null) return
  const { data } = await api.get<Paginated<Cartera>>(
    `/carteras/?search=${encodeURIComponent(v)}&page_size=20`,
  )
  const conZona = data.results.filter((c) => c.id_zona != null && c.id_zona > 0)
  if (!conZona.length) {
    error.value = 'No se encontró cartera con ese nombre (o sin zona asignada).'
    return
  }
  const idZona = conZona[0]!.id_zona!
  const params = new URLSearchParams({ id_zona: String(idZona) })
  const p = await primerPrestamoDesdeListado(params)
  if (!p) {
    error.value = 'No hay préstamos en la zona de esa cartera.'
    return
  }
  const c = await cargarCliente(p.id_cliente)
  const aviso =
    data.count > 1
      ? 'Varias carteras coinciden; se usó la primera con zona asignada y el préstamo más reciente de esa zona.'
      : data.results.length > 1
        ? 'Varios préstamos en la zona; se muestra el más reciente.'
        : ''
  await aplicarPrestamoYCliente(p, c, aviso || undefined)
}

async function buscarPorCliente() {
  const v = requiereValor(campos.value.cliente, 'CLIENTE')
  if (v == null) return
  const { data } = await api.get<Paginated<Cliente>>(
    `/clientes/?search=${encodeURIComponent(v)}&page_size=30`,
  )
  if (!data.results.length) {
    error.value = 'No se encontró cliente con ese nombre.'
    return
  }
  const exact = data.results.find((c) => c.nombre.trim().toLowerCase() === v.toLowerCase())
  const cliente = exact ?? data.results[0]!
  const params = new URLSearchParams({ id_cliente: String(cliente.id_cliente) })
  const p = await primerPrestamoDesdeListado(params)
  if (!p) {
    error.value = 'El cliente no tiene préstamos registrados.'
    return
  }
  const c = await cargarCliente(p.id_cliente)
  const aviso =
    data.results.length > 1 && !exact
      ? 'Varios clientes coinciden; se usó el primero y su préstamo más reciente.'
      : ''
  await aplicarPrestamoYCliente(p, c, aviso || undefined)
}

async function buscarPorIdentidad() {
  const v = requiereValor(campos.value.identidad, 'IDENTIDAD')
  if (v == null) return
  const dni = normalizarDniHn(v)
  if (!esDniHnValido(dni)) {
    error.value = mensajeDniHnInvalido()
    return
  }
  const { data } = await api.get<Paginated<Cliente>>(`/clientes/?dni=${encodeURIComponent(dni)}&page_size=5`)
  if (!data.results.length) {
    error.value = 'No se encontró cliente con esa identidad.'
    return
  }
  const cliente = data.results[0]!
  const params = new URLSearchParams({ id_cliente: String(cliente.id_cliente) })
  const p = await primerPrestamoDesdeListado(params)
  if (!p) {
    error.value = 'El cliente no tiene préstamos registrados.'
    return
  }
  const c = await cargarCliente(p.id_cliente)
  await aplicarPrestamoYCliente(p, c)
}

async function buscarPorTelefono() {
  const v = requiereValor(campos.value.telefono, 'TELEFONO')
  if (v == null) return
  const norm = v.replace(/\s+/g, '')
  const { data } = await api.get<Paginated<Cliente>>(
    `/clientes/?search=${encodeURIComponent(v)}&page_size=40`,
  )
  const exact = data.results.find((c) => (c.telefono ?? '').replace(/\s+/g, '') === norm)
  const cliente = exact ?? data.results[0]
  if (!cliente) {
    error.value = 'No se encontró cliente con ese teléfono.'
    return
  }
  const params = new URLSearchParams({ id_cliente: String(cliente.id_cliente) })
  const p = await primerPrestamoDesdeListado(params)
  if (!p) {
    error.value = 'El cliente no tiene préstamos registrados.'
    return
  }
  const c = await cargarCliente(p.id_cliente)
  const aviso =
    data.results.length > 1 && !exact
      ? 'Varios clientes coinciden con la búsqueda; se usó el primero con coincidencia exacta de teléfono si existía.'
      : ''
  await aplicarPrestamoYCliente(p, c, aviso || undefined)
}

type CampoBusqueda =
  | 'n'
  | 'cartera'
  | 'cliente'
  | 'identidad'
  | 'telefono'

/** Si hay varios campos con valor, solo se usa el primero en este orden. */
function primerCampoConValor(): CampoBusqueda | null {
  const c = campos.value
  if (c.n.trim()) return 'n'
  if (c.cartera.trim()) return 'cartera'
  if (c.cliente.trim()) return 'cliente'
  if (c.identidad.trim()) return 'identidad'
  if (c.telefono.trim()) return 'telefono'
  return null
}

async function ejecutarBusquedaUnica() {
  const campo = primerCampoConValor()
  if (campo == null) {
    error.value =
      'Escribe al menos un dato en un campo. Si rellenas varios, se usa solo el primero en este orden: N → Cartera → Cliente → Identidad → Teléfono.'
    return
  }
  await buscarPorCampo(campo)
}

async function buscarPorCampo(campo: CampoBusqueda) {
  error.value = ''
  info.value = ''
  idPrestamoActivo.value = null
  estadoPrestamoActivo.value = null
  idClienteActivo.value = null
  prestamoActivo.value = null
  clienteActivo.value = null
  cuotasPlan.value = []
  abonos.value = []
  historialPrestamos.value = []
  loading.value = true
  try {
    if (campo === 'n') await buscarPorNumeroPrestamo()
    else if (campo === 'cartera') await buscarPorCartera()
    else if (campo === 'cliente') await buscarPorCliente()
    else if (campo === 'identidad') await buscarPorIdentidad()
    else if (campo === 'telefono') await buscarPorTelefono()
  } catch (e) {
    error.value = getApiErrorMessage(e)
  } finally {
    loading.value = false
  }
}

function limpiarFormulario() {
  campos.value = {
    n: '',
    cartera: '',
    cliente: '',
    identidad: '',
    telefono: '',
  }
  error.value = ''
  info.value = ''
  idPrestamoActivo.value = null
  estadoPrestamoActivo.value = null
  idClienteActivo.value = null
  prestamoActivo.value = null
  clienteActivo.value = null
  cuotasPlan.value = []
  abonos.value = []
  historialPrestamos.value = []
  pdfEstadoCuentaVisible.value = false
}

</script>

<template>
  <div class="page-twelve-col">
    <header class="titulo-marca span-full" aria-label="Estado de cuenta FINDECO">
      <p class="titulo-marca-eyebrow">Estado de cuenta</p>
      <div class="titulo-marca-caja">
        <span class="titulo-marca-texto">FINDECO</span>
      </div>
    </header>

    <h1 class="title span-full">Estado de cuenta FINDECO</h1>

    <Message v-if="error" class="span-full" severity="error" :closable="false">{{ error }}</Message>
    <Message v-if="info" class="span-full" severity="info" :closable="true" @close="info = ''">{{ info }}</Message>

    <div class="layout-apilado span-full">
      <div class="bloque-buscador">
        <form class="panel-busqueda" aria-label="Consulta por campo" @submit.prevent="ejecutarBusquedaUnica">
          <div class="fila-busqueda">
            <span class="ficha-label">N:</span>
            <InputText v-model="campos.n" class="fila-input" placeholder="Número de préstamo" :disabled="loading" />
          </div>
          <div class="fila-busqueda">
            <span class="ficha-label">CARTERA:</span>
            <InputText v-model="campos.cartera" class="fila-input" placeholder="Nombre de cartera" :disabled="loading" />
          </div>
          <div class="fila-busqueda">
            <span class="ficha-label">CLIENTE:</span>
            <InputText v-model="campos.cliente" class="fila-input" placeholder="Nombre del cliente" :disabled="loading" />
          </div>
          <div class="fila-busqueda">
            <span class="ficha-label">IDENTIDAD:</span>
            <DniHondurasInput v-model="campos.identidad" class="fila-input" placeholder="DNI / identidad" :disabled="loading" />
          </div>
          <div class="fila-busqueda">
            <span class="ficha-label">TELEFONO:</span>
            <InputText v-model="campos.telefono" class="fila-input" placeholder="Teléfono" :disabled="loading" />
          </div>
          <div class="panel-busqueda-footer">
            <Button
              type="button"
              label="Limpiar"
              icon="pi pi-times"
              severity="secondary"
              outlined
              :disabled="loading"
              @click="limpiarFormulario"
            />
            <Button type="submit" label="Buscar" icon="pi pi-search" :loading="loading" :disabled="loading" />
          </div>
        </form>
      </div>

      <div class="bloque-resultados">
        <template v-if="idPrestamoActivo != null">
          <div class="ec-toolbar">
            <div class="ec-toolbar-titulo">
              <strong>Préstamo {{ campos.n || idPrestamoActivo }}</strong>
              <Tag
                v-if="estadoPrestamoActivo"
                class="ec-toolbar-estado"
                :severity="severidadEstadoPrestamo(estadoPrestamoActivo)"
                :value="etiquetaEstadoPrestamo(estadoPrestamoActivo)"
              />
            </div>
            <div class="ec-toolbar-acciones">
              <Button
                label="Ver estado financiero"
                icon="pi pi-file-pdf"
                type="button"
                severity="danger"
                outlined
                size="small"
                :disabled="loadingPlan"
                @click="verEstadoFinancieroPdf"
              />
              <Button
                label="Compartir"
                icon="pi pi-whatsapp"
                type="button"
                severity="success"
                outlined
                size="small"
                :loading="pdfCompartiendo"
                :disabled="loadingPlan || pdfCompartiendo || !campos.telefono?.trim()"
                @click="compartirEstadoFinanciero"
              />
            </div>
          </div>

          <section class="ec-ficha" aria-label="Datos del préstamo y cliente">
            <div class="ec-ficha-grid">
              <div class="ec-ficha-col">
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Cliente:</span>
                  <span class="ec-ficha-valor">{{ textoClienteFicha(clienteActivo, campos.cliente) }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Identidad:</span>
                  <span class="ec-ficha-valor">{{ campos.identidad || '—' }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Supervisor:</span>
                  <span class="ec-ficha-valor">{{ prestamoActivo?.supervisor?.trim() || '—' }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Asesor:</span>
                  <span class="ec-ficha-valor">{{ prestamoActivo?.asesor?.trim() || '—' }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Garantía:</span>
                  <span class="ec-ficha-valor">{{ prestamoActivo?.tipo_garantia?.trim() || '—' }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Ciclos:</span>
                  <span class="ec-ficha-valor">{{ prestamoActivo?.ciclos ?? '—' }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Teléfonos:</span>
                  <span class="ec-ficha-valor ec-ficha-telefonos">
                    Casa: {{ '—' }} Negocio: {{ '—' }} Celular: {{ campos.telefono || '—' }}
                  </span>
                </div>
                <div v-if="clienteActivo?.direccion_residencia" class="ec-ficha-row">
                  <span class="ec-ficha-label">Dirección:</span>
                  <span class="ec-ficha-valor">{{ clienteActivo.direccion_residencia }}</span>
                </div>
                <div v-if="clienteActivo?.referencia" class="ec-ficha-row">
                  <span class="ec-ficha-label">Referencia:</span>
                  <span class="ec-ficha-valor">
                    {{ clienteActivo.referencia }}
                    <template v-if="clienteActivo.referencia_parentesco">
                      ({{ clienteActivo.referencia_parentesco }})
                    </template>
                    <template v-if="clienteActivo.referencia_telefono">
                      · {{ clienteActivo.referencia_telefono }}
                    </template>
                  </span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Monto desembolsado:</span>
                  <span class="ec-ficha-valor">{{ formatMoney(prestamoActivo?.monto ?? 0) }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Forma Desembolso:</span>
                  <span class="ec-ficha-valor">{{ etiquetaFormaDesembolso(prestamoActivo?.forma_desembolso) }}</span>
                </div>
              </div>

              <div class="ec-ficha-col">
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Forma Pago:</span>
                  <span class="ec-ficha-valor">{{ etiquetaFormaPago(prestamoActivo?.forma_pago) }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Fecha Entrega:</span>
                  <span class="ec-ficha-valor">{{ formatDate(prestamoActivo?.fecha_entrega) }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Fecha Vencimiento:</span>
                  <span class="ec-ficha-valor">{{ formatDate(prestamoActivo?.fecha_vencimiento) }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Producto:</span>
                  <span class="ec-ficha-valor">{{ prestamoActivo?.producto?.trim() || '—' }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Interés planificado:</span>
                  <span class="ec-ficha-valor">{{ formatMoney(totalesPlanDesembolso.interes) }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Tasa de Interés:</span>
                  <span class="ec-ficha-valor">{{ prestamoActivo?.tasa_interes ?? '—' }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Días Mora:</span>
                  <span class="ec-ficha-valor">{{ prestamoActivo?.dias_mora ?? 0 }}</span>
                </div>
                <div class="ec-ficha-row">
                  <span class="ec-ficha-label">Categoría:</span>
                  <span class="ec-ficha-valor">{{ prestamoActivo?.categoria?.trim() || '—' }}</span>
                </div>
                <div v-if="prestamoActivo?.categoria_crediticia" class="ec-ficha-row ec-ficha-row--calificacion">
                  <span class="ec-ficha-valor ec-ficha-calificacion">{{ prestamoActivo.categoria_crediticia }}</span>
                </div>
              </div>
            </div>
          </section>

          <div class="ec-tabla-saldos-wrap">
            <table class="ec-tabla-saldos">
              <thead>
                <tr>
                  <th class="ec-th-etiqueta"></th>
                  <th>Saldo Inicial</th>
                  <th>Abonos</th>
                  <th>Saldo Actual</th>
                  <th class="ec-th-vencido">
                    Pago Vencido
                    <template v-if="resumenSaldos.fechaPagoVencido">
                      al {{ formatDate(resumenSaldos.fechaPagoVencido) }}
                    </template>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="fila in resumenSaldos.filas"
                  :key="fila.etiqueta"
                  :class="{ 'ec-fila-total': fila.esTotal }"
                >
                  <th scope="row" class="ec-th-etiqueta">{{ fila.etiqueta }}</th>
                  <td class="ec-monto">{{ formatMoney(fila.inicial) }}</td>
                  <td class="ec-monto">{{ formatMoney(fila.abonos) }}</td>
                  <td class="ec-monto">{{ formatMoney(fila.actual) }}</td>
                  <td class="ec-monto ec-col-vencido">{{ formatMoney(fila.vencido) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="seccion-tablas">
            <h2 class="subtitulo">Cuotas pendientes</h2>
            <p v-if="!loadingPlan && !cuotasPendientes.length" class="tabla-vacia">
              No hay cuotas pendientes en el plan de pago.
            </p>
            <DataTable
              v-else
              :value="cuotasPendientes"
              data-key="numero_cuota"
              class="tabla-plan"
              size="small"
              :loading="loadingPlan"
            >
              <Column field="numero_cuota" header="N" />
              <Column header="Fecha programada">
                <template #body="{ data }: { data: FilaCuotaEstado }">
                  {{ formatDate(data.fecha_programada) }}
                </template>
              </Column>
              <Column header="Fecha canceló">
                <template #body>—</template>
              </Column>
              <Column header="CUOTA">
                <template #body="{ data }: { data: FilaCuotaEstado }">
                  {{ formatMoney(data.total_programado) }}
                </template>
              </Column>
              <Column header="SALDO">
                <template #body="{ data }: { data: FilaCuotaEstado }">
                  {{ formatMoney(data.saldo_capital_programado) }}
                </template>
              </Column>
              <Column header="ESTADO">
                <template #body>
                  <span class="estado-cuota-texto">Pendiente</span>
                </template>
              </Column>
            </DataTable>

            <h2 class="subtitulo subtitulo--segundo">Cuotas pagadas</h2>
            <p v-if="!loadingPlan && !cuotasPagadas.length" class="tabla-vacia">
              Aún no hay cuotas pagadas registradas en este préstamo.
            </p>
            <DataTable
              v-else
              :value="cuotasPagadas"
              data-key="numero_cuota"
              class="tabla-plan"
              size="small"
              :loading="loadingPlan"
            >
              <Column field="numero_cuota" header="N" />
              <Column header="Fecha programada">
                <template #body="{ data }: { data: FilaCuotaEstado }">
                  {{ formatDate(data.fecha_programada) }}
                </template>
              </Column>
              <Column header="Fecha canceló">
                <template #body="{ data }: { data: FilaCuotaEstado }">
                  {{ data.fecha_pago ? formatDate(data.fecha_pago) : '—' }}
                </template>
              </Column>
              <Column header="HORA">
                <template #body="{ data }: { data: FilaCuotaEstado }">
                  {{ data.cobrado_en ? formatTime(data.cobrado_en) : '—' }}
                </template>
              </Column>
              <Column header="CUOTA">
                <template #body="{ data }: { data: FilaCuotaEstado }">
                  {{ formatMoney(data.total_programado) }}
                </template>
              </Column>
              <Column header="DOCUMENTO">
                <template #body="{ data }: { data: FilaCuotaEstado }">
                  {{ data.documento || `Cuota ${data.numero_cuota}` }}
                </template>
              </Column>
              <Column header="FACTURA">
                <template #body="{ data }: { data: FilaCuotaEstado }">
                  <Button
                    v-if="data.id_pago && !esPagoFacturaSecundario(data)"
                    icon="pi pi-file-pdf"
                    label="Ver factura"
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

            <h2 class="subtitulo subtitulo--segundo">Abonos a capital</h2>
            <p v-if="!loadingPlan && !abonosCapital.length" class="tabla-vacia">
              No hay abonos a capital registrados en este préstamo.
            </p>
            <DataTable
              v-else
              :value="abonosCapital"
              data-key="id_pago"
              class="tabla-abonos-capital tabla-plan"
              size="small"
              :loading="loadingPlan"
            >
              <Column header="Fecha">
                <template #body="{ data }">
                  {{ formatDate(data.fecha_pago) }}
                </template>
              </Column>
              <Column header="Hora">
                <template #body="{ data }">
                  {{ data.cobrado_en ? formatTime(data.cobrado_en) : '—' }}
                </template>
              </Column>
              <Column header="Monto">
                <template #body="{ data }">
                  {{ formatMoney(data.total) }}
                </template>
              </Column>
              <Column header="Documento">
                <template #body="{ data }">
                  {{ data.documento || 'Abono a capital' }}
                </template>
              </Column>
              <Column header="Factura">
                <template #body="{ data }">
                  <Button
                    icon="pi pi-file-pdf"
                    label="Ver factura"
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

            <h2 class="subtitulo subtitulo--segundo">Historial de préstamos</h2>
            <p v-if="!loadingHistorialPrestamos && !historialPrestamosOrdenado.length" class="tabla-vacia">
              No hay préstamos registrados para este cliente.
            </p>
            <DataTable
              v-else
              :value="historialPrestamosOrdenado"
              data-key="id_prestamo"
              class="tabla-abonos tabla-ec-fin tabla-historial-prestamos"
              size="small"
              striped-rows
              :loading="loadingHistorialPrestamos"
              :row-class="(data: Prestamo) => (data.id_prestamo === idPrestamoActivo ? 'fila-prestamo-activo' : '')"
            >
              <Column header="Nº" :style="{ width: '14%' }">
                <template #body="{ data }: { data: Prestamo }">
                  {{ data.numero_prestamo || data.id_prestamo }}
                </template>
              </Column>
              <Column header="FECHA ENTREGA" :style="{ width: '14%' }">
                <template #body="{ data }: { data: Prestamo }">
                  {{ formatDate(data.fecha_entrega) }}
                </template>
              </Column>
              <Column header="MONTO" :style="{ width: '14%' }">
                <template #body="{ data }: { data: Prestamo }">
                  {{ formatMoney(data.monto) }}
                </template>
              </Column>
              <Column header="PLAZO" :style="{ width: '10%' }">
                <template #body="{ data }: { data: Prestamo }">
                  {{ data.plazo }}
                </template>
              </Column>
              <Column header="CARTERA" :style="{ width: '18%' }">
                <template #body="{ data }: { data: Prestamo }">
                  {{ textoCarteraDesdePrestamo(data) || '—' }}
                </template>
              </Column>
              <Column header="ESTADO" :style="{ width: '16%' }">
                <template #body="{ data }: { data: Prestamo }">
                  <Tag :severity="severidadEstadoPrestamo(data.estado)" :value="etiquetaEstadoPrestamo(data.estado)" />
                </template>
              </Column>
              <Column header="ACCIÓN" :style="{ width: '14%' }">
                <template #body="{ data }: { data: Prestamo }">
                  <Tag v-if="data.id_prestamo === idPrestamoActivo" severity="info" value="Actual" />
                  <Button
                    v-else
                    label="Ver"
                    size="small"
                    severity="secondary"
                    outlined
                    @click="seleccionarPrestamoHistorial(data)"
                  />
                </template>
              </Column>
            </DataTable>
          </div>
        </template>
        <div v-else class="placeholder-resultados" aria-hidden="true">
          <p>Las cuotas pendientes, pagadas y el historial de préstamos aparecerán aquí después de localizar un préstamo.</p>
        </div>
      </div>
    </div>
  </div>

  <EstadoCuentaPdfDialog
    v-model:visible="pdfEstadoCuentaVisible"
    :prestamo-id="idPrestamoActivo"
    :telefono="campos.telefono"
    :nombre-cliente="campos.cliente || 'Cliente'"
    :numero-prestamo="campos.n || null"
  />
</template>

<style scoped>
.page-twelve-col {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.65rem 1rem;
  align-content: start;
  max-width: 100%;
}

.span-full {
  grid-column: 1 / -1;
}

.titulo-marca {
  margin: 0 0 0.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  text-align: center;
}

.titulo-marca-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: #64748b;
}

.titulo-marca-caja {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: min(100%, 16rem);
  padding: 0.85rem 2.25rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.titulo-marca-texto {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: clamp(1.65rem, 5vw, 2.35rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #0a0a0a;
}

.title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  text-align: center;
}

.layout-apilado {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  width: 100%;
}

.bloque-buscador,
.bloque-resultados {
  width: 100%;
  min-width: 0;
}

.bloque-resultados {
  margin-top: 0.15rem;
}

.ec-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-bottom: 0.85rem;
}

.ec-toolbar-titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  font-size: 0.95rem;
  color: #0f172a;
}

.ec-toolbar-estado {
  font-size: 0.75rem;
}

.ec-toolbar-acciones {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.ec-ficha {
  margin-bottom: 0.85rem;
  padding: 0.35rem 0;
  font-size: 0.82rem;
  line-height: 1.35;
  color: #0f172a;
}

.ec-ficha-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem 2rem;
}

.ec-ficha-col {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}

.ec-ficha-row {
  display: grid;
  grid-template-columns: minmax(7.5rem, 9.5rem) minmax(0, 1fr);
  gap: 0.35rem 0.5rem;
  align-items: baseline;
}

.ec-ficha-row--calificacion {
  grid-template-columns: 1fr;
  margin-top: 0.15rem;
}

.ec-ficha-label {
  font-weight: 700;
  color: #0f172a;
}

.ec-ficha-valor {
  min-width: 0;
  word-break: break-word;
}

.ec-ficha-telefonos {
  font-size: 0.8rem;
}

.ec-ficha-calificacion {
  font-weight: 700;
}

.ec-tabla-saldos-wrap {
  margin-bottom: 1.15rem;
  overflow-x: auto;
}

.ec-tabla-saldos {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  color: #0f172a;
}

.ec-tabla-saldos th,
.ec-tabla-saldos td {
  border: 1px solid #0f172a;
  padding: 0.28rem 0.45rem;
}

.ec-tabla-saldos thead th {
  font-weight: 700;
  text-align: center;
  background: #fff;
}

.ec-th-etiqueta {
  text-align: left;
  font-weight: 700;
  background: #fff;
}

.ec-monto {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ec-th-vencido,
.ec-col-vencido {
  background: #e2e8f0;
}

.ec-fila-total th,
.ec-fila-total td {
  font-weight: 700;
}

.placeholder-resultados {
  margin: 0;
  padding: 1.25rem 1rem;
  border: 1px dashed #c9d4ec;
  border-radius: 4px;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.45;
  text-align: center;
}

.placeholder-resultados p {
  margin: 0;
}

.panel-busqueda {
  width: 100%;
  max-width: none;
  margin: 0;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 2px;
  overflow: hidden;
}

.fila-busqueda {
  display: grid;
  grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
  align-items: center;
  gap: 0.5rem 0.85rem;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid #cbd5e1;
}

.panel-busqueda .fila-busqueda:last-of-type {
  border-bottom: none;
}

.panel-busqueda-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem 0.85rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.ficha-label {
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #0f172a;
  text-transform: uppercase;
  font-size: 0.82rem;
}

.fila-input {
  width: 100%;
  min-width: 0;
}

.seccion-tablas {
  margin-top: 0;
  width: 100%;
}

.tabla-vacia {
  margin: 0 0 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.88rem;
  text-align: center;
}

.texto-muted {
  color: #94a3b8;
  font-size: 0.85rem;
}

.subtitulo {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: #1e293b;
  text-align: center;
}

.subtitulo--segundo {
  margin-top: 1.25rem;
}

.tabla-plan {
  width: 100%;
  display: block;
}

.tabla-plan :deep(.p-datatable) {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}

.tabla-plan :deep(.p-datatable-table-container),
.tabla-plan :deep(.p-datatable-table) {
  width: 100%;
}

.tabla-plan :deep(.p-datatable-table) {
  table-layout: fixed;
}

.tabla-plan :deep(.p-datatable-thead > tr > th) {
  background: #fff;
  color: #0f172a;
  border-color: #e2e8f0;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.78rem;
  text-align: center;
  padding: 0.55rem 0.65rem;
}

.tabla-plan :deep(.p-datatable-tbody > tr > td) {
  background: #fff;
  color: #334155;
  border-color: #e2e8f0;
  text-align: center;
  padding: 0.5rem 0.65rem;
  font-size: 0.88rem;
}

.tabla-plan :deep(.p-datatable-tbody > tr:hover > td) {
  background: #fff;
}

.tabla-plan :deep(.p-datatable-tbody > tr.p-row-odd > td),
.tabla-plan :deep(.p-datatable-tbody > tr.p-row-even > td) {
  background: #fff;
}

.estado-cuota-texto {
  color: #334155;
  font-size: 0.88rem;
}

.tabla-abonos {
  width: 100%;
}

.tabla-ec-fin :deep(.p-datatable-thead > tr > th) {
  text-transform: uppercase;
  font-weight: 700;
  color: #0f172a;
  text-align: center;
}

.tabla-ec-fin :deep(.p-datatable-tbody > tr > td) {
  text-align: center;
}

.tabla-historial-prestamos :deep(.p-datatable-tbody > tr.fila-prestamo-activo > td) {
  background: #eff6ff;
}

@media (max-width: 768px) {
  .ec-ficha-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
}
</style>
