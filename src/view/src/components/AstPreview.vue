<!-- AstPreview.vue -->
<template>
  <div class="w-full">
    <div
      class="node-content"
      :class="nodeContentClass"
      @click="handleNodeClick"
      @dblclick.stop="handleNodeDblClick"
    >
      <span
        class="caret"
        v-if="hasChildren"
        @click.stop="toggleExpand"
        @dblclick.stop="handleNodeDblClick"
      >
        {{ isExpanded ? '▼' : '▶' }}
      </span>
      <span class="node-icon" :data-kind="iconKey" :title="iconLabel">
        <svg v-if="iconKey === 'template'" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 9h18" />
          <path d="M7 13h4" />
          <path d="M13 13h4" />
        </svg>
        <svg v-else-if="iconKey === 'tag'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 7l-4 5 4 5" />
          <path d="M16 7l4 5-4 5" />
        </svg>
        <svg v-else-if="iconKey === 'script'" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 10l3 2-3 2" />
          <path d="M12 14h5" />
        </svg>
        <svg v-else-if="iconKey === 'style'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3c-3 4-6 7-6 10a6 6 0 0 0 12 0c0-3-3-6-6-10z" />
        </svg>
        <svg v-else-if="iconKey === 'import'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v10" />
          <path d="M7 9l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
        <svg v-else-if="iconKey === 'function'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
        </svg>
        <svg v-else-if="iconKey === 'class'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8l8-4 8 4-8 4-8-4z" />
          <path d="M4 8v8l8 4 8-4V8" />
          <path d="M12 12v8" />
        </svg>
        <svg v-else-if="iconKey === 'variable'" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" />
        </svg>
        <svg v-else-if="iconKey === 'type'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6h14" />
          <path d="M12 6v12" />
        </svg>
        <svg v-else-if="iconKey === 'call'" class="icon-fill" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 6l10 6-10 6z" />
        </svg>
        <svg v-else-if="iconKey === 'text'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14" />
          <path d="M5 12h10" />
          <path d="M5 17h12" />
        </svg>
        <svg v-else-if="iconKey === 'comment'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H10l-4 3v-3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </span>
      <div class="node-text">
        <span class="node-label" v-html="labelHtml"></span>
        <span class="node-type" v-if="showType" v-html="typeHtml"></span>
        <span class="node-location" v-if="node.location">
          ({{ formatLocation(node.location) }})
        </span>
      </div>
      <button
        v-if="copyText"
        class="node-copy-button"
        type="button"
        title="复制节点摘要"
        @click.stop="copyNodeLabel"
      >
        复制
      </button>
    </div>
    <div v-show="isExpandedEffective" class="pl-2">
      <AstPreview
        v-for="child in node.children"
        :key="child.label + child.location?.range[0]?.line"
        :node="child"
        :depth="depth + 1"
        :force-expand="forceExpand"
        :search-spec="searchSpec"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, inject, toRaw } from 'vue'

type SearchSpec = {
  active: boolean
  mode: "regex" | "terms"
  raw: string
  terms: string[]
  regex: RegExp | null
}

const props = defineProps<{
  node: any
  depth: number
  forceExpand?: boolean
  searchSpec?: SearchSpec
}>()

const vscode = inject<any>("vscode", null)
const isExpanded = ref(true)
const hasChildren = computed(() => props.node.children?.length > 0)
const isExpandedEffective = computed(() => props.forceExpand ? true : isExpanded.value)
const nodeKind = computed(() => String(props.node?.kind || "node"))
const copyText = computed(() => {
  const label = String(props.node?.label ?? "").trim()
  return label || ""
})
const nodeContentClass = computed(() => ({
  "is-match": isMatch.value,
  "kind-text": nodeKind.value === "text",
  "kind-comment": nodeKind.value === "comment",
  "kind-tag": nodeKind.value === "tag",
}))

