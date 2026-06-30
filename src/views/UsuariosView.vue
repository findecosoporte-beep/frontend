<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import MultiSelect from 'primevue/multiselect'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Toolbar from 'primevue/toolbar'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import { usePermissions } from '@/composables/usePermissions'
import type { Cartera, Paginated, UsuarioRow } from '@/types/api'

async function fetchAllPages<T>(initialPath: string): Promise<T[]> {
  const items: T[] = []
  let nextUrl: string | null = initialPath
  while (nextUrl) {
    const response: { data: Paginated<T> } = await api.get<Paginated<T>>(nextUrl)
    const page: Paginated<T> = response.data
    items.push(...page.results)
    nextUrl = page.next
  }
  return items
}

const toast = useToast()
const confirm = useConfirm()
const { canManageUsuarios } = usePermissions()

const rows = ref<UsuarioRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100]
const loading = ref(false)
const search = ref('')
const filtroRol = ref('')
const error = ref('')

const carterasCatalogo = ref<Cartera[]>([])
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const saving = ref(false)
const editingId = ref<number | null>(null)

const cobradorForm = ref({
  nombre: '',
  correo: '',
  password: '',
  carteras: [] as number[],
})

const rolFiltroOptions = [
  { label: 'Todos los roles', value: '' },
  { label: 'Cobrador', value: 'cobrador' },
  { label: 'Asesor', value: 'asesor' },
  { label: 'Supervisor', value: 'supervisor' },
  { label: 'Administrador', value: 'administrador' },
  { label: 'Cobranza adm/jud', value: 'cobranza_adm_jud' },
]

const carteraOptions = computed(() =>
  carterasCatalogo.value.map((c) => ({
    label: `${c.nombre} (${c.dia_cobro})`,
    value: c.id_cartera,
  })),
)

const first = computed(() => (page.value - 1) * pageSize.value)

function severityForRol(rol: string) {
  if (rol === 'administrador') return 'danger'
  if (rol === 'supervisor') return 'warn'
  if (rol === 'cobrador') return 'success'
  return 'info'
}

function etiquetaRol(rol: string) {
  const map: Record<string, string> = {
    administrador: 'Administrador',
    supervisor: 'Supervisor',
    asesor: 'Asesor',
    cobrador: 'Cobrador',
    cobranza_adm_jud: 'Cobranza adm/jud',
  }
  return map[rol] ?? rol
}

function textoCarteras(row: UsuarioRow) {
  if (row.rol !== 'cobrador') return '—'
  const detalle = row.carteras_detalle ?? []
  if (!detalle.length) return 'Sin cartera'
  return detalle.map((c) => c.nombre).join(', ')
}

async function cargarCarteras() {
  try {
    carterasCatalogo.value = await fetchAllPages<Cartera>('/carteras/?page_size=100&ordering=nombre')
  } catch {
    carterasCatalogo.value = []
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
    if (search.value.trim()) params.set('search', search.value.trim())
    if (filtroRol.value) params.set('rol', filtroRol.value)
    const { data } = await api.get<Paginated<UsuarioRow>>(`/usuarios/?${params.toString()}`)
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

function onSearch() {
  page.value = 1
  void load()
}

function resetCobradorForm() {
  cobradorForm.value = { nombre: '', correo: '', password: '', carteras: [] }
  editingId.value = null
}

function abrirAltaCobrador() {
  resetCobradorForm()
  dialogMode.value = 'create'
  dialogVisible.value = true
}

function abrirEditarCobrador(row: UsuarioRow) {
  if (row.rol !== 'cobrador') return
  editingId.value = row.id_usuario
  cobradorForm.value = {
    nombre: row.nombre,
    correo: row.correo ?? '',
    password: '',
    carteras: row.carteras ?? row.carteras_detalle?.map((c) => c.id_cartera) ?? [],
  }
  dialogMode.value = 'edit'
  dialogVisible.value = true
}

async function guardarCobrador() {
  const nombre = cobradorForm.value.nombre.trim()
  const correo = cobradorForm.value.correo.trim().toLowerCase()
  const password = cobradorForm.value.password
  const carteras = cobradorForm.value.carteras

  if (!nombre || !correo) {
    toast.add({ severity: 'warn', summary: 'Cobrador', detail: 'Nombre y correo son obligatorios.', life: 4000 })
    return
  }
  if (!carteras.length) {
    toast.add({ severity: 'warn', summary: 'Cobrador', detail: 'Asigna al menos una cartera.', life: 4000 })
    return
  }
  if (dialogMode.value === 'create' && password.length < 8) {
    toast.add({ severity: 'warn', summary: 'Cobrador', detail: 'La contraseña debe tener al menos 8 caracteres.', life: 4000 })
    return
  }

  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      await api.post('/usuarios/', {
        rol: 'cobrador',
        nombre,
        correo,
        password,
        carteras,
      })
      toast.add({ severity: 'success', summary: 'Cobrador', detail: 'Cobrador registrado con acceso al sistema.', life: 4000 })
    } else if (editingId.value != null) {
      const payload: Record<string, unknown> = { nombre, correo, carteras }
      if (password.trim()) payload.password = password
      await api.patch(`/usuarios/${editingId.value}/`, payload)
      toast.add({ severity: 'success', summary: 'Cobrador', detail: 'Datos actualizados.', life: 4000 })
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Cobrador', detail: getApiErrorMessage(e), life: 5000 })
  } finally {
    saving.value = false
  }
}

function confirmarEliminarCobrador(row: UsuarioRow) {
  if (row.rol !== 'cobrador') return
  confirm.require({
    message: `¿Eliminar al cobrador «${row.nombre}» y su cuenta de acceso?`,
    header: 'Eliminar cobrador',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar',
    rejectLabel: 'Cancelar',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.delete(`/usuarios/${row.id_usuario}/`)
        toast.add({ severity: 'success', summary: 'Cobrador', detail: 'Usuario eliminado.', life: 3500 })
        await load()
      } catch (e) {
        toast.add({ severity: 'error', summary: 'Cobrador', detail: getApiErrorMessage(e), life: 5000 })
      }
    },
  })
}

