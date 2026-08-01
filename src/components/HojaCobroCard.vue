<script setup lang="ts">
import { computed } from 'vue'

import { resumenCobroFila } from '@/utils/cobroResumen'
import { formatMoney } from '@/utils/format'
import { textoCuotaDeTotal, textoTotalCuotas, totalCuotasDesdeReporte } from '@/utils/totalCuotasPrestamo'
import type { ReporteIntegracionFila } from '@/types/api'

const props = defineProps<{
  fila: ReporteIntegracionFila
  index: number
}>()

const cobro = computed(() => resumenCobroFila(props.fila))
const totalCuotas = computed(() => totalCuotasDesdeReporte(props.fila))
</script>

<template>
  <article class="hoja-cobro-card">
    <div class="hoja-cobro-card-top">
      <span class="hoja-cobro-index">{{ index + 1 }}</span>
      <div class="hoja-cobro-main">
        <div class="hoja-cobro-name-row">
          <i class="pi pi-user hoja-cobro-icon" aria-hidden="true" />
          <strong class="hoja-cobro-name">{{ fila.nombre_cliente }}</strong>
        </div>
        <p class="hoja-cobro-loan">{{ fila.numero_prestamo }}</p>
        <p class="hoja-cobro-total-cuotas">Debe pagar {{ textoTotalCuotas(totalCuotas) }}</p>
        <p v-if="fila.telefono?.trim()" class="hoja-cobro-phone">
          <i class="pi pi-phone hoja-cobro-icon-sm" aria-hidden="true" />
          {{ fila.telefono.trim() }}
        </p>
      </div>
      <div class="hoja-cobro-cuota-block">
        <span class="hoja-cobro-cuota-label">
          {{ textoCuotaDeTotal(cobro.numeroCuota, totalCuotas) }}
        </span>
        <strong class="hoja-cobro-cuota-monto">L {{ formatMoney(cobro.aCobrarHoy) }}</strong>
      </div>
      <i class="pi pi-chevron-right hoja-cobro-chevron" aria-hidden="true" />
    </div>

    <div class="hoja-cobro-detalle">
      <div v-if="cobro.tieneAbonoAnterior" class="hoja-cobro-linea">
        <span>Abono cuota {{ cobro.numeroCuotaAnterior ?? cobro.numeroCuota }}</span>
        <span>L {{ formatMoney(cobro.abonoAnterior) }}</span>
      </div>
      <div class="hoja-cobro-linea">
        <span>Cuota #{{ cobro.numeroCuota }}</span>
        <span>L {{ formatMoney(cobro.montoCuotaProgramado) }}</span>
      </div>
      <div class="hoja-cobro-linea hoja-cobro-linea-total">
        <span>Abono + cuota</span>
        <strong>L {{ formatMoney(cobro.totalAbonoMasCuota) }}</strong>
      </div>
    </div>

    <div v-if="fila.cuotas_atrasadas" class="hoja-cobro-atraso">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>
        {{ fila.cuotas_atrasadas }} cuota(s) atrasada(s): {{ fila.cuotas_atrasadas_numeros }}
      </span>
    </div>

    <div class="hoja-cobro-saldo">
      <i class="pi pi-wallet hoja-cobro-icon-sm" aria-hidden="true" />
      <span>A cobrar hoy: L {{ formatMoney(cobro.aCobrarHoy) }}</span>
      <span class="hoja-cobro-sep">·</span>
      <span>Saldo: L {{ formatMoney(fila.saldo_actual) }}</span>
    </div>
  </article>
</template>

<style scoped>
.hoja-cobro-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.9rem;
  box-shadow: 0 1px 3px rgb(15 23 42 / 8%);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.hoja-cobro-card:hover {
  border-color: #94a3b8;
  box-shadow: 0 2px 8px rgb(15 23 42 / 10%);
}

.hoja-cobro-card-top {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.hoja-cobro-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  background: #ecfdf5;
  color: #0f172a;
  font-size: 0.82rem;
  font-weight: 700;
  flex-shrink: 0;
}

.hoja-cobro-main {
  flex: 1;
  min-width: 0;
}

.hoja-cobro-name-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.hoja-cobro-icon {
  font-size: 0.85rem;
  color: #64748b;
}

.hoja-cobro-icon-sm {
  font-size: 0.75rem;
  color: #94a3b8;
}

.hoja-cobro-name {
  font-size: 0.95rem;
  color: #0f172a;
}

.hoja-cobro-loan,
.hoja-cobro-total-cuotas,
.hoja-cobro-phone {
  margin: 0.15rem 0 0 1.15rem;
  font-size: 0.78rem;
}

.hoja-cobro-loan {
  color: #64748b;
}

.hoja-cobro-total-cuotas {
  color: #0f172a;
  font-weight: 600;
}

.hoja-cobro-phone {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: #475569;
}

.hoja-cobro-cuota-block {
  text-align: right;
  flex-shrink: 0;
}

.hoja-cobro-cuota-label {
  display: block;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.hoja-cobro-cuota-monto {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.95rem;
  color: #0f172a;
}

.hoja-cobro-chevron {
  color: #94a3b8;
  font-size: 0.85rem;
}

.hoja-cobro-detalle {
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.hoja-cobro-linea {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.78rem;
  color: #475569;
}

.hoja-cobro-linea-total {
  margin-top: 0.25rem;
  padding-top: 0.4rem;
  border-top: 1px solid #e2e8f0;
  color: #0f172a;
}

.hoja-cobro-atraso {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.65rem;
  padding: 0.4rem 0.6rem;
  border-radius: 0.5rem;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 0.78rem;
  font-weight: 600;
}

.hoja-cobro-saldo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.55rem;
  font-size: 0.78rem;
  color: #475569;
}

.hoja-cobro-sep {
  color: #94a3b8;
}
</style>
