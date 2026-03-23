<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Navbar from './Navbar.vue'

const props = defineProps<{
  activeTool: string
}>()

const emit = defineEmits(['tool-change'])

// 主题状态管理
const isDarkMode = ref(true)

const updateThemeFromBody = () => {
  const classList = document.body.classList
  if (classList.contains('vscode-dark') || classList.contains('vscode-high-contrast')) {
    isDarkMode.value = true
    return
  }
  if (classList.contains('vscode-light') || classList.contains('vscode-high-contrast-light')) {
    isDarkMode.value = false
    return
  }
  isDarkMode.value = window.matchMedia('(prefers-color-scheme: dark)').matches
}

let themeObserver: MutationObserver | null = null
let mediaQuery: MediaQueryList | null = null

const handleThemeChange = () => {
  updateThemeFromBody()
}

onMounted(() => {
  updateThemeFromBody()

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', handleThemeChange)

  themeObserver = new MutationObserver(handleThemeChange)
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  })
})

onBeforeUnmount(() => {
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', handleThemeChange)
    mediaQuery = null
  }
})

const handleToolChange = (tool: string) => {
  emit('tool-change', tool)
}
</script>

<template>
  <div class="app-shell" :class="isDarkMode ? 'dark' : 'light'">
    <div class="app-nav">
      <Navbar :active-tool="props.activeTool" @tool-change="handleToolChange" />
    </div>
    <main class="app-content">
      <slot />
    </main>
  </div>
</template>
