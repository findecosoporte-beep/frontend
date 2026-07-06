<script setup lang="ts">
import InputText from 'primevue/inputtext'

import { filtrarEntradaTelefonoHn } from '@/utils/telefonoHonduras'

const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    inputId?: string
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    inputId: undefined,
    placeholder: '99998888',
    disabled: false,
  },
)

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  model.value = filtrarEntradaTelefonoHn(input.value)
}
</script>

<template>
  <div class="telefono-hn-input">
    <span class="telefono-hn-prefijo" aria-hidden="true">+504</span>
    <InputText
      :id="inputId"
      :model-value="model"
      class="telefono-hn-field"
      inputmode="numeric"
      pattern="[0-9]*"
      autocomplete="tel-national"
      :placeholder="placeholder"
      maxlength="8"
      :disabled="disabled"
      fluid
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.telefono-hn-input {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
}

.telefono-hn-prefijo {
  display: inline-flex;
  align-items: center;
  padding: 0 0.65rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #334155;
  background: #f1f5f9;
  border: 1px solid var(--p-inputtext-border-color, #cbd5e1);
  border-right: none;
  border-radius: var(--p-inputtext-border-radius, 6px) 0 0 var(--p-inputtext-border-radius, 6px);
  white-space: nowrap;
}

.telefono-hn-field {
  flex: 1;
  min-width: 0;
}

.telefono-hn-field :deep(.p-inputtext) {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
</style>
