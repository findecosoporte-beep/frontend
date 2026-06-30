<script setup lang="ts">
import { RouterView } from 'vue-router'

import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'
</script>

<template>
  <div class="app-shell">
    <Toast position="top-right" :closeButtonProps="{ autofocus: false }" />
    <ConfirmDialog />
    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}
</style>
