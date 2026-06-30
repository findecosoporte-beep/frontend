import { computed } from 'vue'

import { useAuthStore } from '@/stores/auth'

export function usePermissions() {
  const auth = useAuthStore()
  const rol = computed(() => auth.profile?.rol ?? null)

  const canWriteClientes = computed(() =>
    ['administrador', 'supervisor'].includes(rol.value ?? ''),
  )
  const canWritePrestamos = computed(() =>
    ['administrador', 'supervisor'].includes(rol.value ?? ''),
  )
  const canWritePagos = computed(() =>
    ['administrador', 'supervisor', 'asesor', 'cobrador', 'cobranza_adm_jud'].includes(rol.value ?? ''),
  )
  const canWriteServicios = computed(() =>
    ['administrador', 'supervisor'].includes(rol.value ?? ''),
  )
  const canWriteCobranza = computed(() =>
    ['administrador', 'supervisor', 'cobranza_adm_jud'].includes(rol.value ?? ''),
  )

  const canConfigureRutaCobranza = computed(() =>
    ['administrador', 'supervisor'].includes(rol.value ?? ''),
  )

  const canManageUsuarios = computed(() =>
    ['administrador', 'supervisor'].includes(rol.value ?? ''),
  )

  const needsVinculo = computed(() => auth.profile?.vinculado === false)

  return {
    rol,
    needsVinculo,
    canWriteClientes,
    canWritePrestamos,
    canWritePagos,
    canWriteServicios,
    canWriteCobranza,
    canConfigureRutaCobranza,
    canManageUsuarios,
  }
}
