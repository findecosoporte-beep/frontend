import type { AxiosResponse } from 'axios'

import { getApiErrorMessage } from '@/api/errors'

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] // %PDF

function esPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4
    && bytes[0] === PDF_MAGIC[0]
    && bytes[1] === PDF_MAGIC[1]
    && bytes[2] === PDF_MAGIC[2]
    && bytes[3] === PDF_MAGIC[3]
  )
}

/** Convierte la respuesta Axios (blob) en PDF o lanza error legible si el cuerpo no es PDF. */
export async function blobPdfDesdeAxios(response: AxiosResponse<Blob>): Promise<Blob> {
  const buf = await response.data.arrayBuffer()
  const bytes = new Uint8Array(buf)

  if (esPdfBytes(bytes)) {
    return new Blob([buf], { type: 'application/pdf' })
  }

  const text = new TextDecoder().decode(buf).trimStart()
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const json = JSON.parse(text) as unknown
      const detalle = getApiErrorMessage(
        { response: { data: json } },
        'El servidor devolvió JSON en lugar de un PDF.',
      )
      throw new Error(
        `${detalle} Despliegue el backend actualizado (parámetro formato=pdf) o use la API local.`,
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('formato=pdf')) {
        throw error
      }
    }
  }

  const contentType = String(response.headers['content-type'] ?? '')
  if (contentType.includes('application/json')) {
    throw new Error(
      'El servidor no generó PDF (respondió JSON). Actualice el backend en producción o apunte VITE_API_BASE_URL al servidor local.',
    )
  }

  throw new Error('El archivo recibido no es un PDF válido.')
}
