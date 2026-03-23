<template>
  <div class="ui-stack h-full">
    <div class="ui-row justify-between">
      <div class="ui-stack" style="gap: 4px;">
        <span class="ui-label">Git Commit 配置</span>
        <span class="ui-help">单独管理 Git Commit 评论生成规范、Emoji 和补充提示词</span>
      </div>
      <div class="ui-row">
        <button class="ui-button ghost" @click="resetGenerationSpec" :disabled="configLoading || configSaving">
          恢复默认规范
        </button>
        <button class="ui-button ghost" @click="requestConfig" :disabled="configLoading || configSaving">
          刷新配置
        </button>
        <button class="ui-button primary" @click="saveConfig" :disabled="configLoading || configSaving">
          {{ configSaving ? "保存中..." : "保存配置" }}
        </button>
      </div>
    </div>

    <div class="ui-card ui-stack" style="gap: 10px;">
      <div class="ui-row justify-between">
        <span class="ui-label">保存范围</span>
        <span class="ui-badge">{{ config.saveScopeLabel || "当前工作区" }}</span>
      </div>
      <div class="ui-help">
        这里保存的是 VS Code 配置项。生成按钮仍然会结合当前仓库的 Git Diff，只是输出格式由这里控制。
      </div>
      <div class="ui-help">
        当前生效规范：{{ config.generationSpecSourceLabel || "使用内置团队规范" }}
      </div>
    </div>

    <div class="ui-card ui-stack" style="gap: 10px;">
      <div class="ui-row justify-between">
        <div class="ui-stack" style="gap: 4px;">
          <span class="ui-label">自动识别预设</span>
          <span class="ui-help">优先读取项目根目录的 <code>.commitlintrc.js</code> 并推导更合适的提交格式</span>
        </div>
        <button
          v-if="config.detectedPreset"
          class="ui-button ghost"
          @click="applyDetectedPreset"
          :disabled="configLoading || configSaving"
        >
          应用识别预设
        </button>
      </div>
      <div v-if="config.detectedPreset" class="ui-stack" style="gap: 8px;">
        <div class="ui-row justify-between">
          <span class="ui-badge">{{ config.detectedPreset.sourceFileName }}</span>
          <span class="ui-badge">{{ config.detectedPreset.workspaceName }}</span>
        </div>
        <div class="ui-help">{{ config.detectedPreset.sourceFilePath }}</div>
        <div class="ui-help">{{ config.detectedPreset.summary }}</div>
        <code class="commit-preview compact">{{ config.detectedPreset.generationSpec }}</code>
      </div>
      <div v-else class="ui-help">
        当前工作区未检测到项目根目录下的 <code>.commitlintrc.js</code> 或兼容 commitlint 配置文件，将继续使用内置团队规范。
      </div>
    </div>

    <div class="ui-stack" style="gap: 6px;">
      <label class="ui-label">生成规范</label>
      <textarea
        class="ui-textarea"
        rows="8"
        v-model="config.generationSpec"
        placeholder="例如：严格输出 feat: 描述，summary 使用中文单行"
      ></textarea>
      <div class="ui-help">
        这是主规则，建议在这里写死团队格式，比如 <code>&lt;type&gt;: &lt;summary&gt;</code> 或 <code>&lt;type&gt;(&lt;scope&gt;): &lt;summary&gt;</code>。
      </div>
      <div class="ui-row">
        <button class="ui-button ghost" @click="useRecommendedPreset" :disabled="configLoading || configSaving">
          使用推荐预设
        </button>
        <button class="ui-button ghost" @click="resetGenerationSpec" :disabled="configLoading || configSaving">
          恢复内置规范
        </button>
      </div>
    </div>

    <div class="ui-stack" style="gap: 8px;">
      <label class="ui-label">Git Commit Emoji</label>
      <div class="ui-segmented">
        <button type="button" :data-active="!config.includeEmoji" @click="config.includeEmoji = false">
          纯文本
        </button>
        <button type="button" :data-active="config.includeEmoji" @click="config.includeEmoji = true">
          带 Emoji
        </button>
      </div>
      <div class="ui-help">
        开启后会按标题内容自动补充更合适的 Emoji，例如 <code>⬆️ chore: 升级依赖</code>、<code>📝 docs: 更新文档</code>。
      </div>
    </div>

    <div class="ui-stack" style="gap: 8px;">
      <label class="ui-label">细节摘要</label>
      <div class="ui-segmented">
        <button type="button" :data-active="!config.includeDetailSummary" @click="config.includeDetailSummary = false">
          仅标题
        </button>
        <button type="button" :data-active="config.includeDetailSummary" @click="config.includeDetailSummary = true">
          标题 + 摘要
        </button>
      </div>
      <div class="ui-help">
        开启后会在提交标题下方自动补充多行摘要，格式为 <code>- 细节描述</code>。
      </div>
    </div>

    <div class="ui-stack" style="gap: 6px;">
      <label class="ui-label">补充提示词</label>
      <textarea
        class="ui-textarea"
        rows="5"
        v-model="config.customPrompt"
        placeholder="例如：优先体现模块名；涉及 API 变更时在 summary 中直接说明"
      ></textarea>
      <div class="ui-help">
        这是附加约束，适合放团队习惯、命名偏好、是否强调模块名等补充规则。
      </div>
    </div>

    <div class="ui-stack" style="gap: 6px;">
      <div class="ui-row justify-between">
        <label class="ui-label">摘要提示词</label>
        <button class="ui-button ghost" @click="resetDetailSummaryPrompt" :disabled="configLoading || configSaving">
          恢复默认摘要提示词
        </button>
      </div>
      <textarea
        class="ui-textarea"
        rows="6"
        v-model="config.detailSummaryPrompt"
        placeholder="例如：每条摘要都体现具体模块、行为变化和用户影响"
      ></textarea>
      <div class="ui-help">
        这部分只控制标题下方的细节摘要。你可以要求它强调模块、影响范围、风险点或迁移说明。
      </div>
    </div>

    <div class="ui-card ui-stack" style="gap: 8px;">
      <div class="ui-row justify-between">
        <span class="ui-label">示例预览</span>
        <span class="ui-badge">{{ previewModeLabel }}</span>
      </div>
      <code class="commit-preview">{{ previewExample }}</code>
      <div class="ui-help">
        这是格式示例。实际生成内容会根据当前代码改动自动决定提交类型和摘要。
      </div>
    </div>

    <div v-if="configStatus" class="ui-help" :class="configStatusType === 'error' ? 'text-red-400' : ''">
      {{ configStatus }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from "vue"

// @ts-ignore
const vscode = inject<any>("vscode")

type GitCommitConfigState = {
  generationSpec: string
  customPrompt: string
  includeEmoji: boolean
  includeDetailSummary: boolean
  detailSummaryPrompt: string
  defaultGenerationSpec: string
  defaultDetailSummaryPrompt: string
  recommendedGenerationSpec: string
  generationSpecSource: "custom" | "commitlint" | "default"
  generationSpecSourceLabel: string
  detectedPreset: {
    sourceFileName: string
    sourceFilePath: string
    workspaceName: string
    generationSpec: string
    summary: string
    typeNames: string[]
  } | null
  saveScopeLabel: string
}

const config = ref<GitCommitConfigState>({
  generationSpec: "",
  customPrompt: "",
  includeEmoji: false,
  includeDetailSummary: true,
  detailSummaryPrompt: "",
  defaultGenerationSpec: "",
  defaultDetailSummaryPrompt: "",
  recommendedGenerationSpec: "",
  generationSpecSource: "default",
  generationSpecSourceLabel: "",
  detectedPreset: null,
  saveScopeLabel: "",
})

const configLoading = ref(false)
const configSaving = ref(false)
const configStatus = ref("")
const configStatusType = ref<"error" | "info" | "">("")

const previewExample = computed(() => {
  const title = config.value.includeEmoji
    ? "⚙️ feat: 新增 Git Commit 配置页"
    : "feat: 新增 Git Commit 配置页"

  if (!config.value.includeDetailSummary) {
    return title
  }

  return [
    title,
    "",
    "- 增加独立配置页管理提交规范和摘要策略",
    "- 支持根据项目规则自动生成更贴合的提交细节",
  ].join("\n")
})

const previewModeLabel = computed(() => {
  const titleMode = config.value.includeEmoji ? "Emoji" : "纯文本"
  const detailMode = config.value.includeDetailSummary ? "标题 + 摘要" : "仅标题"
  return `${titleMode} / ${detailMode}`
})

function requestConfig() {
  if (!vscode) return
  configLoading.value = true
  configStatus.value = ""
  vscode.postMessage({
    command: "getGitCommitConfig",
  })
}

function saveConfig() {
  if (!vscode) return
  configSaving.value = true
  configStatus.value = ""
  vscode.postMessage({
    command: "saveGitCommitConfig",
    data: {
      generationSpec: config.value.generationSpec,
      customPrompt: config.value.customPrompt,
      includeEmoji: config.value.includeEmoji,
      includeDetailSummary: config.value.includeDetailSummary,
      detailSummaryPrompt: config.value.detailSummaryPrompt,
    },
  })
}

function resetGenerationSpec() {
  config.value.generationSpec = config.value.defaultGenerationSpec
}

function useRecommendedPreset() {
  config.value.generationSpec =
    config.value.recommendedGenerationSpec || config.value.defaultGenerationSpec
}

function applyDetectedPreset() {
  if (!config.value.detectedPreset?.generationSpec) return
  config.value.generationSpec = config.value.detectedPreset.generationSpec
}

function resetDetailSummaryPrompt() {
  config.value.detailSummaryPrompt = config.value.defaultDetailSummaryPrompt
}

function applyConfigPayload(payload: any) {
  config.value = {
    generationSpec: payload?.generationSpec || "",
    customPrompt: payload?.customPrompt || "",
    includeEmoji: Boolean(payload?.includeEmoji),
    includeDetailSummary:
      typeof payload?.includeDetailSummary === "boolean"
        ? payload.includeDetailSummary
        : true,
    detailSummaryPrompt: payload?.detailSummaryPrompt || "",
    defaultGenerationSpec: payload?.defaultGenerationSpec || "",
    defaultDetailSummaryPrompt: payload?.defaultDetailSummaryPrompt || "",
    recommendedGenerationSpec:
      payload?.recommendedGenerationSpec || payload?.defaultGenerationSpec || "",
    generationSpecSource: payload?.generationSpecSource || "default",
    generationSpecSourceLabel: payload?.generationSpecSourceLabel || "使用内置团队规范",
    detectedPreset: payload?.detectedPreset || null,
    saveScopeLabel: payload?.saveScopeLabel || "当前工作区",
  }
}

function handleMessage(event: MessageEvent) {
  const message = event.data
  if (message.command === "getGitCommitConfigRes") {
    applyConfigPayload(message.data)
    configLoading.value = false
    configSaving.value = false
    configStatus.value = "配置已加载"
    configStatusType.value = "info"
    return
  }
  if (message.command === "saveGitCommitConfigRes") {
    applyConfigPayload(message.data)
    configSaving.value = false
    configLoading.value = false
    configStatus.value = "配置已保存"
    configStatusType.value = "info"
    return
  }
  if (message.command === "gitCommitConfigError") {
    configSaving.value = false
    configLoading.value = false
    configStatus.value = message.data?.message || "配置操作失败"
    configStatusType.value = "error"
  }
}

onMounted(() => {
  window.addEventListener("message", handleMessage)
  requestConfig()
})

onUnmounted(() => {
  window.removeEventListener("message", handleMessage)
})
</script>

<style scoped>
.commit-preview {
  display: block;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-background-tertiary);
  color: var(--color-text);
  font-family: var(--vscode-editor-font-family, var(--vscode-font-family, monospace));
  font-size: 0.9rem;
  white-space: pre-wrap;
}

.commit-preview.compact {
  font-size: 0.8rem;
}
</style>
