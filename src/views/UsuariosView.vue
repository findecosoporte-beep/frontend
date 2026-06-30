<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import Message from 'primevue/message'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Toolbar from 'primevue/toolbar'

import { api } from '@/api/client'
import { getApiErrorMessage } from '@/api/errors'
import type { Paginated, UsuarioRow } from '@/types/api'

const rows = ref<UsuarioRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
/** Alineado con MAX_PAGE_SIZE del API */
const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100]
const loading = ref(false)
const search = ref('')
const error = ref('')

const first = computed(() => (page.value - 1) * pageSize.value)

function severityForRol(rol: string) {
  if (rol === 'administrador') return 'danger'
  if (rol === 'supervisor') return 'warn'
  return 'info'
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

onMounted(() => void load())
</script>

<template>
  <div class="page">
    <h1 class="title">Usuarios operativos</h1>
    <p class="hint">Solo lectura. Los inicios de sesión usan usuarios de Django; el rol de negocio viene de esta tabla.</p>

    <Toolbar class="mb-3 toolbar">
      <template #start>
        <div class="search-row">
          <InputText v-model="search" placeholder="Buscar nombre o correo…" class="search-input" @keyup.enter="onSearch" />
          <Button label="Buscar" icon="pi pi-search" severity="secondary" @click="onSearch" />
        </div>
      </template>
    </Toolbar>

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
      <Column header="Rol" style="width: 10rem">
        <template #body="{ data }">
          <Tag :value="data.rol" :severity="severityForRol(data.rol)" />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.page {
  max-width: 60rem;
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
</style>
