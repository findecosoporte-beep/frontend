<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import FloatLabel from 'primevue/floatlabel'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import Panel from 'primevue/panel'
 import Toolbar from 'primevue/toolbar'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'
import { formatMoney } from '@/utils/format'
import type {
  GestionCobranza,
  Paginated,
  Prestamo,
  RutaMiHoyResponse,
  UsuarioRutaCobranzaDia,
  UsuarioRow,
  Zona,
} from '@/types/api'

const toast = useToast()
const auth = useAuthStore()
const { canConfigureRutaCobranza } = usePermissions()

const zonasCatalogo = ref<Zona[]>([])
const misRutaHoy = ref<RutaMiHoyResponse | null>(null)
const cargandoMiHoy = ref(false)

const usuarioParaRuta = ref<number | null>(null)
const usuariosCobradorCandidatos = ref<UsuarioRow[]>([])
const rutasServidorUsuarioSelec = ref<UsuarioRutaCobranzaDia[]>([])
const cargandoRutasGestión = ref(false)
const guardandoRutaDia = ref<number | null>(null)

/** draft en UI: día 0=lun … 6=dom → id_zona | null si vacío */
function emptyDraftSemana(): Record<number, number | null> {
  const o: Record<number, number | null> = {}
  for (let d = 0; d < 7; d++) o[d] = null
  return o
}

const draftRutaSemanaUsuario = ref<Record<number, number | null>>(emptyDraftSemana())

const DIAS_PY = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const prestamos = ref<Prestamo[]>([])
const loadingPrestamos = ref(false)
/** '' | '__sin__' | '__ruta_hoy__' | 'id_<n>' | texto legacy sucursal */
const zonaFiltro = ref('')
/** Rangos sobre días de mora (∅ = sin filtro por días) */
const diasMoraFiltro = ref('')
const selectedPrestamoId = ref<number | null>(null)

const diasMoraFiltroOptions: Array<{ label: string; value: string }> = [
  { label: 'Todos los días de mora', value: '' },
  { label: 'Sin mora (0 días)', value: '0' },
  { label: '1 a 7 días', value: '1_7' },
  { label: '8 a 30 días', value: '8_30' },
  { label: '31 a 60 días', value: '31_60' },
  { label: '61 a 90 días', value: '61_90' },
  { label: 'Más de 90 días', value: '91_plus' },
]
const bitacoraRows = ref<GestionCobranza[]>([])
const loadingBitacora = ref(false)
const guardandoRegistro = ref(false)

const form = ref({
  tipo_gestion: 'llamada' as GestionCobranza['tipo_gestion'],
  resultado: '',
  promesa_pago_fecha: '',
  promesa_pago_monto: null as number | null,
  proxima_accion: '',
})

const tipoAccionOptions: Array<{ label: string; value: GestionCobranza['tipo_gestion'] }> = [
  { label: 'Llamada', value: 'llamada' },
  { label: 'Visita', value: 'visita' },
  { label: 'Mensaje', value: 'mensaje' },
  { label: 'Acuerdo', value: 'acuerdo' },
  { label: 'Judicial', value: 'judicial' },
]

async function fetchAllPagesPrestamos(): Promise<Prestamo[]> {
  const items: Prestamo[] = []
  let nextUrl: string | null = '/prestamos/?page_size=100'
  while (nextUrl) {
    const pageData = (await api.get(nextUrl)).data as Paginated<Prestamo>
    items.push(...pageData.results)
    nextUrl = pageData.next
  }
  return items.filter((p) => ['mora', 'pendiente_aprobacion', 'activo'].includes(String(p.estado)))
}

function zonaMetaPorId(idZona: number): Zona | undefined {
  return zonasCatalogo.value.find((z) => z.id_zona === idZona)
}

function prestamoCoincideIdZona(p: Prestamo, idZona: number): boolean {
  if (p.id_zona != null && Number(p.id_zona) === idZona) return true
  const meta = zonaMetaPorId(idZona)
  if (!meta) return false
  const suc = (p.sucursal ?? '').trim().toLowerCase()
  if (!suc) return false
  return (
    suc === meta.nombre.trim().toLowerCase() ||
    suc === meta.codigo.trim().toLowerCase() ||
    suc === meta.nombre.trim().toLowerCase().replace(/\s+/g, '-')
  )
}

