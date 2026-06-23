import type { DiaCobroCartera } from '@/types/api'

/** Misma secuencia y claves que `Cartera.DIA_COBRO_CHOICES` en Django. */
export const DIAS_COBRO_CARTERA_OPTIONS: { label: string; value: DiaCobroCartera }[] = [
  { label: 'Lunes', value: 'lunes' },
  { label: 'Martes', value: 'martes' },
  { label: 'Miércoles', value: 'miercoles' },
  { label: 'Jueves', value: 'jueves' },
  { label: 'Viernes', value: 'viernes' },
  { label: 'Sábado', value: 'sabado' },
  { label: 'Domingo', value: 'domingo' },
]
