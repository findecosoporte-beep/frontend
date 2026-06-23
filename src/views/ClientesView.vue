<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

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
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import { DIAS_COBRO_CARTERA_OPTIONS } from '@/constants/diasCobroCartera'
import type { Cartera, Cliente, DiaCobroCartera, Paginated, Zona } from '@/types/api'

const toast = useToast()
const confirm = useConfirm()
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

const carterasRows = ref<Cartera[]>([])
const loadingCarteras = ref(false)
const carterasError = ref('')
const zonaNombrePorId = ref<Record<number, string>>({})

const editCarteraVisible = ref(false)
const savingEditCartera = ref(false)
const editCarteraForm = ref({
  id_cartera: 0,
  nombre: '',
  dia_cobro: null as DiaCobroCartera | null,
  id_zona: null as number | null,
})

function etiquetaDiaCobro(v: DiaCobroCartera | null | undefined): string {
  if (!v) return '—'
  return diasCobroOptions.find((o) => o.value === v)?.label ?? v
}

function nombreZonaCartera(c: Cartera): string {
  const id = c.id_zona
  if (id == null || id <= 0) return '—'
  return zonaNombrePorId.value[id] ?? `Zona #${id}`
}

async function fetchAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = []
  let nextUrl: string | null = path
  while (nextUrl) {
    const { data } = await api.get<Paginated<T>>(nextUrl)
    items.push(...data.results)
    nextUrl = data.next
  }
  return items
}

async function cargarZonasCatalogo() {
  try {
    const zonas = await fetchAllPages<Zona>('/zonas/?page_size=100')
    const map: Record<number, string> = {}
    for (const z of zonas) map[z.id_zona] = z.nombre.trim()
    zonaNombrePorId.value = map
  } catch {
    zonaNombrePorId.value = {}
  }
}

async function cargarCarteras() {
  loadingCarteras.value = true
  carterasError.value = ''
  try {
    carterasRows.value = await fetchAllPages<Cartera>('/carteras/?page_size=100&ordering=nombre')
  } catch (e) {
    carterasError.value = getApiErrorMessage(e)
    carterasRows.value = []
  } finally {
    loadingCarteras.value = false
  }
}

function abrirEditarCartera(c: Cartera) {
  editCarteraForm.value = {
    id_cartera: c.id_cartera,
    nombre: c.nombre?.trim() ?? '',
    dia_cobro: c.dia_cobro ?? null,
    id_zona: c.id_zona ?? null,
  }
  editCarteraVisible.value = true
}

function cerrarEditarCartera() {
  editCarteraVisible.value = false
}

async function guardarEdicionCartera() {
  const nombre = editCarteraForm.value.nombre.trim()
  const diaCobro = editCarteraForm.value.dia_cobro
  const id = editCarteraForm.value.id_cartera
  if (!nombre || !diaCobro || !id) {
    toast.add({
      severity: 'warn',
      summary: 'Datos incompletos',
      detail: 'Completa el nombre y el día de cobro.',
      life: 4000,
    })
    return
  }
  savingEditCartera.value = true
  try {
    const { data } = await api.patch<Cartera>(`/carteras/${id}/`, {
      nombre,
      dia_cobro: diaCobro,
    })
    const idx = carterasRows.value.findIndex((r) => r.id_cartera === id)
    if (idx >= 0) carterasRows.value[idx] = data
    else carterasRows.value = [...carterasRows.value, data].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es'),
    )
    toast.add({
      severity: 'success',
      summary: 'Cartera actualizada',
      detail: 'Los cambios se guardaron correctamente.',
      life: 3500,
    })
    cerrarEditarCartera()
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo guardar',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    savingEditCartera.value = false
  }
}

function confirmarEliminarCartera(c: Cartera) {
  if (!canWriteClientes.value) return
  confirm.require({
    message: `¿Eliminar la cartera «${c.nombre}»? Los préstamos vinculados quedarán sin cartera asignada.`,
    header: 'Confirmar eliminación',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancelar',
    acceptLabel: 'Eliminar',
    rejectClass: 'p-button-secondary p-button-outlined',
    acceptClass: 'p-button-danger',
    accept: () => void eliminarCartera(c.id_cartera),
  })
}

