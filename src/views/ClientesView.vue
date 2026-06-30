<script setup lang="ts">
import { onMounted, ref } from 'vue'

import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
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
import { usePermissions } from '@/composables/usePermissions'
import { DIAS_COBRO_CARTERA_OPTIONS } from '@/constants/diasCobroCartera'
import type { Cartera, Cliente, DiaCobroCartera, Paginated } from '@/types/api'

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

const carteras = ref<Cartera[]>([])
const loadingCarteras = ref(false)
const errorCarteras = ref('')

const diaCobroLabel = Object.fromEntries(
  DIAS_COBRO_CARTERA_OPTIONS.map((o) => [o.value, o.label]),
) as Record<DiaCobroCartera, string>

function etiquetaDiaCobro(dia: DiaCobroCartera): string {
  return diaCobroLabel[dia] ?? dia
}

async function cargarCarteras() {
  loadingCarteras.value = true
  errorCarteras.value = ''
  try {
    const { data } = await api.get<Paginated<Cartera>>('/carteras/?page_size=100')
    carteras.value = data.results
  } catch (e) {
    errorCarteras.value = getApiErrorMessage(e)
    carteras.value = []
  } finally {
    loadingCarteras.value = false
  }
}

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

interface ClienteImportError {
  fila: number
  dni: string
  mensaje: string
}

interface ClienteImportResult {
  creados: number
  actualizados: number
  omitidos: number
  errores: ClienteImportError[]
}

const excelFileInput = ref<HTMLInputElement | null>(null)
const importingClientes = ref(false)
const exportingClientes = ref(false)
const descargandoPlantilla = ref(false)
const importDialogVisible = ref(false)
const importResultVisible = ref(false)
const importActualizarExistentes = ref(false)
const importArchivoPendiente = ref<File | null>(null)
const importResultado = ref<ClienteImportResult | null>(null)

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombre
  link.click()
  URL.revokeObjectURL(url)
}

async function descargarPlantillaClientes() {
  descargandoPlantilla.value = true
  try {
    const { data } = await api.get<Blob>('/clientes/plantilla-excel/', { responseType: 'blob' })
    descargarBlob(data, 'plantilla_clientes_findeco.xlsx')
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo descargar',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    descargandoPlantilla.value = false
  }
}

