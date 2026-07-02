<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Select from 'primevue/select'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import {
  descargarDesembolsosFindecoPdf,
  generateDesembolsosFindecoPdf,
  type DesembolsosFindecoPdfData,
} from '@/utils/desembolsosFindecoPdf'
import { formatDate, formatMoney } from '@/utils/format'
import { totalInteresDesdeCondiciones } from '@/utils/prestamoCalc'
import type { Cartera, Cliente, Paginated, Prestamo } from '@/types/api'

const PAGE_SIZE_FETCH = 100

const carteraFieldDomId = `cartera-findeco-${crypto.randomUUID()}`

const loading = ref(false)
const error = ref('')
const prestamos = ref<Prestamo[]>([])
const carteraFiltroId = ref<number | null>(null)
const anioFiltro = ref(new Date().getFullYear())
const mesFiltro = ref<number | null>(null)
const diaFiltro = ref<number | null>(null)
const carterasCatalogo = ref<Cartera[]>([])
const consultaHecha = ref(false)
const clientesNombrePorId = ref<Record<number, string>>({})
const pdfModalVisible = ref(false)
const pdfLoading = ref(false)
const pdfError = ref('')
const pdfUrl = ref<string | null>(null)
const pdfBlob = ref<Blob | null>(null)
const pdfTitulo = ref('REPORTE DE DESEMBOLSOS')
const pdfFrameRef = ref<HTMLIFrameElement | null>(null)

const MESES: { label: string; value: number | null }[] = [
  { label: 'Todos los meses', value: null },
  { label: 'Enero', value: 1 },
  { label: 'Febrero', value: 2 },
  { label: 'Marzo', value: 3 },
  { label: 'Abril', value: 4 },
  { label: 'Mayo', value: 5 },
  { label: 'Junio', value: 6 },
  { label: 'Julio', value: 7 },
  { label: 'Agosto', value: 8 },
  { label: 'Septiembre', value: 9 },
  { label: 'Octubre', value: 10 },
  { label: 'Noviembre', value: 11 },
  { label: 'Diciembre', value: 12 },
]

function roundMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function totalInteresDesdePrestamo(p: Prestamo): number {
  const monto = typeof p.monto === 'string' ? Number.parseFloat(p.monto) : Number(p.monto)
  const tasa =
    typeof p.tasa_interes === 'string' ? Number.parseFloat(String(p.tasa_interes)) : Number(p.tasa_interes)
  const plazo = Math.trunc(Number(p.plazo))
  const formaPago = p.forma_pago || 'mensual'

  if (!Number.isFinite(monto) || !Number.isFinite(tasa) || plazo <= 0) return 0

  return totalInteresDesdeCondiciones(monto, plazo, formaPago, tasa)
}

function formatTasaPct(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  if (Number.isNaN(n)) return '—'
  return `${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function montoPrestamo(p: Prestamo): number {
  const m = typeof p.monto === 'string' ? Number.parseFloat(p.monto) : Number(p.monto)
  return Number.isFinite(m) ? m : 0
}

function nombreCliente(id: number): string {
  return clientesNombrePorId.value[id]?.trim() || '—'
}

function codigoPrestamo(p: Prestamo): string {
  const codigo = (p.numero_prestamo ?? '').trim()
  return codigo || String(p.id_prestamo)
}

function parsePartesFecha(iso: string | null | undefined): { anio: number; mes: number; dia: number } | null {
  const t = (iso ?? '').trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  return {
    anio: Number.parseInt(m[1], 10),
    mes: Number.parseInt(m[2], 10),
    dia: Number.parseInt(m[3], 10),
  }
}

function prestamoCoincideFiltroFecha(p: Prestamo): boolean {
  const partes = parsePartesFecha(p.fecha_entrega)
  if (!partes) return false
  if (partes.anio !== anioFiltro.value) return false
  if (mesFiltro.value != null && partes.mes !== mesFiltro.value) return false
  if (diaFiltro.value != null && partes.dia !== diaFiltro.value) return false
  return true
}

function nombreCarteraPrestamo(p: Prestamo): string {
  const embebido = p.cartera?.nombre?.trim()
  if (embebido) return embebido
  const idC = p.id_cartera ?? null
  if (idC == null) return 'Sin cartera'
  return carterasCatalogo.value.find((c) => c.id_cartera === idC)?.nombre?.trim() || `Cartera #${idC}`
}

