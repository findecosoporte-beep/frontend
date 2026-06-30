<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'

import { useAuthStore } from '@/stores/auth'
import { usePermissions } from '@/composables/usePermissions'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { rol, needsVinculo } = usePermissions()

interface SidebarItem {
  label: string
  icon: string
  routeName?: string
  /** Si existe, el ítem padre despliega sub-entradas en lugar de navegar solo. */
  children?: SidebarItem[]
}

interface SidebarSection {
  title: string
  items: SidebarItem[]
}

const menuSections: SidebarSection[] = [
  {
    title: 'Paneles de control',
    items: [
      { label: 'Inicio', icon: 'pi pi-home', routeName: 'dashboard' },
    ],
  },
  {
    title: 'Aplicaciones',
    items: [
      {
        label: 'Clientes',
        icon: 'pi pi-users',
        children: [
          {
            label: 'Registrar Clientes Findeco',
            icon: 'pi pi-building',
            routeName: 'registrar-clientes-findeco',
          },
          {
            label: 'Ver Clientes Findeco',
            icon: 'pi pi-list',
            routeName: 'ver-clientes-findeco',
          },
        ],
      },
      {
        label: 'Préstamos',
        icon: 'pi pi-wallet',
        children: [
          {
            label: 'Gestión de préstamos',
            icon: 'pi pi-calculator',
            routeName: 'prestamos-gestion',
          },
          {
            label: 'Desembolsos Findeco',
            icon: 'pi pi-send',
            routeName: 'desembolsos-findeco',
          },
          {
            label: 'Estado de cuenta FINDECO',
            icon: 'pi pi-file',
            routeName: 'estado-cuenta-findeco',
          },
        ],
      },
      {
        label: 'Cobros',
        icon: 'pi pi-money-bill',
        children: [
          { label: 'Cobros', icon: 'pi pi-wallet', routeName: 'cobros' },
          {
            label: 'Historial de pagos',
            icon: 'pi pi-history',
            routeName: 'historial-pagos-cobros',
          },
        ],
      },
      { label: 'Usuarios', icon: 'pi pi-id-card', routeName: 'usuarios' },
    ],
  },
]

/** Grupos del menú desplegados (clave = `${section.title}::${item.label}`). */
const expandedMenuGroups = ref<Record<string, boolean>>({})

function menuGroupKey(sectionTitle: string, itemLabel: string) {
  return `${sectionTitle}::${itemLabel}`
}

function isGroupExpanded(sectionTitle: string, item: SidebarItem) {
  return Boolean(expandedMenuGroups.value[menuGroupKey(sectionTitle, item.label)])
}

function toggleMenuGroup(sectionTitle: string, item: SidebarItem) {
  const key = menuGroupKey(sectionTitle, item.label)
  expandedMenuGroups.value = {
    ...expandedMenuGroups.value,
    [key]: !expandedMenuGroups.value[key],
  }
}

function isChildActive(child: SidebarItem): boolean {
  return Boolean(child.routeName && child.routeName === route.name)
}

function isParentWithChildrenActive(item: SidebarItem): boolean {
  return Boolean(item.children?.some((c) => c.routeName === route.name))
}

function isActiveLeaf(item: SidebarItem): boolean {
  return Boolean(item.routeName && item.routeName === route.name)
}

watch(
  () => route.name,
  (name) => {
    for (const section of menuSections) {
      for (const item of section.items) {
        if (!item.children?.length) continue
        if (item.children.some((c) => c.routeName === name)) {
          const key = menuGroupKey(section.title, item.label)
          expandedMenuGroups.value = { ...expandedMenuGroups.value, [key]: true }
        }
      }
    }
  },
  { immediate: true },
)

async function onMenuClick(item: SidebarItem) {
  if (!item.routeName || item.routeName === route.name) return
  await router.push({ name: item.routeName })
}

const rolLabel = computed(() => {
  const r = rol.value
  if (!r) return 'Sin rol'
  const map: Record<string, string> = {
    administrador: 'Administrador',
    supervisor: 'Supervisor',
    asesor: 'Asesor',
    cobrador: 'Cobrador',
    cobranza_adm_jud: 'Cobranza administrativa / judicial (según mora)',
  }
  return map[r] ?? r
})

