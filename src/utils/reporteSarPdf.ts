import { api } from '@/api/client'
import { getApiErrorMessageAsync } from '@/api/errors'

import { blobPdfDesdeAxios } from '@/utils/pdfBlobFromResponse'

export async function fetchReporteSarPdfBlob(trimestre: number, anio: number): Promise<Blob> {
  try {
    const response = await api.get<Blob>('/reportes/sar/', {
      params: { trimestre, anio, formato: 'pdf' },
      responseType: 'blob',
    })
    return blobPdfDesdeAxios(response)
  } catch (error) {
    const message = await getApiErrorMessageAsync(
      error,
      'No se pudo generar el PDF del reporte SAR.',
    )
    throw new Error(message)
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function descargarReporteSarPdf(blob: Blob, trimestre: number, anio: number) {
  downloadBlob(blob, `reporte-sar-T${trimestre}-${anio}.pdf`)
}

export function abrirReporteSarPdfEnNuevaPestana(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    URL.revokeObjectURL(url)
    throw new Error('El navegador bloqueó la ventana emergente. Permita ventanas emergentes o use Descargar PDF.')
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