/** Préstamo sin zona operativa usable (FK ni texto sucursal) */
function prestamoSinZona(p: Prestamo): boolean {
  const noFk = p.id_zona == null || p.id_zona === 0
  const noTxt = !(p.sucursal ?? '').trim()
  return noFk && noTxt
}

const prestamosPorZona = computed(() => {
  const list = prestamos.value
  const key = zonaFiltro.value
  if (!key) return list
  if (key === '__sin__') {
    return list.filter((p) => prestamoSinZona(p))
  }
  if (key === '__ruta_hoy__') {
    const idz = misRutaHoy.value?.id_zona
    if (idz == null) return []
    return list.filter((p) => prestamoCoincideIdZona(p, idz))
  }
  if (key.startsWith('id_')) {
    const idz = Number(key.slice(3))
    if (!Number.isFinite(idz)) return list
    return list.filter((p) => prestamoCoincideIdZona(p, idz))
  }
  const z = key.trim().toLowerCase()
  return list.filter((p) => (p.sucursal ?? '').trim().toLowerCase() === z)
})

/** Sucursales tal cual llegan desde préstamos (solo texto), para convivencia con préstamos viejos */
const zonaOpcionesLegacySucursal = computed(() => {
  const cats = new Set(
    zonasCatalogo.value.flatMap((x) =>
      [x.nombre.trim().toLowerCase(), x.codigo.trim().toLowerCase()].filter(Boolean),
    ),
  )
  const set = new Set<string>()
  for (const p of prestamos.value) {
    const s = (p.sucursal ?? '').trim()
    if (!s) continue
    const lo = s.toLowerCase()
    if (cats.has(lo)) continue
    set.add(s)
  }
  return Array.from(set)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((label) => ({ label: `Solo texto: ${label}`, value: label }))
})

const zonaFiltroOpcionRutaHoy = computed(() => {
  const mr = misRutaHoy.value
  const dow = mr?.dia_semana ?? weekdayPyFromBrowser(new Date())
  const diaLbl = DIAS_PY[dow] ?? '?'
  if (mr?.id_zona != null && mr.zona) {
    return {
      label: `Mi cartera de hoy (${diaLbl}: ${mr.zona.nombre})`,
      value: '__ruta_hoy__',
    }
  }
  return {
    label: `Mi cartera de hoy (${diaLbl}: sin zona asignada)`,
    value: '__ruta_hoy__',
  }
})

/** weekday Python (lun=0) desde fecha local navegador */
function weekdayPyFromBrowser(d: Date): number {
  const js = d.getDay()
  return js === 0 ? 6 : js - 1
}

const zonaFiltroOptions = computed(() => {
  const cat = zonasCatalogo.value
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((z) => ({
      label: z.nombre,
      value: `id_${z.id_zona}`,
    }))
  return [
    { label: 'Todas las zonas', value: '' },
    { label: 'Sin zona asignada', value: '__sin__' },
    zonaFiltroOpcionRutaHoy.value,
    ...cat,
    ...zonaOpcionesLegacySucursal.value,
  ]
})

const zonaSelectGestión = computed(() =>
  zonasCatalogo.value
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((z) => ({ label: z.nombre, value: z.id_zona as number })),
)

const opcionesUsuarioRutaGestión = computed(() =>
  usuariosCobradorCandidatos.value.map((u) => ({
    label: `${u.nombre} (${u.correo ?? 'sin correo'})`,
    value: u.id_usuario,
  })),
)

async function fetchAllPagesRuta<T>(pathWithQuery: string): Promise<T[]> {
  let nextUrl: string | null = pathWithQuery.includes('?')
    ? `${pathWithQuery}&page_size=100`
    : `${pathWithQuery}?page_size=100`
  const items: T[] = []
  while (nextUrl) {
    const response = await api.get<Paginated<T>>(nextUrl)
    const pg: Paginated<T> = response.data
    items.push(...pg.results)
    nextUrl = pg.next
  }
  return items
}

