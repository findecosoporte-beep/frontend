<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { formatMoney } from '@/utils/format'
import {
  abrirReporteSarPdfEnNuevaPestana,
  descargarReporteSarPdf,
  fetchReporteSarPdfBlob,
} from '@/utils/reporteSarPdf'
import type { ReporteSarTrimestral } from '@/types/api'

const toast = useToast()

const anioActual = new Date().getFullYear()
const trimestreActual = Math.floor(new Date().getMonth() / 3) + 1

const trimestre = ref(trimestreActual)
const anio = ref(anioActual)
const loading = ref(false)
const pdfLoading = ref(false)
const reporte = ref<ReporteSarTrimestral | null>(null)

const trimestreOptions = [
  { label: 'Trimestre 1 (ene–mar)', value: 1 },
  { label: 'Trimestre 2 (abr–jun)', value: 2 },
  { label: 'Trimestre 3 (jul–sep)', value: 3 },
  { label: 'Trimestre 4 (oct–dic)', value: 4 },
]

const anioOptions = Array.from({ length: 6 }, (_, i) => {
  const y = anioActual - i
  return { label: String(y), value: y }
})

const periodoLegible = computed(() => {
  if (!reporte.value) return ''
  const t = reporte.value.trimestre
  const rangos = ['enero–marzo', 'abril–junio', 'julio–septiembre', 'octubre–diciembre']
  return `${rangos[t - 1] ?? ''} ${reporte.value.anio}`
})

function formatMonto(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  const n = Number(valor)
  if (!Number.isFinite(n)) return String(valor)
  return formatMoney(n)
}

async function cargarReporte() {
  loading.value = true
  reporte.value = null
  try {
    const { data } = await api.get<ReporteSarTrimestral>(
      `/reportes/sar/?trimestre=${trimestre.value}&anio=${anio.value}`,
    )
    reporte.value = data
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Reporte SAR',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void cargarReporte()
})

async function descargarPdf() {
  pdfLoading.value = true
  try {
    const blob = await fetchReporteSarPdfBlob(trimestre.value, anio.value)
    descargarReporteSarPdf(blob, trimestre.value, anio.value)
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'PDF SAR',
      detail: getApiErrorMessage(e, 'No se pudo generar el PDF.'),
      life: 6000,
    })
  } finally {
    pdfLoading.value = false
  }
}

async function verPdf() {
  pdfLoading.value = true
  try {
    const blob = await fetchReporteSarPdfBlob(trimestre.value, anio.value)
    abrirReporteSarPdfEnNuevaPestana(blob)
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'PDF SAR',
      detail: getApiErrorMessage(e, 'No se pudo abrir el PDF.'),
      life: 6000,
    })
  } finally {
    pdfLoading.value = false
  }
}
</script>

<template>
  <div class="page reporte-sar-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Reporte SAR trimestral</h1>
        <p class="page-subtitle">
          Consolidado regulatorio: préstamos otorgados, cartera vigente/vencida e ingresos del periodo.
        </p>
      </div>
    </header>

    <Card class="filtros-card">
      <template #content>
        <div class="filtros-row">
          <div class="filtro-field">
            <label for="sar-trimestre">Trimestre</label>
            <Select
              id="sar-trimestre"
              v-model="trimestre"
              :options="trimestreOptions"
              option-label="label"
              option-value="value"
              class="filtro-select"
            />
          </div>
          <div class="filtro-field">
            <label for="sar-anio">Año</label>
            <Select
              id="sar-anio"
              v-model="anio"
              :options="anioOptions"
              option-label="label"
              option-value="value"
              class="filtro-select"
            />
          </div>
          <Button
            label="Generar reporte"
            icon="pi pi-chart-bar"
            :loading="loading"
            @click="cargarReporte"
          />
          <Button
            label="Ver PDF"
            icon="pi pi-eye"
            severity="secondary"
            outlined
            :disabled="!reporte"
            :loading="pdfLoading"
            @click="verPdf"
          />
          <Button
            label="Descargar PDF"
            icon="pi pi-file-pdf"
            severity="help"
            outlined
            :disabled="!reporte"
            :loading="pdfLoading"
            @click="descargarPdf"
          />
        </div>
      </template>
    </Card>

    <Message v-if="!reporte && !loading" severity="info" class="info-msg">
      Seleccione trimestre y año, luego pulse «Generar reporte».
    </Message>

    <template v-if="reporte">
      <p class="periodo-badge">
        Periodo: <strong>{{ periodoLegible }}</strong>
        ({{ reporte.fecha_inicio }} — {{ reporte.fecha_fin }})
      </p>

      <div class="metricas-grid">
        <Card class="metrica-card">
          <template #title>Préstamos otorgados</template>
          <template #content>
            <p class="metrica-valor">{{ reporte.total_prestamos_otorgados }}</p>
            <p class="metrica-detalle">
              Monto desembolsado: {{ formatMonto(reporte.monto_prestamos_otorgados) }}
            </p>
          </template>
        </Card>

        <Card class="metrica-card">
          <template #title>Cartera vigente</template>
          <template #content>
            <p class="metrica-valor">{{ formatMonto(reporte.cartera_vigente.saldo) }}</p>
            <p class="metrica-detalle">
              {{ reporte.cartera_vigente.prestamos }} préstamo(s) activos / pendientes
            </p>
          </template>
        </Card>

        <Card class="metrica-card">
          <template #title>Cartera vencida</template>
          <template #content>
            <p class="metrica-valor metrica-valor--alerta">
              {{ formatMonto(reporte.cartera_vencida.saldo) }}
            </p>
            <p class="metrica-detalle">
              {{ reporte.cartera_vencida.prestamos }} préstamo(s) en mora
            </p>
          </template>
        </Card>

        <Card class="metrica-card">
          <template #title>Ingresos por intereses</template>
          <template #content>
            <p class="metrica-valor">{{ formatMonto(reporte.ingresos_intereses) }}</p>
            <p class="metrica-detalle">Intereses cobrados en el trimestre</p>
          </template>
        </Card>

        <Card class="metrica-card">
          <template #title>Pagos recibidos</template>
          <template #content>
            <p class="metrica-valor">{{ formatMonto(reporte.pagos_recibidos) }}</p>
            <p class="metrica-detalle">Capital + interés + mora cobrados</p>
          </template>
        </Card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.reporte-sar-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.page-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.page-subtitle {
  margin: 0.35rem 0 0;
  color: var(--p-text-muted-color, #64748b);
  font-size: 0.95rem;
}

.filtros-card :deep(.p-card-body) {
  padding: 1rem 1.25rem;
}

.filtros-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
}

.filtro-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 200px;
}

.filtro-field label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color, #64748b);
}

.filtro-select {
  min-width: 220px;
}

.periodo-badge {
  margin: 0;
  font-size: 0.95rem;
  color: var(--p-text-color);
}

.metricas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.metrica-card :deep(.p-card-title) {
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.metrica-valor {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.2;
}

.metrica-valor--alerta {
  color: var(--p-red-600, #dc2626);
}

.metrica-detalle {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color, #64748b);
}

.info-msg {
  margin: 0;
}
</style>
