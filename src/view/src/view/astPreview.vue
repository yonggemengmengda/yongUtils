<template>
  <div class="flex flex-col h-full w-full gap-3 ast-root">
    <div v-if="loading" class="text-sm text-theme-secondary">
      正在解析 AST...
    </div>
    <div v-else-if="errorMessage" class="text-sm text-red-400 bg-theme-tertiary border border-theme rounded-lg p-3">
      {{ errorMessage }}
    </div>
    <div v-else-if="!hasContent" class="text-sm text-theme-tertiary">
      暂无可展示的 AST，请打开支持的文件（.vue / .ts / .js / .html）。
    </div>
    <div v-else class="ast-workspace">
      <div
        v-if="summary"
        class="ui-panel insight-panel"
        :class="{ 'is-searching': isFiltering }"
      >
        <div class="insight-header">
          <div class="insight-copy">
            <div class="insight-title-row">
              <h3 class="insight-title">{{ summary.title }}</h3>
              <span class="ui-badge">{{ viewKindLabel }}</span>
            </div>
            <p v-if="summary.subtitle" class="insight-subtitle">{{ summary.subtitle }}</p>
          </div>
          <button
            class="ui-button ghost insight-toggle"
            type="button"
            @click="showInsight = !showInsight"
          >
            {{ showInsight ? "收起摘要" : "展开摘要" }}
          </button>
        </div>

        <div v-if="showInsight && summary.cards?.length" class="insight-cards">
          <div
            v-for="card in summary.cards"
            :key="card.label"
            class="insight-card"
            :class="cardToneClass(card.tone)"
          >
            <div class="insight-card-label">{{ card.label }}</div>
            <div class="insight-card-value">{{ card.value }}</div>
            <div v-if="card.description" class="insight-card-description">
              {{ card.description }}
            </div>
          </div>
        </div>

        <div v-if="showInsight && summary.sections?.length" class="insight-sections">
          <section
            v-for="section in summary.sections"
            :key="section.id"
            class="insight-section"
          >
            <button
              class="insight-section-toggle"
              type="button"
              @click="toggleSection(section.id)"
            >
              <div class="insight-section-copy">
                <h4 class="insight-section-title">{{ section.title }}</h4>
                <p v-if="section.description" class="insight-section-description">
                  {{ section.description }}
                </p>
              </div>
              <div class="insight-section-meta">
                <span class="ui-badge">{{ section.items.length }}</span>
                <span class="insight-chevron">{{ isSectionExpanded(section.id) ? "▾" : "▸" }}</span>
              </div>
            </button>

            <div v-if="isSectionExpanded(section.id) && section.items.length" class="insight-list">
              <button
                v-for="(item, index) in section.items"
                :key="`${section.id}-${item.label}-${index}`"
                class="insight-item"
                :class="itemStatusClass(item.status)"
                type="button"
                :disabled="!item.location"
                @click="revealLocation(item.location)"
              >
                <div class="insight-item-head">
                  <span class="insight-item-label">{{ item.label }}</span>
                  <div class="insight-item-badges">
                    <button
                      v-if="item.copyText"
                      class="insight-copy-button"
                      type="button"
                      :title="item.actionLabel || '复制内容'"
                      @click.stop="copySummaryItem(item)"
                    >
                      复制
                    </button>
                    <span v-if="item.kind" class="ui-badge">{{ item.kind }}</span>
                    <span v-if="item.badge" class="ui-badge">{{ item.badge }}</span>
                  </div>
                </div>
                <div v-if="item.description" class="insight-item-description">
                  {{ item.description }}
                </div>
              </button>
            </div>
            <div v-else-if="isSectionExpanded(section.id)" class="insight-empty">
              {{ section.emptyText || "暂无内容。" }}
            </div>
          </section>
        </div>
      </div>

      <div
        class="ui-panel ast-panel"
        :class="{ 'is-searching': isFiltering }"
      >
        <div class="ast-toolbar">
          <div class="ast-toolbar-main">
            <div class="ast-search">
              <input
                v-model="keyword"
                class="ui-input"
                type="text"
                placeholder="搜索节点（名称 / 类型，支持 /regex/ 或 空格分词）"
              />
            </div>
            <button
              v-if="keyword"
              class="ui-button ghost"
              type="button"
              @click="keyword = ''"
            >
              清空
            </button>
          </div>
          <div class="ast-toolbar-actions">
            <span class="ui-badge">{{ filteredCount }} / {{ totalCount }} 节点</span>
            <button
              v-if="ast.length"
              class="ui-button ghost"
              type="button"
              @click="showRawTree = !showRawTree"
            >
              {{ rawTreeVisible && !isFiltering ? "收起原始 AST" : "展开原始 AST" }}
            </button>
          </div>
        </div>

        <div v-if="regexError" class="ast-error">{{ regexError }}</div>
        <div v-else class="ast-helper">
          {{ rawTreeVisible ? "支持 /regex/，多个关键词用空格分隔（需全部匹配）。" : "结构摘要在上方；需要逐节点排查时再展开原始 AST。" }}
        </div>

        <div
          v-if="rawTreeVisible"
          class="ast-body"
          :class="{ 'is-searching': isFiltering }"
        >
          <div v-if="filteredAst.length === 0" class="text-sm text-theme-tertiary px-1">
            未找到匹配节点。
          </div>
          <div v-else class="ast-tree">
            <AstTreeNode
              v-for="(rootNode, index) in filteredAst"
              :key="String(rootNode.label) + index"
              :node="rootNode"
              :depth="0"
              :force-expand="isFiltering"
              :search-spec="searchSpec"
            />
          </div>
        </div>
        <div v-else class="ast-collapsed">
          原始 AST 还在，只是先收起来了。上面的摘要更适合快速判断结构、联动和缺口。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AstTreeNode from "../components/AstPreview.vue"