function claveCartera(p: Prestamo): string {
  const idC = p.id_cartera ?? null
  return idC == null ? 'sin-cartera' : String(idC)
}

const opcionesAnio = computed(() => {
  const actual = new Date().getFullYear()
  const items: { label: string; value: number }[] = []
  for (let y = actual + 1; y >= actual - 10; y -= 1) {
    items.push({ label: String(y), value: y })
  }
  return items
})

const opcionesDia = computed(() => {
  const items: { label: string; value: number | null }[] = [{ label: 'Todos los días', value: null }]
  if (mesFiltro.value == null) return items
  const dias = diasEnMes(anioFiltro.value, mesFiltro.value)
  for (let d = 1; d <= dias; d += 1) {
    items.push({ label: String(d), value: d })
  }
  return items
})

function diasEnMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate()
}

const opcionesCarteraFiltro = computed(() => [
  { label: 'Todas las carteras', value: null as number | null },
  ...carterasCatalogo.value
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => ({
      label: c.nombre,
      value: c.id_cartera,
    })),
])

const etiquetaPeriodo = computed(() => {
  const partes = [String(anioFiltro.value)]
  if (mesFiltro.value != null) {
    const mesLabel = MESES.find((m) => m.value === mesFiltro.value)?.label ?? String(mesFiltro.value)
    partes.push(mesLabel)
  }
  if (diaFiltro.value != null) partes.push(`día ${diaFiltro.value}`)
  return partes.join(' · ')
})

interface FilaPorFecha {
  fecha: string
  cantidad: number
  montoTotal: number
  interesTotal: number
}

interface BloqueCartera {
  clave: string
  idCartera: number | null
  nombreCartera: string
  cantidad: number
  montoTotal: number
  interesTotal: number
  porFecha: FilaPorFecha[]
  prestamos: Prestamo[]
}

const prestamosFiltrados = computed(() =>
  prestamos.value.filter((p) => prestamoCoincideFiltroFecha(p)),
)

const bloquesPorCartera = computed((): BloqueCartera[] => {
  const map = new Map<string, BloqueCartera>()

  for (const p of prestamosFiltrados.value) {
    const clave = claveCartera(p)
    let bloque = map.get(clave)
    if (!bloque) {
      bloque = {
        clave,
        idCartera: p.id_cartera ?? null,
        nombreCartera: nombreCarteraPrestamo(p),
        cantidad: 0,
        montoTotal: 0,
        interesTotal: 0,
        porFecha: [],
        prestamos: [],
      }
      map.set(clave, bloque)
    }
    bloque.cantidad += 1
    bloque.montoTotal = roundMoney2(bloque.montoTotal + montoPrestamo(p))
    bloque.interesTotal = roundMoney2(bloque.interesTotal + totalInteresDesdePrestamo(p))
    bloque.prestamos.push(p)
  }

  const bloques = [...map.values()].sort((a, b) => a.nombreCartera.localeCompare(b.nombreCartera, 'es'))

  for (const bloque of bloques) {
    const porFechaMap = new Map<string, FilaPorFecha>()
    for (const p of bloque.prestamos) {
      const fecha = (p.fecha_entrega ?? '').slice(0, 10)
      let fila = porFechaMap.get(fecha)
      if (!fila) {
        fila = { fecha, cantidad: 0, montoTotal: 0, interesTotal: 0 }
        porFechaMap.set(fecha, fila)
      }
      fila.cantidad += 1
      fila.montoTotal = roundMoney2(fila.montoTotal + montoPrestamo(p))
      fila.interesTotal = roundMoney2(fila.interesTotal + totalInteresDesdePrestamo(p))
    }
    bloque.porFecha = [...porFechaMap.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
    bloque.prestamos.sort((a, b) => {
      const fa = (a.fecha_entrega ?? '').localeCompare(b.fecha_entrega ?? '')
      if (fa !== 0) return fa
      return a.numero_prestamo.localeCompare(b.numero_prestamo, 'es', { numeric: true })
    })
  }

  return bloques
})

const totalesGenerales = computed(() => {
  let monto = 0
  let interes = 0
  for (const p of prestamosFiltrados.value) {
    monto = roundMoney2(monto + montoPrestamo(p))
    interes = roundMoney2(interes + totalInteresDesdePrestamo(p))
  }
  return {
    cantidad: prestamosFiltrados.value.length,
    montoTotal: monto,
    interesTotal: interes,
  }
})

const resumenPorCartera = computed(() =>
  bloquesPorCartera.value.map((b) => ({
    nombreCartera: b.nombreCartera,
    cantidad: b.cantidad,
    montoTotal: b.montoTotal,
    interesTotal: b.interesTotal,
  })),
)

watch(carteraFiltroId, () => {
  prestamos.value = []
  consultaHecha.value = false
  error.value = ''
})

watch(mesFiltro, () => {
  if (mesFiltro.value == null) diaFiltro.value = null
  else if (diaFiltro.value != null && diaFiltro.value > diasEnMes(anioFiltro.value, mesFiltro.value)) {
    diaFiltro.value = null
  }
})

watch(anioFiltro, () => {
  if (mesFiltro.value != null && diaFiltro.value != null) {
    if (diaFiltro.value > diasEnMes(anioFiltro.value, mesFiltro.value)) diaFiltro.value = null
  }
})

async function cargarClientes() {
  try {
    const allRows: Cliente[] = []
    let page = 1
    let total = Number.POSITIVE_INFINITY
    while (allRows.length < total) {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE_FETCH),
      })
      const { data } = await api.get<Paginated<Cliente>>(`/clientes/?${params.toString()}`)
      total = data.count
      allRows.push(...data.results)
      if (data.results.length === 0) break
      page += 1
    }
    const map: Record<number, string> = {}
    for (const c of allRows) {
      const n = c.nombre?.trim()
      map[c.id_cliente] = n && n !== '' ? n : '—'
    }
    clientesNombrePorId.value = map
  } catch {
    clientesNombrePorId.value = {}
  }
}

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

