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
import type { ReporteSarCarteraBloque, ReporteSarTrimestral } from '@/types/api'

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

const RANGOS_MORA = [
  { key: 'hasta_30' as const, label: '1 – 30 días' },
  { key: 'de_31_a_60' as const, label: '31 – 60 días' },
  { key: 'de_61_a_90' as const, label: '61 – 90 días' },
  { key: 'mas_de_90' as const, label: 'Más de 90 días' },
]

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

function formatPct(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  const n = Number(valor)
  if (!Number.isFinite(n)) return String(valor)
  return `${n.toFixed(2)}%`
}

function bloqueMora(key: typeof RANGOS_MORA[number]['key']): ReporteSarCarteraBloque {
  return reporte.value?.cartera_vencida?.por_rango_dias?.[key] ?? { prestamos: 0, saldo: '0' }
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
          Informe regulatorio: operaciones, cartera, ingresos e indicadores de morosidad.
        </p>
      </div>
      <div class="header-acciones">
        <Button
          label="Ver PDF"
          icon="pi pi-eye"
          severity="secondary"
          outlined
          :loading="pdfLoading"
          @click="verPdf"
        />
        <Button
          label="Descargar PDF"
          icon="pi pi-file-pdf"
          severity="danger"
          outlined
          :loading="pdfLoading"
          @click="descargarPdf"
        />
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

      <Card class="seccion-card">
        <template #title>Encabezado</template>
        <template #content>
          <dl class="datos-lista">
            <div><dt>Nombre de la entidad</dt><dd>{{ reporte.encabezado.nombre_entidad }}</dd></div>
            <div><dt>RTN</dt><dd>{{ reporte.encabezado.rtn || '—' }}</dd></div>
            <div><dt>Trimestre y año</dt><dd>T{{ reporte.encabezado.trimestre }} — {{ reporte.encabezado.anio }}</dd></div>
            <div><dt>Dirección</dt><dd>{{ reporte.encabezado.direccion || '—' }}</dd></div>
            <div><dt>Contacto</dt><dd>{{ reporte.encabezado.telefono || '—' }} · {{ reporte.encabezado.correo || '—' }}</dd></div>
          </dl>
        </template>
      </Card>

      <Card class="seccion-card">
        <template #title>Detalle de operaciones</template>
        <template #content>
          <dl class="datos-lista datos-lista--grid">
            <div><dt>Préstamos otorgados</dt><dd>{{ reporte.detalle_operaciones.total_prestamos_otorgados }}</dd></div>
            <div><dt>Monto total</dt><dd>{{ formatMonto(reporte.detalle_operaciones.monto_prestamos_otorgados) }}</dd></div>
            <div><dt>Tasa promedio</dt><dd>{{ formatPct(reporte.detalle_operaciones.tasa_interes_promedio) }}</dd></div>
            <div><dt>Tasa mín. / máx.</dt><dd>{{ formatPct(reporte.detalle_operaciones.tasa_interes_minima) }} / {{ formatPct(reporte.detalle_operaciones.tasa_interes_maxima) }}</dd></div>
            <div><dt>Plazo promedio</dt><dd>{{ reporte.detalle_operaciones.plazo_promedio }} cuotas</dd></div>
            <div><dt>Comisiones desembolsadas</dt><dd>{{ formatMonto(reporte.detalle_operaciones.comisiones_desembolsadas) }}</dd></div>
          </dl>
        </template>
      </Card>

      <div class="dos-columnas">
        <Card class="seccion-card">
          <template #title>Cartera vigente</template>
          <template #content>
            <p class="metrica-valor">{{ formatMonto(reporte.cartera_vigente.saldo) }}</p>
            <p class="metrica-detalle">{{ reporte.cartera_vigente.prestamos }} préstamo(s) activos</p>
          </template>
        </Card>

        <Card class="seccion-card">
          <template #title>Cartera vencida (total)</template>
          <template #content>
            <p class="metrica-valor metrica-valor--alerta">{{ formatMonto(reporte.cartera_vencida.saldo) }}</p>
            <p class="metrica-detalle">{{ reporte.cartera_vencida.prestamos }} préstamo(s) en mora</p>
          </template>
        </Card>
      </div>

      <Card class="seccion-card">
        <template #title>Cartera vencida por rango de días</template>
        <template #content>
          <div class="tabla-rangos">
            <div class="tabla-rangos__head">
              <span>Rango</span>
              <span>Préstamos</span>
              <span>Saldo</span>
            </div>
            <div
              v-for="rango in RANGOS_MORA"
              :key="rango.key"
              class="tabla-rangos__row"
            >
              <span>{{ rango.label }}</span>
              <span>{{ bloqueMora(rango.key).prestamos }}</span>
              <span>{{ formatMonto(bloqueMora(rango.key).saldo) }}</span>
            </div>
          </div>
        </template>
      </Card>

      <Card class="seccion-card">
        <template #title>Ingresos del trimestre</template>
        <template #content>
          <dl class="datos-lista datos-lista--grid">
            <div><dt>Intereses generados</dt><dd>{{ formatMonto(reporte.ingresos.intereses_generados) }}</dd></div>
            <div><dt>Comisiones cobradas</dt><dd>{{ formatMonto(reporte.ingresos.comisiones_cobradas) }}</dd></div>
            <div><dt>Pagos recibidos</dt><dd>{{ formatMonto(reporte.ingresos.pagos_recibidos) }}</dd></div>
            <div><dt>Abonos a capital</dt><dd>{{ formatMonto(reporte.ingresos.total_abonos_capital) }}</dd></div>
            <div><dt>Intereses pagados</dt><dd>{{ formatMonto(reporte.ingresos.total_intereses_pagados) }}</dd></div>
            <div><dt>Mora pagada</dt><dd>{{ formatMonto(reporte.ingresos.total_mora_pagada) }}</dd></div>
          </dl>
        </template>
      </Card>

      <Card class="seccion-card seccion-card--resumen">
        <template #title>Resumen</template>
        <template #content>
          <dl class="datos-lista datos-lista--grid">
            <div>
              <dt>Cartera total</dt>
              <dd>
                {{ reporte.resumen.cartera_total_prestamos }} préstamos —
                {{ formatMonto(reporte.resumen.cartera_total_saldo) }}
              </dd>
            </div>
            <div>
              <dt>Morosidad</dt>
              <dd class="metrica-valor--alerta">
                {{ formatPct(reporte.resumen.porcentaje_morosidad) }} del saldo en cartera vencida
              </dd>
            </div>
          </dl>
        </template>
      </Card>
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
  flex-wrap: wrap;
}

.header-acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
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

.seccion-card :deep(.p-card-title) {
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.seccion-card--resumen :deep(.p-card-body) {
  background: var(--p-surface-50, #f8fafc);
}

.dos-columnas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}

.datos-lista {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.datos-lista--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem 1.25rem;
}

.datos-lista div {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.datos-lista dt {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color, #64748b);
}

.datos-lista dd {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
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

.tabla-rangos {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tabla-rangos__head,
.tabla-rangos__row {
  display: grid;
  grid-template-columns: 1.2fr 0.6fr 1fr;
  gap: 0.75rem;
  padding: 0.5rem 0.65rem;
  font-size: 0.9rem;
}

.tabla-rangos__head {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color, #64748b);
  border-bottom: 1px solid var(--p-content-border-color, #e2e8f0);
}

.tabla-rangos__row:nth-child(even) {
  background: var(--p-surface-50, #f8fafc);
  border-radius: 6px;
}

.tabla-rangos__row span:last-child {
  font-weight: 600;
  text-align: right;
}

.tabla-rangos__row span:nth-child(2) {
  text-align: center;
}

.info-msg {
  margin: 0;
}
</style>