import { computed, inject, onMounted, onUnmounted, ref } from "vue"

type SearchSpec = {
  active: boolean
  mode: "regex" | "terms"
  raw: string
  terms: string[]
  regex: RegExp | null
}

type SummaryCard = {
  label: string
  value: string
  description?: string
  tone?: "default" | "success" | "warning"
}

type SummaryItem = {
  label: string
  description?: string
  kind?: string
  badge?: string
  status?: "linked" | "warning"
  location?: any
  copyText?: string
  actionLabel?: string
}

type SummarySection = {
  id: string
  title: string
  description?: string
  items: SummaryItem[]
  emptyText?: string
}

type SummaryPayload = {
  title: string
  subtitle?: string
  cards: SummaryCard[]
  sections: SummarySection[]
}

type AstMessagePayload = {
  ast: any[]
  viewKind?: "vue" | "script" | "html"
  summary?: SummaryPayload
}

const vscode = inject<any>("vscode")

const ast = ref<any[]>([])
const loading = ref(true)
const errorMessage = ref("")
const keyword = ref("")
const summary = ref<SummaryPayload | null>(null)
const viewKind = ref<"vue" | "script" | "html" | "unknown">("unknown")
const showRawTree = ref(false)
const showInsight = ref(true)
const expandedSectionIds = ref<string[]>([])

const searchParse = computed(() => parseSearch(keyword.value))
const searchSpec = computed(() => searchParse.value.spec)
const regexError = computed(() => searchParse.value.error)
const isFiltering = computed(() => searchSpec.value.active)
const filteredAst = computed(() => {
  if (!searchSpec.value.active) return ast.value
  return filterAstNodes(ast.value, searchSpec.value)
})
const totalCount = computed(() => countNodes(ast.value))
const filteredCount = computed(() => countNodes(filteredAst.value))
const hasContent = computed(() => ast.value.length > 0 || Boolean(summary.value))
const rawTreeVisible = computed(() => isFiltering.value || showRawTree.value || !summary.value)
const viewKindLabel = computed(() => {
  switch (viewKind.value) {
    case "vue":
      return "Vue"
    case "script":
      return "Script"
    case "html":
      return "HTML"
    default:
      return "AST"
  }
})

function requestAst() {
  if (!vscode) {
    loading.value = false
    errorMessage.value = "当前环境不可用，请在 VS Code 中打开。"
    return
  }
  vscode.postMessage({
    command: "getCurrentAst",
  })
}

function handleMessage(event: MessageEvent) {
  const message = event.data
  if (message.command === "currentAstChanged") {
    applyPayload(message.data)
    errorMessage.value = ""
    loading.value = false
  }
  if (message.command === "currentAstError") {
    ast.value = []
    summary.value = null
    viewKind.value = "unknown"
    errorMessage.value = message.data?.message || "无法解析当前文件。"
    loading.value = false
  }
}

