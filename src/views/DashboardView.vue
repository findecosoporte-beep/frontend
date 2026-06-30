<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import Button from 'primevue/button'
import Card from 'primevue/card'
import Chart from 'primevue/chart'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import type { HistorialPrestamo, Paginated } from '@/types/api'
import { formatMoney } from '@/utils/format'

interface DashboardStats {
  clientes: number
  prestamos: number
  pagos: number
  historial: number
  usuarios: number
}

const loading = ref(true)
const error = ref('')
const stats = ref<DashboardStats>({
  clientes: 0,
  prestamos: 0,
  pagos: 0,
  historial: 0,
  usuarios: 0,
})
const historialRows = ref<HistorialPrestamo[]>([])
const historialSearch = ref('')
let controller: AbortController | null = null

const totalGeneral = computed(
  () =>
    stats.value.clientes +
    stats.value.prestamos +
    stats.value.pagos +
    stats.value.historial +
    stats.value.usuarios,
)
const historialFiltered = computed(() => {
  const term = historialSearch.value.trim().toLowerCase()
  if (!term) return historialRows.value

  return historialRows.value.filter((item) => {
    const numero = item.numero_prestamo?.toLowerCase() ?? ''
    const cliente = String(item.id_cliente)
    const producto = item.producto?.toLowerCase() ?? ''
    return numero.includes(term) || cliente.includes(term) || producto.includes(term)
  })
})

const salesBarsData = computed(() => ({
  labels: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
  datasets: [
    {
      label: 'Rendimiento',
      borderRadius: 6,
      backgroundColor: '#3b82f6',
      data: [42, 67, 31, 59, 23, 62, 71, 48, 27, 64, 39, 53],
    },
  ],
}))

const inventoryData = computed(() => ({
  labels: ['500', '400', '300', '200', '100'],
  datasets: [
    {
      label: 'Estado del stock',
      data: [180, 190, 130, 170, 120],
      backgroundColor: '#3b82f6',
      borderRadius: 5,
    },
    {
      label: 'Rotación',
      data: [160, 170, 150, 140, 180],
      backgroundColor: '#f97316',
      borderRadius: 5,
    },
    {
      label: 'Productos pedidos',
      data: [120, 90, 180, 100, 60],
      backgroundColor: '#eab308',
      borderRadius: 5,
    },
  ],
}))

const campaignHeatmapData = computed(() => {
  const labels = ['Jun 30', 'Jul 07', 'Jul 14', 'Jul 21', 'Jul 28', 'Ago 04', 'Ago 11', 'Ago 18']
  const tiers = [220, 380, 610, 870, 1090, 1320, 760, 940]

  return {
    labels,
    datasets: [
      {
        label: 'Intensidad',
        data: tiers,
        borderRadius: 4,
        backgroundColor: labels.map((_, index) => {
          const value = tiers[index] ?? 0
          if (value > 1000) return '#2563eb'
          if (value > 800) return '#3b82f6'
          if (value > 500) return '#60a5fa'
          return '#bfdbfe'
        }),
      },
    ],
  }
})

const emailTrendData = computed(() => ({
  labels: ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023'],
  datasets: [
    {
      label: 'Tasa de clics',
      data: [120, 320, 510, 430, 410, 300, 290, 110],
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.18)',
      tension: 0.45,
      fill: true,
      pointRadius: 0,
    },
    {
      label: 'Tasa de apertura',
      data: [40, 260, 350, 500, 420, 350, 390, 120],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.12)',
      tension: 0.45,
      fill: true,
      pointRadius: 0,
    },
  ],
}))

const verticalBarsOptions = {
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: { grid: { display: false } },
    y: { grid: { color: 'rgba(148, 163, 184, 0.22)' }, beginAtZero: true },
  },
}

