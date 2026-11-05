<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'
import { formatDate, formatDateTime, formatMoney } from '@/utils/format'
import {
  buildHistorialQueryString,
  compararMontoHistorial,
  filtrarFilasPorCobradorSeleccionado,
  normalizarCobradorFiltroId,
  sumarResumenFilas,
  validarRangoSemana,
} from '@/utils/historialPagosCobros'
import type {
  AnularPagoResponse,
  HistorialPagosCobrosFila,
  HistorialPagosCobrosResponse,
  Paginated,
  UsuarioRow,
} from '@/types/api'

const toast = useToast()
const auth = useAuthStore()
const { canAnularPagos } = usePermissions()

const FILAS_POR_PAGINA = 20

const MESES = [
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

const modoOpciones = [
  { label: 'Por día', value: 'dia' as const },
  { label: 'Por semana', value: 'semana' as const },
  { label: 'Por mes', value: 'mes' as const },
  { label: 'Por año', value: 'anio' as const },
]

function hoyIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Lunes y domingo de la semana que contiene la fecha de referencia. */
function rangoSemanaActual(refIso = hoyIso()): { inicio: string; fin: string } {
  const ref = new Date(`${refIso}T12:00:00`)
  const day = ref.getDay() // 0=dom … 6=sáb
  const diffLunes = day === 0 ? -6 : 1 - day
  const lunes = new Date(ref)
  lunes.setDate(ref.getDate() + diffLunes)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return { inicio: isoDate(lunes), fin: isoDate(domingo) }
}

const modo = ref<'dia' | 'semana' | 'mes' | 'anio'>('semana')
const fechaDia = ref(hoyIso())
const semanaRangoInicial = rangoSemanaActual()
const fechaInicioSemana = ref(semanaRangoInicial.inicio)
const fechaFinSemana = ref(semanaRangoInicial.fin)
const mes = ref(new Date().getMonth() + 1)
const anio = ref(new Date().getFullYear())
const cobradorFiltro = ref<number | null>(null)

const cobradorFiltroId = computed({
  get: () => normalizarCobradorFiltroId(cobradorFiltro.value),
  set: (value: unknown) => {
    cobradorFiltro.value = normalizarCobradorFiltroId(value)
  },
})
const cobradores = ref<UsuarioRow[]>([])

const loading = ref(false)
const exportandoExcel = ref(false)
const exportandoPdf = ref(false)
const anulando = ref(false)
const error = ref('')
const reporte = ref<HistorialPagosCobrosResponse | null>(null)

const dialogAnularVisible = ref(false)
const pagoSeleccionado = ref<{ id_pago: number; nombre_cliente: string; total: string } | null>(null)
const motivoAnulacion = ref('')
const paginaPrimera = ref(0)
const filtrosInicializados = ref(false)
const consultaSeq = ref(0)
let debounceConsulta: ReturnType<typeof setTimeout> | undefined
let abortConsulta: AbortController | null = null

const DEBOUNCE_MS = 320

const esCobrador = computed(() => auth.profile?.rol === 'cobrador')

function buildQueryStringLocal(): string {
  return buildHistorialQueryString({
    modo: modo.value,
    fechaDia: fechaDia.value,
    fechaInicioSemana: fechaInicioSemana.value,
    fechaFinSemana: fechaFinSemana.value,
    mes: mes.value,
    anio: anio.value,
    cobradorFiltro: cobradorFiltroId.value,
  })
}

function cobradorSeleccionado(): UsuarioRow | null {
  const id = cobradorFiltroId.value
  if (id == null) return null
  return cobradores.value.find((c) => c.id_usuario === id) ?? null
}

function nombreUsuarioCobro(fila: HistorialPagosCobrosFila): string {
  return fila.registrado_por_nombre?.trim() || '—'
}

function fechaRegistroCobro(fila: HistorialPagosCobrosFila): string {
  return fila.registrado_en || formatDateTime(fila.cobrado_en) || '—'
}

const filasHistorial = computed(() => {
  const filas = reporte.value?.filas ?? []
  const cobrador = cobradorSeleccionado()
  return filtrarFilasPorCobradorSeleccionado(
    filas,
    cobradorFiltroId.value,
    cobrador?.nombre ?? reporte.value?.cobrador_etiqueta,
  )
})

const resumenVisible = computed(() => sumarResumenFilas(filasHistorial.value))

const hayFiltroCobradorToolbar = computed(() => cobradorFiltroId.value != null)

function sortMonto(
  a: HistorialPagosCobrosFila,
  b: HistorialPagosCobrosFila,
  field: keyof HistorialPagosCobrosFila,
) {
  return compararMontoHistorial(a, b, field)
}

const cobradorOpciones = computed(() => [
  { label: 'Todos', value: null as number | null },
  ...cobradores.value.map((c) => ({ label: c.nombre, value: c.id_usuario as number | null })),
])

const tituloCobrador = computed(() => {
  const cobrador = cobradorSeleccionado()
  if (cobrador?.nombre) return cobrador.nombre.toUpperCase()
  if (
    reporte.value?.cobrador_etiqueta &&
    reporte.value.cobrador_etiqueta.toLowerCase() !== 'todos los cobradores'
  ) {
    return reporte.value.cobrador_etiqueta.toUpperCase()
  }
  return 'TODOS LOS COBRADORES'
})

const periodoLegible = computed(() => {
  if (!reporte.value) return '—'
  const { modo: m, fecha_inicio, fecha_fin } = reporte.value
  if (m === 'dia') return formatDate(fecha_inicio)
  if (m === 'semana' || m === 'semanal') {
    if (fecha_inicio === fecha_fin) return formatDate(fecha_inicio)
    return `${formatDate(fecha_inicio)} – ${formatDate(fecha_fin)}`
  }
  if (m === 'mes') {
    const d = new Date(`${fecha_inicio}T12:00:00`)
    const nombreMes = MESES[d.getMonth()]?.label ?? ''
    return `${nombreMes} ${d.getFullYear()}`
  }
  if (m === 'anio') return String(new Date(`${fecha_inicio}T12:00:00`).getFullYear())
  if (fecha_inicio === fecha_fin) return formatDate(fecha_inicio)
  return `${formatDate(fecha_inicio)} – ${formatDate(fecha_fin)}`
})

const anioOpciones = computed(() => {
  const actual = new Date().getFullYear()
  return Array.from({ length: 8 }, (_, i) => ({
    label: String(actual - i),
    value: actual - i,
  }))
})

function onCobradorFiltroChange(_value: unknown) {
  if (!filtrosInicializados.value) return
  void consultarHistorial({ avisarSinRegistros: false })
}

async function cargarCobradores() {
  try {
    const { data } = await api.get<Paginated<UsuarioRow>>('/usuarios/?rol=cobrador&page_size=100&ordering=nombre')
    cobradores.value = data.results.filter((u) => u.rol === 'cobrador')
  } catch {
    cobradores.value = []
  }
  if (esCobrador.value && auth.profile?.id_usuario) {
    cobradorFiltro.value = auth.profile.id_usuario
  } else {
    cobradorFiltro.value = null
  }
}

function programarConsultaHistorial() {
  if (!filtrosInicializados.value) return
  if (debounceConsulta) clearTimeout(debounceConsulta)
  debounceConsulta = setTimeout(() => {
    void consultarHistorial({ avisarSinRegistros: false })
  }, DEBOUNCE_MS)
}

async function consultarHistorial(opciones: { avisarSinRegistros?: boolean } = {}) {
  const { avisarSinRegistros = true } = opciones
  error.value = ''
  if (modo.value === 'semana') {
    const msg = validarRangoSemana(fechaInicioSemana.value, fechaFinSemana.value)
    if (msg) {
      toast.add({
        severity: 'warn',
        summary: 'Semana',
        detail: msg,
        life: 4000,
      })
      return
    }
  }

  if (abortConsulta) abortConsulta.abort()
  const controller = new AbortController()
  abortConsulta = controller
  const seq = ++consultaSeq.value

  loading.value = true
  try {
    const { data } = await api.get<HistorialPagosCobrosResponse>(
      `/pagos/historial-cobros/?${buildQueryStringLocal()}`,
      { signal: controller.signal },
    )
    if (seq !== consultaSeq.value) return
    reporte.value = data
    paginaPrimera.value = 0
    if (avisarSinRegistros && !data.filas.length) {
      toast.add({
        severity: 'info',
        summary: 'Sin registros',
        detail: 'No hay pagos en el periodo seleccionado.',
        life: 4000,
      })
    }
  } catch (e) {
    if (controller.signal.aborted) return
    if (seq !== consultaSeq.value) return
    error.value = getApiErrorMessage(e, 'No se pudo cargar el historial.')
  } finally {
    if (seq === consultaSeq.value) {
      loading.value = false
    }
    if (abortConsulta === controller) {
      abortConsulta = null
    }
  }
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

function fallbackNombreExport(extension: 'xlsx' | 'pdf'): string {
  const cobrador = tituloCobrador.value.replace(/\s+/g, '_').toLowerCase()
  const periodo = periodoLegible.value.replace(/\s+/g, '_').replace('–', '-')
  return `historial_pagos_${cobrador}_${periodo}.${extension}`
}

async function exportarHistorialExcel() {
  if (!reporte.value?.filas.length) {
    toast.add({
      severity: 'warn',
      summary: 'Excel',
      detail: 'Consulte primero un periodo con registros.',
      life: 3500,
    })
    return
  }
  exportandoExcel.value = true
  try {
    const response = await api.get<Blob>(`/pagos/historial-cobros-excel/?${buildQueryStringLocal()}`, {
      responseType: 'blob',
    })
    const nombre = nombreDesdeContentDisposition(
      response.headers['content-disposition'],
      fallbackNombreExport('xlsx'),
    )
    descargarBlob(response.data, nombre)
    toast.add({ severity: 'success', summary: 'Excel descargado', life: 3000 })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo exportar',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    exportandoExcel.value = false
  }
}

async function exportarHistorialPdf() {
  if (!reporte.value?.filas.length) {
    toast.add({
      severity: 'warn',
      summary: 'PDF',
      detail: 'Consulte primero un periodo con registros.',
      life: 3500,
    })
    return
  }
  exportandoPdf.value = true
  try {
    const response = await api.get<Blob>(`/pagos/historial-cobros-pdf/?${buildQueryStringLocal()}`, {
      responseType: 'blob',
    })
    const nombre = nombreDesdeContentDisposition(
      response.headers['content-disposition'],
      fallbackNombreExport('pdf'),
    )
    descargarBlob(response.data, nombre)
    toast.add({ severity: 'success', summary: 'PDF descargado', life: 3000 })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo exportar',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    exportandoPdf.value = false
  }
}

function abrirDialogoAnular(fila: { id_pago: number; nombre_cliente: string; total: string }) {
  pagoSeleccionado.value = fila
  motivoAnulacion.value = ''
  dialogAnularVisible.value = true
}

function cerrarDialogoAnular() {
  dialogAnularVisible.value = false
  pagoSeleccionado.value = null
  motivoAnulacion.value = ''
}

async function confirmarAnulacion() {
  if (!pagoSeleccionado.value) return
  const motivo = motivoAnulacion.value.trim()
  if (!motivo) {
    toast.add({
      severity: 'warn',
      summary: 'Motivo requerido',
      detail: 'Indique por qué se anula este cobro.',
      life: 4000,
    })
    return
  }
  anulando.value = true
  try {
    const { data } = await api.post<AnularPagoResponse>(
      `/pagos/${pagoSeleccionado.value.id_pago}/anular/`,
      { motivo },
    )
    toast.add({
      severity: 'success',
      summary: 'Cobro anulado',
      detail: data.detail,
      life: 5000,
    })
    cerrarDialogoAnular()
    await consultarHistorial()
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo anular',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    anulando.value = false
  }
}

onMounted(async () => {
  if (auth.isAuthenticated && !auth.profile) {
    await auth.fetchProfile()
  }
  await cargarCobradores()
  filtrosInicializados.value = true
  await consultarHistorial({ avisarSinRegistros: true })
})

watch([modo, fechaDia, fechaInicioSemana, fechaFinSemana, mes, anio], () => {
  programarConsultaHistorial()
})

onBeforeUnmount(() => {
  if (debounceConsulta) clearTimeout(debounceConsulta)
  if (abortConsulta) abortConsulta.abort()
})
</script>

<template>
  <div class="page historial-pagos-page">
    <section class="historial-toolbar no-print">
      <h1 class="historial-titulo-pantalla">Historial de pagos</h1>

      <div class="historial-filtros">
        <div class="filtro-field">
          <label class="filtro-label" for="hist-modo">Periodo</label>
          <Select
            id="hist-modo"
            v-model="modo"
            :options="modoOpciones"
            option-label="label"
            option-value="value"
            class="filtro-select"
          />
        </div>

        <div v-if="modo === 'dia'" class="filtro-field">
          <label class="filtro-label" for="hist-fecha">Día</label>
          <InputText id="hist-fecha" v-model="fechaDia" type="date" class="filtro-input" />
        </div>

        <template v-if="modo === 'semana'">
          <div class="filtro-field">
            <label class="filtro-label" for="hist-fecha-inicio">Fecha inicio</label>
            <InputText
              id="hist-fecha-inicio"
              v-model="fechaInicioSemana"
              type="date"
              class="filtro-input"
            />
          </div>
          <div class="filtro-field">
            <label class="filtro-label" for="hist-fecha-fin">Fecha final</label>
            <InputText
              id="hist-fecha-fin"
              v-model="fechaFinSemana"
              type="date"
              class="filtro-input"
            />
          </div>
        </template>

        <template v-if="modo === 'mes'">
          <div class="filtro-field">
            <label class="filtro-label" for="hist-mes">Mes</label>
            <Select
              id="hist-mes"
              v-model="mes"
              :options="MESES"
              option-label="label"
              option-value="value"
              class="filtro-select"
            />
          </div>
          <div class="filtro-field">
            <label class="filtro-label" for="hist-anio-mes">Año</label>
            <Select
              id="hist-anio-mes"
              v-model="anio"
              :options="anioOpciones"
              option-label="label"
              option-value="value"
              class="filtro-select"
            />
          </div>
        </template>

        <div v-if="modo === 'anio'" class="filtro-field">
          <label class="filtro-label" for="hist-anio">Año</label>
          <Select
            id="hist-anio"
            v-model="anio"
            :options="anioOpciones"
            option-label="label"
            option-value="value"
            class="filtro-select"
          />
        </div>

        <div class="filtro-field">
          <label class="filtro-label" for="hist-cobrador">Cobrador</label>
          <Select
            id="hist-cobrador"
            v-model="cobradorFiltroId"
            :options="cobradorOpciones"
            option-label="label"
            option-value="value"
            class="filtro-select"
            placeholder="Todos"
            show-clear
            :disabled="esCobrador"
            @update:model-value="onCobradorFiltroChange"
          />
        </div>

        <div class="filtro-acciones">
          <Button
            label="Consultar"
            icon="pi pi-search"
            type="button"
            :loading="loading"
            :disabled="loading"
            @click="consultarHistorial({ avisarSinRegistros: true })"
          />
          <Button
            label="Excel"
            icon="pi pi-file-excel"
            type="button"
            severity="secondary"
            outlined
            :loading="exportandoExcel"
            :disabled="!reporte?.filas.length || loading"
            @click="exportarHistorialExcel"
          />
          <Button
            label="PDF"
            icon="pi pi-file-pdf"
            type="button"
            severity="danger"
            outlined
            :loading="exportandoPdf"
            :disabled="!reporte?.filas.length || loading"
            @click="exportarHistorialPdf"
          />
        </div>
      </div>
    </section>

    <p v-if="error" class="historial-error no-print">{{ error }}</p>

    <article v-if="reporte" class="historial-sheet">
      <header class="historial-header">
        <img src="/findeco-logo.png" alt="FINDECO" class="historial-logo" />
        <h2 class="historial-marca">FINDECO</h2>
        <p class="historial-cobrador">COBRADOR: {{ tituloCobrador }}</p>
        <p class="historial-periodo">PERIODO: {{ periodoLegible }}</p>
        <p v-if="reporte.generado_en" class="historial-generado">
          GENERADO: {{ formatDateTime(reporte.generado_en) }}
        </p>
        <p class="historial-tipo">HISTORIAL DE PAGOS — PRÉSTAMOS</p>
      </header>

      <DataTable
        v-model:first="paginaPrimera"
        :value="filasHistorial"
        :loading="loading"
        data-key="id_pago"
        paginator
        :rows="FILAS_POR_PAGINA"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport"
        current-page-report-template="Mostrando {first} a {last} de {totalRecords}"
        removable-sort
        responsive-layout="scroll"
        class="historial-table no-print-table"
      >
        <Column
          field="cartera_nombre"
          header="Cartera"
          sortable
          :style="{ minWidth: '8rem' }"
        />
        <Column
          field="nombre_cliente"
          header="Cliente"
          sortable
          :style="{ minWidth: '10rem' }"
        />
        <Column field="dni_cliente" header="DNI" sortable />
        <Column field="numero_prestamo" header="Préstamo" sortable />
        <Column field="documento" header="Documento" sortable />
        <Column field="fecha_programada" header="Fecha programada" sortable>
          <template #body="{ data }">
            {{ data.fecha_programada ? formatDate(data.fecha_programada) : '—' }}
          </template>
        </Column>
        <Column field="fecha_pago" header="Fecha canceló" sortable>
          <template #body="{ data }">{{ formatDate(data.fecha_pago) }}</template>
        </Column>
        <Column
          field="registrado_por_nombre"
          header="Cobrador"
          sortable
          :style="{ minWidth: '10rem' }"
        >
          <template #body="{ data }">
            <span class="auditoria-nombre">{{ nombreUsuarioCobro(data) }}</span>
          </template>
        </Column>
        <Column field="registrado_en" header="Fecha registro" sortable :style="{ minWidth: '10rem' }">
          <template #body="{ data }">
            <span class="auditoria-celda">{{ fechaRegistroCobro(data) }}</span>
          </template>
        </Column>
        <Column
          field="capital"
          header="Capital"
          sortable
          :sort-function="(a: HistorialPagosCobrosFila, b: HistorialPagosCobrosFila) => sortMonto(a, b, 'capital')"
          style="text-align: right"
        >
          <template #body="{ data }">{{ formatMoney(data.capital) }}</template>
        </Column>
        <Column
          field="total"
          header="Total"
          sortable
          :sort-function="(a: HistorialPagosCobrosFila, b: HistorialPagosCobrosFila) => sortMonto(a, b, 'total')"
          style="text-align: right"
        >
          <template #body="{ data }">{{ formatMoney(data.total) }}</template>
        </Column>
        <Column v-if="canAnularPagos" header="Acciones" class="no-print-col">
          <template #body="{ data }">
            <Button
              label="Anular"
              icon="pi pi-times-circle"
              severity="danger"
              size="small"
              outlined
              type="button"
              :disabled="anulando"
              @click="abrirDialogoAnular(data)"
            />
          </template>
        </Column>
      </DataTable>

      <Dialog
        v-model:visible="dialogAnularVisible"
        modal
        header="Anular cobro"
        class="dialog-anular-cobro no-print"
        :style="{ width: 'min(28rem, 95vw)' }"
        @hide="cerrarDialogoAnular"
      >
        <p v-if="pagoSeleccionado" class="dialog-anular-resumen">
          Se anulará el cobro de <strong>{{ pagoSeleccionado.nombre_cliente }}</strong>
          por <strong>{{ formatMoney(pagoSeleccionado.total) }}</strong>.
          El saldo del préstamo se recalculará y la factura quedará marcada como anulada.
        </p>
        <div class="dialog-anular-field">
          <label for="motivo-anulacion">Motivo</label>
          <Textarea
            id="motivo-anulacion"
            v-model="motivoAnulacion"
            rows="3"
            auto-resize
            class="w-full"
            placeholder="Ej.: cobro duplicado, monto incorrecto…"
          />
        </div>
        <template #footer>
          <Button label="Cancelar" severity="secondary" text type="button" @click="cerrarDialogoAnular" />
          <Button
            label="Anular cobro"
            icon="pi pi-times-circle"
            severity="danger"
            type="button"
            :loading="anulando"
            @click="confirmarAnulacion"
          />
        </template>
      </Dialog>

      <footer class="historial-totales">
        <span v-if="hayFiltroCobradorToolbar" class="historial-totales-nota">
          Totales del cobrador seleccionado ({{ resumenVisible.registros }} registros)
        </span>
        <span v-else class="historial-totales-nota">
          Totales del periodo ({{ resumenVisible.registros }} registros)
        </span>
        <span><strong>Capital:</strong> {{ formatMoney(resumenVisible.totalCapital) }}</span>
        <span class="historial-total-grande"
          ><strong>Total cobrado:</strong> {{ formatMoney(resumenVisible.totalCobrado) }}</span
        >
      </footer>
    </article>
  </div>
</template>

<style scoped>
.historial-pagos-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.historial-toolbar {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
}

.historial-titulo-pantalla {
  margin: 0 0 0.25rem;
  font-size: 1.35rem;
  font-weight: 700;
}

.historial-table :deep(.p-datatable-thead > tr > th) {
  white-space: nowrap;
}

.historial-subtitulo {
  margin: 0 0 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.95rem;
}

.historial-filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.filtro-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 10rem;
}

.filtro-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.filtro-select,
.filtro-input {
  min-width: 11rem;
}

.filtro-acciones {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.historial-error {
  color: var(--p-red-600);
  margin: 0;
}

.historial-sheet {
  background: #fff;
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  padding: 1.25rem 1.5rem 1.5rem;
}

.historial-header {
  text-align: center;
  margin-bottom: 1rem;
  border-bottom: 2px solid #1a1a1a;
  padding-bottom: 0.75rem;
}

.historial-logo {
  display: block;
  margin: 0 auto 0.5rem;
  max-height: 56px;
  width: auto;
  object-fit: contain;
}

.historial-marca {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: 0.12em;
}

.historial-cobrador,
.historial-periodo,
.historial-generado,
.historial-tipo {
  margin: 0.2rem 0 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.historial-totales {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--p-surface-300);
  font-size: 0.9rem;
  align-items: baseline;
}

.historial-totales-nota {
  flex: 1 1 100%;
  font-size: 0.82rem;
  color: var(--p-text-muted-color);
}

.historial-total-grande {
  font-size: 1rem;
}

.dialog-anular-resumen {
  margin: 0 0 1rem;
  line-height: 1.5;
}

.dialog-anular-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.dialog-anular-field label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.auditoria-celda {
  display: block;
  font-size: 0.82rem;
  line-height: 1.35;
  color: var(--p-text-muted-color, #64748b);
}

.auditoria-nombre {
  display: block;
  font-weight: 600;
  line-height: 1.35;
}

@media (max-width: 767px) {
  .historial-toolbar,
  .historial-sheet {
    padding: 1rem;
  }

  .historial-titulo-pantalla {
    font-size: 1.15rem;
  }

  .historial-filtros {
    flex-direction: column;
    align-items: stretch;
  }

  .filtro-field,
  .filtro-select,
  .filtro-input {
    min-width: 0;
    width: 100%;
  }

  .filtro-acciones {
    width: 100%;
  }

  .filtro-acciones :deep(.p-button) {
    flex: 1;
  }
}
</style>
