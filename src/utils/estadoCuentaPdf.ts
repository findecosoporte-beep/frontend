import { api } from '@/api/client'

/** Obtiene el PDF de estado de cuenta del préstamo como Blob. */
export async function fetchEstadoCuentaPdfBlob(idPrestamo: number): Promise<Blob> {
  const response = await api.get(`/prestamos/${idPrestamo}/estado-cuenta-pdf/`, {
    responseType: 'blob',
  })
  return new Blob([response.data], { type: 'application/pdf' })
}