async function cargarCarterasCatalogo() {
  try {
    carterasCatalogo.value = await fetchAllPages<Cartera>('/carteras/?page_size=100')
  } catch {
    carterasCatalogo.value = []
  }
}

async function actualizarCatalogoYListado() {
  await cargarCarterasCatalogo()
  if (consultaHecha.value) await buscarDesembolsos()
}

async function buscarDesembolsos() {
  loading.value = true
  error.value = ''
  prestamos.value = []
  consultaHecha.value = false
  try {
    const allRows: Prestamo[] = []
    let page = 1
    let total = Number.POSITIVE_INFINITY

    while (allRows.length < total) {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE_FETCH),
        ordering: '-fecha_entrega,-id_prestamo',
      })
      if (carteraFiltroId.value != null) {
        params.set('id_cartera', String(carteraFiltroId.value))
      }
      const { data } = await api.get<Paginated<Prestamo>>(`/prestamos/?${params.toString()}`)
      total = data.count
      allRows.push(...data.results)
      if (data.results.length === 0) break
      page += 1
    }

    prestamos.value = allRows
    consultaHecha.value = true
  } catch (e) {
    error.value = getApiErrorMessage(e)
    consultaHecha.value = true
  } finally {
    loading.value = false
  }
}

function fechaReporteEncabezado(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

function carteraTituloReporte(): string {
  return carteraFiltroId.value == null
    ? 'Todas las carteras'
    : opcionesCarteraFiltro.value.find((c) => c.value === carteraFiltroId.value)?.label ?? 'Cartera'
}

function construirDatosPdf(): DesembolsosFindecoPdfData {
  const fechaEnc = fechaReporteEncabezado()
  const titulo = `REPORTE DE DESEMBOLSOS ${fechaEnc}`
  const { cantidad, montoTotal, interesTotal } = totalesGenerales.value

  return {
    titulo,
    carteraTitulo: carteraTituloReporte(),
    etiquetaPeriodo: etiquetaPeriodo.value,
    totales: {
      cantidad,
      monto: formatMoney(montoTotal),
      interes: formatMoney(interesTotal),
    },
    bloques: bloquesPorCartera.value.map((bloque) => ({
      nombreCartera: bloque.nombreCartera,
      cantidad: bloque.cantidad,
      montoTotal: formatMoney(bloque.montoTotal),
      interesTotal: formatMoney(bloque.interesTotal),
      porFecha: bloque.porFecha.map((f) => ({
        fecha: formatDate(f.fecha),
        cantidad: f.cantidad,
        monto: formatMoney(f.montoTotal),
        interes: formatMoney(f.interesTotal),
      })),
      prestamos: bloque.prestamos.map((p, i) => ({
        numero: i + 1,
        codigo: codigoPrestamo(p),
        cliente: nombreCliente(p.id_cliente),
        fechaEntrega: formatDate(p.fecha_entrega),
        monto: formatMoney(p.monto),
        tasa: formatTasaPct(p.tasa_interes),
        plazo: String(p.plazo),
        interes: formatMoney(totalInteresDesdePrestamo(p)),
      })),
    })),
  }
}

function revocarPdfUrl() {
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = null
  }
  pdfBlob.value = null
}