async function eliminarCartera(id: number) {
  try {
    await api.delete(`/carteras/${id}/`)
    carterasRows.value = carterasRows.value.filter((r) => r.id_cartera !== id)
    toast.add({
      severity: 'success',
      summary: 'Cartera eliminada',
      detail: 'Se eliminó la cartera del catálogo.',
      life: 3500,
    })
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'No se pudo eliminar',
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  }
}

const carterasOrdenadas = computed(() =>
  [...carterasRows.value].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
)

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

onMounted(() => {
  void Promise.all([cargarZonasCatalogo(), cargarCarteras()])
})
</script>

<template>
  <div class="page">
    <div class="findeco-top-grid">
      <Fieldset legend="CREACION DE CARTERAS:" class="findeco-fieldset findeco-fieldset--carteras" :toggleable="false">
        <Message
          v-if="!canWriteClientes"
          severity="info"
          class="cartera-msg"
          :closable="false"
        >
          Solo administradores y supervisores pueden crear, editar o eliminar carteras.
        </Message>
        <div class="findeco-stack">
          <FloatLabel class="findeco-field">
            <InputText
              id="cartera-nombre"
              v-model="carteraForm.nombreCartera"
              fluid
              :disabled="!canWriteClientes"
            />
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
              :disabled="!canWriteClientes"
            />
          </div>
          <div class="findeco-actions">
            <Button
              label="Guardar cartera"
              icon="pi pi-save"
              :loading="savingCartera"
              :disabled="savingCartera || !canWriteClientes"
              @click="guardarCartera"
            />
          </div>
        </div>

        <div class="carteras-listado">
          <div class="carteras-listado-toolbar">
            <h2 class="carteras-listado-titulo">Carteras registradas</h2>
            <Button
              label="Actualizar"
              icon="pi pi-refresh"
              severity="secondary"
              outlined
              size="small"
              :loading="loadingCarteras"
              @click="cargarCarteras"
            />
          </div>
          <Message v-if="carterasError" severity="error" class="cartera-msg" :closable="false">
            {{ carterasError }}
          </Message>
          <DataTable
            :value="carterasOrdenadas"
            data-key="id_cartera"
            size="small"
            striped-rows
            :loading="loadingCarteras"
            class="carteras-datatable"
            empty-message="No hay carteras registradas."
          >
            <Column field="id_cartera" header="ID" style="width: 4rem" />
            <Column field="nombre" header="Nombre" style="min-width: 10rem" />
            <Column header="Día de cobro" style="width: 9rem">
              <template #body="{ data }: { data: Cartera }">
                {{ etiquetaDiaCobro(data.dia_cobro) }}
              </template>
            </Column>
            <Column header="Zona vinculada" style="min-width: 9rem">
              <template #body="{ data }: { data: Cartera }">
                {{ nombreZonaCartera(data) }}
              </template>
            </Column>
            <Column v-if="canWriteClientes" header="Acciones" style="width: 11rem">
              <template #body="{ data }: { data: Cartera }">
                <div class="carteras-acciones">
                  <Button
                    icon="pi pi-pencil"
                    label="Editar"
                    size="small"
                    severity="secondary"
                    outlined
                    @click="abrirEditarCartera(data)"
                  />
                  <Button
                    icon="pi pi-trash"
                    label="Eliminar"
                    size="small"
                    severity="danger"
                    outlined
                    @click="confirmarEliminarCartera(data)"
                  />
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </Fieldset>
    </div>

    <Fieldset legend="REGISTRO DE CLIENTE:" class="findeco-fieldset findeco-fieldset--cliente" :toggleable="false">
      <div class="cliente-excel-toolbar">
        <p class="cliente-excel-hint">
          Carga masiva desde Excel (.xlsx). Obligatorios: <strong>Nombre</strong> y <strong>DNI</strong>.
        </p>
        <div class="cliente-excel-actions">
          <Button
            label="Plantilla Excel"
            icon="pi pi-file-excel"
            severity="secondary"
            outlined
            size="small"
            :loading="descargandoPlantilla"
            @click="descargarPlantillaClientes"
          />
          <Button
            label="Exportar clientes"
            icon="pi pi-download"
            severity="secondary"
            outlined
            size="small"
            :loading="exportingClientes"
            @click="exportarClientesExcel"
          />
          <Button
            v-if="canWriteClientes"
            label="Importar desde Excel"
            icon="pi pi-upload"
            size="small"
            :loading="importingClientes"
            @click="abrirSelectorImportarClientes"
          />
        </div>
        <input
          ref="excelFileInput"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          class="cliente-excel-input"
          @change="onExcelClientesSeleccionado"
        />
      </div>

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
          <FloatLabel class="cliente-cell span-2">
            <InputText id="cli-dir-res" v-model="clienteForm.direccion_residencia" fluid autocomplete="street-address" />
            <label for="cli-dir-res" class="lbl-mayus">Dirección residencia</label>
          </FloatLabel>
          <FloatLabel class="cliente-cell span-2">
            <InputText id="cli-dir-neg" v-model="clienteForm.direccion_negocio" fluid />
            <label for="cli-dir-neg" class="lbl-mayus">Dirección del negocio</label>
          </FloatLabel>
          <div class="cliente-cell span-4 referencia-bloque">
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
          <div class="cliente-cell span-4 cliente-textarea-wrap">
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
    </Fieldset>

    <Dialog
      v-model:visible="editCarteraVisible"
      header="Editar cartera"
      modal
      :style="{ width: 'min(96vw, 28rem)' }"
      @hide="cerrarEditarCartera"
    >
      <div class="findeco-stack dialog-cartera-form">
        <FloatLabel class="findeco-field findeco-field--dialog">
          <InputText id="edit-cartera-nombre" v-model="editCarteraForm.nombre" fluid />
          <label for="edit-cartera-nombre">Nombre de cartera</label>
        </FloatLabel>
        <div class="findeco-field findeco-select-wrap findeco-field--dialog">
          <label class="findeco-select-label" for="edit-cartera-dia">Día de cobro</label>
          <Select
            id="edit-cartera-dia"
            v-model="editCarteraForm.dia_cobro"
            :options="diasCobroOptions"
            option-label="label"
            option-value="value"
            placeholder="Selecciona un día"
            fluid
          />
        </div>
        <p v-if="editCarteraForm.id_zona" class="cartera-zona-aviso">
          Zona vinculada: {{ zonaNombrePorId[editCarteraForm.id_zona] ?? `Zona #${editCarteraForm.id_zona}` }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="cerrarEditarCartera" />
        <Button
          label="Guardar cambios"
          icon="pi pi-save"
          :loading="savingEditCartera"
          @click="guardarEdicionCartera"
        />
      </template>
    </Dialog>

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

  .findeco-fieldset--carteras {
    grid-column: 1 / -1;
  }
}

.findeco-fieldset--cliente {
  margin-top: 1.75rem;
  width: 100%;
}

.cartera-msg {
  margin: 0 0 0.75rem;
}

.carteras-listado {
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid #e2e8f0;
}

.carteras-listado-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}

.carteras-listado-titulo {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #334155;
}

.carteras-datatable {
  width: 100%;
}

.carteras-acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.cartera-zona-aviso {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
}

.dialog-cartera-form .findeco-field--dialog {
  max-width: none;
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

.findeco-actions {
  max-width: min(100%, 28rem);
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

@media (min-width: 640px) {
  .cliente-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cliente-form-grid .span-2 {
    grid-column: span 2;
  }

  .cliente-form-grid .span-4 {
    grid-column: 1 / -1;
  }
}

@media (min-width: 1024px) {
  .cliente-form-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .cliente-form-grid .span-2 {
    grid-column: span 2;
  }

  .cliente-form-grid .span-4 {
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

.cliente-excel-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e2e8f0;
}

.cliente-excel-hint {
  margin: 0;
  flex: 1 1 14rem;
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.45;
}

.cliente-excel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.cliente-excel-input {
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
</style>
