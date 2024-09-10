<script setup lang="ts">
import { provide } from "vue"
import Home from "./view/home.vue"
// @ts-expect-error
provide("vscode", window.acquireVsCodeApi?.())
</script>

<template>
  <Home />
</template>
