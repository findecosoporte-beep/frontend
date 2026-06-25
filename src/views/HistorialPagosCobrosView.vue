<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'
import { formatDate, formatMoney } from '@/utils/format'
import type { Cartera, HistorialPagosCobrosResponse, Paginated } from '@/types/api'

const toast = useToast()
const auth = useAuthStore()

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
  { label: 'Por mes', value: 'mes' as const },
  { label: 'Por año', value: 'anio' as const },
]

function hoyIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const modo = ref<'dia' | 'mes' | 'anio'>('dia')
const fechaDia = ref(hoyIso())
const mes = ref(new Date().getMonth() + 1)
const anio = ref(new Date().getFullYear())
const carteraFiltro = ref<number | null>(null)
const carteras = ref<Cartera[]>([])

const loading = ref(false)
const exportandoExcel = ref(false)
const exportandoPdf = ref(false)
const error = ref('')
const reporte = ref<HistorialPagosCobrosResponse | null>(null)

const esCobrador = computed(() => auth.profile?.rol === 'cobrador')

const carteraOpciones = computed(() =>
  carteras.value.map((c) => ({ label: c.nombre, value: c.id_cartera })),
)

const tituloCartera = computed(() => {
  const c = carteras.value.find((x) => x.id_cartera === carteraFiltro.value)
  return (c?.nombre ?? 'CARTERA').toUpperCase()
})

