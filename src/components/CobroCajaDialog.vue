<script setup lang="ts">
import { computed } from 'vue'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

import AccordionPanel from '@/components/AccordionPanel.vue'
import { textoCuotaPendiente } from '@/utils/cobroResumen'
import { formatDate, formatMoney } from '@/utils/format'
import { textoCuotaDeTotal, textoTotalCuotas } from '@/utils/totalCuotasPrestamo'

export interface CobroCajaFormView {
  cliente: string
  dni: string
  numero_prestamo: string
  cuota_numero: number
  telefono: string
  direccion_residencia: string
  direccion_negocio: string
  referencia: string
  referencia_parentesco: string
  referencia_telefono: string
  monto_prestamo: number
  cuota_programada: number
  total_cuotas: number
  fecha_entrega: string
  fecha_vencimiento: string
  fecha_ultimo_pago: string
  monto_ultimo_pago: string
  cuota_pendiente_monto: number
  cuota_pendiente_programada: number
  cuota_pendiente_abonado: string
  cuotas_atrasadas: number
  cuotas_atrasadas_numeros: string
  saldo_actual: number
}

const visible = defineModel<boolean>('visible', { default: false })
const montoRecibido = defineModel<string>('montoRecibido', { default: '0' })

const props = defineProps<{
  form: CobroCajaFormView
  saving?: boolean
  error?: string
  formError?: string
  carteraBloqueada?: boolean
  canSubmit?: boolean
}>()

defineEmits<{
  confirm: []
  cancel: []
}>()

const cuotasTexto = computed(() => textoTotalCuotas(props.form.total_cuotas))
const cuotaActualTexto = computed(() =>
  textoCuotaDeTotal(props.form.cuota_numero, props.form.total_cuotas),
)

const cuotaPendienteTexto = computed(() =>
  textoCuotaPendiente({
    cuotaNumero: props.form.cuota_numero,
    montoPendiente: String(props.form.cuota_pendiente_monto),
    montoProgramado: String(props.form.cuota_pendiente_programada || props.form.cuota_programada),
    abonado: props.form.cuota_pendiente_abonado,
    cuotasAtrasadas: props.form.cuotas_atrasadas,
    cuotasAtrasadasNumeros: props.form.cuotas_atrasadas_numeros,
  }),
)

const ultimoPagoTexto = computed(() => {
  if (!props.form.fecha_ultimo_pago?.trim()) return 'Sin pagos registrados'
  const monto = props.form.monto_ultimo_pago?.trim()
  return monto
    ? `${formatDate(props.form.fecha_ultimo_pago)} · L ${formatMoney(monto)}`
    : formatDate(props.form.fecha_ultimo_pago)
})

const tieneContactoCliente = computed(
  () =>
    props.form.telefono.trim() ||
    props.form.direccion_residencia.trim() ||
    props.form.direccion_negocio.trim() ||
    props.form.referencia.trim(),
)

