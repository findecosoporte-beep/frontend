<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { DIAS_COBRO_CARTERA_OPTIONS } from '@/constants/diasCobroCartera'
import type { Cartera } from '@/types/api'

const model = defineModel<number | ''>({ default: '' })

const props = withDefaults(
  defineProps<{
    carteras: Cartera[]
    disabled?: boolean
    autoOpen?: boolean
    label?: string
    placeholder?: string
  }>(),
  {
    disabled: false,
    autoOpen: false,
    label: undefined,
    placeholder: undefined,
  },
)

const open = ref(false)
const autoOpenedRef = ref(false)

const selected = computed(() => {
  if (model.value === '' || model.value == null) return null
  return props.carteras.find((c) => c.id_cartera === model.value) ?? null
})

const triggerLabel = computed(
  () => props.label ?? (selected.value ? 'Cartera seleccionada' : 'Cartera de cobro'),
)

const triggerValue = computed(() => {
  if (selected.value) return selected.value.nombre
  if (props.carteras.length === 0) return 'Sin carteras'
  return props.placeholder ?? 'Seleccione una cartera'
})

const canOpen = computed(() => props.carteras.length > 0)

function labelDiaCobro(dia: string): string {
  return DIAS_COBRO_CARTERA_OPTIONS.find((o) => o.value === dia)?.label ?? dia
}

function select(idCartera: number) {
  model.value = idCartera
  open.value = false
}

function openList() {
  if (!props.disabled && canOpen.value) open.value = true
}

watch(
  () => [props.autoOpen, props.carteras.length, model.value] as const,
  () => {
    if (
      props.autoOpen &&
      props.carteras.length > 0 &&
      (model.value === '' || model.value == null) &&
      !autoOpenedRef.value
    ) {
      autoOpenedRef.value = true
      open.value = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="cartera-dropdown">
    <button
      type="button"
      class="cartera-dropdown-trigger"
      :class="{ 'cartera-dropdown-trigger--disabled': disabled || !canOpen }"
      :disabled="disabled || !canOpen"
      @click="openList"
    >
    <span class="cartera-dropdown-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7h18M3 12h18M3 17h18" />
      </svg>
    </span>
    <span class="cartera-dropdown-text">
      <span class="cartera-dropdown-label">{{ triggerLabel }}</span>
      <span class="cartera-dropdown-value">{{ triggerValue }}</span>
      <span v-if="selected?.dia_cobro" class="cartera-dropdown-meta">
        Día de cobro: {{ labelDiaCobro(selected.dia_cobro) }}
      </span>
    </span>
    <span class="cartera-dropdown-chevron" aria-hidden="true">▾</span>
  </button>

  <Teleport to="body">
    <div v-if="open" class="cartera-dropdown-backdrop" @click="open = false">
      <div class="cartera-dropdown-sheet" role="dialog" aria-modal="true" @click.stop>
        <header class="cartera-dropdown-header">
          <h3 class="cartera-dropdown-title">Seleccionar cartera</h3>
          <button type="button" class="cartera-dropdown-close" aria-label="Cerrar" @click="open = false">
            ×
          </button>
        </header>

        <ul v-if="carteras.length" class="cartera-dropdown-list">
          <li v-for="item in carteras" :key="item.id_cartera">
            <button
              type="button"
              class="cartera-dropdown-option"
              :class="{ 'cartera-dropdown-option--active': item.id_cartera === model }"
              @click="select(item.id_cartera)"
            >
              <span class="cartera-dropdown-option-text">
                <span class="cartera-dropdown-option-name">{{ item.nombre }}</span>
                <span class="cartera-dropdown-option-meta">
                  Día de cobro: {{ labelDiaCobro(item.dia_cobro) }}
                </span>
              </span>
              <span v-if="item.id_cartera === model" class="cartera-dropdown-check" aria-hidden="true">✓</span>
            </button>
          </li>
        </ul>
        <p v-else class="cartera-dropdown-empty">No hay carteras disponibles.</p>
      </div>
    </div>
  </Teleport>
  </div>
</template>

<style scoped>
.cartera-dropdown {
  width: 100%;
  min-width: 0;
}

.cartera-dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.7rem 0.85rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  background: #fff;
  box-shadow: 0 1px 3px rgb(15 23 42 / 8%);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.cartera-dropdown-trigger:hover:not(:disabled) {
  border-color: #94a3b8;
}

.cartera-dropdown-trigger--disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cartera-dropdown-icon {
  display: inline-flex;
  color: #0f172a;
}

.cartera-dropdown-text {
  flex: 1;
  min-width: 0;
}

.cartera-dropdown-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.cartera-dropdown-value {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cartera-dropdown-meta {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.78rem;
  color: #475569;
}

.cartera-dropdown-chevron {
  color: #64748b;
  font-size: 1rem;
  line-height: 1;
}

.cartera-dropdown-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(15 23 42 / 45%);
}

.cartera-dropdown-sheet {
  width: min(100%, 32rem);
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-top-left-radius: 1rem;
  border-top-right-radius: 1rem;
  box-shadow: 0 -8px 30px rgb(15 23 42 / 18%);
}

.cartera-dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid #e2e8f0;
}

.cartera-dropdown-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.cartera-dropdown-close {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
}

.cartera-dropdown-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
}

.cartera-dropdown-option {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border: 0;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.cartera-dropdown-option:hover {
  background: #f8fafc;
}

.cartera-dropdown-option--active {
  background: #0f172a;
}

.cartera-dropdown-option--active:hover {
  background: #0f172a;
}

.cartera-dropdown-option-text {
  flex: 1;
  min-width: 0;
}

.cartera-dropdown-option-name {
  display: block;
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
}

.cartera-dropdown-option--active .cartera-dropdown-option-name,
.cartera-dropdown-option--active .cartera-dropdown-option-meta {
  color: #fff;
}

.cartera-dropdown-option-meta {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.78rem;
  color: #64748b;
}

.cartera-dropdown-check {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}

.cartera-dropdown-empty {
  margin: 0;
  padding: 1.5rem 1rem;
  text-align: center;
  color: #64748b;
  font-size: 0.9rem;
}

@media (min-width: 640px) {
  .cartera-dropdown-backdrop {
    align-items: center;
    padding: 1rem;
  }

  .cartera-dropdown-sheet {
    border-radius: 1rem;
  }
}
</style>
