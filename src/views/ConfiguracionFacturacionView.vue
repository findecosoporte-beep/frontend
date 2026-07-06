<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import Button from 'primevue/button'
import Card from 'primevue/card'
import DatePicker from 'primevue/datepicker'
import Divider from 'primevue/divider'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import RtnHondurasInput from '@/components/RtnHondurasInput.vue'
import { usePermissions } from '@/composables/usePermissions'
import { invalidateConfiguracionFacturacion, setConfiguracionFacturacionCache } from '@/composables/useConfiguracionFacturacion'
import {
  esRtnHnValidoOpcional,
  mensajeRtnHnInvalido,
  normalizarRtnHn,
} from '@/utils/documentoHonduras'
import type { ConfiguracionFacturacion } from '@/types/api'

const toast = useToast()
const { canManageConfiguracion } = usePermissions()

const loading = ref(false)
const saving = ref(false)
const error = ref('')

const form = ref<ConfiguracionFacturacion>({
  id: 1,
  razon_social: '',
  nombre_comercial: '',
  rtn: '',
  direccion: '',
  ciudad: '',
  telefono: '',
  correo: '',
  cai: '',
  fecha_limite_emision: null,
  establecimiento: '001',
  punto_emision: '001',
  tipo_documento: '01',
  correlativo_desde: 1,
  correlativo_hasta: 99999999,
  correlativo_actual: 1,
  usar_numeracion_sar: false,
  formato_ticket: '58',
  aplicar_isv: false,
  porcentaje_isv: 15,
  leyenda_exento: 'Operacion exenta / no sujeta a ISV',
  leyenda_pie: 'Gracias por su preferencia',
  actualizado_en: null,
  rango_autorizado_texto: '',
  numero_ejemplo: '',
})

const fechaLimite = ref<Date | null>(null)

const formatoTicketOptions = [
  { label: 'Ticket 58 mm', value: '58' },
  { label: 'Ticket 80 mm', value: '80' },
]

const soloLectura = computed(() => !canManageConfiguracion.value)

function parseFecha(iso: string | null): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function fechaToIso(date: Date | null): string | null {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function cargar() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get<ConfiguracionFacturacion>('/configuracion/facturacion/')
    form.value = { ...data, rtn: normalizarRtnHn(data.rtn) }
    fechaLimite.value = parseFecha(data.fecha_limite_emision)
    setConfiguracionFacturacionCache(data)
  } catch (e) {
    error.value = getApiErrorMessage(e, 'No se pudo cargar la configuracion de facturacion.')
  } finally {
    loading.value = false
  }
}

async function guardar() {
  if (soloLectura.value) return
  const rtn = normalizarRtnHn(form.value.rtn)
  if (!esRtnHnValidoOpcional(rtn)) {
    error.value = mensajeRtnHnInvalido()
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = {
      ...form.value,
      rtn,
      fecha_limite_emision: fechaToIso(fechaLimite.value),
      porcentaje_isv: String(form.value.porcentaje_isv),
    }
    const { data } = await api.patch<ConfiguracionFacturacion>(
      '/configuracion/facturacion/',
      payload,
    )
    form.value = { ...data, rtn: normalizarRtnHn(data.rtn) }
    fechaLimite.value = parseFecha(data.fecha_limite_emision)
    setConfiguracionFacturacionCache(data)
    toast.add({
      severity: 'success',
      summary: 'Configuracion guardada',
      detail: 'Los datos de facturacion SAR se actualizaron correctamente.',
      life: 4000,
    })
  } catch (e) {
    error.value = getApiErrorMessage(e, 'No se pudo guardar la configuracion.')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void cargar()
})
</script>

