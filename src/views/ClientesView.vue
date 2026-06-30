<script setup lang="ts">
import { ref } from 'vue'

import Accordion from 'primevue/accordion'
import AccordionContent from 'primevue/accordioncontent'
import AccordionHeader from 'primevue/accordionheader'
import AccordionPanel from 'primevue/accordionpanel'
import Button from 'primevue/button'
import Fieldset from 'primevue/fieldset'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { DIAS_COBRO_CARTERA_OPTIONS } from '@/constants/diasCobroCartera'
import type { Cartera, Cliente, DiaCobroCartera, UsuarioRow } from '@/types/api'

const toast = useToast()
const { canWriteClientes } = usePermissions()

const diasCobroOptions: { label: string; value: DiaCobroCartera }[] = [...DIAS_COBRO_CARTERA_OPTIONS]

const carteraForm = ref<{
  nombreCartera: string
  diaCobro: DiaCobroCartera | null
}>({
  nombreCartera: '',
  diaCobro: null,
})

const savingCartera = ref(false)

/** Panel del acordeón de registro de cliente (`null` = cerrado). */
const registroClienteAccordion = ref<string | null>(null)

const clienteForm = ref({
  nombre: '',
  dni: '',
  telefono: '',
  direccion_residencia: '',
  direccion_negocio: '',
  referencia_parentesco: '',
  referencia_telefono: '',
  referencia: '',
  actividad_economica: '',
  dia_cobro_semanal: 'lunes' as DiaCobroCartera,
})

const savingCliente = ref(false)

const asesorForm = ref({
  nombre: '',
  correo: '',
  password: '',
})

const savingAsesor = ref(false)

function emptyToNull(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

async function guardarCartera() {
  const nombre = carteraForm.value.nombreCartera.trim()
  const diaCobro = carteraForm.value.diaCobro
  if (!nombre || !diaCobro) {
    toast.add({
      severity: 'warn',
      summary: 'Datos incompletos',
      detail: 'Completa el nombre de la cartera y el día de cobro.',
      life: 4000,
    })
    return
  }
  savingCartera.value = true
  try {
    await api.post<Cartera>('/carteras/', {
      nombre,
      dia_cobro: diaCobro,
    })
    toast.add({
      severity: 'success',
      summary: 'Cartera guardada',
      detail: 'Se registró la cartera correctamente.',
      life: 3500,
    })
    carteraForm.value = { nombreCartera: '', diaCobro: null }
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo guardar',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    savingCartera.value = false
  }
}

async function guardarCliente() {
  const nombre = clienteForm.value.nombre.trim()
  const dni = clienteForm.value.dni.trim()
  if (!nombre || !dni) {
    toast.add({
      severity: 'warn',
      summary: 'Datos incompletos',
      detail: 'El nombre y el DNI son obligatorios.',
      life: 4500,
    })
    return
  }
  if (!clienteForm.value.dia_cobro_semanal) {
    toast.add({
      severity: 'warn',
      summary: 'Datos incompletos',
      detail: 'Selecciona el día de cobro semanal del cliente.',
      life: 4500,
    })
    return
  }
  savingCliente.value = true
  try {
    const payload = {
      nombre,
      dni,
      telefono: emptyToNull(clienteForm.value.telefono),
      direccion_residencia: emptyToNull(clienteForm.value.direccion_residencia),
      direccion_negocio: emptyToNull(clienteForm.value.direccion_negocio),
      referencia_parentesco: emptyToNull(clienteForm.value.referencia_parentesco),
      referencia_telefono: emptyToNull(clienteForm.value.referencia_telefono),
      referencia: emptyToNull(clienteForm.value.referencia),
      actividad_economica: emptyToNull(clienteForm.value.actividad_economica),
      dia_cobro_semanal: clienteForm.value.dia_cobro_semanal,
    }
    await api.post<Cliente>('/clientes/', payload)
    toast.add({
      severity: 'success',
      summary: 'Cliente registrado',
      detail: 'El cliente se guardó correctamente.',
      life: 3500,
    })
    clienteForm.value = {
      nombre: '',
      dni: '',
      telefono: '',
      direccion_residencia: '',
      direccion_negocio: '',
      referencia_parentesco: '',
      referencia_telefono: '',
      referencia: '',
      actividad_economica: '',
      dia_cobro_semanal: 'lunes',
    }
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo registrar',
      detail: getApiErrorMessage(e),
      life: 7000,
    })
  } finally {
    savingCliente.value = false
  }
}

