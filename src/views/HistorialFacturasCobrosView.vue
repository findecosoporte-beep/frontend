<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import Button from 'primevue/button'
import Card from 'primevue/card'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'
import { abrirFacturaPago, esPagoFacturaSecundario } from '@/utils/facturaPago'
import { formatDate, formatMoney } from '@/utils/format'
import type { Cartera, Cliente, Pago, Paginated, Prestamo } from '@/types/api'

interface FilaHistorialFactura {
  id_pago: number
  id_pago_factura: number
  fecha_pago: string
  documento: string | null
  numero_prestamo: string
  nombre_cliente: string
  dni_cliente: string
  capital: string | number
  interes: string | number
  total: number
  numero_factura: string | null
  anulado: boolean
  es_secundario: boolean
}

const toast = useToast()
const auth = useAuthStore()

const carteras = ref<Cartera[]>([])
const carteraFiltro = ref<number | null>(null)
const criterioBusqueda = ref('')
const loading = ref(false)
const error = ref('')
const consultaHecha = ref(false)
const filas = ref<FilaHistorialFactura[]>([])
const clienteResumen = ref<{ nombre: string; dni: string; prestamos: string } | null>(null)
const facturaAbriendoId = ref<number | null>(null)

const esCobrador = computed(() => auth.profile?.rol === 'cobrador')

const carteraOpciones = computed(() =>
  carteras.value
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => ({ label: c.nombre, value: c.id_cartera })),
)

const tituloCartera = computed(() => {
  if (carteraFiltro.value == null) return '—'
  return carteras.value.find((c) => c.id_cartera === carteraFiltro.value)?.nombre ?? 'Cartera'
})

const puedeBuscar = computed(
  () => carteraFiltro.value != null && criterioBusqueda.value.trim().length > 0 && !loading.value,
)

async function fetchAllPages<T>(initialPath: string): Promise<T[]> {
  const items: T[] = []
  let nextUrl: string | null = initialPath
  while (nextUrl) {
    const response = await api.get<Paginated<T>>(nextUrl)
    items.push(...response.data.results)
    nextUrl = response.data.next
  }
  return items
}

function normalizarCriterio(raw: string): string {
  return raw.trim().replace(/\s+/g, '')
}

function totalPago(pago: Pago): number {
  const capital = Number(pago.capital) || 0
  const interes = Number(pago.interes) || 0
  const mora = Number(pago.mora) || 0
  return capital + interes + mora
}

async function cargarCarteras() {
  try {
    if (esCobrador.value && auth.profile?.carteras?.length) {
      carteras.value = auth.profile.carteras.map((c) => ({
        id_cartera: c.id_cartera,
        nombre: c.nombre,
        dia_cobro: c.dia_cobro,
      })) as Cartera[]
    } else {
      carteras.value = await fetchAllPages<Cartera>('/carteras/?page_size=100&ordering=nombre')
    }
  } catch {
    carteras.value = []
  }
}

async function buscarPrestamosPorCriterio(idCartera: number, criterio: string): Promise<Prestamo[]> {
  const porNumero = await fetchAllPages<Prestamo>(
    `/prestamos/?id_cartera=${idCartera}&numero_prestamo=${encodeURIComponent(criterio)}&page_size=100`,
  )

  const porMapa = new Map<number, Prestamo>()
  for (const p of porNumero) porMapa.set(p.id_prestamo, p)

  const dniExacto = criterio
  const dniSinGuiones = criterio.replace(/-/g, '')
  const dniQueries = Array.from(new Set([dniExacto, dniSinGuiones]))

  for (const dni of dniQueries) {
    if (!dni) continue
    const clientes = await fetchAllPages<Cliente>(
      `/clientes/?dni=${encodeURIComponent(dni)}&page_size=50`,
    )
    for (const cliente of clientes) {
      const prestamosCliente = await fetchAllPages<Prestamo>(
        `/prestamos/?id_cartera=${idCartera}&id_cliente=${cliente.id_cliente}&page_size=100`,
      )
      for (const p of prestamosCliente) porMapa.set(p.id_prestamo, p)
    }
  }

  if (porMapa.size === 0) {
    const porBusqueda = await fetchAllPages<Prestamo>(
      `/prestamos/?id_cartera=${idCartera}&search=${encodeURIComponent(criterio)}&page_size=100`,
    )
    for (const p of porBusqueda) {
      const numero = (p.numero_prestamo || '').trim().toLowerCase()
      if (numero === criterio.toLowerCase() || numero.includes(criterio.toLowerCase())) {
        porMapa.set(p.id_prestamo, p)
      }
    }
  }

  return Array.from(porMapa.values()).sort((a, b) =>
    (a.numero_prestamo || '').localeCompare(b.numero_prestamo || '', 'es'),
  )
}

