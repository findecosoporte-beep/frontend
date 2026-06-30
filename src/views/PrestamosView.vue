<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import FloatLabel from 'primevue/floatlabel'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Password from 'primevue/password'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { DIAS_COBRO_CARTERA_OPTIONS } from '@/constants/diasCobroCartera'
import { formatMoney } from '@/utils/format'
import type {
  Cartera,
  Cliente,
  DiaCobroCartera,
  Paginated,
  Prestamo,
  SimulacionPrestamo,
  UsuarioRow,
  Zona,
} from '@/types/api'

const toast = useToast()
const { canWritePrestamos, canWriteClientes, canManageUsuarios } = usePermissions()

const rolEtiquetaCorto: Record<string, string> = {
  cobrador: 'Cobrador',
  cobranza_adm_jud: 'Cobranza',
  supervisor: 'Supervisor',
  administrador: 'Admin',
  asesor: 'Asesor',
}

/** Opciones del Select: `label` para mostrar nombre y DNI juntos */
const clienteOptions = ref<Array<{ id_cliente: number; nombre: string; dni: string; label: string }>>([])
const clientesById = ref<Record<number, Cliente>>({})
const usuarioOptions = ref<
  Array<{ id_usuario: number; nombre: string; rol: string; label: string }>
>([])
const zonaOptions = ref<Zona[]>([])
const carteraOptions = ref<
  Array<{ id_cartera: number; id_zona: number | null; dia_cobro: DiaCobroCartera; label: string }>
>([])

const diasCobroLabel = Object.fromEntries(
  DIAS_COBRO_CARTERA_OPTIONS.map((o) => [o.value, o.label]),
) as Record<DiaCobroCartera, string>

const diasCobroOptions: { label: string; value: DiaCobroCartera }[] = [...DIAS_COBRO_CARTERA_OPTIONS]

const dialogVisible = ref(false)
const nuevoClienteDialogVisible = ref(false)
const nuevoAsesorDialogVisible = ref(false)
const nuevoCobradorDialogVisible = ref(false)
const savingNuevoCliente = ref(false)
const savingNuevoAsesor = ref(false)
const savingNuevoCobrador = ref(false)
const saving = ref(false)
const simulating = ref(false)
const simulacion = ref<SimulacionPrestamo | null>(null)
const simulacionError = ref('')
const simulacionNotice = ref('')
const simulationSignature = ref('')
const wizardStep = ref(1)
const totalWizardSteps = 4

const estadoOpts = [
  { label: 'Pendiente aprobación', value: 'pendiente_aprobacion' },
  { label: 'Activo', value: 'activo' },
  { label: 'Pagado', value: 'pagado' },
  { label: 'Mora', value: 'mora' },
  { label: 'Cancelado', value: 'cancelado' },
]
const formaPagoOpts = [
  { label: 'Semanal', value: 'semanal' },
  { label: 'Mensual', value: 'mensual' },
  { label: 'Quincenal', value: 'quincenal' },
]
const formaDesOpts = [
  { label: 'Efectivo', value: 'efectivo' },
  { label: 'Transferencia', value: 'transferencia' },
  { label: 'Cheque', value: 'cheque' },
]

const form = ref({
  numero_prestamo: '',
  id_cliente: null as number | null,
  id_usuario: null as number | null,
  id_asesor: null as number | null,
  id_cobrador: null as number | null,
  monto: null as number | null,
  plazo: 12,
  tasa_interes: null as number | null,
  estado: 'pendiente_aprobacion',
  forma_pago: 'mensual',
  forma_desembolso: 'efectivo',
  comision: 0,
  fecha_entrega: '',
  id_cartera: null as number | null,
  id_zona: null as number | null,
  producto: '',
  dias_mora: 0,
  ciclos: 0,
})

const nuevoClienteForm = ref({
  nombre: '',
  dni: '',
  telefono: '',
  direccion_residencia: '',
  dia_cobro_semanal: 'lunes' as DiaCobroCartera,
})

const nuevoAsesorForm = ref({
  nombre: '',
  correo: '',
  password: '',
})

const nuevoCobradorForm = ref({
  nombre: '',
  correo: '',
  password: '',
  carteras: [] as number[],
})

const currentSimulationSignature = computed(() =>
  JSON.stringify({
    monto: form.value.monto,
    plazo: form.value.plazo,
    tasa_interes: form.value.tasa_interes,
    forma_pago: form.value.forma_pago,
    comision: form.value.comision,
  }),
)

const tasaPeriodoLabel = computed(() => {
  return 'Tasa mensual %'
})

const frecuenciaEfectoLabel = computed(() => {
  if (form.value.forma_pago === 'semanal') return 'Efecto aplicado: 1 semana por cuota (semanal).'
  if (form.value.forma_pago === 'quincenal') return 'Efecto aplicado: 15 días por cuota (quincenal).'
  return 'Efecto aplicado: 1 mes por cuota (mensual).'
})

const frecuenciaPlazoResumen = computed(() => {
  const plazo = Number(form.value.plazo || 0)
  if (plazo <= 0) return ''
  if (form.value.forma_pago === 'semanal') {
    const semanas = plazo * 4
    return `Semanas totales estimadas para el plazo actual: ${semanas} (${plazo} mes${plazo === 1 ? '' : 'es'} × 4 cuotas/mes).`
  }
  if (form.value.forma_pago === 'quincenal') {
    return `Quincenas totales estimadas para el plazo actual: ${plazo * 2}.`
  }
  return `Meses del plazo: ${plazo}.`
})

const tasaConversionLabel = computed(() => {
  if (form.value.forma_pago === 'semanal') return 'Tasa por periodo aplicada: tasa mensual / 4.'
  if (form.value.forma_pago === 'quincenal') return 'Tasa por periodo aplicada: tasa mensual / 2.'
  return 'Tasa por periodo aplicada: tasa mensual.'
})

