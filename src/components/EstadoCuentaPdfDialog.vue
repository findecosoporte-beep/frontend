<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import ProgressSpinner from 'primevue/progressspinner'
import { useToast } from 'primevue/usetoast'

import { getApiErrorMessage } from '@/api/errors'
import { fetchEstadoCuentaPdfBlob } from '@/utils/estadoCuentaPdf'
import {
  compartirPdfPorWhatsApp,
  mensajeEstadoCuentaPdf,
} from '@/utils/whatsappCliente'

const visible = defineModel<boolean>('visible', { default: false })

const props = defineProps<{
  idPrestamo: number | null
  tituloCliente?: string
  telefono?: string
  numeroPrestamo?: string
}>()

const toast = useToast()

const loading = ref(false)
const enviandoWhatsApp = ref(false)
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

function nombreArchivoPdf(): string {
  const slug = (props.numeroPrestamo || String(props.idPrestamo ?? 'prestamo')).replace(/\s+/g, '-')
  return `estado-cuenta-${slug}.pdf`
}

function mensajeWhatsApp(): string {
  return mensajeEstadoCuentaPdf(props.tituloCliente ?? 'Cliente', props.numeroPrestamo)
}

async function cargarPdf() {
  if (props.idPrestamo == null) return
  loading.value = true
  error.value = ''
  revokeUrl()
  try {
    const blob = await fetchEstadoCuentaPdfBlob(props.idPrestamo)
    pdfBlob.value = blob
    pdfUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    error.value = getApiErrorMessage(e, 'No se pudo cargar el PDF del estado de cuenta.')
  } finally {
    loading.value = false
  }
}

async function enviarPorWhatsApp() {
  const telefono = (props.telefono ?? '').trim()
  if (!telefono || !pdfBlob.value) return
  enviandoWhatsApp.value = true
  try {
    const resultado = await compartirPdfPorWhatsApp({
      telefono,
      pdfBlob: pdfBlob.value,
      nombreArchivo: nombreArchivoPdf(),
      mensaje: mensajeWhatsApp(),
    })
    if (!resultado.ok) {
      if (resultado.razon === 'telefono_invalido') {
        toast.add({
          severity: 'warn',
          summary: 'WhatsApp',
          detail: 'Teléfono inválido. Use 8 dígitos (Honduras).',
          life: 5000,
        })
      }
      return
    }
    if (resultado.metodo === 'whatsapp-descarga') {
      toast.add({
        severity: 'info',
        summary: 'WhatsApp',
        detail: 'Se descargó el PDF y se abrió el chat. Adjunte el archivo al mensaje.',
        life: 6000,
      })
    }
  } finally {
    enviandoWhatsApp.value = false
  }
}

function descargarPdf() {
  if (!pdfBlob.value || props.idPrestamo == null) return
  const url = URL.createObjectURL(pdfBlob.value)
  const link = document.createElement('a')
  link.href = url
  link.download = nombreArchivoPdf()
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

watch(
  () => [visible.value, props.idPrestamo] as const,
  ([abierto, idPrestamo]) => {
    if (abierto && idPrestamo != null) void cargarPdf()
    if (!abierto) {
      revokeUrl()
      error.value = ''
    }
  },
)

onBeforeUnmount(() => revokeUrl())

defineExpose({
  cargarPdf,
  enviarPorWhatsApp,
})
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="tituloCliente ? `Estado financiero — ${tituloCliente}` : 'Estado financiero'"
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
        :loading="enviandoWhatsApp"
        :disabled="enviandoWhatsApp"
        @click="enviarPorWhatsApp"
      />
      <Button
        v-if="pdfUrl"
        label="Descargar"
        icon="pi pi-download"
        severity="secondary"
        outlined
        @click="descargarPdf"
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