function applyPayload(payload: AstMessagePayload | any[]) {
  if (Array.isArray(payload)) {
    ast.value = payload
    summary.value = null
    viewKind.value = "unknown"
    showRawTree.value = true
    showInsight.value = false
    expandedSectionIds.value = []
    return
  }

  ast.value = Array.isArray(payload?.ast) ? payload.ast : []
  summary.value = payload?.summary || null
  viewKind.value = payload?.viewKind || "unknown"
  showRawTree.value = !summary.value
  showInsight.value = Boolean(summary.value)
  expandedSectionIds.value = getDefaultExpandedSections(summary.value)
}

function revealLocation(location: any) {
  if (!location || !vscode?.postMessage) return
  const safeLocation = JSON.parse(JSON.stringify(location))
  vscode.postMessage({
    command: "revealAstLocation",
    data: safeLocation,
  })
}

function copySummaryItem(item: SummaryItem) {
  if (!item.copyText || !vscode?.postMessage) return
  vscode.postMessage({
    command: "copyToClipboard",
    text: item.copyText,
  })
}

function parseSearch(input: string): { spec: SearchSpec; error: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return {
      spec: { active: false, mode: "terms", raw: "", terms: [], regex: null },
      error: "",
    }
  }

  if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
    const lastSlash = trimmed.lastIndexOf("/")
    const pattern = trimmed.slice(1, lastSlash)
    const flags = trimmed.slice(lastSlash + 1)
    if (pattern) {
      try {
        const regex = new RegExp(pattern, flags)
        return {
          spec: {
            active: true,
            mode: "regex",
            raw: trimmed,
            terms: [],
            regex,
          },
          error: "",
        }
      } catch (err) {
        return {
          spec: buildTermSpec(trimmed),
          error: "正则无效，已按文本搜索。",
        }
      }
    }
  }

  return { spec: buildTermSpec(trimmed), error: "" }
}

function buildTermSpec(input: string): SearchSpec {
  const terms = input
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => term.toLowerCase())
  return {
    active: terms.length > 0,
    mode: "terms",
    raw: input,
    terms,
    regex: null,
  }
}

function countNodes(nodes: any[]): number {
  if (!Array.isArray(nodes)) return 0
  let total = 0
  const stack = [...nodes]
  while (stack.length) {
    const node = stack.pop()
    if (!node) continue
    total += 1
    if (Array.isArray(node.children) && node.children.length) {
      stack.push(...node.children)
    }
  }
  return total
}

function matchesNode(node: any, spec: SearchSpec): boolean {
  if (!spec.active) return true
  const labelRaw = String(node?.label ?? "")
  const nameRaw = String(node?.name ?? "")
  const combinedRaw = `${labelRaw} ${nameRaw}`.trim()

  if (spec.mode === "regex" && spec.regex) {
    spec.regex.lastIndex = 0
    return spec.regex.test(combinedRaw)
  }

  if (spec.mode === "terms" && spec.terms.length) {
    const combined = combinedRaw.toLowerCase()
    return spec.terms.every((term) => combined.includes(term))
  }

  return false
}

function filterAstNodes(nodes: any[], spec: SearchSpec): any[] {
  if (!Array.isArray(nodes)) return []
  return nodes
    .map((node) => filterAstNode(node, spec))
    .filter(Boolean) as any[]
}

function filterAstNode(node: any, spec: SearchSpec): any | null {
  if (!node) return null
  const children = Array.isArray(node.children)
    ? filterAstNodes(node.children, spec)
    : []
  if (matchesNode(node, spec) || children.length > 0) {
    return { ...node, children }
  }
  return null
}

function cardToneClass(tone?: SummaryCard["tone"]) {
  if (tone === "success") return "is-success"
  if (tone === "warning") return "is-warning"
  return ""
}

function itemStatusClass(status?: SummaryItem["status"]) {
  if (status === "linked") return "is-linked"
  if (status === "warning") return "is-warning"
  return ""
}

function isSectionExpanded(sectionId: string) {
  return expandedSectionIds.value.includes(sectionId)
}