async function cargarCatalogoZonas() {
  try {
    const { data } = await api.get<Paginated<Zona>>('/zonas/?page_size=100')
    zonasCatalogo.value = data.results.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  } catch {
    zonasCatalogo.value = []
  }
}

async function cargarMiHoy() {
  if (!auth.profile?.vinculado) {
    misRutaHoy.value = null
    return
  }
  cargandoMiHoy.value = true
  try {
    const { data } = await api.get<RutaMiHoyResponse>('/rutas-cobranza/mi-hoy/')
    misRutaHoy.value = data
  } catch {
    misRutaHoy.value = null
  } finally {
    cargandoMiHoy.value = false
  }
}

async function cargarUsuariosParaRuta() {
  if (!canConfigureRutaCobranza.value) {
    usuariosCobradorCandidatos.value = []
    return
  }
  try {
    let nextUrl: string | null = '/usuarios/?page_size=100'
    const todos: UsuarioRow[] = []
    while (nextUrl) {
      const response = await api.get<Paginated<UsuarioRow>>(nextUrl)
      const pg: Paginated<UsuarioRow> = response.data
      todos.push(...pg.results)
      nextUrl = pg.next
    }
    usuariosCobradorCandidatos.value = todos.filter((u) => u.rol === 'cobranza_adm_jud').sort((a, b) => {
      const an = `${a.nombre}`.localeCompare(`${b.nombre}`, 'es')
      if (an !== 0) return an
      return (a.correo ?? '').localeCompare(b.correo ?? '', 'es')
    })
    if (usuarioParaRuta.value == null && usuariosCobradorCandidatos.value[0]) {
      usuarioParaRuta.value = usuariosCobradorCandidatos.value[0].id_usuario
    }
  } catch {
    usuariosCobradorCandidatos.value = []
  }
}

function sincronDraftDesdeServidor(rows: UsuarioRutaCobranzaDia[]) {
  const draft = emptyDraftSemana()
  for (const r of rows) draft[r.dia_semana] = r.id_zona
  draftRutaSemanaUsuario.value = draft
}

async function cargarRutasUsuarioGestión(uid: number) {
  rutasServidorUsuarioSelec.value = []
  if (!canConfigureRutaCobranza.value) return
  cargandoRutasGestión.value = true
  try {
    const rows = await fetchAllPagesRuta<UsuarioRutaCobranzaDia>(
      `/rutas-cobranza/?id_usuario=${encodeURIComponent(String(uid))}`,
    )
    rutasServidorUsuarioSelec.value = rows.sort((a, b) => a.dia_semana - b.dia_semana)
    sincronDraftDesdeServidor(rutasServidorUsuarioSelec.value)
  } catch {
    sincronDraftDesdeServidor([])
  } finally {
    cargandoRutasGestión.value = false
  }
}

async function persistirRutaParaDía(diaSemanaPy: number, nuevoIdZona: number | null) {
  if (!canConfigureRutaCobranza.value || usuarioParaRuta.value == null) return
  const uid = usuarioParaRuta.value
  const existente = rutasServidorUsuarioSelec.value.find((r) => r.dia_semana === diaSemanaPy)
  guardandoRutaDia.value = diaSemanaPy
  try {
    if (nuevoIdZona == null) {
      if (existente) {
        await api.delete(`/rutas-cobranza/${existente.id_ruta_dia}/`)
      }
      await cargarRutasUsuarioGestión(uid)
      toast.add({ severity: 'success', summary: 'Ruta', detail: 'Día actualizado.', life: 2200 })
      return
    }
    if (existente?.id_zona === nuevoIdZona) return
    if (existente) {
      await api.patch(`/rutas-cobranza/${existente.id_ruta_dia}/`, {
        dia_semana: diaSemanaPy,
        id_zona: nuevoIdZona,
        id_usuario: uid,
      })
    } else {
      await api.post('/rutas-cobranza/', {
        id_usuario: uid,
        dia_semana: diaSemanaPy,
        id_zona: nuevoIdZona,
      })
    }
    await cargarRutasUsuarioGestión(uid)
    toast.add({ severity: 'success', summary: 'Ruta guardada', life: 2200 })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Ruta',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
    await cargarRutasUsuarioGestión(uid)
  } finally {
    guardandoRutaDia.value = null
  }
}

