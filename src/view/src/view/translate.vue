<template>
  <div class="ui-stack h-full">
    <div class="ui-row justify-between">
      <span class="ui-label">翻译管理</span>
      <div class="ui-row">
        <button
          class="ui-button ghost icon config-gear-btn"
          title="AI 配置"
          aria-label="打开 AI 配置"
          @click="openConfigModal"
        >
          ⚙
        </button>
        <button class="ui-button ghost" @click="getTranslatedList">刷新列表</button>
      </div>
    </div>

    <input class="ui-input" v-model="kw" placeholder="输入关键字过滤" />

    <div v-if="loading" class="ui-help">正在加载翻译数据...</div>

    <div v-else class="ui-stack">
      <div v-if="!localList.length" class="ui-help">暂无匹配数据</div>
      <div v-for="item in localList" :key="item.original" class="ui-card">
        <div class="ui-row justify-between">
          <div class="ui-stack" style="gap: 6px;">
            <span class="text-sm text-theme">{{ item.original }}</span>
            <span class="text-sm text-theme-secondary">{{ item.translated }}</span>
          </div>
          <div class="ui-row">
            <button class="ui-button" @click="copy(item.translated)">复制</button>
            <button class="ui-button danger" @click="handleRemove(item.original)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showConfigModal" class="config-modal-backdrop" @click="closeConfigModal">
      <div class="config-modal-card ui-stack" @click.stop>
        <div class="ui-row justify-between">
          <span class="ui-label">AI 配置</span>
          <div class="ui-row">
            <button class="ui-button ghost" @click="requestAiConfig" :disabled="configLoading || configSaving">
              刷新配置
            </button>
            <button class="ui-button primary" @click="saveAiConfig" :disabled="configLoading || configSaving">
              {{ configSaving ? "保存中..." : "保存配置" }}
            </button>
            <button class="ui-button ghost" @click="closeConfigModal">关闭</button>
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

        <div class="ui-stack" style="gap: 6px;">
          <label class="ui-label">系统提示词</label>
          <textarea class="ui-textarea" rows="6" v-model="aiConfig.systemPrompt"></textarea>
        </div>

        <div class="ui-stack" style="gap: 6px;">
          <label class="ui-label">通用翻译提示词模板</label>
          <textarea class="ui-textarea" rows="4" v-model="aiConfig.translatePromptTemplate"></textarea>
        </div>

        <div class="ui-stack" style="gap: 6px;">
          <label class="ui-label">英文命名提示词模板</label>
          <textarea class="ui-textarea" rows="4" v-model="aiConfig.namingPromptTemplate"></textarea>
        </div>

        <div class="ui-help">
          模板变量: <code v-pre>{{text}}</code>、<code v-pre>{{targetLanguage}}</code>
        </div>
        <div v-if="configStatus" class="ui-help" :class="configStatusType === 'error' ? 'text-red-400' : ''">
          {{ configStatus }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, inject, computed } from "vue"

// @ts-ignore
const vscode = inject<any>("vscode")
const loading = ref(true)
const kw = ref("")
const list = ref<
  {
    original: string
    translated: string
  }[]
>([])

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
  systemPrompt: string
  translatePromptTemplate: string
  namingPromptTemplate: string
  presets: AiPreset[]
}

const aiConfig = ref<AiConfigState>({
  presetId: "qwen",
  apiKey: "",
  baseURL: "",
  model: "",
  systemPrompt: "",
  translatePromptTemplate: "",
  namingPromptTemplate: "",
  presets: [],
})
const configLoading = ref(false)
const configSaving = ref(false)
const configStatus = ref("")
const configStatusType = ref<"error" | "info" | "">("")
const showConfigModal = ref(false)

const localList = computed(() => {
  return list.value.filter((item) =>
    item.original.toLowerCase().includes(kw.value.toLowerCase())
  )
})

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
      systemPrompt: aiConfig.value.systemPrompt,
      translatePromptTemplate: aiConfig.value.translatePromptTemplate,
      namingPromptTemplate: aiConfig.value.namingPromptTemplate,
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
    systemPrompt: payload?.systemPrompt || "",
    translatePromptTemplate: payload?.translatePromptTemplate || "",
    namingPromptTemplate: payload?.namingPromptTemplate || "",
    presets: Array.isArray(payload?.presets) ? payload.presets : [],
  }
}

function openConfigModal() {
  showConfigModal.value = true
  requestAiConfig()
}

function closeConfigModal() {
  showConfigModal.value = false
}

function getTranslatedList() {
  if (!vscode) return
  loading.value = true
  vscode.postMessage({
    command: "getTranslatedList",
    data: {
      kw: kw.value,
    },
  })
}

onMounted(() => {
  window.addEventListener("message", handleMessage)
  getTranslatedList()
})

onUnmounted(() => {
  window.removeEventListener("message", handleMessage)
})

function handleMessage(event: MessageEvent) {
  const message = event.data
  if (message.command === "getTranslatedListRes") {
    list.value = message.data
    loading.value = false
    return
  }
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

function handleRemove(original: string) {
  if (!vscode) return
  vscode.postMessage({
    command: "removeTranslated",
    data: original,
  })
  list.value = list.value.filter((item) => item.original !== original)
}

function copy(text: string) {
  navigator.clipboard
    .writeText(text)
    .catch((err) => console.error("Could not copy text: ", err))
}

</script>

<style scoped>
.config-gear-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
}

.config-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
}

.config-modal-card {
  width: min(860px, 96vw);
  padding: 24px;
  max-height: 86vh;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-background-secondary);
  box-shadow: 0 24px 48px -30px var(--color-shadow);
}
</style>
