<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Fieldset from 'primevue/fieldset'
import FloatLabel from 'primevue/floatlabel'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { DIAS_COBRO_CARTERA_OPTIONS } from '@/constants/diasCobroCartera'
import { usePermissions } from '@/composables/usePermissions'
import type { Cliente, DiaCobroCartera, Paginated } from '@/types/api'

const toast = useToast()
const { canWriteClientes } = usePermissions()

const diasCobroOptions: { label: string; value: DiaCobroCartera }[] = [...DIAS_COBRO_CARTERA_OPTIONS]

const rows = ref<Cliente[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
/** Alineado con MAX_PAGE_SIZE del API */
const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100]
const loading = ref(false)
const error = ref('')

const first = computed(() => (page.value - 1) * pageSize.value)

const editDialogVisible = ref(false)
const savingEdit = ref(false)
const editForm = ref({
  id_cliente: 0,
  nombre: '',
  dni: '',
  telefono: '',
  direccion_residencia: '',
  direccion_negocio: '',
  referencia_parentesco: '',
  referencia_telefono: '',
  referencia: '',
  actividad_economica: '',
  dia_cobro_semanal: null as DiaCobroCartera | null,
})

function etiquetaDiaCobro(v: DiaCobroCartera | null): string {
  if (!v) return '—'
  return diasCobroOptions.find((o) => o.value === v)?.label ?? v
}

function textoCampo(data: Cliente, key: keyof Cliente): string {
  const v = data[key]
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return String(v)
  if (key === 'dia_cobro_semanal') return etiquetaDiaCobro(v as DiaCobroCartera | null)
  if (typeof v !== 'string') return '—'
  const t = v.trim()
  return t === '' ? '—' : t
}
function nullToEmpty(s: string | null | undefined): string {
  return s == null ? '' : String(s)
}

function emptyToNull(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

function abrirEditar(data: Cliente) {
  editForm.value = {
    id_cliente: data.id_cliente,
    nombre: nullToEmpty(data.nombre),
    dni: nullToEmpty(data.dni),
    telefono: nullToEmpty(data.telefono),
    direccion_residencia: nullToEmpty(data.direccion_residencia),
    direccion_negocio: nullToEmpty(data.direccion_negocio),
    referencia_parentesco: nullToEmpty(data.referencia_parentesco),
    referencia_telefono: nullToEmpty(data.referencia_telefono),
    referencia: nullToEmpty(data.referencia),
    actividad_economica: nullToEmpty(data.actividad_economica),
    dia_cobro_semanal: data.dia_cobro_semanal ?? null,
  }
  editDialogVisible.value = true
}

function cerrarEditar() {
  editDialogVisible.value = false
}

async function guardarEdicion() {
  const nombre = editForm.value.nombre.trim()
  const dni = editForm.value.dni.trim()
  const id = editForm.value.id_cliente
  if (!nombre || !dni || !id) {
    toast.add({
      severity: 'warn',
      summary: 'Datos incompletos',
      detail: 'El nombre y el DNI son obligatorios.',
      life: 4500,
    })
    return
  }
  if (!editForm.value.dia_cobro_semanal) {
    toast.add({
      severity: 'warn',
      summary: 'Datos incompletos',
      detail: 'Selecciona el día de cobro semanal del cliente.',
      life: 4500,
    })
    return
  }
  savingEdit.value = true
  try {
    const payload = {
      nombre,
      dni,
      telefono: emptyToNull(editForm.value.telefono),
      direccion_residencia: emptyToNull(editForm.value.direccion_residencia),
      direccion_negocio: emptyToNull(editForm.value.direccion_negocio),
      referencia_parentesco: emptyToNull(editForm.value.referencia_parentesco),
      referencia_telefono: emptyToNull(editForm.value.referencia_telefono),
      referencia: emptyToNull(editForm.value.referencia),
      actividad_economica: emptyToNull(editForm.value.actividad_economica),
      dia_cobro_semanal: editForm.value.dia_cobro_semanal,
    }
    const { data } = await api.patch<Cliente>(`/clientes/${id}/`, payload)
    const idx = rows.value.findIndex((r) => r.id_cliente === id)
    if (idx >= 0) rows.value[idx] = data
    toast.add({
      severity: 'success',
      summary: 'Cliente actualizado',
      detail: 'Los cambios se guardaron correctamente.',
      life: 3500,
    })
    cerrarEditar()
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo guardar',
      detail: getApiErrorMessage(e),
      life: 7000,
    })
  } finally {
    savingEdit.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      page_size: String(pageSize.value),
    })
    const { data } = await api.get<Paginated<Cliente>>(`/clientes/?${params.toString()}`)
    total.value = data.count
    rows.value = data.results
    if (typeof data.page === 'number') page.value = data.page
  } catch (e) {
    error.value = getApiErrorMessage(e)
  } finally {
    loading.value = false
  }
}

