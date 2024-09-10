<template>
  <div class="ui-stack h-full">
    <section class="ui-stack">
      <label class="ui-label">输入 JSON</label>
      <textarea
        class="ui-textarea"
        v-model="curJSON"
        placeholder='例如：{"name": "John", "age": 30, "city": "New York"}'
      />
      <div v-if="jsonError" class="ui-help text-red-400">
        {{ jsonError }}
      </div>
    </section>

    <section class="ui-stack flex-1">
      <div class="ui-row justify-between">
        <div class="ui-row">
          <span class="ui-label">输出结果</span>
          <span v-if="previewType === 'text'" class="ui-badge">{{ outputMode === 'pretty' ? '格式化' : '压缩' }}</span>
        </div>
        <div class="ui-row">
          <div v-if="previewType === 'text'" class="ui-segmented">
            <button :data-active="outputMode === 'pretty'" @click="outputMode = 'pretty'">格式化</button>
            <button :data-active="outputMode === 'minify'" @click="outputMode = 'minify'">压缩</button>
          </div>
          <div class="ui-segmented">
            <button :data-active="previewType === 'tree'" @click="previewType = 'tree'">树状视图</button>
            <button :data-active="previewType === 'text'" @click="previewType = 'text'">文本视图</button>
          </div>
          <select v-if="previewType === 'text' && outputMode === 'pretty'" class="ui-select w-24" v-model.number="indentSize">
            <option :value="2">缩进 2</option>
            <option :value="4">缩进 4</option>
          </select>
          <button class="ui-button" @click="copy" :disabled="copying" :title="copySuccess ? '已复制' : '复制结果'">
            {{ copySuccess ? '已复制' : '复制' }}
          </button>
        </div>
      </div>

      <div class="ui-panel flex-1 overflow-auto">
        <pre v-if="previewType === 'text'" class="text-theme font-mono text-sm break-all whitespace-pre-wrap">{{ outputText }}</pre>
        <div v-else class="h-full overflow-auto">
          <JsonTreeView
            v-if="isJsonValid"
            :json="treeJsonText"
            :maxDepth="6"
            class="text-theme font-mono text-sm"
          />
          <div v-else class="ui-help">无法渲染树状视图，请检查 JSON 格式。</div>
        </div>
      </div>

      <div v-if="jsonStats" class="ui-help">
        字符数: {{ jsonStats.charCount }} | 行数: {{ jsonStats.lineCount }} | 深度: {{ jsonStats.depth }}
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue"
import { JsonTreeView } from "json-tree-view-vue3"
import "json-tree-view-vue3/dist/style.css"

const curJSON = ref("{}")
const previewType = ref<"text" | "tree">("tree")
const outputMode = ref<"pretty" | "minify">("pretty")
const indentSize = ref(2)
const copying = ref(false)
const copySuccess = ref(false)
type JsonParseResult =
  | { ok: true; value: any }
  | { ok: false; error: string }

const parseResult = computed<JsonParseResult>(() => {
  try {
    return { ok: true, value: JSON.parse(curJSON.value) }
  } catch (error: any) {
    return { ok: false, error: error?.message || "无法解析 JSON" }
  }
})

const isJsonValid = computed(() => parseResult.value.ok)
const jsonError = computed(() => (parseResult.value.ok ? "" : parseResult.value.error))
const treeJsonText = computed(() => {
  if (!parseResult.value.ok) return ""
  return JSON.stringify(parseResult.value.value)
})

const outputText = computed(() => {
  if (!parseResult.value.ok) {
    return JSON.stringify(
      {
        error: "JSON格式错误",
        message: jsonError.value || "无法解析",
      },
      null,
      2
    )
  }
  const value = parseResult.value.value
  if (outputMode.value === "minify") {
    return JSON.stringify(value)
  }
  return JSON.stringify(value, null, indentSize.value)
})

const jsonStats = computed(() => {
  if (!parseResult.value.ok) return null
  const jsonString = JSON.stringify(parseResult.value.value, null, indentSize.value)
  const charCount = jsonString.length
  const lineCount = jsonString.split("\n").length
  const depth = calculateDepth(parseResult.value.value)
  return { charCount, lineCount, depth }
})

function calculateDepth(obj: any, currentDepth = 0): number {
  if (typeof obj !== "object" || obj === null) return currentDepth
  let maxDepth = currentDepth
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const depth = calculateDepth(obj[key], currentDepth + 1)
      maxDepth = Math.max(maxDepth, depth)
    }
  }
  return maxDepth
}

async function copy() {
  if (copying.value) return
  copying.value = true
  copySuccess.value = false
  try {
    await navigator.clipboard.writeText(outputText.value)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2500)
  } catch (err) {
    console.error("Could not copy text: ", err)
  } finally {
    copying.value = false
  }
}

watch(curJSON, () => {
  if (copySuccess.value) {
    copySuccess.value = false
  }
})
</script>

<style>
.json-view-item .value-key {
  color: var(--color-text) !important;
  white-space: break-spaces;
}

.json-view-item {
  --jtv-arrow-color: var(--color-text-secondary) !important;
  --jtv-string-color: var(--color-primary-light) !important;
}
</style>
