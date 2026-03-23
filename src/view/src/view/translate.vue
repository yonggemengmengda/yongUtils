<template>
  <div class="ui-stack h-full">
    <div class="ui-row justify-between">
      <div class="ui-stack" style="gap: 4px;">
        <span class="ui-label">翻译管理</span>
        <span class="ui-help">翻译系统提示词和模板统一放在这里管理；AI 连接信息仍在“AI基础配置”页面。</span>
      </div>
      <div class="ui-row">
        <button class="ui-button ghost" @click="openAiConfig">
          打开 AI基础配置
        </button>
        <button class="ui-button ghost" @click="getTranslatedList">刷新列表</button>
      </div>
    </div>

    <div class="ui-card ui-stack" style="gap: 8px;">
      <div class="ui-row justify-between">
        <span class="ui-label">AI 配置入口</span>
        <span class="ui-badge">独立页面</span>
      </div>
      <div class="ui-help">
        模型、API Key、Base URL 统一放在 “AI基础配置” 页面；翻译系统提示词和模板则在当前页单独配置。
      </div>
      <div class="ui-row">
        <button class="ui-button primary" @click="openAiConfig">
          前往 AI基础配置
        </button>
      </div>
    </div>

    <div class="ui-row" style="align-items: stretch;">
      <div class="ui-card ui-stack" style="gap: 10px; flex: 1 1 420px;">
        <div class="ui-row justify-between">
          <div class="ui-stack" style="gap: 4px;">
            <span class="ui-label">翻译提示词配置</span>
            <span class="ui-help">只影响翻译和英文命名，不影响 Git Commit 生成。</span>
          </div>
          <div class="ui-row">
            <button class="ui-button ghost" @click="requestPromptConfig" :disabled="promptConfigLoading || promptConfigSaving">
              刷新模板
            </button>
            <button class="ui-button primary" @click="savePromptConfig" :disabled="promptConfigLoading || promptConfigSaving">
              {{ promptConfigSaving ? "保存中..." : "保存模板" }}
            </button>
          </div>
        </div>

        <div class="ui-stack" style="gap: 6px;">
          <label class="ui-label">翻译系统提示词</label>
          <textarea
            class="ui-textarea"
            rows="5"
            v-model="promptConfig.systemPrompt"
          ></textarea>
        </div>

        <div class="ui-stack" style="gap: 6px;">
          <label class="ui-label">通用翻译提示词模板</label>
          <textarea
            class="ui-textarea"
            rows="4"
            v-model="promptConfig.translatePromptTemplate"
          ></textarea>
        </div>

        <div class="ui-stack" style="gap: 6px;">
          <label class="ui-label">英文命名提示词模板</label>
          <textarea
            class="ui-textarea"
            rows="4"
            v-model="promptConfig.namingPromptTemplate"
          ></textarea>
        </div>

        <div class="ui-help">
          模板变量: <code v-pre>{{text}}</code>、<code v-pre>{{targetLanguage}}</code>
        </div>
        <div v-if="promptConfigStatus" class="ui-help" :class="promptConfigStatusType === 'error' ? 'text-red-400' : ''">
          {{ promptConfigStatus }}
        </div>
      </div>

      <div class="ui-card ui-stack" style="gap: 10px; flex: 1 1 360px; min-width: 300px;">
        <div class="ui-row justify-between">
          <div class="ui-stack" style="gap: 4px;">
            <span class="ui-label">翻译结果缓存</span>
            <span class="ui-help">管理已翻译内容，支持过滤、复制与删除。</span>
          </div>
          <div class="ui-row">
            <span class="ui-badge">总数 {{ totalCount }}</span>
            <span class="ui-badge">匹配 {{ matchedCount }}</span>
          </div>
        </div>

        <div class="ui-stack" style="gap: 6px;">
          <label class="ui-label">关键字过滤</label>
          <input class="ui-input" v-model="kw" placeholder="输入关键字过滤" />
        </div>

        <div class="ui-row justify-between">
          <span class="ui-help">{{ cacheSummaryText }}</span>
          <button class="ui-button ghost" @click="getTranslatedList" :disabled="loading">刷新缓存</button>
        </div>

        <div v-if="loading" class="ui-panel">
          <span class="ui-help">正在加载翻译数据...</span>
        </div>

        <div v-else-if="!localList.length" class="ui-panel">
          <span class="ui-help">{{ kw ? "暂无匹配数据" : "暂无缓存数据" }}</span>
        </div>

        <div v-else class="ui-stack" style="gap: 8px; max-height: 420px; overflow: auto; padding-right: 4px;">
          <div v-for="item in localList" :key="item.original" class="ui-panel">
            <div class="ui-row justify-between">
              <div class="ui-stack" style="gap: 6px; min-width: 0; flex: 1;">
                <span class="ui-label">原文</span>
                <span class="text-sm text-theme" style="word-break: break-word;">{{ item.original }}</span>
                <span class="ui-label">译文</span>
                <span class="text-sm text-theme-secondary" style="word-break: break-word;">{{ item.translated }}</span>
              </div>
              <div class="ui-row">
                <button class="ui-button" @click="copy(item.translated)">复制</button>
                <button class="ui-button danger" @click="handleRemove(item.original)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, inject, computed } from "vue"

