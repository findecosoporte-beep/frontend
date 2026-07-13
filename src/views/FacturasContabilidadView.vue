<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import Button from 'primevue/button'
import Card from 'primevue/card'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { abrirFacturaPago } from '@/utils/facturaPago'
import { formatDate, formatMoney } from '@/utils/format'
import type { Cartera, FacturasContabilidadFila, FacturasContabilidadResponse } from '@/types/api'

const toast = useToast()
const { canManageConfiguracion } = usePermissions()

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

const modo = ref<'dia' | 'mes' | 'anio'>('mes')
const fechaDia = ref(hoyIso())
const mes = ref(new Date().getMonth() + 1)
const anio = ref(new Date().getFullYear())
const carteraFiltro = ref<number | null>(null)
const incluirAnuladas = ref(false)
const carteras = ref<Cartera[]>([])

const loading = ref(false)
const error = ref('')
const reporte = ref<FacturasContabilidadResponse | null>(null)
const busqueda = ref('')
const facturaAbriendoId = ref<number | null>(null)

const carteraOpciones = computed(() => [
  { label: 'Todas', value: null as number | null },
  ...carteras.value
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => ({ label: c.nombre, value: c.id_cartera as number | null })),
])

const tituloCartera = computed(() => {
  if (carteraFiltro.value == null) return 'Todas las carteras'
  return carteras.value.find((c) => c.id_cartera === carteraFiltro.value)?.nombre ?? 'Cartera'
})

const anioOpciones = computed(() => {
  const actual = new Date().getFullYear()
  return Array.from({ length: 8 }, (_, i) => ({
    label: String(actual - i),
    value: actual - i,
  }))
})

const periodoLegible = computed(() => {
  if (!reporte.value) return '—'
  const { modo: m, fecha_inicio, fecha_fin } = reporte.value
  if (m === 'dia') return formatDate(fecha_inicio)
  if (m === 'mes') {
    const d = new Date(fecha_inicio + 'T12:00:00')
    const nombreMes = MESES.find((x) => x.value === d.getMonth() + 1)?.label ?? ''
    return `${nombreMes} ${d.getFullYear()}`
  }
  void fecha_fin
  return String(new Date(fecha_inicio + 'T12:00:00').getFullYear())
})

const filasFiltradas = computed(() => {
  const filas = reporte.value?.filas ?? []
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return filas
  return filas.filter((fila) =>
    [
      fila.numero_factura,
      fila.nombre_cliente,
      fila.dni_cliente,
      fila.rtn_cliente,
      fila.numero_prestamo,
      fila.cartera_nombre,
      fila.estado,
      String(fila.id_pago),
    ].some((c) => (c ?? '').toString().toLowerCase().includes(q)),
  )
})

function buildQueryString(): string {
  const params = new URLSearchParams({ modo: modo.value })
  if (modo.value === 'dia') params.set('fecha', fechaDia.value)
  if (modo.value === 'mes') {
    params.set('mes', String(mes.value))
    params.set('anio', String(anio.value))
  }
  if (modo.value === 'anio') params.set('anio', String(anio.value))
  if (carteraFiltro.value != null) params.set('id_cartera', String(carteraFiltro.value))
  if (incluirAnuladas.value) params.set('incluir_anuladas', 'true')
  return params.toString()
}

async function cargarCarteras() {
  try {
    const { data } = await api.get<{ results?: Cartera[] } | Cartera[]>('/carteras/')
    carteras.value = Array.isArray(data) ? data : (data.results ?? [])
  } catch {
    carteras.value = []
  }
}

async function consultar() {
  if (!canManageConfiguracion.value) return
  loading.value = true
  error.value = ''
  reporte.value = null
  try {
    const { data } = await api.get<FacturasContabilidadResponse>(
      `/reportes/facturas-contabilidad/?${buildQueryString()}`,
    )
    reporte.value = data
    if (!data.filas.length) {
      toast.add({
        severity: 'info',
        summary: 'Sin facturas',
        detail: 'No hay facturas SAR en el periodo seleccionado.',
        life: 4000,
      })
    }
  } catch (e) {
    error.value = getApiErrorMessage(e, 'No se pudo cargar el listado de facturas.')
  } finally {
    loading.value = false
  }
}

