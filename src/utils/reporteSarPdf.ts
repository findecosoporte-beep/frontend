import { api } from '@/api/client'

import { blobPdfDesdeAxios } from '@/utils/pdfBlobFromResponse'

export async function fetchReporteSarPdfBlob(trimestre: number, anio: number): Promise<Blob> {
  const response = await api.get<Blob>('/reportes/sar/', {
    params: { trimestre, anio, formato: 'pdf' },
    responseType: 'blob',
    headers: { Accept: 'application/pdf' },
  })
  return blobPdfDesdeAxios(response)
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
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