const isMatch = computed(() => matchesNode(props.node, props.searchSpec))
const labelHtml = computed(() => highlightText(String(props.node?.label ?? ""), props.searchSpec))
const typeHtml = computed(() => highlightText(String(props.node?.name ?? ""), props.searchSpec))
const showType = computed(() => {
  if (nodeKind.value === "tag" || nodeKind.value === "text" || nodeKind.value === "comment") {
    return false
  }
  const type = String(props.node?.name ?? "").trim()
  if (!type) return false
  const label = String(props.node?.label ?? "").trim()
  if (!label) return true
  const simplified = type
    .replace(/(Declaration|Expression|Statement|Specifier|Pattern|Literal)$/gi, "")
    .trim()
  const labelLower = label.toLowerCase()
  if (labelLower === type.toLowerCase()) return false
  if (simplified && labelLower === simplified.toLowerCase()) return false
  const prefixHints = [
    "function",
    "class",
    "interface",
    "type",
    "enum",
    "import",
    "export",
    "call",
    "var",
    "let",
    "const",
    "method",
    "prop",
    "property",
    "namespace",
  ]
  if (labelLower.startsWith("<")) return false
  if (prefixHints.some((prefix) => labelLower.startsWith(prefix))) return false
  return true
})

const iconKey = computed(() => getNodeIcon(props.node))
const iconLabel = computed(() => ICON_LABELS[iconKey.value] || '节点')
function toggleExpand() {
  if (props.forceExpand) return
	isExpanded.value = !isExpanded.value
}
function handleNodeClick() {
  if (!props.node?.location || !vscode?.postMessage) return
  if (clickTimer.value) {
    window.clearTimeout(clickTimer.value)
    clickTimer.value = null
  }
  clickTimer.value = window.setTimeout(() => {
    clickTimer.value = null
    const rawLocation = toRaw(props.node.location)
    const safeLocation = rawLocation
      ? JSON.parse(JSON.stringify(rawLocation))
      : rawLocation
    vscode.postMessage({
      command: "revealAstLocation",
      data: safeLocation,
    })
  }, 200)
}

function copyNodeLabel() {
  if (!copyText.value || !vscode?.postMessage) return
  vscode.postMessage({
    command: "copyToClipboard",
    text: copyText.value,
  })
}

const clickTimer = ref<number | null>(null)

function handleNodeDblClick() {
  if (clickTimer.value) {
    window.clearTimeout(clickTimer.value)
    clickTimer.value = null
  }
  toggleExpand()
}
const formatLocation = (loc: any) => {
  if (!loc?.range) return ''
  const start = loc.range[0]
  const end = loc.range[1]
  return `L${start.line + 1}:${start.character}-L${end.line + 1}:${end.character}`
}