async function cargarCliente(idCliente: number): Promise<Cliente | null> {
  try {
    const { data } = await api.get<Cliente>(`/clientes/${idCliente}/`)
    return data
  } catch {
    return null
  }
}

async function buscar() {
  if (carteraFiltro.value == null) {
    toast.add({
      severity: 'warn',
      summary: 'Cartera requerida',
      detail: 'Selecciona una cartera disponible.',
      life: 4000,
    })
    return
  }

  const criterio = normalizarCriterio(criterioBusqueda.value)
  if (!criterio) {
    toast.add({
      severity: 'warn',
      summary: 'Criterio requerido',
      detail: 'Ingresa número de préstamo o identidad del cliente.',
      life: 4000,
    })
    return
  }

  loading.value = true
  error.value = ''
  consultaHecha.value = true
  filas.value = []
  clienteResumen.value = null

  try {
    const prestamos = await buscarPrestamosPorCriterio(carteraFiltro.value, criterio)
    if (!prestamos.length) {
      toast.add({
        severity: 'info',
        summary: 'Sin resultados',
        detail: 'No se encontró préstamo ni cliente con ese criterio en la cartera seleccionada.',
        life: 4500,
      })
      return
    }

    const clientesCache = new Map<number, Cliente | null>()
    const filasLocales: FilaHistorialFactura[] = []

    for (const prestamo of prestamos) {
      let cliente = clientesCache.get(prestamo.id_cliente)
      if (cliente === undefined) {
        cliente = await cargarCliente(prestamo.id_cliente)
        clientesCache.set(prestamo.id_cliente, cliente)
      }

      const pagos = await fetchAllPages<Pago>(
        `/pagos/?id_prestamo=${prestamo.id_prestamo}&page_size=100&ordering=fecha_pago,id_pago`,
      )

      for (const pago of pagos) {
        const secundario = esPagoFacturaSecundario(pago)
        const idFactura =
          secundario && pago.id_pago_factura != null ? Number(pago.id_pago_factura) : pago.id_pago
        filasLocales.push({
          id_pago: pago.id_pago,
          id_pago_factura: idFactura,
          fecha_pago: pago.fecha_pago,
          documento: pago.documento,
          numero_prestamo: prestamo.numero_prestamo,
          nombre_cliente: cliente?.nombre ?? '—',
          dni_cliente: cliente?.dni ?? '—',
          capital: pago.capital,
          interes: pago.interes,
          total: totalPago(pago),
          numero_factura: pago.numero_factura ?? null,
          anulado: Boolean(pago.anulado),
          es_secundario: secundario,
        })
      }
    }

    filas.value = filasLocales.sort((a, b) => {
      const porFecha = a.fecha_pago.localeCompare(b.fecha_pago)
      if (porFecha !== 0) return porFecha
      return a.id_pago - b.id_pago
    })

    const primerCliente = Array.from(clientesCache.values()).find(Boolean) ?? null
    clienteResumen.value = {
      nombre: primerCliente?.nombre ?? '—',
      dni: primerCliente?.dni ?? '—',
      prestamos: prestamos.map((p) => p.numero_prestamo).join(', '),
    }

    if (!filasLocales.length) {
      toast.add({
        severity: 'info',
        summary: 'Sin pagos',
        detail: 'El cliente/préstamo no tiene pagos registrados en esta cartera.',
        life: 4500,
      })
    }
  } catch (e) {
    error.value = getApiErrorMessage(e, 'No se pudo cargar el historial de facturas.')
  } finally {
    loading.value = false
  }
}