async function onCambiaZonaDia(diaPy: number, valor: unknown) {
  const v =
    valor === '' || valor === undefined || valor === null
      ? null
      : typeof valor === 'number'
        ? valor
        : Number(valor)
  const fin = Number.isFinite(v as number) ? (v as number) : null
  draftRutaSemanaUsuario.value[diaPy] = fin
  await persistirRutaParaDía(diaPy, fin)
}

function cumpleRangoDiasMora(d: number): boolean {
  const key = diasMoraFiltro.value
  if (!key) return true
  if (key === '0') return d === 0
  if (key === '1_7') return d >= 1 && d <= 7
  if (key === '8_30') return d >= 8 && d <= 30
  if (key === '31_60') return d >= 31 && d <= 60
  if (key === '61_90') return d >= 61 && d <= 90
  if (key === '91_plus') return d >= 91
  return true
}

/** Cartera cargada aplicando zona + rango de días de mora */
const prestamosCartera = computed(() =>
  prestamosPorZona.value.filter((p) => cumpleRangoDiasMora(daysOverdue(p))),
)

const carteraEnMora = computed(() => prestamosCartera.value.filter((p) => p.estado === 'mora'))
const carteraPendiente = computed(() =>
  prestamosCartera.value.filter((p) => p.estado === 'pendiente_aprobacion'),
)
const carteraTotal = computed(() => prestamosCartera.value.length)
const carteraMontoMora = computed(() =>
  carteraEnMora.value.reduce((acc, p) => acc + Number(p.monto || 0), 0),
)

/** Morosos visibles por filtros, orden descendente por días de mora */
const carteraMorosLista = computed(() =>
  carteraEnMora.value
    .slice()
    .sort((a, b) => Number(b.dias_mora ?? 0) - Number(a.dias_mora ?? 0)),
)

const selectedPrestamo = computed(
  () => prestamosCartera.value.find((p) => p.id_prestamo === selectedPrestamoId.value) ?? null,
)

function daysOverdue(prestamo: Prestamo): number {
  return Number(prestamo.dias_mora ?? 0)
}

function etiquetaZonaParaPrestamo(p: Prestamo): string {
  if (p.id_zona != null) {
    const z = zonaMetaPorId(Number(p.id_zona))
    if (z) return z.nombre
  }
  return (p.sucursal ?? '').trim() || '—'
}



function urgenciaCobro(prestamo: Prestamo): 'alta' | 'media' | 'baja' {
  const overdue = daysOverdue(prestamo)
  if (prestamo.estado === 'mora' && overdue >= 30) return 'alta'
  if (prestamo.estado === 'mora' || overdue > 0) return 'media'
  return 'baja'
}

function urgenciaLabel(prestamo: Prestamo): string {
  const level = urgenciaCobro(prestamo)
  if (level === 'alta') return 'Alta'
  if (level === 'media') return 'Media'
  return 'Baja'
}

function urgenciaClass(prestamo: Prestamo): string {
  return `urgencia-chip urgencia-${urgenciaCobro(prestamo)}`
}

function isPastDate(value: string): boolean {
  if (!value) return false
  const target = new Date(`${value}T00:00:00`)
  if (Number.isNaN(target.getTime())) return false
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return target < today
}

const promesasVencidas = computed(() =>
  bitacoraRows.value.filter((g) => Boolean(g.promesa_pago_fecha) && isPastDate(g.promesa_pago_fecha ?? '')),
)

