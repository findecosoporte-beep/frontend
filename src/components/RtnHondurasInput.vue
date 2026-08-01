<script setup lang="ts">
import InputText from 'primevue/inputtext'

import { filtrarEntradaRtnHn } from '@/utils/documentoHonduras'

defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ default: '' })

withDefaults(
  defineProps<{
    inputId?: string
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    inputId: undefined,
    placeholder: '08019001234567',
    disabled: false,
  },
)

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  model.value = filtrarEntradaRtnHn(input.value)
}
</script>

<template>
  <InputText
    v-bind="$attrs"
    :id="inputId"
    :model-value="model"
    inputmode="numeric"
    autocomplete="off"
    :placeholder="placeholder"
    maxlength="14"
    :disabled="disabled"
    fluid
    @input="onInput"
  />
</template>