<template>
  <div class="page-stack">
    <div class="page-header">
      <div>
        <h1 class="page-title">Facturacion SAR</h1>
      </div>
      <Button
        v-if="canManageConfiguracion"
        label="Guardar cambios"
        icon="pi pi-save"
        :loading="saving"
        :disabled="loading"
        @click="guardar"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <Message v-if="soloLectura" severity="info" :closable="false">
      Solo administradores y supervisores pueden modificar esta configuracion.
    </Message>

    <Card v-if="loading">
      <p class="muted-text">Cargando configuracion...</p>
    </Card>

    <template v-else>
      <Card>
        <template #title>Datos del emisor</template>
        <template #content>
          <div class="form-grid">
            <div class="field">
              <label for="cf-razon">Razon social</label>
              <InputText id="cf-razon" v-model="form.razon_social" fluid :disabled="soloLectura" />
            </div>
            <div class="field">
              <label for="cf-comercial">Nombre comercial</label>
              <InputText
                id="cf-comercial"
                v-model="form.nombre_comercial"
                fluid
                :disabled="soloLectura"
              />
            </div>
            <div class="field">
              <label for="cf-rtn">RTN</label>
              <RtnHondurasInput id="cf-rtn" v-model="form.rtn" :disabled="soloLectura" />
            </div>
            <div class="field">
              <label for="cf-direccion">Direccion</label>
              <InputText id="cf-direccion" v-model="form.direccion" fluid :disabled="soloLectura" />
            </div>
            <div class="field">
              <label for="cf-ciudad">Ciudad</label>
              <InputText id="cf-ciudad" v-model="form.ciudad" fluid :disabled="soloLectura" />
            </div>
            <div class="field">
              <label for="cf-telefono">Telefono</label>
              <InputText id="cf-telefono" v-model="form.telefono" fluid :disabled="soloLectura" />
            </div>
            <div class="field">
              <label for="cf-correo">Correo</label>
              <InputText id="cf-correo" v-model="form.correo" type="email" fluid :disabled="soloLectura" />
            </div>
          </div>
        </template>
      </Card>

      <Card>
        <template #title>Autorizacion SAR (CAI)</template>
        <template #content>
          <div class="form-grid">
            <div class="field span-2">
              <label for="cf-cai">CAI</label>
              <InputText id="cf-cai" v-model="form.cai" fluid :disabled="soloLectura" />
              <small class="hint-text">Codigo de Autorizacion de Impresion otorgado por SAR.</small>
            </div>
            <div class="field">
              <label for="cf-fecha-limite">Fecha limite de emision</label>
              <DatePicker
                id="cf-fecha-limite"
                v-model="fechaLimite"
                date-format="dd/mm/yy"
                show-icon
                fluid
                :disabled="soloLectura"
              />
            </div>
            <div class="field">
              <label for="cf-est">Establecimiento</label>
              <InputText id="cf-est" v-model="form.establecimiento" maxlength="3" fluid :disabled="soloLectura" />
            </div>
            <div class="field">
              <label for="cf-punto">Punto de emision</label>
              <InputText id="cf-punto" v-model="form.punto_emision" maxlength="3" fluid :disabled="soloLectura" />
            </div>
            <div class="field">
              <label for="cf-tipo">Tipo documento</label>
              <InputText id="cf-tipo" v-model="form.tipo_documento" maxlength="2" fluid :disabled="soloLectura" />
              <small class="hint-text">01 = Factura</small>
            </div>
            <div class="field">
              <label for="cf-desde">Correlativo desde</label>
              <InputNumber
                id="cf-desde"
                v-model="form.correlativo_desde"
                :min="1"
                :use-grouping="false"
                fluid
                :disabled="soloLectura"
              />
            </div>
            <div class="field">
              <label for="cf-hasta">Correlativo hasta</label>
              <InputNumber
                id="cf-hasta"
                v-model="form.correlativo_hasta"
                :min="1"
                :use-grouping="false"
                fluid
                :disabled="soloLectura"
              />
            </div>
            <div class="field">
              <label for="cf-actual">Proximo correlativo</label>
              <InputNumber
                id="cf-actual"
                v-model="form.correlativo_actual"
                :min="1"
                :use-grouping="false"
                fluid
                :disabled="soloLectura"
              />
            </div>
          </div>
          <Divider />
          <p v-if="form.rango_autorizado_texto" class="hint-text">
            <strong>Rango autorizado:</strong> {{ form.rango_autorizado_texto }}
          </p>
          <p v-if="form.numero_ejemplo" class="hint-text">
            <strong>Proxima factura:</strong> {{ form.numero_ejemplo }}
          </p>
        </template>
      </Card>

      <Card>
        <template #title>Opciones de factura</template>
        <template #content>
          <div class="form-grid">
            <div class="field switch-field">
              <label for="cf-sar">Usar numeracion SAR en cobros</label>
              <ToggleSwitch
                id="cf-sar"
                v-model="form.usar_numeracion_sar"
                :disabled="soloLectura"
              />
              <small class="hint-text">
                Al activar, cada cobro recibe numero correlativo y valida CAI y rango antes de registrar.
              </small>
            </div>
            <div class="field">
              <label for="cf-formato">Formato ticket predeterminado</label>
              <Select
                id="cf-formato"
                v-model="form.formato_ticket"
                :options="formatoTicketOptions"
                option-label="label"
                option-value="value"
                fluid
                :disabled="soloLectura"
              />
            </div>
            <div class="field switch-field">
              <label for="cf-isv">Aplicar ISV en factura</label>
              <ToggleSwitch id="cf-isv" v-model="form.aplicar_isv" :disabled="soloLectura" />
            </div>
            <div class="field">
              <label for="cf-pct-isv">Porcentaje ISV</label>
              <InputNumber
                id="cf-pct-isv"
                v-model="form.porcentaje_isv"
                mode="decimal"
                :min-fraction-digits="2"
                :max-fraction-digits="2"
                suffix=" %"
                fluid
                :disabled="soloLectura || !form.aplicar_isv"
              />
            </div>
            <div class="field span-2">
              <label for="cf-exento">Leyenda exento / no gravado</label>
              <InputText id="cf-exento" v-model="form.leyenda_exento" fluid :disabled="soloLectura" />
            </div>
            <div class="field span-2">
              <label for="cf-pie">Leyenda pie de factura</label>
              <InputText id="cf-pie" v-model="form.leyenda_pie" fluid :disabled="soloLectura" />
            </div>
          </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.page-stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 1.35rem;
}

.page-subtitle {
  margin: 0.35rem 0 0;
  color: var(--p-text-muted-color);
  max-width: 52rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field.span-2 {
  grid-column: 1 / -1;
}

.switch-field {
  grid-column: 1 / -1;
}

.hint-text {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.muted-text {
  color: var(--p-text-muted-color);
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