const canSave = computed(() => {
  const hasRequired =
    !!form.value.numero_prestamo.trim() &&
    form.value.id_cliente != null &&
    form.value.id_asesor != null &&
    form.value.id_cobrador != null &&
    form.value.monto != null &&
    form.value.tasa_interes != null &&
    !!form.value.fecha_entrega &&
    form.value.id_cartera != null

  const hasCurrentSimulation =
    simulacion.value != null &&
    simulationSignature.value.length > 0 &&
    simulationSignature.value === currentSimulationSignature.value
  return hasRequired && hasCurrentSimulation
})

const canGoNext = computed(() => {
  if (wizardStep.value === 1) {
    return (
      !!form.value.numero_prestamo.trim() &&
      form.value.id_cliente != null &&
      form.value.id_asesor != null &&
      form.value.id_cobrador != null
    )
  }
  if (wizardStep.value === 2) {
    return form.value.monto != null && form.value.tasa_interes != null && form.value.plazo > 0
  }
  if (wizardStep.value === 3) {
    return !!form.value.fecha_entrega && form.value.id_cartera != null
  }
  return false
})

const wizardStepTitle = computed(() => {
  if (wizardStep.value === 1) return 'Identificación'
  if (wizardStep.value === 2) return 'Condiciones'
  if (wizardStep.value === 3) return 'Fechas y detalle'
  return 'Cálculo y guardado'
})

const fechaVencimientoCalculada = computed(() => {
  if (!form.value.fecha_entrega || form.value.plazo <= 0) return ''
  const base = new Date(`${form.value.fecha_entrega}T00:00:00`)
  return toISODate(addPeriod(base, form.value.forma_pago, form.value.plazo))
})

const clienteCalculoDetalle = computed(() => {
  if (form.value.id_cliente == null) return null
  return clientesById.value[form.value.id_cliente] ?? null
})

const asesorOptions = computed(() =>
  usuarioOptions.value.filter((u) => u.rol === 'asesor' || u.rol === 'supervisor' || u.rol === 'administrador'),
)

const cobradorOptions = computed(() =>
  usuarioOptions.value.filter(
    (u) =>
      u.rol === 'cobrador' ||
      u.rol === 'cobranza_adm_jud' ||
      u.rol === 'supervisor' ||
      u.rol === 'administrador',
  ),
)

const cobradorCarteraMultiOptions = computed(() =>
  carteraOptions.value.map((c) => ({
    label: c.label,
    value: c.id_cartera,
  })),
)

function mapUsuarioOption(u: UsuarioRow) {
  return {
    id_usuario: u.id_usuario,
    nombre: u.nombre,
    rol: u.rol,
    label: `${u.nombre} (${rolEtiquetaCorto[u.rol] ?? u.rol})`,
  }
}

function registrarUsuarioEnLista(usuario: UsuarioRow) {
  const opt = mapUsuarioOption(usuario)
  if (!usuarioOptions.value.some((u) => u.id_usuario === usuario.id_usuario)) {
    usuarioOptions.value = [...usuarioOptions.value, opt].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es'),
    )
  }
}

function nombreUsuarioPorId(idUsuario: number | null): string {
  if (idUsuario == null) return ''
  const row = usuarioOptions.value.find((u) => u.id_usuario === idUsuario)
  return row?.nombre ?? ''
}

async function fetchAllPages<T>(initialPath: string): Promise<T[]> {
  const items: T[] = []
  let nextUrl: string | null = initialPath
  while (nextUrl) {
    const pageData = (await api.get(nextUrl)).data as Paginated<T>
    items.push(...pageData.results)
    nextUrl = pageData.next
  }
  return items
}

const zonaAsignadaNombre = computed(() => {
  const idZ = form.value.id_zona
  if (idZ == null) return ''
  return zonaOptions.value.find((z) => z.id_zona === idZ)?.nombre ?? ''
})

function mapClienteOption(r: Cliente) {
  return {
    id_cliente: r.id_cliente,
    nombre: r.nombre,
    dni: r.dni,
    label: `${r.nombre} (${r.dni})`,
  }
}

function registrarClienteEnListas(cliente: Cliente) {
  const opt = mapClienteOption(cliente)
  if (!clienteOptions.value.some((c) => c.id_cliente === cliente.id_cliente)) {
    clienteOptions.value = [...clienteOptions.value, opt].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es'),
    )
  }
  clientesById.value = { ...clientesById.value, [cliente.id_cliente]: cliente }
}

function emptyToNull(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

function resetNuevoClienteForm() {
  nuevoClienteForm.value = {
    nombre: '',
    dni: '',
    telefono: '',
    direccion_residencia: '',
    dia_cobro_semanal: 'lunes',
  }
}

function abrirNuevoClienteModal() {
  resetNuevoClienteForm()
  nuevoClienteDialogVisible.value = true
}

async function guardarNuevoCliente() {
  const nombre = nuevoClienteForm.value.nombre.trim()
  const dni = nuevoClienteForm.value.dni.trim()
  if (!nombre || !dni) {
    toast.add({
      severity: 'warn',
      summary: 'Datos incompletos',
      detail: 'El nombre y el DNI son obligatorios.',
      life: 4500,
    })
    return
  }
  if (!nuevoClienteForm.value.dia_cobro_semanal) {
    toast.add({
      severity: 'warn',
      summary: 'Datos incompletos',
      detail: 'Selecciona el día de cobro semanal del cliente.',
      life: 4500,
    })
    return
  }

  savingNuevoCliente.value = true
  try {
    const payload = {
      nombre,
      dni,
      telefono: emptyToNull(nuevoClienteForm.value.telefono),
      direccion_residencia: emptyToNull(nuevoClienteForm.value.direccion_residencia),
      direccion_negocio: null,
      referencia_parentesco: null,
      referencia_telefono: null,
      referencia: null,
      actividad_economica: null,
      dia_cobro_semanal: nuevoClienteForm.value.dia_cobro_semanal,
    }
    const { data } = await api.post<Cliente>('/clientes/', payload)
    registrarClienteEnListas(data)
    form.value.id_cliente = data.id_cliente
    sincronizarCarteraDesdeCliente(data.id_cliente)
    nuevoClienteDialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: 'Cliente registrado',
      detail: `${data.nombre} quedó seleccionado para este préstamo.`,
      life: 4000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo registrar',
      detail: getApiErrorMessage(e),
      life: 7000,
    })
  } finally {
    savingNuevoCliente.value = false
  }
}