async function verFactura(fila: FacturasContabilidadFila) {
  facturaAbriendoId.value = fila.id_pago
  try {
    await abrirFacturaPago(fila.id_pago)
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

onMounted(async () => {
  await cargarCarteras()
})
</script>

<template>
  <div class="page facturas-contabilidad-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Facturas contabilidad</h1>
        <p class="page-subtitle">
          Facturas SAR emitidas por cobros, con totales por periodo para revisión contable.
        </p>
      </div>
    </header>

    <Message v-if="!canManageConfiguracion" severity="warn" class="permiso-aviso">
      Solo administrador o supervisor pueden consultar este modulo.
    </Message>

    <Card v-else class="filtros-card">
      <template #content>
        <div class="filtros-grid">
          <div class="filtro-field">
            <label for="fc-cartera">Cartera</label>
            <Select
              id="fc-cartera"
              v-model="carteraFiltro"
              :options="carteraOpciones"
              option-label="label"
              option-value="value"
              placeholder="Todas"
              show-clear
              fluid
            />
          </div>

          <div class="filtro-field">
            <label for="fc-modo">Periodo</label>
            <Select
              id="fc-modo"
              v-model="modo"
              :options="modoOpciones"
              option-label="label"
              option-value="value"
            />
          </div>

          <div v-if="modo === 'dia'" class="filtro-field">
            <label for="fc-fecha">Dia</label>
            <InputText id="fc-fecha" v-model="fechaDia" type="date" />
          </div>

          <template v-if="modo === 'mes'">
            <div class="filtro-field">
              <label for="fc-mes">Mes</label>
              <Select id="fc-mes" v-model="mes" :options="MESES" option-label="label" option-value="value" />
            </div>
            <div class="filtro-field">
              <label for="fc-anio-mes">Ano</label>
              <Select
                id="fc-anio-mes"
                v-model="anio"
                :options="anioOpciones"
                option-label="label"
                option-value="value"
              />
            </div>
          </template>

          <div v-if="modo === 'anio'" class="filtro-field">
            <label for="fc-anio">Ano</label>
            <Select
              id="fc-anio"
              v-model="anio"
              :options="anioOpciones"
              option-label="label"
              option-value="value"
            />
          </div>

          <div class="filtro-field filtro-check">
            <Checkbox v-model="incluirAnuladas" input-id="fc-anuladas" binary />
            <label for="fc-anuladas">Incluir anuladas</label>
          </div>

          <div class="filtro-acciones">
            <Button label="Consultar" icon="pi pi-search" :loading="loading" @click="consultar" />
          </div>
        </div>
      </template>
    </Card>

    <Message v-if="error" severity="error">{{ error }}</Message>

    <template v-if="reporte">
      <Card class="resumen-card">
        <template #content>
          <div class="resumen-grid">
            <div>
              <span class="resumen-label">Cartera</span>
              <strong>{{ reporte.cartera_etiqueta || tituloCartera }}</strong>
            </div>
            <div>
              <span class="resumen-label">Periodo</span>
              <strong>{{ periodoLegible }}</strong>
            </div>
            <div>
              <span class="resumen-label">Facturas</span>
              <strong>{{ reporte.resumen.registros }}</strong>
            </div>
            <div>
              <span class="resumen-label">Capital</span>
              <strong>{{ formatMoney(reporte.resumen.total_capital) }}</strong>
            </div>
            <div>
              <span class="resumen-label">Interes</span>
              <strong>{{ formatMoney(reporte.resumen.total_interes) }}</strong>
            </div>
            <div>
              <span class="resumen-label">Total cobrado</span>
              <strong>{{ formatMoney(reporte.resumen.total_cobrado) }}</strong>
            </div>
          </div>
        </template>
      </Card>

      <Card>
        <template #content>
          <div class="tabla-toolbar">
            <InputText v-model="busqueda" placeholder="Buscar factura, cliente, prestamo..." class="busqueda-input" />
          </div>
          <DataTable
            :value="filasFiltradas"
            :loading="loading"
            paginator
            :rows="15"
            data-key="id_pago"
            responsive-layout="scroll"
            size="small"
          >
            <Column field="numero_factura" header="No. factura" style="min-width: 11rem" />
            <Column header="Fecha">
              <template #body="{ data }: { data: FacturasContabilidadFila }">
                {{ formatDate(data.fecha_pago) }}
              </template>
            </Column>
            <Column field="hora_pago" header="Hora" style="width: 6rem" />
            <Column field="nombre_cliente" header="Cliente" style="min-width: 12rem" />
            <Column field="dni_cliente" header="Identidad" style="min-width: 9rem" />
            <Column field="rtn_cliente" header="RTN" style="min-width: 9rem">
              <template #body="{ data }: { data: FacturasContabilidadFila }">
                {{ data.rtn_cliente || '—' }}
              </template>
            </Column>
            <Column field="numero_prestamo" header="Prestamo" style="min-width: 8rem" />
            <Column header="Total">
              <template #body="{ data }: { data: FacturasContabilidadFila }">
                {{ formatMoney(data.total) }}
              </template>
            </Column>
            <Column header="Estado" style="width: 7rem">
              <template #body="{ data }: { data: FacturasContabilidadFila }">
                <Tag
                  :value="data.estado"
                  :severity="data.anulado ? 'danger' : 'success'"
                />
              </template>
            </Column>
            <Column header="Factura" style="width: 7rem">
              <template #body="{ data }: { data: FacturasContabilidadFila }">
                <Button
                  icon="pi pi-file-pdf"
                  label="Ver"
                  size="small"
                  severity="secondary"
                  outlined
                  :loading="facturaAbriendoId === data.id_pago"
                  :disabled="facturaAbriendoId != null && facturaAbriendoId !== data.id_pago"
                  @click="verFactura(data)"
                />
              </template>
            </Column>
          </DataTable>
        </template>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.facturas-contabilidad-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.page-header {
  margin-bottom: 0.25rem;
}

.page-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.page-subtitle {
  margin: 0.35rem 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.95rem;
}

.permiso-aviso {
  margin: 0;
}

.filtros-grid {
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

.filtro-field label {
  font-size: 0.85rem;
  font-weight: 600;
}

.filtro-check {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  min-width: auto;
  padding-bottom: 0.4rem;
}

.filtro-acciones {
  display: flex;
  align-items: flex-end;
}

.resumen-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 1rem;
}

.resumen-label {
  display: block;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  margin-bottom: 0.2rem;
}

.tabla-toolbar {
  margin-bottom: 0.75rem;
}

.busqueda-input {
  width: min(100%, 24rem);
}
</style>