function matchesNode(node: any, spec?: SearchSpec): boolean {
  if (!spec?.active) return false
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

function highlightText(text: string, spec?: SearchSpec): string {
  if (!text) return ""
  if (!spec?.active) return escapeHtml(text)
  const regex = buildHighlightRegex(spec)
  if (!regex) return escapeHtml(text)

  let result = ""
  let lastIndex = 0
  regex.lastIndex = 0
  let match: RegExpExecArray | null = null
  while ((match = regex.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    result += escapeHtml(text.slice(lastIndex, start))
    result += `<span class="node-highlight">${escapeHtml(match[0])}</span>`
    lastIndex = end
    if (regex.lastIndex === match.index) {
      regex.lastIndex += 1
    }
  }
  result += escapeHtml(text.slice(lastIndex))
  return result
}

function buildHighlightRegex(spec: SearchSpec): RegExp | null {
  if (spec.mode === "regex" && spec.regex) {
    const flags = spec.regex.flags.includes("g")
      ? spec.regex.flags
      : `${spec.regex.flags}g`
    try {
      return new RegExp(spec.regex.source, flags)
    } catch (err) {
      return null
    }
  }
  if (spec.mode === "terms" && spec.terms.length) {
    const pattern = spec.terms.map(escapeRegExp).join("|")
    if (!pattern) return null
    return new RegExp(pattern, "gi")
  }
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const ICON_LABELS: Record<string, string> = {
  template: "模板",
  script: "脚本",
  style: "样式",
  tag: "标签",
  import: "导入/导出",
  function: "函数",
  class: "类",
  variable: "变量",
  type: "类型",
  call: "调用",
  text: "文本",
  comment: "注释",
  node: "节点",
}

function getNodeIcon(node: any): string {
  const kind = String(node?.kind || "")
  if (kind === "text") return "text"
  if (kind === "comment") return "comment"
  if (kind === "tag") return "tag"
  const label = String(node?.label ?? '').toLowerCase()
  const name = String(node?.name ?? '')

  if (label === 'template' || name === 'vue-template') return 'template'
  if (label === 'script' || name === 'javascript') return 'script'
  if (
    label.startsWith('style') ||
    name === 'css' ||
    name === 'vue-style' ||
    name === 'css-rule'
  ) {
    return 'style'
  }

  if (name.startsWith('Import') || name.startsWith('Export')) return 'import'
  if (
    name === 'FunctionDeclaration' ||
    name === 'TSDeclareFunction' ||
    name === 'ObjectMethod' ||
    name === 'ClassMethod'
  ) {
    return 'function'
  }
  if (name === 'VariableDeclaration') return 'variable'
  if (
    name === 'ClassDeclaration' ||
    name === 'ClassProperty' ||
    name === 'ClassPrivateProperty'
  ) {
    return 'class'
  }
  if (name === 'CallExpression') return 'call'
  if (
    name.startsWith('TS') ||
    name === 'TSTypeAliasDeclaration' ||
    name === 'TSInterfaceDeclaration' ||
    name === 'TSEnumDeclaration'
  ) {
    return 'type'
  }
  if (label && !label.startsWith('#') && !name) return 'tag'
  return 'node'
}
</script>

<style scoped>
.node-container {
  margin-left: calc(v-bind('props.depth || 0') * 20px);
  border-left: 1px solid var(--color-border-light);
  padding-left: 4px;
}

.node-content {
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: background 0.2s;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.node-content:hover {
  background: var(--color-background-secondary);
}

.node-content.is-match {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
}

.node-content.kind-text .node-label {
  color: var(--color-text-secondary);
  font-style: italic;
}

.node-content.kind-comment .node-label {
  color: var(--color-text-tertiary);
  font-style: italic;
}

.node-content.kind-tag .node-label {
  font-weight: 600;
}

.caret {
  display: inline-block;
  width: 16px;
  font-size: 0.8em;
  color: var(--color-text-secondary);
}

.node-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
}

.node-icon svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.node-icon svg.icon-fill {
  fill: currentColor;
  stroke: none;
}

.node-icon[data-kind="template"] {
  color: var(--color-primary);
}

.node-icon[data-kind="script"] {
  color: var(--color-primary-light);
}

.node-icon[data-kind="style"] {
  color: var(--color-primary-dark);
}

.node-icon[data-kind="import"] {
  color: var(--color-primary);
}

.node-icon[data-kind="function"] {
  color: var(--color-text);
}

.node-icon[data-kind="class"] {
  color: var(--color-text-secondary);
}

.node-icon[data-kind="type"] {
  color: var(--color-text-secondary);
}

.node-icon[data-kind="call"] {
  color: var(--color-text);
}

.node-icon[data-kind="text"] {
  color: var(--color-text-secondary);
}

.node-icon[data-kind="comment"] {
  color: var(--color-text-tertiary);
}

.node-text {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.node-copy-button {
  opacity: 0;
  border: 1px solid var(--color-border);
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.68rem;
  line-height: 1.4;
  cursor: pointer;
  flex: 0 0 auto;
  transition: opacity 0.18s ease;
}

.node-content:hover .node-copy-button,
.node-copy-button:focus-visible {
  opacity: 1;
}

.node-label {
  font-weight: 500;
  color: var(--color-text);
  min-width: 0;
  flex: 1 1 auto;
  overflow-wrap: anywhere;
}

.node-type {
  margin-left: 8px;
  color: var(--color-text-secondary);
  font-size: 0.9em;
  white-space: nowrap;
}

.node-location {
  margin-left: 12px;
  color: var(--color-text-tertiary);
  font-size: 0.8em;
  white-space: nowrap;
}

.node-highlight {
  background: color-mix(in srgb, var(--color-primary) 24%, transparent);
  border-radius: 4px;
  padding: 0 2px;
  color: inherit;
}
</style>
