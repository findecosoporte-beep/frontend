<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Message from 'primevue/message'
import Select from 'primevue/select'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { formatDate, formatMoney } from '@/utils/format'
import type { Cliente, Paginated, Prestamo, Zona } from '@/types/api'

const PAGE_SIZE_FETCH = 100

/** ID único en cada visita a la pantalla: el navegador no reutiliza sugerencias ligadas a un `id`/`name` fijo. */
const zonaFieldDomId = `zona-findeco-${crypto.randomUUID()}`

const loading = ref(false)
const error = ref('')
const prestamos = ref<Prestamo[]>([])
/** Clave de grupo (`z{id}`) alineada con `claveGrupoZona`; coincide con `option-value` del Select. */
const zonaFiltroClave = ref('')
/** Catálogo de zonas (API); el listado de préstamos solo se pide por `id_zona` al consultar. */
const zonasCatalogo = ref<Zona[]>([])
/** True después de ejecutar una búsqueda por zona (aunque el resultado sea vacío). */
const consultaHecha = ref(false)
const clientesNombrePorId = ref<Record<number, string>>({})

/** Redondeo a 2 decimales alineado con el API (interés simple por periodo). */
function roundMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Igual que `SimulacionPrestamoView` en Django: tasa nominal mensual (%) → tasa del periodo. */
function periodicRateFromNominal(tasaNominalPct: number, formaPago: string): number {
  if (formaPago === 'semanal') return tasaNominalPct / 4
  if (formaPago === 'quincenal') return tasaNominalPct / 2
  return tasaNominalPct
}

function periodsFromMonths(plazoMeses: number, formaPago: string): number {
  if (formaPago === 'semanal') return plazoMeses * 4
  if (formaPago === 'quincenal') return plazoMeses * 2
  return plazoMeses
}

/** Interés total del crédito (suma de intereses por periodo), misma lógica que `POST /prestamos/simular/`. */
function totalInteresDesdePrestamo(p: Prestamo): number {
  const monto = typeof p.monto === 'string' ? Number.parseFloat(p.monto) : Number(p.monto)
  const tasa =
    typeof p.tasa_interes === 'string' ? Number.parseFloat(String(p.tasa_interes)) : Number(p.tasa_interes)
  const plazoMeses = Math.trunc(Number(p.plazo))
  const formaPago = p.forma_pago || 'mensual'

  if (!Number.isFinite(monto) || !Number.isFinite(tasa) || plazoMeses <= 0) return 0

  const periodos = periodsFromMonths(plazoMeses, formaPago)
  if (periodos <= 0) return 0

  const tasaPeriodica = periodicRateFromNominal(tasa, formaPago) / 100
  const capitalFijo = roundMoney2(monto / periodos)
  const interesFijo = roundMoney2(monto * tasaPeriodica)
  let saldo = monto
  let totalInteres = 0

  for (let periodo = 1; periodo <= periodos; periodo++) {
    const interes = interesFijo
    let capital = capitalFijo
    if (periodo === periodos) capital = saldo
    saldo = roundMoney2(saldo - capital)
    if (saldo < 0) saldo = 0
    totalInteres += interes
  }

  return roundMoney2(totalInteres)
}