async function exportarClientesExcel() {
  exportingClientes.value = true
  try {
    const { data } = await api.get<Blob>('/clientes/exportar-excel/', { responseType: 'blob' })
    descargarBlob(data, 'clientes_findeco.xlsx')
    toast.add({
      severity: 'success',
      summary: 'Exportación lista',
      detail: 'Se descargó el archivo Excel con los clientes.',
      life: 3500,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo exportar',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    exportingClientes.value = false
  }
}

function abrirSelectorImportarClientes() {
  if (!canWriteClientes.value) return
  importArchivoPendiente.value = null
  importActualizarExistentes.value = false
  excelFileInput.value?.click()
}

function onExcelClientesSeleccionado(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    toast.add({
      severity: 'warn',
      summary: 'Archivo no válido',
      detail: 'Selecciona un archivo Excel (.xlsx).',
      life: 4500,
    })
    return
  }
  importArchivoPendiente.value = file
  importDialogVisible.value = true
}

function cerrarDialogoImportar() {
  importDialogVisible.value = false
  importArchivoPendiente.value = null
}

async function confirmarImportarClientes() {
  const file = importArchivoPendiente.value
  if (!file) return
  importingClientes.value = true
  try {
    const formData = new FormData()
    formData.append('archivo', file)
    formData.append('actualizar_existentes', importActualizarExistentes.value ? 'true' : 'false')
    const { data } = await api.post<ClienteImportResult>('/clientes/importar-excel/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    importResultado.value = data
    importResultVisible.value = true
    cerrarDialogoImportar()
    const totalOk = data.creados + data.actualizados
    toast.add({
      severity: data.errores.length > 0 ? 'warn' : 'success',
      summary: 'Importación finalizada',
      detail: `${totalOk} cliente(s) procesado(s) correctamente.`,
      life: 5000,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo importar',
      detail: getApiErrorMessage(e),
      life: 7000,
    })
  } finally {
    importingClientes.value = false
  }
}

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
    await cargarCarteras()
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

onMounted(() => void cargarCarteras())
</script>

<template>
  <div class="page">
    <Fieldset legend="CREACION DE CARTERAS:" class="findeco-fieldset carteras-section" :toggleable="false">
      <div class="carteras-layout">
        <div class="carteras-form-row">
          <FloatLabel class="carteras-form-field">
            <InputText id="cartera-nombre" v-model="carteraForm.nombreCartera" fluid />
            <label for="cartera-nombre">Nombre de cartera</label>
          </FloatLabel>
          <div class="carteras-form-field findeco-select-wrap">
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
          <div class="carteras-form-actions">
            <Button
              label="Guardar cartera"
              icon="pi pi-save"
              :loading="savingCartera"
              :disabled="savingCartera"
              @click="guardarCartera"
            />
          </div>
        </div>

        <Message v-if="errorCarteras" severity="error" class="carteras-error" :closable="false">
          {{ errorCarteras }}
        </Message>

        <DataTable
          :value="carteras"
          :loading="loadingCarteras"
          data-key="id_cartera"
          striped-rows
          class="carteras-table"
          empty-message="No hay carteras registradas."
        >
          <Column field="id_cartera" header="ID" style="width: 5rem" />
          <Column field="nombre" header="Nombre de cartera" />
          <Column header="Día de cobro" style="width: 10rem">
            <template #body="{ data }">
              {{ etiquetaDiaCobro(data.dia_cobro) }}
            </template>
          </Column>
        </DataTable>
      </div>
    </Fieldset>

    <Fieldset
      legend="CARGA DE CLIENTES DESDE EXCEL:"
      class="findeco-fieldset excel-section"
      :toggleable="false"
    >
      <div class="excel-layout">
        <p class="excel-hint">
          Carga masiva desde Excel (.xlsx). Obligatorios: <strong>Nombre</strong> y <strong>DNI</strong>.
        </p>
        <div class="excel-actions">
          <Button
            label="Plantilla Excel"
            icon="pi pi-file-excel"
            severity="secondary"
            outlined
            :loading="descargandoPlantilla"
            @click="descargarPlantillaClientes"
          />
          <Button
            label="Exportar clientes"
            icon="pi pi-download"
            severity="secondary"
            outlined
            :loading="exportingClientes"
            @click="exportarClientesExcel"
          />
          <Button
            v-if="canWriteClientes"
            label="Importar desde Excel"
            icon="pi pi-upload"
            :loading="importingClientes"
            @click="abrirSelectorImportarClientes"
          />
        </div>
        <Message v-if="!canWriteClientes" severity="info" :closable="false">
          Solo administradores y supervisores pueden importar clientes desde Excel.
        </Message>
        <input
          ref="excelFileInput"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          class="excel-input"
          @change="onExcelClientesSeleccionado"
        />
      </div>
    </Fieldset>

    <Fieldset legend="REGISTRO DE CLIENTE:" class="findeco-fieldset cliente-section" :toggleable="false">
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
              <Textarea id="cli-ref" v-model="clienteForm.referencia" rows="2" fluid />
            </div>
          </div>
          <div class="cliente-cell span-2 cliente-textarea-wrap">
            <label class="textarea-lbl lbl-mayus" for="cli-act">Actividad económica</label>
            <Textarea id="cli-act" v-model="clienteForm.actividad_economica" rows="3" fluid />
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
    </Fieldset>

    <Dialog
      v-model:visible="importDialogVisible"
      header="Importar clientes desde Excel"
      modal
      :style="{ width: 'min(96vw, 26rem)' }"
      @hide="cerrarDialogoImportar"
    >
      <div class="import-dialog-body">
        <p v-if="importArchivoPendiente" class="import-archivo-nombre">
          Archivo: <strong>{{ importArchivoPendiente.name }}</strong>
        </p>
        <div class="import-checkbox-row">
          <Checkbox v-model="importActualizarExistentes" input-id="import-actualizar" :binary="true" />
          <label for="import-actualizar">Actualizar clientes si el DNI ya existe</label>
        </div>
        <p class="import-nota">
          Si no marcas la opción, las filas con DNI duplicado se omitirán y se reportarán al finalizar.
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="cerrarDialogoImportar" />
        <Button
          label="Importar"
          icon="pi pi-upload"
          :loading="importingClientes"
          :disabled="!importArchivoPendiente"
          @click="confirmarImportarClientes"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="importResultVisible"
      header="Resultado de la importación"
      modal
      :style="{ width: 'min(96vw, 36rem)' }"
    >
      <div v-if="importResultado" class="import-resultado">
        <div class="import-resultado-resumen">
          <span><strong>{{ importResultado.creados }}</strong> creado(s)</span>
          <span><strong>{{ importResultado.actualizados }}</strong> actualizado(s)</span>
          <span><strong>{{ importResultado.omitidos }}</strong> omitido(s)</span>
        </div>
        <Message
          v-if="importResultado.errores.length === 0"
          severity="success"
          :closable="false"
        >
          Todos los registros válidos se importaron sin incidencias.
        </Message>
        <div v-else class="import-errores">
          <p class="import-errores-titulo">Incidencias ({{ importResultado.errores.length }})</p>
          <DataTable
            :value="importResultado.errores"
            size="small"
            striped-rows
            class="import-errores-table"
          >
            <Column field="fila" header="Fila" style="width: 4rem" />
            <Column field="dni" header="DNI" style="min-width: 8rem" />
            <Column field="mensaje" header="Detalle" style="min-width: 12rem" />
          </DataTable>
        </div>
      </div>
      <template #footer>
        <Button label="Cerrar" @click="importResultVisible = false" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  max-width: none;
  padding: 0.5rem 0;
}

.carteras-section {
  width: 100%;
  margin-bottom: 1.5rem;
}

.carteras-layout {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
}

.carteras-form-row {
  display: grid;
  gap: 1rem 1.25rem;
  grid-template-columns: 1fr;
  align-items: end;
  width: 100%;
}

@media (min-width: 768px) {
  .carteras-form-row {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
  }
}

.carteras-form-field {
  width: 100%;
  min-width: 0;
}

.carteras-form-actions {
  display: flex;
  justify-content: flex-start;
}

@media (min-width: 768px) {
  .carteras-form-actions {
    justify-content: flex-end;
  }
}

.carteras-error {
  margin: 0;
}

.carteras-table {
  width: 100%;
}

.carteras-table :deep(.p-datatable-table) {
  width: 100%;
}

.findeco-fieldset :deep(.p-fieldset-legend) {
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.02em;
  color: #0f172a;
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

.cliente-section {
  width: 100%;
  margin-top: 1.5rem;
}

.excel-section {
  width: 100%;
  margin-top: 1.5rem;
}

.excel-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

@media (min-width: 768px) {
  .excel-layout {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }
}

.excel-hint {
  margin: 0;
  flex: 1 1 16rem;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.45;
}

.excel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.excel-input {
  display: none;
}

.import-dialog-body {
  display: grid;
  gap: 0.75rem;
}

.import-archivo-nombre {
  margin: 0;
  font-size: 0.88rem;
}

.import-checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.88rem;
}

.import-nota {
  margin: 0;
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.4;
}

.import-resultado-resumen {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.import-errores-titulo {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}

.import-errores-table {
  width: 100%;
}

.cliente-form {
  width: 100%;
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