function resetNuevoAsesorForm() {
  nuevoAsesorForm.value = { nombre: '', correo: '', password: '' }
}

function abrirNuevoAsesorModal() {
  resetNuevoAsesorForm()
  nuevoAsesorDialogVisible.value = true
}

async function guardarNuevoAsesor() {
  const nombre = nuevoAsesorForm.value.nombre.trim()
  const correo = nuevoAsesorForm.value.correo.trim().toLowerCase()
  const password = nuevoAsesorForm.value.password

  if (!nombre || !correo) {
    toast.add({
      severity: 'warn',
      summary: 'Asesor',
      detail: 'Nombre y correo son obligatorios.',
      life: 4000,
    })
    return
  }
  if (password.length < 8) {
    toast.add({
      severity: 'warn',
      summary: 'Asesor',
      detail: 'La contraseña debe tener al menos 8 caracteres.',
      life: 4000,
    })
    return
  }

  savingNuevoAsesor.value = true
  try {
    const { data } = await api.post<UsuarioRow>('/usuarios/', {
      rol: 'asesor',
      nombre,
      correo,
      password,
    })
    registrarUsuarioEnLista(data)
    form.value.id_asesor = data.id_usuario
    form.value.id_usuario = data.id_usuario
    nuevoAsesorDialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: 'Asesor registrado',
      detail: `${data.nombre} quedó seleccionado para este préstamo.`,
      life: 4000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo registrar',
      detail: getApiErrorMessage(e),
      life: 7000,
    })
  } finally {
    savingNuevoAsesor.value = false
  }
}

function resetNuevoCobradorForm() {
  nuevoCobradorForm.value = {
    nombre: '',
    correo: '',
    password: '',
    carteras: form.value.id_cartera != null ? [form.value.id_cartera] : [],
  }
}

function abrirNuevoCobradorModal() {
  resetNuevoCobradorForm()
  nuevoCobradorDialogVisible.value = true
}

async function guardarNuevoCobrador() {
  const nombre = nuevoCobradorForm.value.nombre.trim()
  const correo = nuevoCobradorForm.value.correo.trim().toLowerCase()
  const password = nuevoCobradorForm.value.password
  const carteras = nuevoCobradorForm.value.carteras

  if (!nombre || !correo) {
    toast.add({
      severity: 'warn',
      summary: 'Cobrador',
      detail: 'Nombre y correo son obligatorios.',
      life: 4000,
    })
    return
  }
  if (!carteras.length) {
    toast.add({
      severity: 'warn',
      summary: 'Cobrador',
      detail: 'Asigna al menos una cartera.',
      life: 4000,
    })
    return
  }
  if (password.length < 8) {
    toast.add({
      severity: 'warn',
      summary: 'Cobrador',
      detail: 'La contraseña debe tener al menos 8 caracteres.',
      life: 4000,
    })
    return
  }

  savingNuevoCobrador.value = true
  try {
    const { data } = await api.post<UsuarioRow>('/usuarios/', {
      rol: 'cobrador',
      nombre,
      correo,
      password,
      carteras,
    })
    registrarUsuarioEnLista(data)
    form.value.id_cobrador = data.id_usuario
    nuevoCobradorDialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: 'Cobrador registrado',
      detail: `${data.nombre} quedó seleccionado para este préstamo.`,
      life: 4000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo registrar',
      detail: getApiErrorMessage(e),
      life: 7000,
    })
  } finally {
    savingNuevoCobrador.value = false
  }
}

function sincronizarCarteraDesdeCliente(idCliente: number | null) {
  if (idCliente == null) return
  const cliente = clientesById.value[idCliente]
  const dia = cliente?.dia_cobro_semanal
  if (!dia) return
  const cartera = carteraOptions.value.find((c) => c.dia_cobro === dia)
  if (!cartera) return
  form.value.id_cartera = cartera.id_cartera
  form.value.id_zona = cartera.id_zona
}

async function loadOptions() {
  const [clientes, usuarios, zonas, carteras] = await Promise.all([
    fetchAllPages<Cliente>('/clientes/?page_size=100'),
    fetchAllPages<UsuarioRow>('/usuarios/?page_size=100'),
    fetchAllPages<Zona>('/zonas/?page_size=100'),
    fetchAllPages<Cartera>('/carteras/?page_size=100'),
  ])
  clienteOptions.value = clientes
    .map(mapClienteOption)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  clientesById.value = Object.fromEntries(clientes.map((r) => [r.id_cliente, r]))
  usuarioOptions.value = usuarios
    .map(mapUsuarioOption)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  zonaOptions.value = zonas.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  carteraOptions.value = carteras
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((c) => ({
      id_cartera: c.id_cartera,
      id_zona: c.id_zona ?? null,
      dia_cobro: c.dia_cobro,
      label: `${c.nombre} — ${diasCobroLabel[c.dia_cobro] ?? c.dia_cobro}`,
    }))
}

function openCreate() {
  simulacion.value = null
  simulacionError.value = ''
  simulacionNotice.value = ''
  simulationSignature.value = ''
  form.value = {
    numero_prestamo: '',
    id_cliente: clienteOptions.value[0]?.id_cliente ?? null,
    id_usuario: asesorOptions.value[0]?.id_usuario ?? null,
    id_asesor: asesorOptions.value[0]?.id_usuario ?? null,
    id_cobrador: cobradorOptions.value[0]?.id_usuario ?? null,
    monto: null,
    plazo: 12,
    tasa_interes: null,
    estado: 'pendiente_aprobacion',
    forma_pago: 'mensual',
    forma_desembolso: 'efectivo',
    comision: 0,
    fecha_entrega: '',
    id_cartera: carteraOptions.value[0]?.id_cartera ?? null,
    id_zona: carteraOptions.value[0]?.id_zona ?? null,
    producto: '',
    dias_mora: 0,
    ciclos: 0,
  }
  sincronizarCarteraDesdeCliente(form.value.id_cliente)
  wizardStep.value = 1
  dialogVisible.value = true
}