const periodoLegible = computed(() => {
  if (!reporte.value) return '—'
  const { modo: m, fecha_inicio, fecha_fin } = reporte.value
  if (m === 'dia') return formatDate(fecha_inicio)
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

function aplicarCarteraPorDefecto() {
  if (carteraFiltro.value != null) return
  const primera = carteras.value[0]
  if (primera) carteraFiltro.value = primera.id_cartera
}

async function cargarCarteras() {
  try {
    if (esCobrador.value && auth.profile?.carteras?.length) {
      carteras.value = auth.profile.carteras as Cartera[]
      aplicarCarteraPorDefecto()
      return
    }
    const { data } = await api.get<Paginated<Cartera>>('/carteras/?page_size=100')
    carteras.value = data.results
    aplicarCarteraPorDefecto()
  } catch {
    carteras.value = []
    carteraFiltro.value = null
  }
}

function buildHistorialQueryString(): string {
  const qs = new URLSearchParams({ modo: modo.value })
  if (modo.value === 'dia') {
    qs.set('fecha', fechaDia.value)
    qs.set('anio', String(new Date(`${fechaDia.value}T12:00:00`).getFullYear()))
  } else if (modo.value === 'mes') {
    qs.set('mes', String(mes.value))
    qs.set('anio', String(anio.value))
  } else {
    qs.set('anio', String(anio.value))
  }
  if (carteraFiltro.value != null) {
    qs.set('id_cartera', String(carteraFiltro.value))
  }
  return qs.toString()
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
  const cartera = tituloCartera.value.replace(/\s+/g, '_').toLowerCase()
  const periodo = periodoLegible.value.replace(/\s+/g, '_').replace('–', '-')
  return `historial_pagos_${cartera}_${periodo}.${extension}`
}

async function consultarHistorial() {
  error.value = ''
  if (carteraFiltro.value == null) {
    error.value = 'Seleccione una cartera para consultar el historial.'
    return
  }
  loading.value = true
  reporte.value = null
  try {
    const { data } = await api.get<HistorialPagosCobrosResponse>(
      `/pagos/historial-cobros/?${buildHistorialQueryString()}`,
    )
    reporte.value = data
    if (!data.filas.length) {
      toast.add({
        severity: 'info',
        summary: 'Sin registros',
        detail: 'No hay pagos en el periodo seleccionado.',
        life: 4000,
      })
    }
  } catch (e) {
    error.value = getApiErrorMessage(e, 'No se pudo cargar el historial.')
  } finally {
    loading.value = false
  }
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
    const response = await api.get<Blob>(`/pagos/historial-cobros-excel/?${buildHistorialQueryString()}`, {
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
    const response = await api.get<Blob>(`/pagos/historial-cobros-pdf/?${buildHistorialQueryString()}`, {
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

function imprimirHistorial() {
  if (!reporte.value?.filas.length) {
    toast.add({
      severity: 'warn',
      summary: 'Imprimir',
      detail: 'Consulte primero un periodo con registros.',
      life: 3500,
    })
    return
  }
  const cleanup = () => {
    document.body.classList.remove('printing-historial-pagos')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  document.body.classList.add('printing-historial-pagos')
  window.print()
}

onMounted(async () => {
  if (auth.isAuthenticated && !auth.profile) {
    await auth.fetchProfile()
  }
  await cargarCarteras()
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
          <label class="filtro-label" for="hist-cartera">Cartera</label>
          <Select
            id="hist-cartera"
            v-model="carteraFiltro"
            :options="carteraOpciones"
            option-label="label"
            option-value="value"
            class="filtro-select"
            placeholder="Seleccione cartera"
          />
        </div>

        <div class="filtro-acciones">
          <Button
            label="Consultar"
            icon="pi pi-search"
            type="button"
            :loading="loading"
            :disabled="loading || carteraFiltro == null || !carteras.length"
            @click="consultarHistorial"
          />
          <Button
            label="Imprimir"
            icon="pi pi-print"
            type="button"
            severity="success"
            outlined
            :disabled="!reporte?.filas.length || loading"
            @click="imprimirHistorial"
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
        <p class="historial-cartera">CARTERA: {{ tituloCartera }}</p>
        <p class="historial-periodo">PERIODO: {{ periodoLegible }}</p>
        <p class="historial-tipo">HISTORIAL DE PAGOS — PRÉSTAMOS</p>
      </header>

      <DataTable
        :value="reporte.filas"
        :loading="loading"
        data-key="id_pago"
        responsive-layout="scroll"
        class="historial-table no-print-table"
      >
        <Column header="Fecha">
          <template #body="{ data }">{{ formatDate(data.fecha_pago) }}</template>
        </Column>
        <Column field="nombre_cliente" header="Cliente" />
        <Column field="dni_cliente" header="DNI" />
        <Column field="numero_prestamo" header="Préstamo" />
        <Column field="cartera_nombre" header="Cartera" />
        <Column field="documento" header="Documento" />
        <Column header="Capital" style="text-align: right">
          <template #body="{ data }">{{ formatMoney(data.capital) }}</template>
        </Column>
        <Column header="Interés" style="text-align: right">
          <template #body="{ data }">{{ formatMoney(data.interes) }}</template>
        </Column>
        <Column header="Mora" style="text-align: right">
          <template #body="{ data }">{{ formatMoney(data.mora) }}</template>
        </Column>
        <Column header="Total" style="text-align: right">
          <template #body="{ data }">{{ formatMoney(data.total) }}</template>
        </Column>
      </DataTable>

      <table class="historial-print-table" aria-hidden="true">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>DNI</th>
            <th>Préstamo</th>
            <th>Cartera</th>
            <th>Doc.</th>
            <th>Capital</th>
            <th>Interés</th>
            <th>Mora</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="fila in reporte.filas" :key="fila.id_pago">
            <td>{{ formatDate(fila.fecha_pago) }}</td>
            <td>{{ fila.nombre_cliente }}</td>
            <td>{{ fila.dni_cliente }}</td>
            <td>{{ fila.numero_prestamo }}</td>
            <td>{{ fila.cartera_nombre }}</td>
            <td>{{ fila.documento || '—' }}</td>
            <td class="num">{{ formatMoney(fila.capital) }}</td>
            <td class="num">{{ formatMoney(fila.interes) }}</td>
            <td class="num">{{ formatMoney(fila.mora) }}</td>
            <td class="num">{{ formatMoney(fila.total) }}</td>
          </tr>
        </tbody>
      </table>

      <footer class="historial-totales">
        <span><strong>Registros:</strong> {{ reporte.resumen.registros }}</span>
        <span><strong>Capital:</strong> {{ formatMoney(reporte.resumen.total_capital) }}</span>
        <span><strong>Interés:</strong> {{ formatMoney(reporte.resumen.total_interes) }}</span>
        <span><strong>Mora:</strong> {{ formatMoney(reporte.resumen.total_mora) }}</span>
        <span class="historial-total-grande"
          ><strong>Total cobrado:</strong> {{ formatMoney(reporte.resumen.total_cobrado) }}</span
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

.historial-cartera,
.historial-periodo,
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
}

.historial-total-grande {
  font-size: 1rem;
}

.historial-print-table {
  display: none;
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;
}

.historial-print-table th,
.historial-print-table td {
  border: 1px solid #333;
  padding: 0.25rem 0.35rem;
  text-align: left;
}

.historial-print-table .num {
  text-align: right;
  white-space: nowrap;
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

@media print {
  .no-print {
    display: none !important;
  }

  .historial-sheet {
    border: none;
    border-radius: 0;
    padding: 0;
  }

  .no-print-table {
    display: none !important;
  }

  .historial-print-table {
    display: table !important;
  }

  body.printing-historial-pagos .sidebar,
  body.printing-historial-pagos .topbar {
    display: none !important;
  }

  body.printing-historial-pagos .layout-main {
    margin: 0 !important;
    padding: 0 !important;
  }
}
</style>
