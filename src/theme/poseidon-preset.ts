import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

/**
 * Aura extendido: acento cyan (estilo Poseidon), botones más marcados y campos algo más redondeados.
 */
export const poseidonPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{cyan.50}',
      100: '{cyan.100}',
      200: '{cyan.200}',
      300: '{cyan.300}',
      400: '{cyan.400}',
      500: '{cyan.500}',
      600: '{cyan.600}',
      700: '{cyan.700}',
      800: '{cyan.800}',
      900: '{cyan.900}',
      950: '{cyan.950}',
    },
    formField: {
      borderRadius: '{border.radius.lg}',
    },
  },
  components: {
    button: {
      root: {
        borderRadius: '{border.radius.lg}',
        label: {
          fontWeight: '600',
        },
      },
    },
    card: {
      root: {
        borderRadius: '{border.radius.xl}',
      },
    },
  },
})
