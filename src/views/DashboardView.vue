<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import Card from 'primevue/card'
import Chart from 'primevue/chart'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import type { DashboardPrestamoFila, DashboardResumen, DashboardTotales } from '@/types/api'
import { formatMoney } from '@/utils/format'

const ESTADO_LABELS: Record<string, string> = {
  activo: 'Activo',
  pendiente_aprobacion: 'Pendiente',
  pagado: 'Pagado',
  mora: 'Mora',
  cancelado: 'Cancelado',
}

const loading = ref(true)
const error = ref('')
const stats = ref<DashboardTotales>({
  clientes: 0,
  prestamos: 0,
  pagos: 0,
  historial: 0,
  usuarios: 0,
})
const prestamoRows = ref<DashboardPrestamoFila[]>([])
const historialSearch = ref('')
let controller: AbortController | null = null

const registrosMensuales = ref({
  labels: [] as string[],
  prestamos: [] as number[],
  pagos: [] as number[],
})
const prestamosPorEstado = ref({ labels: [] as string[], valores: [] as number[] })
const actividadSemanal = ref({ labels: [] as string[], cobros: [] as number[] })
const tendenciaMensual = ref({
  labels: [] as string[],
  monto_cobrado: [] as number[],
  monto_desembolsado: [] as number[],
})

const totalGeneral = computed(
  () =>
    stats.value.clientes +
    stats.value.prestamos +
    stats.value.pagos +
    stats.value.historial +
    stats.value.usuarios,
)

const prestamosFiltered = computed(() => {
  const term = historialSearch.value.trim().toLowerCase()
  if (!term) return prestamoRows.value

  return prestamoRows.value.filter((item) => {
    const numero = item.numero_prestamo?.toLowerCase() ?? ''
    const cliente = (item.cliente_nombre ?? String(item.id_cliente)).toLowerCase()
    const producto = item.producto?.toLowerCase() ?? ''
    const estado = (item.estado ?? '').toLowerCase()
    return (
      numero.includes(term) ||
      cliente.includes(term) ||
      producto.includes(term) ||
      estado.includes(term)
    )
  })
})

const salesBarsData = computed(() => ({
  labels: registrosMensuales.value.labels,
  datasets: [
    {
      label: 'Préstamos',
      borderRadius: 6,
      backgroundColor: '#3b82f6',
      data: registrosMensuales.value.prestamos,
    },
    {
      label: 'Cobros',
      borderRadius: 6,
      backgroundColor: '#22c55e',
      data: registrosMensuales.value.pagos,
    },
  ],
}))

const inventoryData = computed(() => ({
  labels: prestamosPorEstado.value.labels,
  datasets: [
    {
      label: 'Préstamos',
      data: prestamosPorEstado.value.valores,
      backgroundColor: '#3b82f6',
      borderRadius: 5,
    },
  ],
}))

const campaignHeatmapData = computed(() => ({
  labels: actividadSemanal.value.labels,
  datasets: [
    {
      label: 'Cobros',
      data: actividadSemanal.value.cobros,
      borderRadius: 4,
      backgroundColor: actividadSemanal.value.cobros.map((value) => {
        if (value > 10) return '#2563eb'
        if (value > 5) return '#3b82f6'
        if (value > 0) return '#60a5fa'
        return '#bfdbfe'
      }),
    },
  ],
}))

const emailTrendData = computed(() => ({
  labels: tendenciaMensual.value.labels,
  datasets: [
    {
      label: 'Monto cobrado',
      data: tendenciaMensual.value.monto_cobrado,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.18)',
      tension: 0.45,
      fill: true,
      pointRadius: 2,
    },
    {
      label: 'Monto desembolsado',
      data: tendenciaMensual.value.monto_desembolsado,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.12)',
      tension: 0.45,
      fill: true,
      pointRadius: 2,
    },
  ],
}))

const verticalBarsOptions = {
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const, align: 'end' as const },
  },
  scales: {
    x: { grid: { display: false } },
    y: {
      grid: { color: 'rgba(148, 163, 184, 0.22)' },
      beginAtZero: true,
      ticks: { precision: 0 },
    },
  },
}