function onPage(e: { page: number; first: number; rows: number }) {
  if (loading.value) return
  pageSize.value = e.rows
  page.value = Math.floor(e.first / e.rows) + 1
  void load()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page page-twelve-col">
    <h1 class="title span-full">Ver Clientes Findeco</h1>
    <div class="span-full acciones">
      <Button label="Actualizar tabla" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="load" />
    </div>

    <Message v-if="error" severity="error" class="msg span-full" :closable="false">{{ error }}</Message>

    <div class="panel-tabla tabla-width-full">
      <DataTable
        class="datatable-clientes"
        :value="rows"
        lazy
        paginator
        :first="first"
        :rows="pageSize"
        :rows-per-page-options="ROWS_PER_PAGE_OPTIONS"
        :total-records="total"
        responsive-layout="scroll"
        striped-rows
        :loading="loading"
        data-key="id_cliente"
        @page="onPage"
      >
        <Column field="id_cliente" header="ID" :style="{ width: '6rem' }" />
        <Column header="Nombre" :style="{ minWidth: '18rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ textoCampo(data, 'nombre') }}
          </template>
        </Column>
        <Column header="DNI" :style="{ minWidth: '11rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ textoCampo(data, 'dni') }}
          </template>
        </Column>
        <Column header="Día cobro" :style="{ minWidth: '9rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ etiquetaDiaCobro(data.dia_cobro_semanal) }}
          </template>
        </Column>
        <Column header="Teléfono" :style="{ minWidth: '10rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ textoCampo(data, 'telefono') }}
          </template>
        </Column>
        <Column header="Dirección residencia" :style="{ minWidth: '16rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ textoCampo(data, 'direccion_residencia') }}
          </template>
        </Column>
        <Column header="Dirección negocio" :style="{ minWidth: '16rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ textoCampo(data, 'direccion_negocio') }}
          </template>
        </Column>
        <Column header="Parentesco referencia" :style="{ minWidth: '13rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ textoCampo(data, 'referencia_parentesco') }}
          </template>
        </Column>
        <Column header="Tel. referencia" :style="{ minWidth: '11rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ textoCampo(data, 'referencia_telefono') }}
          </template>
        </Column>
        <Column header="Notas referencia" :style="{ minWidth: '18rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ textoCampo(data, 'referencia') }}
          </template>
        </Column>
        <Column header="Actividad económica" :style="{ minWidth: '16rem' }">
          <template #body="{ data }: { data: Cliente }">
            {{ textoCampo(data, 'actividad_economica') }}
          </template>
        </Column>
        <Column
          v-if="canWriteClientes"
          header="Acciones"
          :exportable="false"
          :style="{ width: '5.5rem' }"
        >
          <template #body="{ data }: { data: Cliente }">
            <Button
              icon="pi pi-pencil"
              rounded
              text
              severity="secondary"
              title="Editar cliente"
              :aria-label="`Editar cliente ${data.nombre}`"
              @click="abrirEditar(data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog
      v-model:visible="editDialogVisible"
      modal
      header="Editar cliente"
      class="dialog-editar-cliente"
      :style="{ width: 'min(100vw - 2rem, 40rem)' }"
      :breakpoints="{ '960px': '95vw' }"
      @hide="cerrarEditar"
    >
      <form class="cliente-edit-form" @submit.prevent="guardarEdicion">
        <div class="cliente-edit-grid">
          <FloatLabel class="cliente-edit-cell">
            <InputText id="edit-cli-nombre" v-model="editForm.nombre" fluid autocomplete="name" />
            <label for="edit-cli-nombre" class="lbl-mayus">Nombre</label>
          </FloatLabel>
          <FloatLabel class="cliente-edit-cell">
            <InputText id="edit-cli-dni" v-model="editForm.dni" fluid autocomplete="off" />
            <label for="edit-cli-dni" class="lbl-mayus">DNI</label>
          </FloatLabel>
          <FloatLabel class="cliente-edit-cell">
            <InputText id="edit-cli-tel" v-model="editForm.telefono" fluid type="tel" autocomplete="tel" />
            <label for="edit-cli-tel" class="lbl-mayus">Teléfono</label>
          </FloatLabel>
          <FloatLabel class="cliente-edit-cell">
            <Select
              id="edit-cli-dia-cobro"
              v-model="editForm.dia_cobro_semanal"
              :options="diasCobroOptions"
              option-label="label"
              option-value="value"
              fluid
            />
            <label for="edit-cli-dia-cobro" class="lbl-mayus">Día de cobro semanal</label>
          </FloatLabel>
          <FloatLabel class="cliente-edit-cell">
            <InputText id="edit-cli-dir-res" v-model="editForm.direccion_residencia" fluid autocomplete="street-address" />
            <label for="edit-cli-dir-res" class="lbl-mayus">Dirección residencia</label>
          </FloatLabel>
          <FloatLabel class="cliente-edit-cell span-2">
            <InputText id="edit-cli-dir-neg" v-model="editForm.direccion_negocio" fluid />
            <label for="edit-cli-dir-neg" class="lbl-mayus">Dirección del negocio</label>
          </FloatLabel>
          <div class="cliente-edit-cell span-2 referencia-bloque">
            <span class="referencia-bloque-titulo lbl-mayus">Referencia</span>
            <Fieldset legend="Datos de la referencia" class="ref-mini-fieldset" :toggleable="false">
              <div class="ref-mini-grid">
                <FloatLabel class="ref-mini-cell">
                  <InputText id="edit-cli-ref-parentesco" v-model="editForm.referencia_parentesco" fluid />
                  <label for="edit-cli-ref-parentesco" class="lbl-mayus">Parentesco</label>
                </FloatLabel>
                <FloatLabel class="ref-mini-cell">
                  <InputText
                    id="edit-cli-ref-tel"
                    v-model="editForm.referencia_telefono"
                    fluid
                    type="tel"
                    autocomplete="tel"
                  />
                  <label for="edit-cli-ref-tel" class="lbl-mayus">Teléfono referencia</label>
                </FloatLabel>
              </div>
            </Fieldset>
            <div class="cliente-textarea-wrap ref-notas">
              <label class="textarea-lbl lbl-mayus" for="edit-cli-ref">Notas de referencia (opcional)</label>
              <Textarea id="edit-cli-ref" v-model="editForm.referencia" rows="2" auto-resize fluid />
            </div>
          </div>
          <div class="cliente-edit-cell span-2 cliente-textarea-wrap">
            <label class="textarea-lbl lbl-mayus" for="edit-cli-act">Actividad económica</label>
            <Textarea id="edit-cli-act" v-model="editForm.actividad_economica" rows="3" auto-resize fluid />
          </div>
        </div>
        <div class="cliente-edit-actions">
          <Button type="button" label="Cancelar" severity="secondary" outlined :disabled="savingEdit" @click="cerrarEditar" />
          <Button type="submit" label="Guardar cambios" icon="pi pi-check" :loading="savingEdit" :disabled="savingEdit" />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
/* Grid de 12 columnas; la tabla usa ancho completo. */
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

.title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.msg {
  margin: 0;
}

.acciones {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 0.25rem;
}

.estado {
  margin: 0;
  padding: 1rem 0;
  color: #64748b;
  font-size: 0.95rem;
}

.panel-tabla {
  min-width: 0;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}

.tabla-width-full {
  grid-column: 1 / -1;
}

.datatable-clientes :deep(table) {
  width: 100%;
}

.datatable-clientes :deep(thead > tr > th),
.datatable-clientes :deep(tbody > tr > td) {
  white-space: nowrap;
  vertical-align: top;
}

.datatable-clientes :deep(.p-datatable-wrapper) {
  border-radius: 0.45rem;
}

.cliente-edit-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.cliente-edit-grid {
  display: grid;
  gap: 1.1rem 0.85rem;
  grid-template-columns: 1fr;
  align-items: start;
}

@media (min-width: 640px) {
  .cliente-edit-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cliente-edit-grid .span-2 {
    grid-column: 1 / -1;
  }
}

.cliente-edit-cell {
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

.cliente-edit-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.25rem;
}
</style>