async function verFactura(fila: FilaHistorialFactura) {
  facturaAbriendoId.value = fila.id_pago
  try {
    await abrirFacturaPago(fila.id_pago_factura)
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Factura PDF',
      detail: getApiErrorMessage(e, 'No se pudo abrir la factura.'),
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
  <div class="page historial-facturas-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Historial de facturas</h1>
        <p class="page-subtitle">
          Filtra por cartera y busca por número de préstamo o identidad para ver los pagos y su factura PDF.
        </p>
      </div>
    </header>

    <Card class="filtros-card">
      <template #content>
        <div class="filtros-grid">
          <div class="filtro-field">
            <label for="hf-cartera">Cartera</label>
            <Select
              id="hf-cartera"
              v-model="carteraFiltro"
              :options="carteraOpciones"
              option-label="label"
              option-value="value"
              placeholder="Seleccionar cartera"
              fluid
            />
          </div>

          <div class="filtro-field filtro-busqueda">
            <label for="hf-criterio">Préstamo o identidad</label>
            <InputText
              id="hf-criterio"
              v-model="criterioBusqueda"
              placeholder="No. préstamo o DNI"
              fluid
              @keyup.enter="buscar"
            />
          </div>

          <div class="filtro-acciones">
            <Button
              label="Buscar"
              icon="pi pi-search"
              :loading="loading"
              :disabled="!puedeBuscar"
              @click="buscar"
            />
          </div>
        </div>
      </template>
    </Card>

    <Message v-if="error" severity="error">{{ error }}</Message>

    <Card v-if="clienteResumen" class="resumen-card">
      <template #content>
        <div class="resumen-grid">
          <div>
            <span class="resumen-label">Cartera</span>
            <strong>{{ tituloCartera }}</strong>
          </div>
          <div>
            <span class="resumen-label">Cliente</span>
            <strong>{{ clienteResumen.nombre }}</strong>
          </div>
          <div>
            <span class="resumen-label">Identidad</span>
            <strong>{{ clienteResumen.dni }}</strong>
          </div>
          <div>
            <span class="resumen-label">Préstamo(s)</span>
            <strong>{{ clienteResumen.prestamos }}</strong>
          </div>
          <div>
            <span class="resumen-label">Pagos</span>
            <strong>{{ filas.length }}</strong>
          </div>
        </div>
      </template>
    </Card>

    <Card v-if="consultaHecha">
      <template #content>
        <DataTable
          :value="filas"
          :loading="loading"
          paginator
          :rows="15"
          data-key="id_pago"
          responsive-layout="scroll"
          size="small"
          empty-message="No hay pagos para mostrar."
        >
          <Column header="Fecha" style="min-width: 8rem">
            <template #body="{ data }: { data: FilaHistorialFactura }">
              {{ formatDate(data.fecha_pago) }}
            </template>
          </Column>
          <Column field="numero_prestamo" header="Préstamo" style="min-width: 8rem" />
          <Column field="documento" header="Documento" style="min-width: 9rem">
            <template #body="{ data }: { data: FilaHistorialFactura }">
              {{ data.documento || '—' }}
            </template>
          </Column>
          <Column header="Capital" style="min-width: 7rem">
            <template #body="{ data }: { data: FilaHistorialFactura }">
              {{ formatMoney(data.capital) }}
            </template>
          </Column>
          <Column header="Interés" style="min-width: 7rem">
            <template #body="{ data }: { data: FilaHistorialFactura }">
              {{ formatMoney(data.interes) }}
            </template>
          </Column>
          <Column header="Total" style="min-width: 7rem">
            <template #body="{ data }: { data: FilaHistorialFactura }">
              {{ formatMoney(data.total) }}
            </template>
          </Column>
          <Column header="No. factura" style="min-width: 11rem">
            <template #body="{ data }: { data: FilaHistorialFactura }">
              <span v-if="data.numero_factura">{{ data.numero_factura }}</span>
              <span v-else-if="data.es_secundario">Ver factura maestro</span>
              <span v-else>—</span>
            </template>
          </Column>
          <Column header="Estado" style="width: 7rem">
            <template #body="{ data }: { data: FilaHistorialFactura }">
              <Tag
                :value="data.anulado ? 'Anulado' : 'Vigente'"
                :severity="data.anulado ? 'danger' : 'success'"
              />
            </template>
          </Column>
          <Column header="Factura PDF" style="width: 8rem">
            <template #body="{ data }: { data: FilaHistorialFactura }">
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
  </div>
</template>

<style scoped>
.historial-facturas-page {
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
  min-width: 12rem;
}

.filtro-busqueda {
  flex: 1;
  min-width: 16rem;
}

.filtro-field label {
  font-size: 0.85rem;
  font-weight: 600;
}

.filtro-acciones {
  display: flex;
  align-items: flex-end;
}

.resumen-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 1rem;
}

.resumen-label {
  display: block;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  margin-bottom: 0.2rem;
}
</style>