const stackedHorizontalOptions = {
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: {
    legend: { position: 'top' as const, align: 'start' as const },
  },
  scales: {
    x: {
      stacked: true,
      grid: { color: 'rgba(148, 163, 184, 0.22)' },
      beginAtZero: true,
    },
    y: {
      stacked: true,
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

async function load() {
  controller?.abort()
  const activeController = new AbortController()
  controller = activeController

  loading.value = true
  error.value = ''

  try {
    const results = await Promise.allSettled([
      api.get<Paginated<unknown>>('/clientes/?page=1&page_size=1', { signal: activeController.signal }),
      api.get<Paginated<unknown>>('/prestamos/?page=1&page_size=1', { signal: activeController.signal }),
      api.get<Paginated<unknown>>('/pagos/?page=1&page_size=1', { signal: activeController.signal }),
      api.get<Paginated<HistorialPrestamo>>('/historial-prestamos/?page=1&page_size=7', {
        signal: activeController.signal,
      }),
      api.get<Paginated<unknown>>('/usuarios/?page=1&page_size=1', { signal: activeController.signal }),
    ])

    if (controller !== activeController) return

    const nextStats: DashboardStats = { ...stats.value }
    const statKeys: Array<keyof DashboardStats> = [
      'clientes',
      'prestamos',
      'pagos',
      'historial',
      'usuarios',
    ]

    let failedRequests = 0
    results.forEach((result, index) => {
      const statKey = statKeys[index]
      if (!statKey) return

      if (result.status === 'fulfilled') {
        nextStats[statKey] = result.value.data.count
        if (statKey === 'historial') {
          historialRows.value = (result.value.data as Paginated<HistorialPrestamo>).results
        }
        return
      }
      failedRequests++
    })

    stats.value = nextStats

    if (failedRequests > 0) {
      error.value =
        failedRequests === statKeys.length
          ? 'No se pudieron cargar los totales.'
          : 'Algunos totales no se pudieron cargar.'
    }
  } catch (e) {
    if (controller !== activeController) return
    error.value = getApiErrorMessage(e, 'No se pudieron cargar los totales.')
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
    <p class="subtitle">Panel de control.</p>

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
            <div class="chart-wrap">
              <Chart type="bar" :data="salesBarsData" :options="verticalBarsOptions" />
            </div>
          </template>
        </Card>

        <Card class="chart-card">
          <template #title>Gestión por categorías</template>
          <template #content>
            <div class="chart-metrics">
              <div class="metric-item">
                <span class="metric-label">Historial</span>
                <span class="metric-value">{{ stats.historial }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Usuarios</span>
                <span class="metric-value">{{ stats.usuarios }}</span>
              </div>
            </div>
            <div class="chart-wrap">
              <Chart type="bar" :data="inventoryData" :options="stackedHorizontalOptions" />
            </div>
          </template>
        </Card>

        <Card class="chart-card">
          <template #title>Intensidad de actividad semanal</template>
          <template #content>
            <div class="chart-wrap chart-wrap-sm">
              <Chart type="bar" :data="campaignHeatmapData" :options="heatmapOptions" />
            </div>
          </template>
        </Card>

        <Card class="chart-card">
          <template #title>Tendencia de interacciones</template>
          <template #content>
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
            <p class="table-subtitle">Últimos registros cargados desde la API.</p>
            <div class="table-actions">
              <InputText v-model="historialSearch" placeholder="Buscar..." class="table-search" />
              <Button label="Filtrar" icon="pi pi-filter" severity="info" outlined />
              <Button label="Exportar" icon="pi pi-download" severity="secondary" />
            </div>
          </div>

          <DataTable
            :value="historialFiltered"
            paginator
            :rows="7"
            :rows-per-page-options="[7, 10, 20]"
            responsive-layout="scroll"
            size="small"
            data-key="id_historial"
            class="history-table"
          >
            <Column field="numero_prestamo" header="Identificación" />
            <Column field="id_cliente" header="Cliente" />
            <Column field="producto" header="Producto">
              <template #body="{ data }">{{ data.producto || '-' }}</template>
            </Column>
            <Column header="Monto">
              <template #body="{ data }">{{ formatMoney(data.monto) }}</template>
            </Column>
            <Column header="Interés">
              <template #body="{ data }">{{ formatMoney(data.interes) }}</template>
            </Column>
            <Column header="Saldo">
              <template #body="{ data }">{{ formatMoney(data.saldo ?? 0) }}</template>
            </Column>
          </DataTable>
        </template>
      </Card>

      <div class="actions">
        <button class="retry-btn" type="button" @click="load">Actualizar panel</button>
      </div>
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

.subtitle code {
  font-size: 0.85em;
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
  margin-bottom: 0.5rem;
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

.actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 980px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}

</style>