onMounted(async () => {
  await cargarCarteras()
  await load()
})
</script>

<template>
  <div class="page">
    <h1 class="title">Usuarios operativos</h1>

    <Toolbar class="mb-3 toolbar">
      <template #start>
        <div class="search-row">
          <InputText
            v-model="search"
            placeholder="Buscar nombre o correo…"
            class="search-input"
            @keyup.enter="onSearch"
          />
          <Select
            v-model="filtroRol"
            :options="rolFiltroOptions"
            option-label="label"
            option-value="value"
            placeholder="Rol"
            class="rol-filter"
            @change="onSearch"
          />
          <Button label="Buscar" icon="pi pi-search" severity="secondary" @click="onSearch" />
        </div>
      </template>
      <template #end>
        <Button
          v-if="canManageUsuarios"
          label="Nuevo cobrador"
          icon="pi pi-user-plus"
          @click="abrirAltaCobrador"
        />
      </template>
    </Toolbar>

    <Message v-if="!canManageUsuarios" severity="info" class="mb-2" :closable="false">
      Solo administradores y supervisores pueden registrar o editar cobradores.
    </Message>

    <Message v-if="error" severity="error" class="mb-2" :closable="false">{{ error }}</Message>

    <DataTable
      :value="rows"
      lazy
      paginator
      :first="first"
      :rows="pageSize"
      :rows-per-page-options="ROWS_PER_PAGE_OPTIONS"
      :total-records="total"
      :loading="loading"
      data-key="id_usuario"
      @page="onPage"
    >
      <Column field="id_usuario" header="ID" style="width: 4rem" />
      <Column field="nombre" header="Nombre" />
      <Column field="correo" header="Correo" />
      <Column header="Rol" style="width: 9rem">
        <template #body="{ data }">
          <Tag :value="etiquetaRol(data.rol)" :severity="severityForRol(data.rol)" />
        </template>
      </Column>
      <Column header="Carteras asignadas">
        <template #body="{ data }">
          {{ textoCarteras(data) }}
        </template>
      </Column>
      <Column v-if="canManageUsuarios" header="Acciones" style="width: 10rem">
        <template #body="{ data }">
          <div v-if="data.rol === 'cobrador'" class="acciones">
            <Button icon="pi pi-pencil" severity="secondary" text rounded @click="abrirEditarCobrador(data)" />
            <Button icon="pi pi-trash" severity="danger" text rounded @click="confirmarEliminarCobrador(data)" />
          </div>
          <span v-else class="muted">—</span>
        </template>
      </Column>
    </DataTable>

    <Dialog
      v-model:visible="dialogVisible"
      :header="dialogMode === 'create' ? 'Nuevo cobrador por cartera' : 'Editar cobrador'"
      modal
      :style="{ width: 'min(32rem, 95vw)' }"
    >
      <div class="form-grid">
        <div class="field">
          <label for="cob-nombre">Nombre completo</label>
          <InputText id="cob-nombre" v-model="cobradorForm.nombre" fluid autocomplete="name" />
        </div>
        <div class="field">
          <label for="cob-correo">Correo (usuario de acceso)</label>
          <InputText id="cob-correo" v-model="cobradorForm.correo" fluid type="email" autocomplete="off" />
        </div>
        <div class="field">
          <label for="cob-pass">{{ dialogMode === 'create' ? 'Contraseña inicial' : 'Nueva contraseña (opcional)' }}</label>
          <Password
            id="cob-pass"
            v-model="cobradorForm.password"
            fluid
            :feedback="false"
            toggle-mask
            :input-props="{ autocomplete: 'new-password' }"
          />
        </div>
        <div class="field">
          <label for="cob-carteras">Carteras a cobrar</label>
          <MultiSelect
            id="cob-carteras"
            v-model="cobradorForm.carteras"
            :options="carteraOptions"
            option-label="label"
            option-value="value"
            placeholder="Selecciona una o más carteras"
            display="chip"
            fluid
            filter
          />
          <p class="field-hint">Cada cartera solo puede tener un cobrador asignado.</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Guardar" icon="pi pi-check" :loading="saving" @click="guardarCobrador" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.page {
  max-width: 72rem;
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.hint {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  opacity: 0.85;
}

.toolbar {
  flex-wrap: wrap;
  gap: 0.5rem;
}

.search-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.search-input {
  min-width: 12rem;
}

.rol-filter {
  min-width: 11rem;
}

.acciones {
  display: flex;
  gap: 0.15rem;
}

.muted {
  opacity: 0.5;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
}

.field-hint {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  opacity: 0.75;
}
</style>