function exportarBitacoraCsv() {
  if (!bitacoraRows.value.length) {
    toast.add({ severity: 'warn', summary: 'Bitácora vacía', detail: 'No hay registros para exportar.', life: 2500 })
    return
  }
  const headers = ['id_gestion', 'id_prestamo', 'fecha', 'tipo_gestion', 'resultado', 'promesa_fecha', 'promesa_monto', 'proxima_accion', 'actor']
  const lines = bitacoraRows.value.map((g) =>
    [
      g.id_gestion,
      g.id_prestamo,
      g.creado_en,
      g.tipo_gestion,
      `"${String(g.resultado ?? '').replaceAll('"', '""')}"`,
      g.promesa_pago_fecha ?? '',
      g.promesa_pago_monto ?? '',
      `"${String(g.proxima_accion ?? '').replaceAll('"', '""')}"`,
      `"${String(g.actor ?? '').replaceAll('"', '""')}"`,
    ].join(','),
  )
  const csv = `${headers.join(',')}\n${lines.join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bitacora-cobranza-${selectedPrestamo.value?.numero_prestamo ?? 'general'}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function loadCartera() {
  loadingPrestamos.value = true
  try {
    prestamos.value = await fetchAllPagesPrestamos()
    sincronizarSeleccionCartera()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Cobranzas', detail: getApiErrorMessage(e), life: 5000 })
  } finally {
    loadingPrestamos.value = false
  }
}

function sincronizarSeleccionCartera() {
  const visibles = prestamosCartera.value
  if (!visibles.length) {
    selectedPrestamoId.value = null
    return
  }
  if (selectedPrestamoId.value == null) {
    selectedPrestamoId.value = visibles[0].id_prestamo
    return
  }
  if (!visibles.some((p) => p.id_prestamo === selectedPrestamoId.value)) {
    selectedPrestamoId.value = visibles[0].id_prestamo
  }
}

async function loadBitacora() {
  if (!selectedPrestamoId.value) {
    bitacoraRows.value = []
    return
  }
  loadingBitacora.value = true
  try {
    const { data } = await api.get<Paginated<GestionCobranza>>(
      `/gestion-cobranza/?id_prestamo=${selectedPrestamoId.value}&page_size=200`,
    )
    bitacoraRows.value = data.results
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Bitácora', detail: getApiErrorMessage(e), life: 5000 })
  } finally {
    loadingBitacora.value = false
  }
}

async function onSelectPrestamo(idPrestamo: number) {
  selectedPrestamoId.value = idPrestamo
  await loadBitacora()
}

async function guardarRegistro() {
  if (!selectedPrestamoId.value) {
    toast.add({ severity: 'warn', summary: 'Cobranza', detail: 'Selecciona un préstamo.', life: 3500 })
    return
  }
  if (!form.value.resultado.trim()) {
    toast.add({ severity: 'warn', summary: 'Resultado requerido', detail: 'Ingresa el resultado.', life: 3500 })
    return
  }

  guardandoRegistro.value = true
  try {
    const actor =
      auth.profile?.nombre_operativo?.trim() || auth.profile?.username?.trim() || 'Cobranza'
    await api.post('/gestion-cobranza/', {
      id_prestamo: selectedPrestamoId.value,
      tipo_gestion: form.value.tipo_gestion,
      resultado: form.value.resultado.trim(),
      promesa_pago_fecha: form.value.promesa_pago_fecha || null,
      promesa_pago_monto: form.value.promesa_pago_monto,
      proxima_accion: form.value.proxima_accion.trim() || null,
      actor,
    })
    toast.add({ severity: 'success', summary: 'Registro guardado', life: 2600 })
    form.value.resultado = ''
    form.value.promesa_pago_fecha = ''
    form.value.promesa_pago_monto = null
    form.value.proxima_accion = ''
    await loadBitacora()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'No se pudo guardar', detail: getApiErrorMessage(e), life: 5000 })
  } finally {
    guardandoRegistro.value = false
  }
}

const zonaGestiónConVacío = computed(() => [
  { label: 'Sin asignar', value: null as number | null },
  ...zonaSelectGestión.value.map((o) => ({ label: o.label, value: o.value as number | null })),
])

const diasIter = computed(() => DIAS_PY.map((nombre, i) => ({ nombre, dia_py: i })))

watch(usuarioParaRuta, async (uid) => {
  if (!canConfigureRutaCobranza.value || uid == null) return
  await cargarRutasUsuarioGestión(uid)
})

watch(zonaFiltro, async (v) => {
  if (v === '__ruta_hoy__') await cargarMiHoy()
})

watch([zonaFiltro, diasMoraFiltro, misRutaHoy, zonasCatalogo], async () => {
  sincronizarSeleccionCartera()
  await loadBitacora()
})

onMounted(async () => {
  await cargarCatalogoZonas()
  await auth.fetchProfile()
  await Promise.all([loadCartera(), cargarMiHoy(), cargarUsuariosParaRuta()])
  await loadBitacora()
})
</script>

<template>
  <div class="page">
    <h1 class="title">Cobranza administrativa / judicial (según mora)</h1>

    <div class="kpi-grid">
      <div class="kpi-card">
        <span>Cartera monitoreada</span>
        <strong>{{ carteraTotal }}</strong>
      </div>
      <div class="kpi-card">
        <span>En mora</span>
        <strong>{{ carteraEnMora.length }}</strong>
      </div>
      <div class="kpi-card">
        <span>Pendiente aprobación</span>
        <strong>{{ carteraPendiente.length }}</strong>
      </div>
      <div class="kpi-card">
        <span>Monto en mora</span>
        <strong>{{ formatMoney(carteraMontoMora) }}</strong>
      </div>
    </div>

    <Message
      v-if="zonaFiltro === '__ruta_hoy__' && misRutaHoy && misRutaHoy.id_zona == null"
      severity="warn"
      :closable="false"
      class="no-print mb-2"
    >
      Hoy no tienes zona definida en tu ruta semanal. Pídele a supervisión que asigne día → zona, o cambia el
      filtro de territorio a «Todas» o una zona fija del catálogo.
    </Message>

    <Toolbar class="mb-3 toolbar">
      <template #start>
        <div class="toolbar-zona">
          <label class="toolbar-zona-label" for="cob-zona">Cartera por territorio</label>
          <Select
            id="cob-zona"
            v-model="zonaFiltro"
            :options="zonaFiltroOptions"
            option-label="label"
            option-value="value"
            placeholder="Territorio / zona …"
            class="toolbar-zona-select toolbar-zona-wide"
            :loading="loadingPrestamos || cargandoMiHoy"
          />
          <label class="toolbar-zona-label" for="cob-dias">Días de mora</label>
          <Select
            id="cob-dias"
            v-model="diasMoraFiltro"
            :options="diasMoraFiltroOptions"
            option-label="label"
            option-value="value"
            placeholder="Todos"
            class="toolbar-zona-select"
            :loading="loadingPrestamos"
          />
          <Button label="Recargar cartera" icon="pi pi-refresh" severity="secondary" :loading="loadingPrestamos" @click="loadCartera" />
        </div>
      </template>
    </Toolbar>

    <p class="filtro-nota muted no-print">
      La opción «Mi cartera de hoy» filtra préstamos con la zona de tu
      <strong>ruta diaria</strong> (lun–dom configurada por supervisión). Los préstamos se identifican por
      <code>id_zona</code>
      del préstamo o, si falta, por el texto sucursal heredado.
    </p>

    <Panel
      v-if="canConfigureRutaCobranza && opcionesUsuarioRutaGestión.length"
      header="Plan semanal de cobro (supervisión)"
      toggleable
      collapsed
      class="ruta-plan-panel no-print mb-3"
    >
      <p class="panel-sub-muted mb-2">
        Define qué día corresponde a cada zona territorial para cada usuario con rol cobranza.
      </p>
      <div class="ruta-gestion-toolbar">
        <label class="toolbar-zona-label" for="cob-ruta-user">Cobrador</label>
        <Select
          id="cob-ruta-user"
          v-model="usuarioParaRuta"
          :options="opcionesUsuarioRutaGestión"
          option-label="label"
          option-value="value"
          placeholder="Usuario"
          class="toolbar-zona-select ruta-usuario-select"
          :loading="cargandoRutasGestión"
          show-clear
        />
      </div>
      <Message v-if="usuarioParaRuta == null" severity="info" class="mt-2" :closable="false">
        Selecciona un usuario con rol cobranza administrativa/judicial.
      </Message>
      <div v-else class="dia-ruta-grid mt-2">
        <div v-for="{ nombre, dia_py } in diasIter" :key="dia_py" class="dia-ruta-row">
          <span class="dia-ruta-label">{{ nombre }}</span>
          <Select
            :model-value="draftRutaSemanaUsuario[dia_py] ?? null"
            :options="zonaGestiónConVacío"
            option-label="label"
            option-value="value"
            placeholder="Zona…"
            class="dia-ruta-select flex-1"
            :loading="guardandoRutaDia === dia_py || cargandoRutasGestión"
            :disabled="cargandoRutasGestión"
            @update:model-value="(v: unknown) => void onCambiaZonaDia(dia_py, v)"
          />
        </div>
      </div>
    </Panel>
    <Message
      v-else-if="canConfigureRutaCobranza && !opcionesUsuarioRutaGestión.length"
      severity="info"
      :closable="false"
      class="no-print mb-2"
    >
      No hay usuarios operativos con rol «cobranza administrativa / judicial». Crea o vincula uno desde usuarios Django
      y la tabla <code>usuarios</code> para poder cargar rutas semanales.
    </Message>

    <div class="layout-grid">
      <div class="card-box">
        <p class="card-title">Préstamos en mora (filtro por zona y días de mora)</p>
        <DataTable
          :value="carteraMorosLista"
          data-key="id_prestamo"
          :loading="loadingPrestamos"
          responsive-layout="scroll"
        >
          <Column field="numero_prestamo" header="Préstamo" />
          <Column header="Territorio / zona">
            <template #body="{ data }">{{ etiquetaZonaParaPrestamo(data) }}</template>
          </Column>
          <Column field="id_cliente" header="Cliente" />
          <Column header="Monto">
            <template #body="{ data }">{{ formatMoney(data.monto) }}</template>
          </Column>
          <Column header="Estado">
            <template #body="{ data }">
              <span :class="['estado-chip', `estado-${data.estado}`]">{{ data.estado }}</span>
            </template>
          </Column>
          <Column header="Días mora">
            <template #body="{ data }">{{ data.dias_mora ?? 0 }}</template>
          </Column>
          <Column header="Urgencia" style="width: 9rem">
            <template #body="{ data }">
              <span :class="urgenciaClass(data)">{{ urgenciaLabel(data) }}</span>
            </template>
          </Column>
          <Column header="Acción" style="width: 8rem">
            <template #body="{ data }">
              <Button
                label="Seleccionar"
                icon="pi pi-check"
                size="small"
                outlined
                @click="onSelectPrestamo(data.id_prestamo)"
              />
            </template>
          </Column>
        </DataTable>
        <p v-if="!loadingPrestamos && !carteraMorosLista.length" class="empty-priority">
          No hay préstamos en mora que coincidan con la zona y el rango de días de mora seleccionados.
        </p>
      </div>

      <div class="card-box">
        <Message v-if="!selectedPrestamo" severity="info" :closable="false">
          Selecciona un préstamo para registrar el seguimiento de cobranza.
        </Message>

        <div v-else class="form-grid">
          <div class="full">
            <label class="lbl">Tipo de acción</label>
            <Select
              v-model="form.tipo_gestion"
              :options="tipoAccionOptions"
              option-label="label"
              option-value="value"
              fluid
            />
          </div>
          <FloatLabel class="full">
            <Textarea id="c-res" v-model="form.resultado" rows="3" auto-resize fluid />
            <label for="c-res">Resultado</label>
          </FloatLabel>
          <FloatLabel>
            <InputText id="c-fecha" v-model="form.promesa_pago_fecha" type="date" fluid />
            <label for="c-fecha">Promesa de pago (fecha)</label>
          </FloatLabel>
          <FloatLabel>
            <InputNumber id="c-monto" v-model="form.promesa_pago_monto" mode="decimal" :min-fraction-digits="2" fluid />
            <label for="c-monto">Promesa de pago (monto)</label>
          </FloatLabel>
          <FloatLabel class="full">
            <InputText id="c-next" v-model="form.proxima_accion" fluid />
            <label for="c-next">Próxima acción</label>
          </FloatLabel>
          <div class="full actions">
            <Button label="Guardar" icon="pi pi-save" :loading="guardandoRegistro" @click="guardarRegistro" />
          </div>
        </div>
      </div>
    </div>

    <div class="card-box mt">
      <div class="bitacora-head">
        <p class="card-title">Bitácora de cobranza</p>
        <Button
          label="Exportar CSV"
          icon="pi pi-download"
          severity="secondary"
          outlined
          size="small"
          @click="exportarBitacoraCsv"
        />
      </div>
      <Message v-if="promesasVencidas.length" severity="warn" :closable="false" class="mb-2">
        Tienes {{ promesasVencidas.length }} promesa(s) de pago vencida(s) en esta bitácora. Prioriza seguimiento.
      </Message>
      <DataTable :value="bitacoraRows" data-key="id_gestion" :loading="loadingBitacora" responsive-layout="scroll">
        <Column field="creado_en" header="Fecha" />
        <Column field="tipo_gestion" header="Tipo" />
        <Column field="resultado" header="Resultado" />
        <Column header="Promesa">
          <template #body="{ data }">
            {{ data.promesa_pago_fecha || 'N/A' }} / {{ data.promesa_pago_monto ? formatMoney(data.promesa_pago_monto) : 'N/A' }}
          </template>
        </Column>
        <Column field="proxima_accion" header="Próxima acción" />
        <Column field="actor" header="Actor" />
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: min(100%, 88rem); width: 100%; }
.title { margin: 0 0 1rem; font-size: 1.25rem; font-weight: 600; }
.toolbar { margin-top: 0.6rem; }
.toolbar-zona { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.85rem; }
.toolbar-zona-label { font-size: 0.85rem; font-weight: 600; color: #334155; }
.toolbar-zona-select { min-width: 14rem; }
.toolbar-zona-wide { min-width: 19rem; }
.filtro-nota.muted {
  margin: -0.15rem 0 0.75rem;
  font-size: 0.84rem;
  color: #64748b;
}
.ruta-plan-panel .panel-sub-muted { font-size: 0.82rem; color: #64748b; font-weight: 400; }
.ruta-gestion-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem 0.85rem; align-items: center; }
.ruta-usuario-select { min-width: min(26rem, 100%); flex: 1; }
.mt-2 { margin-top: 0.55rem; }
.dia-ruta-grid { display: grid; gap: 0.5rem; max-width: 36rem; }
.dia-ruta-row { display: flex; gap: 0.55rem; align-items: center; }
.dia-ruta-label {
  flex: 0 0 6.75rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
}
.dia-ruta-select { min-width: 0; max-width: 22rem; }
.flex-1 { flex: 1; }
.kpi-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
.kpi-card { border: 1px solid #dbe3ee; border-radius: 10px; background: #f8fafc; padding: 0.65rem; display: grid; gap: 0.2rem; }
.kpi-card span { font-size: 0.82rem; color: #64748b; }
.kpi-card strong { font-size: 1.05rem; color: #0f172a; }
.layout-grid { margin-top: 0.75rem; display: grid; gap: 0.9rem; grid-template-columns: 1.1fr 1fr; }
.card-box { border: 1px solid #dbe3ee; border-radius: 10px; background: #fff; padding: 0.75rem; }
.card-title { margin: 0 0 0.55rem; font-weight: 600; color: #0f172a; }
.form-grid { display: grid; gap: 0.7rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.full { grid-column: 1 / -1; }
.lbl { display: block; margin-bottom: 0.35rem; font-size: 0.82rem; font-weight: 600; }
.actions { display: flex; justify-content: flex-end; }
.mt { margin-top: 0.85rem; }
.bitacora-head { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
.estado-chip { display: inline-flex; border-radius: 999px; padding: 0.08rem 0.5rem; font-size: 0.74rem; border: 1px solid transparent; }
.estado-mora { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
.estado-pendiente_aprobacion { background: #fff7ed; color: #9a3412; border-color: #fdba74; }
.estado-activo { background: #ecfdf5; color: #166534; border-color: #86efac; }
.urgencia-chip { display: inline-flex; border-radius: 999px; padding: 0.08rem 0.48rem; font-size: 0.74rem; border: 1px solid transparent; }
.urgencia-alta { background: #fee2e2; color: #991b1b; border-color: #fca5a5; font-weight: 700; }
.urgencia-media { background: #fffbeb; color: #92400e; border-color: #fcd34d; font-weight: 600; }
.urgencia-baja { background: #ecfdf5; color: #166534; border-color: #86efac; }
.empty-priority { margin: 0.55rem 0 0; color: #64748b; font-size: 0.9rem; }
@media (max-width: 980px) { .layout-grid { grid-template-columns: 1fr; } }
</style>