// @ts-ignore
const vscode = inject<any>("vscode")
const navigateToTool = inject<((tool: string) => void) | undefined>("navigateToTool")
const loading = ref(true)
const kw = ref("")
const list = ref<
  {
    original: string
    translated: string
  }[]
>([])
const promptConfig = ref({
  systemPrompt: "",
  translatePromptTemplate: "",
  namingPromptTemplate: "",
})
const promptConfigLoading = ref(false)
const promptConfigSaving = ref(false)
const promptConfigStatus = ref("")
const promptConfigStatusType = ref<"error" | "info" | "">("")

const localList = computed(() => {
  return list.value.filter((item) =>
    item.original.toLowerCase().includes(kw.value.toLowerCase())
  )
})
const totalCount = computed(() => list.value.length)
const matchedCount = computed(() => localList.value.length)
const cacheSummaryText = computed(() => {
  if (loading.value) {
    return "正在同步最新翻译缓存..."
  }
  if (!totalCount.value) {
    return "当前还没有翻译缓存记录"
  }
  if (!kw.value.trim()) {
    return `当前共 ${totalCount.value} 条缓存记录`
  }
  return `过滤后显示 ${matchedCount.value} / ${totalCount.value} 条记录`
})

function openAiConfig() {
  navigateToTool?.("AiConfig")
}

function requestPromptConfig() {
  if (!vscode) return
  promptConfigLoading.value = true
  promptConfigStatus.value = ""
  vscode.postMessage({
    command: "getTranslationPromptConfig",
  })
}

function savePromptConfig() {
  if (!vscode) return
  promptConfigSaving.value = true
  promptConfigStatus.value = ""
  vscode.postMessage({
    command: "saveTranslationPromptConfig",
    data: {
      systemPrompt: promptConfig.value.systemPrompt,
      translatePromptTemplate: promptConfig.value.translatePromptTemplate,
      namingPromptTemplate: promptConfig.value.namingPromptTemplate,
    },
  })
}

function applyPromptConfigPayload(payload: any) {
  promptConfig.value = {
    systemPrompt: payload?.systemPrompt || "",
    translatePromptTemplate: payload?.translatePromptTemplate || "",
    namingPromptTemplate: payload?.namingPromptTemplate || "",
  }
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
  requestPromptConfig()
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
  if (message.command === "getTranslationPromptConfigRes") {
    applyPromptConfigPayload(message.data)
    promptConfigLoading.value = false
    promptConfigSaving.value = false
    promptConfigStatus.value = "模板已加载"
    promptConfigStatusType.value = "info"
    return
  }
  if (message.command === "saveTranslationPromptConfigRes") {
    applyPromptConfigPayload(message.data)
    promptConfigLoading.value = false
    promptConfigSaving.value = false
    promptConfigStatus.value = "模板已保存"
    promptConfigStatusType.value = "info"
    return
  }
  if (message.command === "translationPromptConfigError") {
    promptConfigLoading.value = false
    promptConfigSaving.value = false
    promptConfigStatus.value = message.data?.message || "翻译模板配置失败"
    promptConfigStatusType.value = "error"
    return
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