const stackedHorizontalOptions = {
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: {
      grid: { color: 'rgba(148, 163, 184, 0.22)' },
      beginAtZero: true,
      ticks: { precision: 0 },
    },
    y: {
      grid: { display: false },
    },
  },
}

const heatmapOptions = {
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: { grid: { display: false } },
    y: {
      display: false,
      grid: { display: false },
    },
  },
}

const lineOptions = {
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const, align: 'end' as const },
  },
  scales: {
    x: {
      grid: { color: 'rgba(148, 163, 184, 0.2)' },
    },
    y: {
      grid: { color: 'rgba(148, 163, 184, 0.2)' },
      beginAtZero: true,
    },
  },
}

function etiquetaEstado(estado: string | undefined): string {
  if (!estado) return '—'
  return ESTADO_LABELS[estado] ?? estado
}

async function load() {
  controller?.abort()
  const activeController = new AbortController()
  controller = activeController

  loading.value = true
  error.value = ''

  try {
    const { data } = await api.get<DashboardResumen>('/dashboard/', {
      signal: activeController.signal,
    })

    if (controller !== activeController) return

    stats.value = data.totales
    registrosMensuales.value = data.registros_mensuales
    prestamosPorEstado.value = data.prestamos_por_estado
    actividadSemanal.value = data.actividad_semanal
    tendenciaMensual.value = data.tendencia_mensual

    const filas =
      data.historial_prestamos.length > 0 ? data.historial_prestamos : data.ultimos_prestamos
    prestamoRows.value = filas
  } catch (e) {
    if (controller !== activeController) return
    error.value = getApiErrorMessage(e, 'No se pudo cargar el panel.')
  } finally {
    if (controller === activeController) {
      loading.value = false
    }
  }
}

onMounted(() => void load())
onBeforeUnmount(() => {
  controller?.abort()
})
</script>