async function imprimirReporte() {
  if (bloquesPorCartera.value.length === 0) return

  pdfModalVisible.value = true
  pdfLoading.value = true
  pdfError.value = ''
  revocarPdfUrl()

  try {
    const datos = construirDatosPdf()
    pdfTitulo.value = datos.titulo
    const blob = generateDesembolsosFindecoPdf(datos)
    pdfBlob.value = blob
    pdfUrl.value = URL.createObjectURL(blob)
  } catch {
    pdfError.value = 'No se pudo generar el PDF del reporte.'
  } finally {
    pdfLoading.value = false
  }
}

function descargarPdfModal() {
  if (!pdfBlob.value) return
  descargarDesembolsosFindecoPdf(pdfBlob.value, pdfTitulo.value)
}

function imprimirDesdeModal() {
  const frame = pdfFrameRef.value
  if (!frame?.contentWindow) return
  frame.contentWindow.focus()
  frame.contentWindow.print()
}

onMounted(() => {
  void Promise.all([cargarClientes(), cargarCarterasCatalogo()])
})

watch(pdfModalVisible, (abierto) => {
  if (!abierto) {
    revocarPdfUrl()
    pdfError.value = ''
  }
})

onBeforeUnmount(() => {
  revocarPdfUrl()
  carteraFiltroId.value = null
  prestamos.value = []
  carterasCatalogo.value = []
  consultaHecha.value = false
  clientesNombrePorId.value = {}
})
</script>

