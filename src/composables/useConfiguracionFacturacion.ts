import { api } from '@/api/client'
import type { ConfiguracionFacturacion } from '@/types/api'

let configCache: ConfiguracionFacturacion | null = null
let configPromise: Promise<ConfiguracionFacturacion> | null = null

/** Invalida cache local para forzar recarga desde el API. */
export function invalidateConfiguracionFacturacion(): void {
  configCache = null
  configPromise = null
}

/** Guarda en cache la configuracion recien cargada o guardada. */
export function setConfiguracionFacturacionCache(config: ConfiguracionFacturacion): void {
  configCache = config
}

/** Carga la configuracion fiscal SAR; reutiliza cache en la misma sesion. */
export async function fetchConfiguracionFacturacion(
  force = false,
): Promise<ConfiguracionFacturacion> {
  if (!force && configCache) return configCache
  if (!force && configPromise) return configPromise

  configPromise = api
    .get<ConfiguracionFacturacion>('/configuracion/facturacion/')
    .then((response) => {
      configCache = response.data
      return response.data
    })
    .finally(() => {
      configPromise = null
    })

  return configPromise
}

export async function resolveFormatoTicketFactura(
  explicit?: '58' | '80',
): Promise<'58' | '80'> {
  if (explicit === '58' || explicit === '80') return explicit
  const config = await fetchConfiguracionFacturacion()
  return config.formato_ticket === '80' ? '80' : '58'
}

export function tieneDatosEmisorSar(config: ConfiguracionFacturacion): boolean {
  return Boolean(config.razon_social?.trim() || config.rtn?.trim() || config.cai?.trim())
}
