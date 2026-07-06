<script setup lang="ts">
import InputText from 'primevue/inputtext'

import { filtrarEntradaDniHn } from '@/utils/documentoHonduras'

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
    placeholder: '0801-1990-12345',
    disabled: false,
  },
)

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  model.value = filtrarEntradaDniHn(input.value)
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
    maxlength="17"
    :disabled="disabled"
    fluid
    @input="onInput"
  />
</template>