<template>
  <div class="dash" :aria-busy="loading">
    <h1 class="title">Resumen</h1>
    <p class="subtitle">Panel de control con datos en tiempo real del sistema FINDECO.</p>

    <div v-if="loading" class="loading">
      <ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="4" />
    </div>
    <div v-else-if="error && totalGeneral === 0" class="status-area">
      <Message severity="error" :closable="false">{{ error }}</Message>
      <button class="retry-btn" type="button" @click="load">Reintentar</button>
    </div>
    <div v-else class="dashboard-body">
      <Message v-if="error" severity="warn" :closable="false" class="partial-warning">{{ error }}</Message>

      <div class="chart-grid">
        <Card class="chart-card">
          <template #title>Rendimiento de registros</template>
          <template #content>
            <div class="chart-metrics">
              <div class="metric-item">
                <span class="metric-label">Clientes</span>
                <span class="metric-value">{{ stats.clientes }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Préstamos</span>
                <span class="metric-value">{{ stats.prestamos }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Cobros</span>
                <span class="metric-value">{{ stats.pagos }}</span>
              </div>
            </div>
            <p class="chart-hint">Préstamos desembolsados y cobros registrados por mes (año actual).</p>
            <div class="chart-wrap">
              <Chart type="bar" :data="salesBarsData" :options="verticalBarsOptions" />
            </div>
          </template>
        </Card>

        <Card class="chart-card">
          <template #title>Gestión por categorías</template>
          <template #content>
            <div class="chart-metrics chart-metrics--two">
              <div class="metric-item">
                <span class="metric-label">Historial</span>
                <span class="metric-value">{{ stats.historial }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Usuarios</span>
                <span class="metric-value">{{ stats.usuarios }}</span>
              </div>
            </div>
            <p class="chart-hint">Préstamos agrupados por estado operativo.</p>
            <div class="chart-wrap">
              <Chart type="bar" :data="inventoryData" :options="stackedHorizontalOptions" />
            </div>
          </template>
        </Card>

        <Card class="chart-card">
          <template #title>Intensidad de actividad semanal</template>
          <template #content>
            <p class="chart-hint">Cantidad de cobros registrados por día de la semana.</p>
            <div class="chart-wrap chart-wrap-sm">
              <Chart type="bar" :data="campaignHeatmapData" :options="heatmapOptions" />
            </div>
          </template>
        </Card>

        <Card class="chart-card">
          <template #title>Tendencia de interacciones</template>
          <template #content>
            <p class="chart-hint">Montos cobrados vs desembolsados en los últimos 8 meses.</p>
            <div class="chart-wrap chart-wrap-sm">
              <Chart type="line" :data="emailTrendData" :options="lineOptions" />
            </div>
          </template>
        </Card>
      </div>

      <Card class="table-card">
        <template #title>Historial de préstamos</template>
        <template #content>
          <div class="table-head">
            <p class="table-subtitle">
              {{
                stats.historial > 0
                  ? 'Registros del historial operativo.'
                  : 'Préstamos registrados en el sistema (tabla historial vacía).'
              }}
            </p>
            <div class="table-actions">
              <InputText v-model="historialSearch" placeholder="Buscar..." class="table-search" />
            </div>
          </div>

          <DataTable
            :value="prestamosFiltered"
            paginator
            :rows="10"
            :rows-per-page-options="[10, 20, 50]"
            responsive-layout="scroll"
            size="small"
            :data-key="stats.historial > 0 ? 'id_historial' : 'id_prestamo'"
            class="history-table"
            empty-message="No hay préstamos para mostrar."
          >
            <Column field="numero_prestamo" header="N.º préstamo" />
            <Column header="Cliente">
              <template #body="{ data }: { data: DashboardPrestamoFila }">
                {{ data.cliente_nombre?.trim() || `#${data.id_cliente}` }}
              </template>
            </Column>
            <Column header="Producto">
              <template #body="{ data }: { data: DashboardPrestamoFila }">
                {{ data.producto?.trim() || '—' }}
              </template>
            </Column>
            <Column v-if="stats.historial === 0" header="Estado">
              <template #body="{ data }: { data: DashboardPrestamoFila }">
                {{ etiquetaEstado(data.estado) }}
              </template>
            </Column>
            <Column header="Monto">
              <template #body="{ data }: { data: DashboardPrestamoFila }">
                {{ formatMoney(data.monto) }}
              </template>
            </Column>
            <Column header="Interés">
              <template #body="{ data }: { data: DashboardPrestamoFila }">
                {{ formatMoney(data.interes) }}
              </template>
            </Column>
            <Column header="Saldo">
              <template #body="{ data }: { data: DashboardPrestamoFila }">
                {{ formatMoney(data.saldo ?? 0) }}
              </template>
            </Column>
          </DataTable>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.dash {
  width: 100%;
  max-width: none;
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.35rem;
  font-weight: 600;
}

.subtitle {
  margin: 0 0 1.25rem;
  opacity: 0.85;
  font-size: 0.9rem;
}

.loading {
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.status-area {
  display: grid;
  gap: 0.75rem;
  justify-items: start;
}

.dashboard-body {
  display: grid;
  gap: 1rem;
}

.partial-warning {
  margin: 0;
}

.chart-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
}

.chart-card {
  border-radius: 14px;
}

.chart-card :deep(.p-card-body) {
  padding: 1rem;
}

.chart-card :deep(.p-card-title) {
  margin: 0 0 0.7rem;
  font-size: 0.95rem;
}

.chart-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

.chart-metrics--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.metric-label {
  font-size: 0.78rem;
  opacity: 0.78;
}

.metric-value {
  font-size: 1.2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.chart-hint {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  color: #64748b;
}

.chart-wrap {
  height: 14rem;
}

.chart-wrap-sm {
  height: 13rem;
}

.table-card :deep(.p-card-title) {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}

.table-card {
  width: 100%;
}

.table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.7rem;
  flex-wrap: wrap;
}

.table-subtitle {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.78;
}

.table-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.table-search {
  min-width: 12rem;
}

.history-table :deep(th) {
  font-size: 0.78rem;
}

.history-table :deep(td) {
  font-size: 0.82rem;
}

.retry-btn {
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  background: #fff;
  color: inherit;
  padding: 0.45rem 0.75rem;
  font: inherit;
  cursor: pointer;
}

.retry-btn:hover {
  background: #f3f4f6;
}

@media (max-width: 980px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}
</style>
