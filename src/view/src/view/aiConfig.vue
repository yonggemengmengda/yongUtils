<template>
  <div class="ui-stack h-full">
    <div class="ui-row justify-between">
      <div class="ui-stack" style="gap: 4px;">
        <span class="ui-label">AI 基础配置</span>
        <span class="ui-help">统一管理 API Key、Base URL 和模型，翻译与 Git Commit 共用这套连接配置。</span>
      </div>
      <div class="ui-row">
        <button class="ui-button ghost" @click="requestAiConfig" :disabled="configLoading || configSaving">
          刷新配置
        </button>
        <button class="ui-button primary" @click="saveAiConfig" :disabled="configLoading || configSaving">
          {{ configSaving ? "保存中..." : "保存配置" }}
        </button>
      </div>
    </div>

    <div class="ui-card ui-stack" style="gap: 8px;">
      <div class="ui-row justify-between">
        <span class="ui-label">适用范围</span>
        <div class="ui-row">
          <span class="ui-badge">翻译管理</span>
          <span class="ui-badge">Git Commit 生成</span>
        </div>
      </div>
      <div class="ui-help">
        这里配置的是 AI 服务连接。翻译系统提示词、翻译模板、提交模板、摘要策略，仍在各自模块中单独配置。
      </div>
    </div>

    <div class="ui-row">
      <label class="ui-label" style="min-width: 78px;">预设</label>
      <select class="ui-select" v-model="aiConfig.presetId" @change="handlePresetChange">
        <option v-for="item in aiConfig.presets" :key="item.id" :value="item.id">
          {{ item.name }}
        </option>
      </select>
    </div>

    <div class="ui-row">
      <label class="ui-label" style="min-width: 78px;">API Key</label>
      <input
        class="ui-input"
        type="password"
        v-model.trim="aiConfig.apiKey"
        placeholder="请输入 API Key，留空并保存表示清空"
      />
    </div>

    <div class="ui-row">
      <label class="ui-label" style="min-width: 78px;">Base URL</label>
      <input class="ui-input" type="text" v-model.trim="aiConfig.baseURL" placeholder="如 https://api.openai.com/v1" />
    </div>

    <div class="ui-row">
      <label class="ui-label" style="min-width: 78px;">模型</label>
      <input class="ui-input" type="text" v-model.trim="aiConfig.model" placeholder="如 gpt-4o-mini / qwen-turbo" />
    </div>

    <div v-if="configStatus" class="ui-help" :class="configStatusType === 'error' ? 'text-red-400' : ''">
      {{ configStatus }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from "vue"

// @ts-ignore
const vscode = inject<any>("vscode")

type AiPreset = {
  id: string
  name: string
  baseURL: string
  model: string
}

type AiConfigState = {
  presetId: string
  apiKey: string
  baseURL: string
  model: string
  presets: AiPreset[]
}

const aiConfig = ref<AiConfigState>({
  presetId: "qwen",
  apiKey: "",
  baseURL: "",
  model: "",
  presets: [],
})

const configLoading = ref(false)
const configSaving = ref(false)
const configStatus = ref("")
const configStatusType = ref<"error" | "info" | "">("")

function requestAiConfig() {
  if (!vscode) return
  configLoading.value = true
  configStatus.value = ""
  vscode.postMessage({
    command: "getTranslationAiConfig",
  })
}

function saveAiConfig() {
  if (!vscode) return
  configSaving.value = true
  configStatus.value = ""
  vscode.postMessage({
    command: "saveTranslationAiConfig",
    data: {
      presetId: aiConfig.value.presetId,
      apiKey: aiConfig.value.apiKey,
      baseURL: aiConfig.value.baseURL,
      model: aiConfig.value.model,
    },
  })
}

function handlePresetChange() {
  const selected = aiConfig.value.presets.find((item) => item.id === aiConfig.value.presetId)
  if (!selected) return
  aiConfig.value.baseURL = selected.baseURL
  aiConfig.value.model = selected.model
}

function applyAiConfigPayload(payload: any) {
  aiConfig.value = {
    presetId: payload?.presetId || "custom",
    apiKey: payload?.apiKey || "",
    baseURL: payload?.baseURL || "",
    model: payload?.model || "",
    presets: Array.isArray(payload?.presets) ? payload.presets : [],
  }
}

function handleMessage(event: MessageEvent) {
  const message = event.data
  if (message.command === "getTranslationAiConfigRes") {
    applyAiConfigPayload(message.data)
    configLoading.value = false
    configSaving.value = false
    configStatus.value = "配置已加载"
    configStatusType.value = "info"
    return
  }
  if (message.command === "saveTranslationAiConfigRes") {
    applyAiConfigPayload(message.data)
    configSaving.value = false
    configLoading.value = false
    configStatus.value = "配置已保存"
    configStatusType.value = "info"
    return
  }
  if (message.command === "translationAiConfigError") {
    configSaving.value = false
    configLoading.value = false
    configStatus.value = message.data?.message || "配置操作失败"
    configStatusType.value = "error"
  }
}

onMounted(() => {
  window.addEventListener("message", handleMessage)
  requestAiConfig()
})

onUnmounted(() => {
  window.removeEventListener("message", handleMessage)
})
</script>