function formatTasaPct(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  if (Number.isNaN(n)) return '—'
  return `${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function nombreCliente(id: number): string {
  return clientesNombrePorId.value[id]?.trim() || '—'
}

/** Etiqueta de zona para agrupar y mostrar (API anidada o sin zona). */
function etiquetaZona(p: Prestamo): string {
  const n = p.zona?.nombre?.trim()
  if (n) return n
  return 'Sin zona'
}

/** Clave estable para agrupar: id de zona o un valor único para “sin zona”. */
function claveGrupoZona(p: Prestamo): string {
  const id = p.id_zona ?? p.zona?.id_zona
  if (id != null && id !== 0) return `z${id}`
  return '__sin_zona__'
}

interface GrupoPrestamosPorZona {
  clave: string
  nombreZona: string
  prestamos: Prestamo[]
  cantidad: number
  montoTotal: number
}

const gruposPorZonaTodos = computed((): GrupoPrestamosPorZona[] => {
  const map = new Map<string, Prestamo[]>()
  for (const p of prestamos.value) {
    const k = claveGrupoZona(p)
    const list = map.get(k)
    if (list) list.push(p)
    else map.set(k, [p])
  }

  const out: GrupoPrestamosPorZona[] = []
  for (const [clave, lista] of map) {
    const nombreZona = etiquetaZona(lista[0]!)
    let montoTotal = 0
    for (const p of lista) {
      const m = typeof p.monto === 'string' ? Number.parseFloat(p.monto) : Number(p.monto)
      if (!Number.isNaN(m)) montoTotal += m
    }
    out.push({
      clave,
      nombreZona,
      prestamos: [...lista].sort((a, b) =>
        a.numero_prestamo.localeCompare(b.numero_prestamo, 'es', { numeric: true }),
      ),
      cantidad: lista.length,
      montoTotal,
    })
  }

  out.sort((a, b) => {
    if (a.nombreZona === 'Sin zona') return 1
    if (b.nombreZona === 'Sin zona') return -1
    return a.nombreZona.localeCompare(b.nombreZona, 'es', { sensitivity: 'base' })
  })
  return out
})

/** Solo la zona elegida; las opciones son únicamente grupos con préstamos cargados. */
const gruposPorZona = computed((): GrupoPrestamosPorZona[] => {
  const filtro = zonaFiltroClave.value.trim()
  const todos = gruposPorZonaTodos.value
  if (todos.length === 0 || !filtro) return []
  return todos.filter((g) => g.clave === filtro)
})

const opcionesZonaFiltro = computed(() =>
  zonasCatalogo.value
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((z) => ({
      label: z.nombre,
      value: `z${z.id_zona}`,
    })),
)

const totalesGenerales = computed(() => {
  let monto = 0
  let cantidad = 0
  for (const g of gruposPorZona.value) {
    monto += g.montoTotal
    cantidad += g.cantidad
  }
  return { cantidad, montoTotal: monto }
})

/** Suma de interés total (columna Interés) de todos los préstamos en el listado filtrado. */
const totalesInteresListado = computed(() => {
  let s = 0
  for (const g of gruposPorZona.value) {
    for (const p of g.prestamos) {
      s += totalInteresDesdePrestamo(p)
    }
  }
  return roundMoney2(s)
})

watch(zonaFiltroClave, (v) => {
  if (v == null) zonaFiltroClave.value = ''
  prestamos.value = []
  consultaHecha.value = false
  error.value = ''
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

async function cargarZonasCatalogo() {
  try {
    zonasCatalogo.value = await fetchAllPages<Zona>('/zonas/?page_size=100')
  } catch {
    zonasCatalogo.value = []
  }
}

async function actualizarCatalogoYListado() {
  await cargarZonasCatalogo()
  if (zonaFiltroClave.value.trim()) await buscarPrestamosPorZona()
}

/** Solo trae préstamos de la zona elegida (`GET /prestamos/?id_zona=…`). */
async function buscarPrestamosPorZona() {
  const clave = zonaFiltroClave.value.trim()
  if (!clave) {
    error.value = 'Selecciona una zona para consultar.'
    return
  }
  const m = /^z(\d+)$/.exec(clave)
  const idZona = m ? Number(m[1]) : NaN
  if (!Number.isFinite(idZona) || idZona <= 0) {
    error.value = 'Zona no válida.'
    return
  }

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
        id_zona: String(idZona),
      })
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Fecha de generación del reporte para el encabezado impreso (dd/mm/aa). */
function fechaReporteEncabezado(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

function imprimirReporte() {
  const grupos = gruposPorZona.value
  if (grupos.length === 0) return
  const tituloZona =
    opcionesZonaFiltro.value.find((o) => o.value === zonaFiltroClave.value)?.label ?? 'Zona'
  const { montoTotal } = totalesGenerales.value
  const filasResumen = grupos
    .map(
      (g) =>
        `<tr>
          <td>${escapeHtml(g.nombreZona)}</td>
          <td style="text-align:right">${escapeHtml(formatMoney(g.montoTotal))}</td>
        </tr>`,
    )
    .join('')

  const bloquesDetalle = grupos
    .map((g) => {
      const filas = g.prestamos
        .map((p, i) => {
          const n = i + 1
          const nombre = nombreCliente(p.id_cliente)
          const interes = totalInteresDesdePrestamo(p)
          return `<tr>
              <td style="text-align:right">${n}</td>
              <td>${escapeHtml(nombre)}</td>
              <td>${escapeHtml(formatDate(p.fecha_entrega))}</td>
              <td style="text-align:right">${escapeHtml(formatMoney(p.monto))}</td>
              <td style="text-align:right">${escapeHtml(formatTasaPct(p.tasa_interes))}</td>
              <td style="text-align:right">${p.plazo}</td>
              <td style="text-align:right">${escapeHtml(formatMoney(interes))}</td>
            </tr>`
        })
        .join('')
      return `
        <h2>${escapeHtml(g.nombreZona)}</h2>
        <table class="t">
          <thead>
            <tr>
              <th>N</th>
              <th>NOMBRE</th>
              <th>ENTREGA</th>
              <th>MONTO</th>
              <th>TASA</th>
              <th>PLAZO</th>
              <th>INTERES</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>`
    })
    .join('')

  const fechaEnc = fechaReporteEncabezado()
  const tituloImpresion = `REPORTE DE PRESTAMOS ENTREGADOS ${fechaEnc}`

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(tituloImpresion)}</title>
  <style>
    body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; padding: 1.25rem; color: #0f172a; }
    .print-encabezado {
      border-top: 1px solid #94a3b8;
      border-bottom: 1px solid #94a3b8;
      background: #e8edf2;
      padding: 0.65rem 1rem;
      margin: 0 0 1rem;
      text-align: center;
    }
    .print-encabezado h1 {
      margin: 0;
      font-size: 1rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      line-height: 1.35;
      color: #0f172a;
    }
    h2 { font-size: 0.95rem; margin: 1.25rem 0 0.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25rem; }
    table.t { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 0.5rem; }
    table.t th, table.t td { border: 1px solid #cbd5e1; padding: 4px 6px; }
    table.t th { background: #f1f5f9; text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; font-weight: 700; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <header class="print-encabezado" role="banner">
    <h1>${escapeHtml(tituloImpresion)}</h1>
  </header>
  <p class="meta">Filtro: ${escapeHtml(tituloZona)} · Monto desembolsado (suma): ${escapeHtml(formatMoney(montoTotal))}</p>
  <table class="t">
    <thead>
      <tr>
        <th>Zona</th>
        <th style="text-align:right">Monto total zona</th>
      </tr>
    </thead>
    <tbody>
      ${filasResumen}
      <tr style="font-weight:bold;background:#f8fafc">
        <td>Total</td>
        <td style="text-align:right">${escapeHtml(formatMoney(montoTotal))}</td>
      </tr>
    </tbody>
  </table>
  ${bloquesDetalle}
</body>
</html>`

  const w = window.open('', '_blank', 'width=1100,height=820')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

onMounted(() => {
  void Promise.all([cargarClientes(), cargarZonasCatalogo()])
})

onBeforeUnmount(() => {
  zonaFiltroClave.value = ''
  prestamos.value = []
  zonasCatalogo.value = []
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

    <h1 class="title span-full">Reporte de préstamos entregados</h1>

    <form
      class="span-full barra-filtros"
      autocomplete="off"
      data-lpignore="true"
      data-1p-ignore
      data-bwignore
      @submit.prevent
    >
      <div
        class="zona-select-wrap"
        data-lpignore="true"
        data-1p-ignore
      >
        <label class="zona-select-label" :for="zonaFieldDomId">Zona</label>
        <Select
          :input-id="zonaFieldDomId"
          :name="zonaFieldDomId"
          v-model="zonaFiltroClave"
          :options="opcionesZonaFiltro"
          option-label="label"
          option-value="value"
          placeholder="Elige zona y luego Consultar"
          show-clear
          :disabled="opcionesZonaFiltro.length === 0"
          fluid
        />
      </div>
      <div class="acciones">
        <Button
          label="Consultar"
          icon="pi pi-search"
          type="button"
          :loading="loading"
          :disabled="!zonaFiltroClave.trim()"
          @click="buscarPrestamosPorZona"
        />
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
          :disabled="loading || prestamos.length === 0 || gruposPorZona.length === 0"
          @click="imprimirReporte"
        />
      </div>
    </form>

    <Message v-if="error" severity="error" class="msg span-full" :closable="false">{{ error }}</Message>

    <p v-if="loading && zonaFiltroClave.trim()" class="estado span-full">Cargando préstamos de la zona…</p>
    <p v-else-if="!loading && opcionesZonaFiltro.length === 0" class="estado span-full">
      No hay zonas en el catálogo. Revisa permisos o el endpoint de zonas.
    </p>
    <p v-else-if="!loading && !zonaFiltroClave.trim()" class="estado span-full">
      Selecciona una zona y pulsa <strong>Consultar</strong> para cargar solo los préstamos de esa zona.
    </p>
    <p v-else-if="!loading && zonaFiltroClave.trim() && !consultaHecha" class="estado span-full">
      Pulsa <strong>Consultar</strong> para traer los préstamos desde el servidor (filtrado por zona).
    </p>
    <p v-else-if="!loading && consultaHecha && prestamos.length === 0 && !error" class="estado span-full">
      No hay préstamos en la zona seleccionada.
    </p>

    <template v-else-if="gruposPorZona.length > 0">
      <div class="span-full panel-tabla">
        <h2 class="subtitulo">Detalle por zona</h2>
        <div
          v-for="g in gruposPorZona"
          :key="g.clave"
          class="bloque-zona-tabla"
        >
          <h3 class="bloque-zona-titulo">
            <span class="bloque-zona-nombre">{{ g.nombreZona }}</span>
            <span class="bloque-zona-meta"> · {{ formatMoney(g.montoTotal) }}</span>
          </h3>
          <DataTable
            class="datatable-reporte datatable-desembolso"
            :value="g.prestamos"
            responsive-layout="scroll"
            striped-rows
            size="small"
            data-key="id_prestamo"
          >
            <Column header="N" :style="{ width: '2.75rem' }">
              <template #body="{ index }: { index: number }">
                {{ (index ?? 0) + 1 }}
              </template>
            </Column>
            <Column header="Nombre" :style="{ minWidth: '14rem' }">
              <template #body="{ data }: { data: Prestamo }">
                {{ nombreCliente(data.id_cliente) }}
              </template>
            </Column>
            <Column header="Entrega" :style="{ minWidth: '9rem' }">
              <template #body="{ data }: { data: Prestamo }">
                {{ formatDate(data.fecha_entrega) }}
              </template>
            </Column>
            <Column header="Monto" :style="{ minWidth: '8rem' }">
              <template #body="{ data }: { data: Prestamo }">
                {{ formatMoney(data.monto) }}
              </template>
            </Column>
            <Column header="Tasa" :style="{ minWidth: '6.5rem' }">
              <template #body="{ data }: { data: Prestamo }">
                {{ formatTasaPct(data.tasa_interes) }}
              </template>
            </Column>
            <Column header="Plazo" :style="{ width: '4.5rem' }">
              <template #body="{ data }: { data: Prestamo }">
                {{ data.plazo }}
              </template>
            </Column>
            <Column header="Interés" :style="{ minWidth: '8rem' }">
              <template #body="{ data }: { data: Prestamo }">
                {{ formatMoney(totalInteresDesdePrestamo(data)) }}
              </template>
            </Column>
          </DataTable>
        </div>
        <div
          v-if="zonaFiltroClave"
          class="fila-totales fila-total-detalle-pie"
          aria-label="Totales del listado (zona filtrada)"
        >
          <span>Total</span>
          <span>Monto {{ formatMoney(totalesGenerales.montoTotal) }}</span>
          <span>Interés {{ formatMoney(totalesInteresListado) }}</span>
        </div>
      </div>
    </template>
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

.zona-select-wrap {
  flex: 1 1 16rem;
  min-width: min(100%, 18rem);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.zona-select-label {
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

.panel-tabla {
  min-width: 0;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  padding: 1rem;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}

.bloque-zona-tabla {
  margin-top: 1rem;
}

.bloque-zona-tabla:first-of-type {
  margin-top: 0;
}

.bloque-zona-titulo {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.4;
}

.bloque-zona-nombre {
  font-weight: 600;
}

.bloque-zona-meta {
  font-weight: 400;
  color: #64748b;
  font-size: 0.9rem;
}

.fila-totales {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
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
  grid-template-columns: minmax(5rem, 1fr) auto auto;
  gap: 0.75rem 1rem;
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
</style>