function fmtMonto(value: number): string {
  return `L ${formatMoney(value)}`
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    header="Registrar cobro"
    modal
    class="cobro-caja-dialog"
    :style="{ width: 'min(28rem, 95vw)' }"
    :draggable="false"
    @hide="$emit('cancel')"
  >
    <div class="cobro-caja-wrap">
      <div class="cobro-caja-hero">
        <span class="cobro-caja-avatar" aria-hidden="true">
          <i class="pi pi-user" />
        </span>
        <div class="cobro-caja-hero-text">
          <h2 class="cobro-caja-name">{{ form.cliente }}</h2>
          <p class="cobro-caja-subtitle">Préstamo {{ form.numero_prestamo }} · {{ cuotaActualTexto }}</p>
          <p v-if="form.total_cuotas > 0" class="cobro-caja-cuotas">Debe pagar {{ cuotasTexto }}</p>
        </div>
      </div>

      <AccordionPanel title="Datos del cliente" icon="pi pi-user" :default-open="false">
        <div class="cobro-detail-row">
          <span>Nombre</span>
          <strong>{{ form.cliente }}</strong>
        </div>
        <div v-if="form.dni" class="cobro-detail-row">
          <span>DNI</span>
          <strong>{{ form.dni }}</strong>
        </div>
        <div v-if="form.telefono.trim()" class="cobro-detail-row">
          <span>Teléfono</span>
          <strong>{{ form.telefono.trim() }}</strong>
        </div>
        <div v-if="form.direccion_residencia.trim()" class="cobro-detail-row">
          <span>Dirección</span>
          <strong>{{ form.direccion_residencia.trim() }}</strong>
        </div>
        <div v-if="form.direccion_negocio.trim()" class="cobro-detail-row">
          <span>Negocio</span>
          <strong>{{ form.direccion_negocio.trim() }}</strong>
        </div>
        <div v-if="form.referencia.trim()" class="cobro-detail-row">
          <span>Referencia</span>
          <strong>
            {{ form.referencia.trim() }}
            <template v-if="form.referencia_parentesco.trim()">
              ({{ form.referencia_parentesco.trim() }})
            </template>
          </strong>
        </div>
        <div v-if="form.referencia_telefono.trim()" class="cobro-detail-row">
          <span>Tel. referencia</span>
          <strong>{{ form.referencia_telefono.trim() }}</strong>
        </div>
        <p v-if="!tieneContactoCliente" class="cobro-sin-datos">Sin datos de contacto del cliente.</p>
      </AccordionPanel>

      <AccordionPanel title="Datos del préstamo" icon="pi pi-file" :default-open="false">
        <div class="cobro-detail-row">
          <span>Préstamo</span>
          <strong>{{ form.numero_prestamo }}</strong>
        </div>
        <div class="cobro-detail-row">
          <span>Monto</span>
          <strong>{{ fmtMonto(form.monto_prestamo) }}</strong>
        </div>
        <div class="cobro-detail-row">
          <span>Cuotas</span>
          <strong>{{ cuotasTexto }}</strong>
        </div>
        <div class="cobro-detail-row">
          <span>Cuota</span>
          <strong>{{ fmtMonto(form.cuota_programada) }}</strong>
        </div>
        <div class="cobro-detail-row">
          <span>Fecha inicial</span>
          <strong>{{ formatDate(form.fecha_entrega) }}</strong>
        </div>
        <div class="cobro-detail-row">
          <span>Fecha final</span>
          <strong>{{ formatDate(form.fecha_vencimiento) }}</strong>
        </div>
        <div class="cobro-detail-row">
          <span>Último pago</span>
          <strong>{{ ultimoPagoTexto }}</strong>
        </div>
        <div class="cobro-detail-row cobro-detail-row--highlight">
          <span>Cuota pendiente</span>
          <strong>{{ cuotaPendienteTexto }}</strong>
        </div>
        <div class="cobro-detail-row cobro-detail-row--highlight">
          <span>Saldo pendiente</span>
          <strong>{{ fmtMonto(form.saldo_actual) }}</strong>
        </div>
      </AccordionPanel>

      <div class="cobro-caja-input-section">
        <label class="cobro-caja-input-label" for="cobro-monto-recibido">Monto recibido</label>
        <div class="cobro-caja-input-row">
          <i class="pi pi-wallet" aria-hidden="true" />
          <input
            id="cobro-monto-recibido"
            v-model="montoRecibido"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            autocomplete="off"
          />
        </div>
      </div>

      <p v-if="carteraBloqueada" class="cobro-caja-error">
        No puede cobrar: el préstamo no pertenece a una cartera asignada a su usuario.
      </p>
      <p v-if="formError" class="cobro-caja-error">{{ formError }}</p>
      <p v-if="error" class="cobro-caja-error">{{ error }}</p>

      <Button
        label="Confirmar cobro"
        icon="pi pi-check-circle"
        class="cobro-caja-submit"
        :loading="saving"
        :disabled="!canSubmit || saving || carteraBloqueada"
        @click="$emit('confirm')"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.cobro-caja-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.cobro-caja-hero {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem;
  margin-bottom: 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.875rem;
  background: #fff;
  box-shadow: 0 1px 3px rgb(15 23 42 / 8%);
}

.cobro-caja-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  background: #ecfdf5;
  color: #0f172a;
  font-size: 1.25rem;
}

.cobro-caja-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
}

.cobro-caja-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  color: #475569;
}

.cobro-caja-cuotas {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #0f172a;
}

.cobro-detail-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.82rem;
  color: #475569;
}

.cobro-detail-row strong {
  max-width: 58%;
  text-align: right;
  color: #0f172a;
  font-weight: 600;
}

.cobro-detail-row--highlight strong {
  font-weight: 700;
  color: #0f172a;
}

.cobro-sin-datos {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
}

.cobro-caja-input-section {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e2e8f0;
}

.cobro-caja-input-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
}

.cobro-caja-input-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  background: #fff;
}

.cobro-caja-input-row i {
  color: #64748b;
}

.cobro-caja-input-row input {
  flex: 1;
  border: 0;
  outline: none;
  font-size: 1.35rem;
  font-weight: 700;
  color: #0f172a;
  background: transparent;
}

.cobro-caja-error {
  margin: 0.5rem 0 0;
  padding: 0.55rem 0.65rem;
  border-radius: 0.5rem;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 0.82rem;
}

.cobro-caja-submit {
  margin-top: 0.75rem;
  width: 100%;
  justify-content: center;
}

:deep(.cobro-caja-dialog .p-dialog-content) {
  padding-top: 0.35rem;
}
</style>