<template>
  <div class="page page-twelve-col">
    <header class="titulo-marca span-full" aria-label="Desembolsos FINDECO">
      <p class="titulo-marca-eyebrow">Desembolsos</p>
      <div class="titulo-marca-caja">
        <span class="titulo-marca-texto">FINDECO</span>
      </div>
    </header>

    <h1 class="title span-full">Reporte de desembolsos por cartera</h1>

    <form
      class="span-full barra-filtros"
      autocomplete="off"
      data-lpignore="true"
      data-1p-ignore
      data-bwignore
      @submit.prevent="buscarDesembolsos"
    >
      <div class="filtro-campo">
        <label class="filtro-label" :for="carteraFieldDomId">Cartera</label>
        <Select
          :input-id="carteraFieldDomId"
          v-model="carteraFiltroId"
          :options="opcionesCarteraFiltro"
          option-label="label"
          option-value="value"
          placeholder="Todas las carteras"
          show-clear
          fluid
        />
      </div>
      <div class="filtro-campo filtro-campo-corto">
        <label class="filtro-label" for="anio-findeco">Año</label>
        <Select
          id="anio-findeco"
          v-model="anioFiltro"
          :options="opcionesAnio"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <div class="filtro-campo filtro-campo-corto">
        <label class="filtro-label" for="mes-findeco">Mes</label>
        <Select
          id="mes-findeco"
          v-model="mesFiltro"
          :options="MESES"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <div class="filtro-campo filtro-campo-corto">
        <label class="filtro-label" for="dia-findeco">Día</label>
        <Select
          id="dia-findeco"
          v-model="diaFiltro"
          :options="opcionesDia"
          option-label="label"
          option-value="value"
          :disabled="mesFiltro == null"
          fluid
        />
      </div>
      <div class="acciones">
        <Button label="Consultar" icon="pi pi-search" type="submit" :loading="loading" />
        <Button
          label="Actualizar datos"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="loading"
          type="button"
          @click="actualizarCatalogoYListado"
        />
        <Button
          label="Imprimir reporte"
          icon="pi pi-print"
          severity="secondary"
          type="button"
          :disabled="loading || bloquesPorCartera.length === 0"
          @click="imprimirReporte"
        />
      </div>
    </form>

    <Message v-if="error" severity="error" class="msg span-full" :closable="false">{{ error }}</Message>

    <p v-if="loading" class="estado span-full">Cargando desembolsos…</p>
    <p v-else-if="!consultaHecha" class="estado span-full">
      Elige cartera y periodo, luego pulsa <strong>Consultar</strong>.
    </p>
    <p v-else-if="consultaHecha && bloquesPorCartera.length === 0 && !error" class="estado span-full">
      No hay desembolsos para {{ etiquetaPeriodo }}
      <template v-if="carteraFiltroId != null"> en la cartera seleccionada</template>.
    </p>

    <template v-else-if="bloquesPorCartera.length > 0">
      <div class="span-full panel-tabla">
        <h2 class="subtitulo">Resumen por cartera · {{ etiquetaPeriodo }}</h2>
        <DataTable
          class="datatable-reporte"
          :value="resumenPorCartera"
          responsive-layout="scroll"
          striped-rows
          size="small"
        >
          <Column field="nombreCartera" header="Cartera" :style="{ minWidth: '12rem' }" />
          <Column header="Préstamos" :style="{ width: '6rem' }">
            <template #body="{ data }">{{ data.cantidad }}</template>
          </Column>
          <Column header="Monto desembolsado" :style="{ minWidth: '9rem' }">
            <template #body="{ data }">{{ formatMoney(data.montoTotal) }}</template>
          </Column>
          <Column header="Interés total" :style="{ minWidth: '9rem' }">
            <template #body="{ data }">{{ formatMoney(data.interesTotal) }}</template>
          </Column>
        </DataTable>
        <div class="fila-totales fila-total-detalle-pie" aria-label="Totales generales">
          <span>Total general</span>
          <span>{{ totalesGenerales.cantidad }} préstamos</span>
          <span>Monto {{ formatMoney(totalesGenerales.montoTotal) }}</span>
          <span>Interés {{ formatMoney(totalesGenerales.interesTotal) }}</span>
        </div>
      </div>

      <div v-for="bloque in bloquesPorCartera" :key="bloque.clave" class="span-full panel-tabla">
        <h2 class="subtitulo">{{ bloque.nombreCartera }}</h2>

        <h3 class="subtitulo-detalle">Por día de entrega</h3>
        <DataTable
          class="datatable-reporte datatable-desembolso"
          :value="bloque.porFecha"
          responsive-layout="scroll"
          striped-rows
          size="small"
        >
          <Column header="Fecha" :style="{ minWidth: '9rem' }">
            <template #body="{ data }">{{ formatDate(data.fecha) }}</template>
          </Column>
          <Column header="Préstamos" :style="{ width: '6rem' }">
            <template #body="{ data }">{{ data.cantidad }}</template>
          </Column>
          <Column header="Monto" :style="{ minWidth: '8rem' }">
            <template #body="{ data }">{{ formatMoney(data.montoTotal) }}</template>
          </Column>
          <Column header="Interés" :style="{ minWidth: '8rem' }">
            <template #body="{ data }">{{ formatMoney(data.interesTotal) }}</template>
          </Column>
        </DataTable>

        <h3 class="subtitulo-detalle">Detalle de préstamos</h3>
        <div class="bloque-cartera-tabla">
          <DataTable
            class="datatable-reporte datatable-desembolso"
            :value="bloque.prestamos"
            responsive-layout="scroll"
            striped-rows
            size="small"
            data-key="id_prestamo"
          >
            <Column header="N" :style="{ width: '2.75rem' }">
              <template #body="{ index }: { index: number }">{{ (index ?? 0) + 1 }}</template>
            </Column>
            <Column header="Nº préstamo" :style="{ minWidth: '9rem' }">
              <template #body="{ data }: { data: Prestamo }">{{ codigoPrestamo(data) }}</template>
            </Column>
            <Column header="Nombre" :style="{ minWidth: '14rem' }">
              <template #body="{ data }: { data: Prestamo }">{{ nombreCliente(data.id_cliente) }}</template>
            </Column>
            <Column header="Entrega" :style="{ minWidth: '9rem' }">
              <template #body="{ data }: { data: Prestamo }">{{ formatDate(data.fecha_entrega) }}</template>
            </Column>
            <Column header="Monto" :style="{ minWidth: '8rem' }">
              <template #body="{ data }: { data: Prestamo }">{{ formatMoney(data.monto) }}</template>
            </Column>
            <Column header="Tasa" :style="{ minWidth: '6.5rem' }">
              <template #body="{ data }: { data: Prestamo }">{{ formatTasaPct(data.tasa_interes) }}</template>
            </Column>
            <Column header="Plazo" :style="{ width: '4.5rem' }">
              <template #body="{ data }: { data: Prestamo }">{{ data.plazo }}</template>
            </Column>
            <Column header="Interés" :style="{ minWidth: '8rem' }">
              <template #body="{ data }: { data: Prestamo }">
                {{ formatMoney(totalInteresDesdePrestamo(data)) }}
              </template>
            </Column>
          </DataTable>
        </div>
      </div>
    </template>

    <Dialog
      v-model:visible="pdfModalVisible"
      :header="pdfTitulo"
      modal
      :style="{ width: 'min(58rem, 96vw)' }"
      :content-style="{ padding: 0, overflow: 'hidden' }"
    >
      <div class="pdf-modal-body">
        <div v-if="pdfLoading" class="pdf-modal-loading">
          <ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="4" />
          <span>Generando PDF…</span>
        </div>
        <p v-else-if="pdfError" class="pdf-modal-error">{{ pdfError }}</p>
        <iframe
          v-else-if="pdfUrl"
          ref="pdfFrameRef"
          :src="pdfUrl"
          class="pdf-modal-frame"
          title="Reporte de desembolsos PDF"
        />
      </div>
      <template #footer>
        <Button
          v-if="pdfUrl"
          label="Imprimir"
          icon="pi pi-print"
          severity="secondary"
          outlined
          @click="imprimirDesdeModal"
        />
        <Button
          v-if="pdfUrl"
          label="Descargar"
          icon="pi pi-download"
          severity="secondary"
          outlined
          @click="descargarPdfModal"
        />
        <Button label="Cerrar" severity="secondary" text @click="pdfModalVisible = false" />
      </template>
    </Dialog>
  </div>
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
}