function goToNextStep() {
  if (wizardStep.value >= totalWizardSteps) return
  wizardStep.value += 1
}

function goToPreviousStep() {
  if (wizardStep.value <= 1) return
  wizardStep.value -= 1
}

function buildSimulationPayload() {
  const tasaInteres = form.value.tasa_interes == null ? null : Number(form.value.tasa_interes.toFixed(2))
  const comision = form.value.comision == null ? 0 : Number(form.value.comision.toFixed(2))
  return {
    monto: form.value.monto,
    plazo: form.value.plazo,
    tasa_interes: tasaInteres,
    forma_pago: form.value.forma_pago,
    comision,
  }
}

watch(
  () => form.value.id_asesor,
  (asesorId) => {
    form.value.id_usuario = asesorId
  },
)

watch(
  () => form.value.id_cliente,
  (idCliente) => {
    sincronizarCarteraDesdeCliente(idCliente)
  },
)

function addPeriod(baseDate: Date, formaPago: string, period: number): Date {
  const next = new Date(baseDate)
  if (formaPago === 'semanal') {
    next.setDate(next.getDate() + period * 7)
    return next
  }
  if (formaPago === 'quincenal') {
    next.setDate(next.getDate() + period * 15)
    return next
  }
  next.setMonth(next.getMonth() + period)
  return next
}

function toISODate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Alineado con `getDay()` de JS: 0 = domingo … 6 = sábado. */
const DIA_SEMANA_A_JS_DOW: Record<DiaCobroCartera, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
}

/** Primera fecha (hoy o en los próximos 7 días) que coincide con el día de ruta de la zona. */
function proximaFechaEntregaParaDiaSemana(dia: DiaCobroCartera | null | undefined): string {
  if (!dia || !(dia in DIA_SEMANA_A_JS_DOW)) return ''
  const targetDow = DIA_SEMANA_A_JS_DOW[dia]
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 8; i++) {
    if (d.getDay() === targetDow) return toISODate(d)
    d.setDate(d.getDate() + 1)
  }
  return ''
}

watch(
  () => form.value.id_cartera,
  (idCartera) => {
    if (idCartera == null) {
      form.value.id_zona = null
      return
    }
    const c = carteraOptions.value.find((x) => x.id_cartera === idCartera)
    if (!c) return
    form.value.id_zona = c.id_zona
    const siguiente = proximaFechaEntregaParaDiaSemana(c.dia_cobro)
    if (siguiente) form.value.fecha_entrega = siguiente
  },
)

function onFormaPagoToggle(targetValue: string, checked: boolean) {
  // Mantenemos selección única obligatoria: si apaga el activo, lo volvemos a dejar activo.
  if (!checked && form.value.forma_pago === targetValue) {
    form.value.forma_pago = targetValue
    return
  }
  if (checked) {
    form.value.forma_pago = targetValue
  }
}

