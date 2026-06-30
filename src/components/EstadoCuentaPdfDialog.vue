<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import ProgressSpinner from 'primevue/progressspinner'
import { useToast } from 'primevue/usetoast'

import { getApiErrorMessage } from '@/api/errors'
import {
  compartirEstadoCuentaPdf,
  descargarEstadoCuentaPdf,
  fetchEstadoCuentaPdfBlob,
} from '@/utils/estadoCuentaPdf'

const visible = defineModel<boolean>('visible', { default: false })

const props = defineProps<{
  prestamoId: number | null
  telefono?: string | null
  nombreCliente?: string
  numeroPrestamo?: string | null
}>()

const toast = useToast()
const loading = ref(false)
const sharing = ref(false)
const error = ref('')
const pdfUrl = ref<string | null>(null)
const pdfBlob = ref<Blob | null>(null)

const telefonoValido = computed(() => (props.telefono ?? '').trim().length > 0)

function revokeUrl() {
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = null
  }
  pdfBlob.value = null
}

async function cargarPdf(prestamoId: number) {
  loading.value = true
  error.value = ''
  revokeUrl()
  try {
    const blob = await fetchEstadoCuentaPdfBlob(prestamoId)
    pdfBlob.value = blob
    pdfUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    error.value = getApiErrorMessage(e, 'No se pudo cargar el PDF del estado de cuenta.')
  } finally {
    loading.value = false
  }
}

async function compartir() {
  if (!pdfBlob.value) return
  const telefono = props.telefono?.trim()
  if (!telefono) {
    toast.add({
      severity: 'warn',
      summary: 'Compartir',
      detail: 'El cliente no tiene teléfono registrado.',
      life: 4000,
    })
    return
  }
  sharing.value = true
  try {
    const result = await compartirEstadoCuentaPdf({
      telefono,
      nombreCliente: props.nombreCliente || 'Cliente',
      numeroPrestamo: props.numeroPrestamo,
      pdfBlob: pdfBlob.value,
    })
    if (result === 'failed') {
      toast.add({
        severity: 'warn',
        summary: 'Compartir',
        detail: 'No se pudo compartir. Verifique que el teléfono tenga formato válido (8 dígitos en Honduras).',
        life: 5000,
      })
    } else if (result === 'whatsapp') {
      toast.add({
        severity: 'info',
        summary: 'WhatsApp',
        detail: 'Se abrió WhatsApp y se descargó el PDF. Adjúntelo al chat con el cliente.',
        life: 6000,
      })
    }
  } finally {
    sharing.value = false
  }
}

function descargar() {
  if (!pdfBlob.value) return
  descargarEstadoCuentaPdf(pdfBlob.value, props.numeroPrestamo)
}

watch(
  () => [visible.value, props.prestamoId] as const,
  ([abierto, prestamoId]) => {
    if (abierto && prestamoId != null) void cargarPdf(prestamoId)
    if (!abierto) {
      revokeUrl()
      error.value = ''
    }
  },
)

onBeforeUnmount(() => revokeUrl())

defineExpose({ cargarPdf, compartir })
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="nombreCliente ? `Estado financiero — ${nombreCliente}` : 'Estado financiero'"
    modal
    :style="{ width: 'min(58rem, 96vw)' }"
    :content-style="{ padding: 0, overflow: 'hidden' }"
  >
    <div class="pdf-modal-body">
      <div v-if="loading" class="pdf-modal-loading">
        <ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="4" />
        <span>Generando PDF…</span>
      </div>
      <p v-else-if="error" class="pdf-modal-error">{{ error }}</p>
      <iframe
        v-else-if="pdfUrl"
        :src="pdfUrl"
        class="pdf-modal-frame"
        title="Estado de cuenta PDF"
      />
    </div>
    <template #footer>
      <Button
        v-if="pdfUrl && telefonoValido"
        label="Enviar por WhatsApp"
        icon="pi pi-whatsapp"
        severity="success"
        outlined
        :loading="sharing"
        :disabled="sharing"
        @click="compartir"
      />
      <Button
        v-if="pdfUrl"
        label="Descargar"
        icon="pi pi-download"
        severity="secondary"
        outlined
        @click="descargar"
      />
      <Button label="Cerrar" severity="secondary" text @click="visible = false" />
    </template>
  </Dialog>
</template>

<style scoped>
.pdf-modal-body {
  min-height: min(78vh, 42rem);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
}

.pdf-modal-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  color: #475569;
  font-size: 0.9rem;
}

.pdf-modal-error {
  margin: 1rem;
  color: #b91c1c;
  font-size: 0.9rem;
  text-align: center;
}

.pdf-modal-frame {
  width: 100%;
  height: min(78vh, 42rem);
  border: 0;
  background: #fff;
}
</style>