.barra-filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem 1.25rem;
  margin-bottom: 0.35rem;
}

.filtro-campo {
  flex: 1 1 14rem;
  min-width: min(100%, 14rem);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.filtro-campo-corto {
  flex: 0 1 9rem;
  min-width: min(100%, 9rem);
}

.filtro-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
}

.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.msg {
  margin: 0;
}

.estado {
  margin: 0;
  padding: 1rem 0;
  color: #64748b;
  font-size: 0.95rem;
}

.subtitulo {
  margin: 0 0 0.65rem;
  font-size: 1rem;
  font-weight: 600;
  color: #334155;
}

.subtitulo-detalle {
  margin: 0.85rem 0 0.45rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: #475569;
}

.panel-tabla {
  min-width: 0;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  padding: 1rem;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}

.bloque-cartera-tabla {
  margin-top: 0;
}

.fila-totales {
  display: grid;
  grid-template-columns: 1.2fr repeat(3, auto);
  gap: 0.75rem 1rem;
  align-items: center;
  margin-top: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: #f8fafc;
  border-radius: 0.375rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
}

.fila-total-detalle-pie {
  margin-top: 1rem;
  border: 1px solid #e2e8f0;
}

@media (max-width: 52rem) {
  .fila-total-detalle-pie {
    grid-template-columns: 1fr 1fr;
    font-size: 0.82rem;
  }
}

.datatable-reporte :deep(table) {
  width: 100%;
}

.datatable-reporte :deep(.p-datatable-wrapper) {
  border-radius: 0.45rem;
}

.datatable-desembolso :deep(.p-datatable-thead > tr > th) {
  text-transform: uppercase;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: #334155;
}

.datatable-desembolso :deep(.p-datatable-tbody > tr > td) {
  font-size: 0.875rem;
}

.pdf-modal-body {
  min-height: min(78vh, 42rem);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
}

.pdf-modal-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  color: #475569;
  font-size: 0.9rem;
}

.pdf-modal-error {
  margin: 1rem;
  color: #b91c1c;
  font-size: 0.9rem;
  text-align: center;
}

.pdf-modal-frame {
  width: 100%;
  height: min(78vh, 42rem);
  border: 0;
  background: #fff;
}
</style>