async function simulate() {
  simulacionError.value = ''
  simulacionNotice.value = ''
  simulacion.value = null
  simulationSignature.value = ''
  simulating.value = true
  try {
    const payload = buildSimulationPayload()
    const { data } = await api.post<SimulacionPrestamo>('/prestamos/simular/', payload)
    simulacion.value = data
    simulationSignature.value = currentSimulationSignature.value
  } catch (e) {
    simulacionError.value = getApiErrorMessage(e, 'No se pudo completar el cálculo.')
  } finally {
    simulating.value = false
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function printCalculo() {
  if (!simulacion.value) return

  const rowsHtml = simulacion.value.amortizacion
    .map(
      (item) => `
        <tr>
          <td>${item.periodo}</td>
          <td>${escapeHtml(formatMoney(item.cuota))}</td>
          <td>${escapeHtml(formatMoney(item.capital))}</td>
          <td>${escapeHtml(formatMoney(item.interes))}</td>
          <td>${escapeHtml(formatMoney(item.saldo))}</td>
        </tr>`,
    )
    .join('')

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Cálculo de préstamo ${escapeHtml(form.value.numero_prestamo || '')}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
          h1 { margin: 0 0 8px; font-size: 20px; }
          .meta { margin: 0 0 14px; font-size: 13px; color: #334155; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap: 8px 16px; margin: 12px 0 18px; }
          .card { border: 1px solid #dbe3ee; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #dbe3ee; padding: 6px 8px; text-align: left; }
          th { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>Cálculo de préstamo</h1>
        <p class="meta">
          Número: ${escapeHtml(form.value.numero_prestamo || 'N/A')} | Forma de pago:
          ${escapeHtml(form.value.forma_pago)}
        </p>
        <div class="grid">
          <div class="card"><strong>Cuota:</strong> ${escapeHtml(formatMoney(simulacion.value.cuota_periodica))}</div>
          <div class="card"><strong>Interés total:</strong> ${escapeHtml(formatMoney(simulacion.value.total_interes))}</div>
          <div class="card"><strong>Comisión:</strong> ${escapeHtml(formatMoney(simulacion.value.comision_monto))}</div>
          <div class="card"><strong>Total a pagar:</strong> ${escapeHtml(formatMoney(simulacion.value.total_pagar))}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Periodo</th>
              <th>Cuota</th>
              <th>Capital</th>
              <th>Interés</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>`

  const printWindow = window.open('', '_blank', 'width=1000,height=700')
  if (!printWindow) return

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

function buildPayload() {
  const asesorNombre = nombreUsuarioPorId(form.value.id_asesor)
  const cobradorNombre = nombreUsuarioPorId(form.value.id_cobrador)
  const tasaInteres = form.value.tasa_interes == null ? null : Number(form.value.tasa_interes.toFixed(2))
  const comision = form.value.comision == null ? 0 : Number(form.value.comision.toFixed(2))
  return {
    numero_prestamo: form.value.numero_prestamo.trim(),
    id_cliente: form.value.id_cliente,
    id_usuario: form.value.id_asesor,
    monto: form.value.monto,
    plazo: form.value.plazo,
    tasa_interes: tasaInteres,
    estado: form.value.estado,
    forma_pago: form.value.forma_pago,
    forma_desembolso: form.value.forma_desembolso,
    comision,
    fecha_entrega: form.value.fecha_entrega,
    fecha_vencimiento: fechaVencimientoCalculada.value || null,
    id_cartera: form.value.id_cartera,
    id_zona: form.value.id_zona,
    asesor: asesorNombre || null,
    supervisor: cobradorNombre || null,
    producto: form.value.producto.trim() || null,
    dias_mora: form.value.dias_mora,
    ciclos: form.value.ciclos,
  }
}

async function hasDuplicateNumeroPrestamoByCliente(): Promise<boolean> {
  const numero = form.value.numero_prestamo.trim()
  if (!numero) return false

  const params = new URLSearchParams({
    search: numero,
    page_size: '200',
  })
  const { data } = await api.get<Paginated<Prestamo>>(`/prestamos/?${params.toString()}`)

  return data.results.some(
    (item) => item.numero_prestamo.trim().toLowerCase() === numero.toLowerCase(),
  )
}

async function save() {
  saving.value = true
  try {
    const duplicateExists = await hasDuplicateNumeroPrestamoByCliente()
    if (duplicateExists) {
      toast.add({
        severity: 'warn',
        summary: 'Número duplicado',
        detail: 'Ya existe un préstamo con ese número. Usa un número diferente.',
        life: 5000,
      })
      return
    }

    const payload = buildPayload()
    await api.post('/prestamos/', payload)
    toast.add({ severity: 'success', summary: 'Préstamo creado', life: 3000 })
    dialogVisible.value = false
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: getApiErrorMessage(e), life: 6000 })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    await loadOptions()
  } catch (e) {
    toast.add({ severity: 'warn', summary: 'Opciones', detail: getApiErrorMessage(e), life: 5000 })
  }
})

watch(
  () => currentSimulationSignature.value,
  () => {
    // Si cambian datos clave del cálculo, invalidamos el resultado mostrado y avisamos.
    if (simulationSignature.value && simulationSignature.value !== currentSimulationSignature.value) {
      simulacion.value = null
      simulationSignature.value = ''
      simulacionNotice.value = 'Los datos cambiaron. Vuelve a calcular para actualizar la proyección.'
    }
  },
)
</script>

<template>
  <div class="page">
    <div class="prestamos-header">
      <h1 class="title">Préstamos</h1>
      <Button v-if="canWritePrestamos" label="Nuevo préstamo" icon="pi pi-plus" @click="openCreate" />
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      :header="`Nuevo préstamo · Paso ${wizardStep}/${totalWizardSteps}: ${wizardStepTitle}`"
      modal
      class="prestamo-dialog"
      :style="{ width: 'min(78rem, 98vw)' }"
    >
      <div class="wizard-head">
        <div :class="['wizard-pill', { active: wizardStep >= 1 }]">1. Identificación</div>
        <div :class="['wizard-pill', { active: wizardStep >= 2 }]">2. Condiciones</div>
        <div :class="['wizard-pill', { active: wizardStep >= 3 }]">3. Fechas</div>
        <div :class="['wizard-pill', { active: wizardStep >= 4 }]">4. Cálculo</div>
      </div>
      <div class="form-grid">
        <template v-if="wizardStep === 1">
          <FloatLabel>
            <InputText id="p-num" v-model="form.numero_prestamo" fluid />
            <label for="p-num">Número préstamo</label>
          </FloatLabel>
          <div class="full cliente-select-wrap">
            <label class="lbl" for="p-cliente">Cliente</label>
            <div class="cliente-select-row">
              <Select
                id="p-cliente"
                v-model="form.id_cliente"
                :options="clienteOptions"
                option-label="label"
                option-value="id_cliente"
                placeholder="Buscar cliente por nombre o DNI"
                filter
                filter-placeholder="Buscar..."
                empty-filter-message="No hay clientes con ese criterio."
                empty-message="No hay clientes registrados."
                :show-clear="true"
                fluid
                class="cliente-select"
              />
              <Button
                v-if="canWriteClientes"
                type="button"
                icon="pi pi-user-plus"
                label="Nuevo"
                severity="secondary"
                outlined
                class="cliente-add-btn"
                aria-label="Registrar nuevo cliente"
                @click="abrirNuevoClienteModal"
              />
            </div>
            <small v-if="canWriteClientes" class="hint-text">
              Si no aparece en la lista, regístralo con el botón «Nuevo».
            </small>
          </div>
          <div class="full asesor-select-wrap">
            <label class="lbl" for="p-asesor">Asesor</label>
            <div class="cliente-select-row">
              <Select
                id="p-asesor"
                v-model="form.id_asesor"
                :options="asesorOptions"
                option-label="label"
                option-value="id_usuario"
                placeholder="Buscar asesor por nombre"
                filter
                filter-placeholder="Buscar..."
                empty-filter-message="No hay asesores con ese criterio."
                empty-message="No hay asesores registrados."
                :show-clear="true"
                fluid
                class="cliente-select"
              />
              <Button
                v-if="canManageUsuarios"
                type="button"
                icon="pi pi-user-plus"
                label="Nuevo"
                severity="secondary"
                outlined
                class="cliente-add-btn"
                aria-label="Registrar nuevo asesor"
                @click="abrirNuevoAsesorModal"
              />
            </div>
            <small v-if="canManageUsuarios" class="hint-text">
              Si no aparece en la lista, regístralo con el botón «Nuevo».
            </small>
          </div>
          <div class="full cobrador-select-wrap">
            <label class="lbl" for="p-cobrador">Cobrador</label>
            <div class="cliente-select-row">
              <Select
                id="p-cobrador"
                v-model="form.id_cobrador"
                :options="cobradorOptions"
                option-label="label"
                option-value="id_usuario"
                placeholder="Buscar cobrador por nombre"
                filter
                filter-placeholder="Buscar..."
                empty-filter-message="No hay cobradores con ese criterio."
                empty-message="No hay cobradores registrados."
                :show-clear="true"
                fluid
                class="cliente-select"
              />
              <Button
                v-if="canManageUsuarios"
                type="button"
                icon="pi pi-user-plus"
                label="Nuevo"
                severity="secondary"
                outlined
                class="cliente-add-btn"
                aria-label="Registrar nuevo cobrador"
                @click="abrirNuevoCobradorModal"
              />
            </div>
            <small v-if="canManageUsuarios" class="hint-text">
              Si no aparece en la lista, regístralo con el botón «Nuevo».
            </small>
          </div>
        </template>

        <template v-if="wizardStep === 2">
          <div class="field-block">
            <label class="lbl" for="p-monto">Monto</label>
            <InputNumber id="p-monto" v-model="form.monto" mode="decimal" :min-fraction-digits="2" fluid />
          </div>
          <div class="field-block">
            <label class="lbl" for="p-plazo">Plazo (meses)</label>
            <InputNumber id="p-plazo" v-model="form.plazo" :min="1" fluid />
          </div>
          <div class="field-block">
            <label class="lbl" for="p-tasa">{{ tasaPeriodoLabel }}</label>
            <InputNumber
              id="p-tasa"
              v-model="form.tasa_interes"
              mode="decimal"
              :min="0"
              :max-fraction-digits="2"
              :min-fraction-digits="2"
              :step="0.01"
              :use-grouping="false"
              fluid
            />
            <small class="hint-text">{{ tasaConversionLabel }}</small>
          </div>
          <div class="full">
            <label class="lbl">Estado</label>
            <Select v-model="form.estado" :options="estadoOpts" option-label="label" option-value="value" fluid />
          </div>
          <div class="full">
            <label class="lbl">Forma pago</label>
            <div class="switch-list">
              <div v-for="opt in formaPagoOpts" :key="opt.value" class="switch-item">
                <span class="switch-item-label">{{ opt.label }}</span>
                <ToggleSwitch
                  :model-value="form.forma_pago === opt.value"
                  @update:model-value="(value) => onFormaPagoToggle(opt.value, value)"
                />
              </div>
            </div>
            <small class="hint-text">{{ frecuenciaEfectoLabel }}</small>
            <small v-if="frecuenciaPlazoResumen" class="hint-text">{{ frecuenciaPlazoResumen }}</small>
          </div>
          <div class="full">
            <label class="lbl">Desembolso</label>
            <Select
              v-model="form.forma_desembolso"
              :options="formaDesOpts"
              option-label="label"
              option-value="value"
              fluid
            />
          </div>
          <div class="field-block">
            <label class="lbl" for="p-com">Comisión</label>
            <InputNumber id="p-com" v-model="form.comision" mode="decimal" :min-fraction-digits="2" fluid />
          </div>
        </template>

        <template v-if="wizardStep === 3">
          <div class="field-block full">
            <label class="lbl" for="p-cartera">Cartera</label>
            <Select
              id="p-cartera"
              v-model="form.id_cartera"
              :options="carteraOptions"
              option-label="label"
              option-value="id_cartera"
              placeholder="Selecciona cartera de cobro"
              fluid
              :show-clear="false"
            />
            <small class="hint-text">
              El préstamo queda asignado a esta cartera. La zona territorial se toma de la cartera cuando está
              vinculada.
            </small>
          </div>
          <div v-if="zonaAsignadaNombre" class="field-block full">
            <label class="lbl" for="p-zona-asig">Zona asignada</label>
            <InputText id="p-zona-asig" :model-value="zonaAsignadaNombre" readonly fluid />
          </div>
          <Message v-else-if="form.id_cartera" severity="warn" class="full" :closable="false">
            Esta cartera no tiene zona vinculada. Asigna día y zona en catálogo de zonas para que aparezca en la hoja
            de cobros por territorio.
          </Message>
          <div class="field-block">
            <label class="lbl" for="p-fe">Fecha inicio del préstamo</label>
            <InputText id="p-fe" v-model="form.fecha_entrega" type="date" fluid />
            <small class="hint-text">
              Si la cartera tiene día de cobro, esta fecha se ajusta al próximo día coincidente (puedes cambiarla
              manualmente).
            </small>
          </div>
          <div class="field-block">
            <label class="lbl" for="p-fv-calc">Fecha fin (calculada)</label>
            <InputText id="p-fv-calc" :model-value="fechaVencimientoCalculada" readonly fluid />
            <small class="hint-text">Se recalcula automáticamente al cambiar forma de pago, plazo o fecha inicio.</small>
          </div>
          <div class="field-block">
            <label class="lbl" for="p-pr">Producto</label>
            <InputText id="p-pr" v-model="form.producto" fluid />
          </div>
        </template>

        <template v-if="wizardStep === 4">
          <div v-if="clienteCalculoDetalle" class="full sim-client-box">
            <div class="sim-client-title">Datos del cliente para este cálculo</div>
            <div class="sim-client-header">
              {{ clienteCalculoDetalle.nombre || 'N/A' }}
              <span class="sim-client-header-sep">•</span>
              {{ clienteCalculoDetalle.dni || 'N/A' }}
            </div>
            <div class="sim-client-grid">
              <div class="sim-client-item">
                <span class="sim-client-label">Teléfono</span>
                <span class="sim-client-value">{{ clienteCalculoDetalle.telefono || 'N/A' }}</span>
              </div>
              <div class="sim-client-item sim-client-item-full">
                <span class="sim-client-label">Actividad económica</span>
                <span class="sim-client-value sim-client-value-multiline">{{
                  clienteCalculoDetalle.actividad_economica?.trim() || 'N/A'
                }}</span>
              </div>
              <div class="sim-client-item sim-client-item-full">
                <span class="sim-client-label">Dir. residencia</span>
                <span class="sim-client-value sim-client-value-multiline">{{
                  clienteCalculoDetalle.direccion_residencia?.trim() || 'N/A'
                }}</span>
              </div>
              <div class="sim-client-item sim-client-item-full">
                <span class="sim-client-label">Dir. negocio</span>
                <span class="sim-client-value sim-client-value-multiline">{{
                  clienteCalculoDetalle.direccion_negocio?.trim() || 'N/A'
                }}</span>
              </div>
              <div class="sim-client-item sim-client-item-full">
                <span class="sim-client-label">Referencia</span>
                <span class="sim-client-value sim-client-value-multiline">{{
                  clienteCalculoDetalle.referencia?.trim() || 'N/A'
                }}</span>
              </div>
            </div>
          </div>
          <div class="full sim-actions">
          <Button
            :label="simulacionNotice ? 'Recalcular préstamo' : 'Calcular préstamo'"
            icon="pi pi-calculator"
            severity="secondary"
            :loading="simulating"
            :disabled="form.monto == null || form.tasa_interes == null || form.plazo <= 0"
            @click="simulate"
          />
          <Button
            label="Imprimir cálculo"
            icon="pi pi-print"
            severity="contrast"
            outlined
            :disabled="!simulacion"
            @click="printCalculo"
          />
          </div>
          <Message v-if="simulacionError" class="full" severity="error" :closable="false">
            {{ simulacionError }}
          </Message>
          <Message v-if="simulacionNotice" class="full" severity="warn" :closable="false">
            {{ simulacionNotice }}
          </Message>
          <div v-if="simulacion" class="full sim-box">
            <div class="sim-grid">
              <div><strong>Tasa usada:</strong> {{ simulacion.tasa_interes.toFixed(2) }}% ({{ simulacion.forma_pago }})</div>
              <div><strong>Tasa anual efectiva:</strong> {{ simulacion.tasa_anual.toFixed(2) }}%</div>
              <div><strong>Cuota:</strong> {{ formatMoney(simulacion.cuota_periodica) }}</div>
              <div><strong>Interés total:</strong> {{ formatMoney(simulacion.total_interes) }}</div>
              <div><strong>Comisión:</strong> {{ formatMoney(simulacion.comision_monto) }}</div>
              <div><strong>Total a pagar:</strong> {{ formatMoney(simulacion.total_pagar) }}</div>
            </div>
            <DataTable
              :value="simulacion.amortizacion"
              size="small"
              paginator
              :rows="10"
              responsive-layout="scroll"
              class="sim-table"
            >
              <Column field="periodo" header="Periodo" style="width: 6rem" />
              <Column header="Cuota">
                <template #body="{ data }">{{ formatMoney(data.cuota) }}</template>
              </Column>
              <Column header="Capital">
                <template #body="{ data }">{{ formatMoney(data.capital) }}</template>
              </Column>
              <Column header="Interés">
                <template #body="{ data }">{{ formatMoney(data.interes) }}</template>
              </Column>
              <Column header="Saldo">
                <template #body="{ data }">{{ formatMoney(data.saldo) }}</template>
              </Column>
            </DataTable>
          </div>
        </template>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button
          v-if="wizardStep > 1"
          label="Anterior"
          icon="pi pi-angle-left"
          severity="secondary"
          outlined
          @click="goToPreviousStep"
        />
        <Button
          v-if="wizardStep < totalWizardSteps"
          label="Siguiente"
          icon="pi pi-angle-right"
          icon-pos="right"
          :disabled="!canGoNext"
          @click="goToNextStep"
        />
        <Button
          v-if="wizardStep === totalWizardSteps"
          label="Guardar"
          icon="pi pi-check"
          :loading="saving"
          :disabled="!canSave"
          @click="save"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="nuevoClienteDialogVisible"
      header="Registrar cliente"
      modal
      :style="{ width: 'min(32rem, 95vw)' }"
      append-to="body"
    >
      <form class="nuevo-cliente-form" @submit.prevent="guardarNuevoCliente">
        <div class="nuevo-cliente-field">
          <label for="np-cli-nombre">Nombre</label>
          <InputText id="np-cli-nombre" v-model="nuevoClienteForm.nombre" fluid autocomplete="name" />
        </div>
        <div class="nuevo-cliente-field">
          <label for="np-cli-dni">DNI</label>
          <InputText id="np-cli-dni" v-model="nuevoClienteForm.dni" fluid autocomplete="off" />
        </div>
        <div class="nuevo-cliente-field">
          <label for="np-cli-tel">Teléfono</label>
          <InputText id="np-cli-tel" v-model="nuevoClienteForm.telefono" fluid type="tel" autocomplete="tel" />
        </div>
        <div class="nuevo-cliente-field">
          <label for="np-cli-dia">Día de cobro semanal</label>
          <Select
            id="np-cli-dia"
            v-model="nuevoClienteForm.dia_cobro_semanal"
            :options="diasCobroOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>
        <div class="nuevo-cliente-field">
          <label for="np-cli-dir">Dirección residencia</label>
          <InputText
            id="np-cli-dir"
            v-model="nuevoClienteForm.direccion_residencia"
            fluid
            autocomplete="street-address"
          />
        </div>
      </form>
      <template #footer>
        <Button
          label="Cancelar"
          severity="secondary"
          text
          :disabled="savingNuevoCliente"
          @click="nuevoClienteDialogVisible = false"
        />
        <Button
          label="Guardar cliente"
          icon="pi pi-check"
          :loading="savingNuevoCliente"
          @click="guardarNuevoCliente"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="nuevoAsesorDialogVisible"
      header="Registrar asesor"
      modal
      :style="{ width: 'min(32rem, 95vw)' }"
      append-to="body"
    >
      <form class="nuevo-cliente-form" @submit.prevent="guardarNuevoAsesor">
        <div class="nuevo-cliente-field">
          <label for="np-ase-nombre">Nombre</label>
          <InputText id="np-ase-nombre" v-model="nuevoAsesorForm.nombre" fluid autocomplete="name" />
        </div>
        <div class="nuevo-cliente-field">
          <label for="np-ase-correo">Correo (usuario de acceso)</label>
          <InputText id="np-ase-correo" v-model="nuevoAsesorForm.correo" fluid type="email" autocomplete="email" />
        </div>
        <div class="nuevo-cliente-field">
          <label for="np-ase-pass">Contraseña</label>
          <Password
            id="np-ase-pass"
            v-model="nuevoAsesorForm.password"
            fluid
            toggle-mask
            :feedback="false"
            :input-props="{ autocomplete: 'new-password' }"
          />
          <small class="hint-text">Mínimo 8 caracteres.</small>
        </div>
      </form>
      <template #footer>
        <Button
          label="Cancelar"
          severity="secondary"
          text
          :disabled="savingNuevoAsesor"
          @click="nuevoAsesorDialogVisible = false"
        />
        <Button
          label="Guardar asesor"
          icon="pi pi-check"
          :loading="savingNuevoAsesor"
          @click="guardarNuevoAsesor"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="nuevoCobradorDialogVisible"
      header="Registrar cobrador"
      modal
      :style="{ width: 'min(32rem, 95vw)' }"
      append-to="body"
    >
      <form class="nuevo-cliente-form" @submit.prevent="guardarNuevoCobrador">
        <div class="nuevo-cliente-field">
          <label for="np-cob-nombre">Nombre</label>
          <InputText id="np-cob-nombre" v-model="nuevoCobradorForm.nombre" fluid autocomplete="name" />
        </div>
        <div class="nuevo-cliente-field">
          <label for="np-cob-correo">Correo (usuario de acceso)</label>
          <InputText id="np-cob-correo" v-model="nuevoCobradorForm.correo" fluid type="email" autocomplete="email" />
        </div>
        <div class="nuevo-cliente-field">
          <label for="np-cob-pass">Contraseña</label>
          <Password
            id="np-cob-pass"
            v-model="nuevoCobradorForm.password"
            fluid
            toggle-mask
            :feedback="false"
            :input-props="{ autocomplete: 'new-password' }"
          />
          <small class="hint-text">Mínimo 8 caracteres.</small>
        </div>
        <div class="nuevo-cliente-field">
          <label for="np-cob-carteras">Carteras a cobrar</label>
          <MultiSelect
            id="np-cob-carteras"
            v-model="nuevoCobradorForm.carteras"
            :options="cobradorCarteraMultiOptions"
            option-label="label"
            option-value="value"
            placeholder="Selecciona una o más carteras"
            display="chip"
            fluid
            filter
            filter-placeholder="Buscar cartera..."
          />
          <small class="hint-text">Cada cartera solo puede tener un cobrador asignado.</small>
        </div>
      </form>
      <template #footer>
        <Button
          label="Cancelar"
          severity="secondary"
          text
          :disabled="savingNuevoCobrador"
          @click="nuevoCobradorDialogVisible = false"
        />
        <Button
          label="Guardar cobrador"
          icon="pi pi-check"
          :loading="savingNuevoCobrador"
          @click="guardarNuevoCobrador"
        />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.page {
  max-width: min(100%, 88rem);
  width: 100%;
}

.prestamos-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.wizard-head {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
  margin-bottom: 0.85rem;
}

.wizard-pill {
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.78rem;
  color: #64748b;
  background: #f8fafc;
}

.wizard-pill.active {
  color: #0f172a;
  border-color: #93c5fd;
  background: #eff6ff;
  font-weight: 600;
}

.cliente-select-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.cliente-select-row {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}

.cliente-select {
  flex: 1;
  min-width: 0;
}

.cliente-add-btn {
  flex-shrink: 0;
  align-self: stretch;
}

.cliente-select :deep(.p-select-label) {
  overflow: hidden;
  text-overflow: ellipsis;
}

.nuevo-cliente-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.nuevo-cliente-field label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
}

.full {
  grid-column: 1 / -1;
}

.lbl {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 0.4rem;
  color: var(--p-text-color);
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.switch-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.5rem;
}

.switch-item {
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  padding: 0.4rem 0.6rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
}

.switch-item-label {
  font-size: 0.86rem;
  color: #334155;
  font-weight: 600;
}

.form-grid :deep(input[type='date']) {
  min-height: 2.6rem;
}

.mr-1 {
  margin-right: 0.25rem;
}

.sim-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  padding-top: 0.25rem;
}

.sim-box {
  border: 1px solid var(--p-content-border-color, #dbe3ee);
  border-radius: 10px;
  padding: 1rem;
  margin-top: 0.25rem;
}

.sim-client-box {
  border: 1px solid var(--p-content-border-color, #dbe3ee);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  background: var(--p-content-background, #fff);
}

.sim-client-value-multiline {
  white-space: pre-wrap;
  word-break: break-word;
}

.sim-client-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
}

.sim-client-header {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.65rem;
}

.sim-client-header-sep {
  opacity: 0.6;
  margin: 0 0.35rem;
}

.sim-client-grid {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
}

.sim-client-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.sim-client-item-full {
  grid-column: 1 / -1;
}

.sim-client-label {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color, #6b7280);
}

.sim-client-value {
  font-size: 0.92rem;
}

.sim-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  font-size: 0.92rem;
  margin-bottom: 0.6rem;
}

.sim-table :deep(.p-datatable-table) {
  min-width: 36rem;
}

@media (max-width: 1100px) {
  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sim-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 520px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