async function guardarAsesor() {
  const nombre = asesorForm.value.nombre.trim()
  const correo = asesorForm.value.correo.trim().toLowerCase()
  const password = asesorForm.value.password
  if (!nombre || !correo || !password) {
    toast.add({
      severity: 'warn',
      summary: 'Datos incompletos',
      detail: 'Completa nombre, correo y contraseña (mínimo 8 caracteres).',
      life: 4500,
    })
    return
  }
  if (password.length < 8) {
    toast.add({
      severity: 'warn',
      summary: 'Contraseña corta',
      detail: 'La contraseña debe tener al menos 8 caracteres.',
      life: 4000,
    })
    return
  }
  savingAsesor.value = true
  try {
    await api.post<UsuarioRow>('/usuarios/', {
      nombre,
      correo,
      password,
    })
    toast.add({
      severity: 'success',
      summary: 'Asesor registrado',
      detail: 'Se creó la cuenta de acceso y el perfil operativo con rol asesor.',
      life: 4000,
    })
    asesorForm.value = { nombre: '', correo: '', password: '' }
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo registrar',
      detail: getApiErrorMessage(e),
      life: 7000,
    })
  } finally {
    savingAsesor.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="findeco-top-grid">
      <Fieldset legend="CREACION DE CARTERAS:" class="findeco-fieldset" :toggleable="false">
        <div class="findeco-stack">
          <FloatLabel class="findeco-field">
            <InputText id="cartera-nombre" v-model="carteraForm.nombreCartera" fluid />
            <label for="cartera-nombre">Nombre de cartera</label>
          </FloatLabel>
          <div class="findeco-field findeco-select-wrap">
            <label class="findeco-select-label" for="cartera-dia">Día de cobro</label>
            <Select
              id="cartera-dia"
              v-model="carteraForm.diaCobro"
              :options="diasCobroOptions"
              option-label="label"
              option-value="value"
              placeholder="Selecciona un día"
              fluid
              show-clear
            />
          </div>
          <div class="findeco-actions">
            <Button
              label="Guardar cartera"
              icon="pi pi-save"
              :loading="savingCartera"
              :disabled="savingCartera"
              @click="guardarCartera"
            />
          </div>
        </div>
      </Fieldset>

      <Fieldset legend="ALTA DE ASESOR:" class="findeco-fieldset" :toggleable="false">
        <Message
          v-if="!canWriteClientes"
          severity="info"
          class="asesor-msg"
          :closable="false"
        >
          Solo administradores y supervisores pueden registrar asesores.
        </Message>
        <div class="findeco-stack">
          <FloatLabel class="findeco-field">
            <InputText
              id="asesor-nombre"
              v-model="asesorForm.nombre"
              fluid
              autocomplete="name"
              :disabled="!canWriteClientes"
            />
            <label for="asesor-nombre">Nombre completo</label>
          </FloatLabel>
          <FloatLabel class="findeco-field">
            <InputText
              id="asesor-correo"
              v-model="asesorForm.correo"
              fluid
              type="email"
              autocomplete="off"
              :disabled="!canWriteClientes"
            />
            <label for="asesor-correo">Correo (usuario de acceso)</label>
          </FloatLabel>
          <div class="findeco-field findeco-password-wrap">
            <label class="findeco-select-label" for="asesor-pass">Contraseña inicial</label>
            <Password
              id="asesor-pass"
              v-model="asesorForm.password"
              fluid
              :feedback="false"
              toggle-mask
              input-class="w-full"
              :disabled="!canWriteClientes"
              :input-props="{ autocomplete: 'new-password' }"
            />
          </div>
          <p class="asesor-hint">
            El correo debe ser único: se usa para el inicio de sesión y para vincular el perfil operativo (rol asesor).
          </p>
          <div class="findeco-actions">
            <Button
              label="Guardar asesor"
              icon="pi pi-user-plus"
              :loading="savingAsesor"
              :disabled="savingAsesor || !canWriteClientes"
              @click="guardarAsesor"
            />
          </div>
        </div>
      </Fieldset>
    </div>

    <Accordion
      v-model:value="registroClienteAccordion"
      class="cliente-registro-accordion"
      expand-icon="pi pi-chevron-down"
      collapse-icon="pi pi-chevron-up"
    >
      <AccordionPanel value="registro-cliente">
        <AccordionHeader>
          <span id="cliente-registro-titulo" class="accordion-registro-titulo">
            REGISTRO DE CLIENTE
          </span>
        </AccordionHeader>
        <AccordionContent>
          <div class="accordion-registro-body" role="region" aria-labelledby="cliente-registro-titulo">
            <form class="cliente-form" @submit.prevent="guardarCliente">
              <div class="cliente-form-grid" role="presentation">
                <FloatLabel class="cliente-cell">
                  <InputText id="cli-nombre" v-model="clienteForm.nombre" fluid autocomplete="name" />
                  <label for="cli-nombre" class="lbl-mayus">Nombre</label>
                </FloatLabel>
                <FloatLabel class="cliente-cell">
                  <InputText id="cli-dni" v-model="clienteForm.dni" fluid autocomplete="off" />
                  <label for="cli-dni" class="lbl-mayus">DNI</label>
                </FloatLabel>
                <FloatLabel class="cliente-cell">
                  <InputText id="cli-tel" v-model="clienteForm.telefono" fluid type="tel" autocomplete="tel" />
                  <label for="cli-tel" class="lbl-mayus">Teléfono</label>
                </FloatLabel>
                <FloatLabel class="cliente-cell">
                  <Select
                    id="cli-dia-cobro"
                    v-model="clienteForm.dia_cobro_semanal"
                    :options="diasCobroOptions"
                    option-label="label"
                    option-value="value"
                    fluid
                  />
                  <label for="cli-dia-cobro" class="lbl-mayus">Día de cobro semanal</label>
                </FloatLabel>
                <FloatLabel class="cliente-cell">
                  <InputText id="cli-dir-res" v-model="clienteForm.direccion_residencia" fluid autocomplete="street-address" />
                  <label for="cli-dir-res" class="lbl-mayus">Dirección residencia</label>
                </FloatLabel>
                <FloatLabel class="cliente-cell span-2">
                  <InputText id="cli-dir-neg" v-model="clienteForm.direccion_negocio" fluid />
                  <label for="cli-dir-neg" class="lbl-mayus">Dirección del negocio</label>
                </FloatLabel>
                <div class="cliente-cell span-2 referencia-bloque">
                  <span class="referencia-bloque-titulo lbl-mayus">Referencia</span>
                  <Fieldset legend="Datos de la referencia" class="ref-mini-fieldset" :toggleable="false">
                    <div class="ref-mini-grid">
                      <FloatLabel class="ref-mini-cell">
                        <InputText id="cli-ref-parentesco" v-model="clienteForm.referencia_parentesco" fluid />
                        <label for="cli-ref-parentesco" class="lbl-mayus">Parentesco</label>
                      </FloatLabel>
                      <FloatLabel class="ref-mini-cell">
                        <InputText
                          id="cli-ref-tel"
                          v-model="clienteForm.referencia_telefono"
                          fluid
                          type="tel"
                          autocomplete="tel"
                        />
                        <label for="cli-ref-tel" class="lbl-mayus">Teléfono referencia</label>
                      </FloatLabel>
                    </div>
                  </Fieldset>
                  <div class="cliente-textarea-wrap ref-notas">
                    <label class="textarea-lbl lbl-mayus" for="cli-ref">Notas de referencia (opcional)</label>
                    <Textarea id="cli-ref" v-model="clienteForm.referencia" rows="2" auto-resize fluid />
                  </div>
                </div>
                <div class="cliente-cell span-2 cliente-textarea-wrap">
                  <label class="textarea-lbl lbl-mayus" for="cli-act">Actividad económica</label>
                  <Textarea id="cli-act" v-model="clienteForm.actividad_economica" rows="3" auto-resize fluid />
                </div>
              </div>
              <div class="cliente-form-actions">
                <Button
                  type="submit"
                  label="Registrar cliente"
                  icon="pi pi-user-plus"
                  :loading="savingCliente"
                  :disabled="savingCliente"
                />
              </div>
            </form>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </div>
</template>

<style scoped>
.page {
  max-width: min(100%, 88rem);
  padding: 0.5rem 0;
}

.findeco-top-grid {
  display: grid;
  gap: 1.5rem 1.25rem;
  grid-template-columns: 1fr;
  align-items: start;
}

@media (min-width: 900px) {
  .findeco-top-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.findeco-fieldset :deep(.p-fieldset-legend) {
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.02em;
  color: #0f172a;
}

.findeco-stack {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.findeco-field {
  width: 100%;
  max-width: min(100%, 28rem);
}

.findeco-select-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.findeco-select-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.02em;
}

.findeco-password-wrap :deep(.p-password),
.findeco-password-wrap :deep(.p-password-input) {
  width: 100%;
}

.findeco-actions {
  max-width: min(100%, 28rem);
}

.asesor-msg {
  margin: 0 0 0.75rem;
}

.asesor-hint {
  margin: 0;
  max-width: min(100%, 28rem);
  font-size: 0.78rem;
  line-height: 1.45;
  color: #64748b;
}

.cliente-registro-accordion {
  margin-top: 1.75rem;
}

.cliente-registro-accordion :deep(.p-accordionheader) {
  align-items: center;
  gap: 0.5rem;
  background: #e8eaef;
  border-color: #c5cad3;
  color: #0f172a;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.04em;
}

.accordion-registro-titulo {
  flex: 1;
  text-align: center;
  text-transform: uppercase;
}

.cliente-registro-accordion :deep(.p-accordioncontent-content) {
  padding: 1rem 1rem 1.25rem;
}

.accordion-registro-body {
  min-height: 0.25rem;
}

.cliente-form {
  width: 100%;
  max-width: min(100%, 52rem);
}

.cliente-form-grid {
  display: grid;
  gap: 1.25rem 1rem;
  grid-template-columns: 1fr;
  align-items: start;
}

@media (min-width: 768px) {
  .cliente-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cliente-form-grid .span-2 {
    grid-column: 1 / -1;
  }
}

.cliente-cell {
  width: 100%;
  min-width: 0;
}

.lbl-mayus {
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 600;
}

.cliente-textarea-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.textarea-lbl {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.cliente-form-actions {
  margin-top: 1.75rem;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.referencia-bloque {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.referencia-bloque-titulo {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
}

.ref-mini-fieldset :deep(.p-fieldset-legend) {
  font-weight: 700;
  font-size: 0.8125rem;
  letter-spacing: 0.02em;
  color: #334155;
  padding: 0 0.35rem;
}

.ref-mini-fieldset :deep(.p-fieldset-content) {
  padding-top: 0.5rem;
}

.ref-mini-grid {
  display: grid;
  gap: 1rem 0.75rem;
  grid-template-columns: 1fr;
}

@media (min-width: 480px) {
  .ref-mini-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.ref-mini-cell {
  width: 100%;
  min-width: 0;
}

.ref-notas {
  margin-top: 0.25rem;
}
</style>