async function onLogout() {
  auth.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="layout-root">
    <aside class="sidebar">
      <div class="brand">Préstamos</div>
      <div class="side-menu">
        <section v-for="section in menuSections" :key="section.title" class="menu-section">
          <p class="section-title">{{ section.title }}</p>
          <ul class="section-items">
            <li v-for="item in section.items" :key="`${section.title}-${item.label}`">
              <template v-if="item.children?.length">
                <button
                  type="button"
                  class="menu-item menu-item--parent"
                  :class="{ 'menu-item--active': isParentWithChildrenActive(item) }"
                  :aria-expanded="isGroupExpanded(section.title, item)"
                  @click="toggleMenuGroup(section.title, item)"
                >
                  <i class="menu-icon" :class="item.icon" />
                  <span class="menu-item-label">{{ item.label }}</span>
                  <i
                    class="pi pi-chevron-down menu-chevron"
                    :class="{ 'menu-chevron--open': isGroupExpanded(section.title, item) }"
                    aria-hidden="true"
                  />
                </button>
                <ul
                  v-show="isGroupExpanded(section.title, item)"
                  class="submenu-items"
                  :aria-label="`${item.label}: submenú`"
                >
                  <li v-for="child in item.children" :key="`${section.title}-${item.label}-${child.label}`">
                    <button
                      type="button"
                      class="menu-item menu-item--sub"
                      :class="{ 'menu-item--active': isChildActive(child) }"
                      @click="onMenuClick(child)"
                    >
                      <span class="submenu-dot" aria-hidden="true" />
                      <span>{{ child.label }}</span>
                    </button>
                  </li>
                </ul>
              </template>
              <button
                v-else
                type="button"
                class="menu-item"
                :class="{ 'menu-item--active': isActiveLeaf(item) }"
                @click="onMenuClick(item)"
              >
                <i class="menu-icon" :class="item.icon" />
                <span>{{ item.label }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </aside>
    <div class="layout-main">
      <header class="topbar">
        <div class="user-block">
          <span class="user-name">{{
            auth.profile?.nombre_operativo ?? auth.profile?.username ?? 'Usuario'
          }}</span>
          <Tag :value="rolLabel" severity="secondary" />
        </div>
        <Button label="Salir" icon="pi pi-sign-out" severity="secondary" outlined @click="onLogout" />
      </header>
      <div class="layout-content">
        <Message v-if="needsVinculo" severity="warn" class="mb-3" :closable="false">
          Tu usuario de Django no está vinculado a la tabla <code>usuarios</code> (mismo correo). Solo
          lectura en la API; pide a un administrador que cree o actualice el registro.
        </Message>
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout-root {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 16rem;
  flex-shrink: 0;
  border-right: 1px solid #dbe2f0;
  padding: 0.9rem 0.65rem;
  background: #edf1fa;
  color: #37456b;
  overflow: hidden;
}

.brand {
  font-weight: 700;
  font-size: 1.05rem;
  padding: 0.4rem 0.6rem 0.8rem;
  letter-spacing: 0.02em;
}

.side-menu {
  height: calc(100vh - 4.5rem);
  overflow-y: auto;
  padding-right: 0.3rem;
}

.side-menu::-webkit-scrollbar {
  width: 0.42rem;
}

.side-menu::-webkit-scrollbar-thumb {
  background: #a5afc2;
  border-radius: 999px;
}

.menu-section {
  margin-bottom: 0.9rem;
}

.section-title {
  margin: 0.2rem 0.5rem 0.35rem;
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  color: #6b7899;
}

.section-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.menu-item {
  width: 100%;
  border: none;
  background: transparent;
  color: #34456f;
  padding: 0.52rem 0.58rem;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font: inherit;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.menu-item:hover {
  background: #e3eaf9;
}

.menu-item--active {
  background: #ffffff;
  color: #23366b;
  font-weight: 700;
}

.menu-item--parent {
  justify-content: flex-start;
}

.menu-item-label {
  flex: 1;
  text-align: left;
}

.menu-chevron {
  font-size: 0.65rem;
  margin-left: auto;
  opacity: 0.75;
  transition: transform 0.2s ease;
}

.menu-chevron--open {
  transform: rotate(180deg);
}

.submenu-items {
  list-style: none;
  margin: 0.15rem 0 0.35rem;
  padding: 0 0 0 0.35rem;
  border-left: 2px solid #c9d4ec;
  margin-left: 0.85rem;
}

.menu-item--sub {
  padding-left: 0.45rem;
  font-size: 0.9rem;
  border-radius: 0.65rem;
}

.submenu-dot {
  width: 0.35rem;
  height: 0.35rem;
  border-radius: 999px;
  background: #7a8ab5;
  flex-shrink: 0;
}

.menu-icon {
  font-size: 0.88rem;
  width: 1rem;
  text-align: center;
}

.layout-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.08));
}

.user-block {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.user-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layout-content {
  padding: 1.25rem;
  flex: 1;
}
</style>
