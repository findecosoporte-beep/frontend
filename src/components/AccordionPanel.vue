<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    icon?: string
    defaultOpen?: boolean
  }>(),
  {
    icon: 'pi pi-chevron-right',
    defaultOpen: false,
  },
)

const open = ref(props.defaultOpen)
</script>

<template>
  <section class="accordion-panel">
    <button type="button" class="accordion-panel-header" :aria-expanded="open" @click="open = !open">
      <i :class="icon" class="accordion-panel-icon" aria-hidden="true" />
      <span class="accordion-panel-title">{{ title }}</span>
      <i :class="open ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" aria-hidden="true" />
    </button>
    <div v-show="open" class="accordion-panel-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.accordion-panel {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  background: #fff;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.accordion-panel-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.85rem 0.9rem;
  border: 0;
  background: #fff;
  cursor: pointer;
  text-align: left;
}

.accordion-panel-icon {
  color: #0f172a;
  font-size: 0.95rem;
}

.accordion-panel-title {
  flex: 1;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.accordion-panel-body {
  padding: 0.75rem 0.9rem 0.9rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
</style>