function toggleSection(sectionId: string) {
  if (isSectionExpanded(sectionId)) {
    expandedSectionIds.value = expandedSectionIds.value.filter((id) => id !== sectionId)
    return
  }
  expandedSectionIds.value = [...expandedSectionIds.value, sectionId]
}

function getDefaultExpandedSections(summaryPayload: SummaryPayload | null): string[] {
  if (!summaryPayload?.sections?.length) return []
  const preferred = summaryPayload.sections
    .filter((section) =>
      section.id.includes("dependency") ||
      section.id.includes("links") ||
      section.id.includes("contract") ||
      section.id.includes("reactivity") ||
      section.id.includes("exports") ||
      section.id.includes("hooks")
    )
    .map((section) => section.id)

  if (preferred.length > 0) {
    return [...new Set(preferred.slice(0, 3))]
  }
  return [summaryPayload.sections[0].id]
}

onMounted(() => {
  window.addEventListener("message", handleMessage)
  requestAst()
})

onUnmounted(() => {
  window.removeEventListener("message", handleMessage)
})
</script>

<style scoped>
.ast-root {
  min-height: 0;
  overflow: hidden;
}

.ast-workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  flex: 1 1 auto;
}

.insight-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
}

.insight-panel.is-searching {
  max-height: clamp(140px, 24vh, 220px);
}

.insight-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.insight-copy {
  min-width: 0;
}

.insight-toggle {
  flex: 0 0 auto;
}

.insight-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.insight-title {
  margin: 0;
  font-size: 0.96rem;
  font-weight: 600;
  color: var(--color-text);
}

.insight-subtitle {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 0.76rem;
}

.insight-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
}

.insight-card {
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-background-secondary) 88%, transparent);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.insight-card.is-success {
  border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border) 72%);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-background-secondary) 90%);
}

.insight-card.is-warning {
  border-color: color-mix(in srgb, #f59e0b 42%, var(--color-border) 58%);
  background: color-mix(in srgb, #f59e0b 8%, var(--color-background-secondary) 92%);
}

.insight-card-label {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}

.insight-card-value {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--color-text);
}

.insight-card-description {
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.insight-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.insight-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.insight-section-toggle {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.insight-section-toggle:hover {
  color: var(--color-text);
}

.insight-section-copy {
  min-width: 0;
}

.insight-section-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.insight-section-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text);
}

.insight-section-description {
  margin: 2px 0 0;
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}

.insight-chevron {
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  line-height: 1;
  padding-top: 4px;
}

.insight-list {
  display: grid;
  gap: 8px;
}

.insight-item {
  border: 1px solid var(--color-border);
  background: var(--color-background);
  border-radius: 10px;
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.insight-item:hover:not(:disabled) {
  border-color: var(--color-border-dark);
  background: var(--color-background-secondary);
}

.insight-item:disabled {
  cursor: default;
  opacity: 0.76;
}

.insight-item.is-linked {
  border-color: color-mix(in srgb, var(--color-primary) 24%, var(--color-border) 76%);
}

.insight-item.is-warning {
  border-color: color-mix(in srgb, #f59e0b 40%, var(--color-border) 60%);
}

.insight-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.insight-item-label {
  font-weight: 600;
  color: var(--color-text);
  overflow-wrap: anywhere;
  min-width: 0;
}

.insight-item-badges {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
}

.insight-copy-button {
  border: 1px solid var(--color-border);
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.68rem;
  line-height: 1.4;
  cursor: pointer;
}

.insight-copy-button:hover {
  color: var(--color-text);
  border-color: var(--color-border-dark);
}

.insight-item-description {
  font-size: 0.74rem;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.insight-empty {
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--color-text-tertiary);
  font-size: 0.74rem;
}

.ast-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.ast-panel.is-searching {
  flex-basis: auto;
}

.ast-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.ast-toolbar-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 260px;
  min-width: 220px;
}

.ast-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ast-search {
  flex: 1 1 220px;
  min-width: 200px;
}

.ast-helper {
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.ast-error {
  font-size: 0.72rem;
  color: #f59e0b;
}

.ast-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.ast-body.is-searching {
  min-height: clamp(320px, 52vh, 640px);
}

.ast-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ast-collapsed {
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  padding: 12px;
  color: var(--color-text-tertiary);
  font-size: 0.78rem;
}
</style>
