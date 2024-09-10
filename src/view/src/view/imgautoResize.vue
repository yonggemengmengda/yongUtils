<template>
  <div class="ui-stack h-full">
    <div class="ui-row justify-between">
      <span class="ui-label">待处理图片</span>
      <div class="ui-row">
        <button class="ui-button" @click="triggerFilePicker" :disabled="loading">选择图片</button>
        <button class="ui-button ghost" @click="clearFiles" :disabled="loading">清空</button>
      </div>
    </div>

    <div
      class="ui-dropzone"
      :class="{ dragover: dragOver }"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
      @click="triggerFilePicker"
    >
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        multiple
        accept="image/*"
        @change="handleFileChange"
      />
      <div class="ui-stack" style="gap: 6px; align-items: center;">
        <div>拖拽图片到此处，或点击选择</div>
        <div class="ui-help">支持多选，处理完会输出目标路径列表</div>
      </div>
    </div>

    <div class="ui-stack" style="gap: 8px;">
      <div class="ui-row justify-between">
        <span class="ui-label">输出目录</span>
        <button class="ui-button ghost" @click="handlePickOutputDir" :disabled="loading">选择目录</button>
      </div>
      <input
        class="ui-input"
        type="text"
        v-model.trim="outputDir"
        :disabled="loading"
        placeholder="可填相对项目目录或绝对路径，留空默认输出到 icons"
      />
      <div class="ui-help">示例：`icons`、`assets/images` 或 `D:\images\output`</div>
    </div>

    <div class="ui-row">
      <label class="ui-label" style="min-width: 78px;">输出格式</label>
      <select class="ui-select" v-model="outputFormat" :disabled="loading">
        <option value="origin">跟随原图</option>
        <option value="ico">ICO</option>
        <option value="png">PNG</option>
        <option value="jpg">JPG</option>
        <option value="gif">GIF</option>
        <option value="bmp">BMP</option>
        <option value="tiff">TIFF</option>
      </select>
    </div>
    <div class="ui-help">可统一转换为常见图片格式（含 ICO），默认跟随原图格式输出。</div>

    <div class="ui-row">
      <label class="ui-label" style="min-width: 78px;">输出文件名</label>
      <input
        class="ui-input"
        type="text"
        v-model.trim="outputFileName"
        :disabled="loading"
        placeholder="留空使用原始文件名称（不含后缀）"
      />
    </div>
    <div class="ui-help">支持自定义基础文件名，系统会自动拼接分辨率与后缀；ICO 模式下会按分辨率分别输出 .ico 文件。</div>

    <div v-if="fileItems.length" class="ui-file-grid">
      <div class="ui-file-card" v-for="item in fileItems" :key="item.id">
        <img class="ui-file-thumb" :src="item.url" @click.stop="handlePreview(item)" />
        <div class="text-xs text-theme-secondary break-all">{{ item.name }}</div>
        <div class="ui-row justify-between">
          <span class="ui-badge">{{ formatFileSize(item.size) }}</span>
          <button class="ui-button icon" @click.stop="removeFile(item.id)">✕</button>
        </div>
      </div>
    </div>

    <div class="ui-stack">
      <div class="ui-row justify-between">
        <span class="ui-label">目标分辨率</span>
        <div class="ui-row">
          <button class="ui-button" @click="handleSelectPreset('desktop')">桌面端</button>
          <button class="ui-button" @click="handleSelectPreset('mobile')">移动端</button>
          <button class="ui-button" @click="handleSelectPreset('favicon')">网站.ico</button>
          <button class="ui-button ghost" @click="handleAddResolution">添加</button>
        </div>
      </div>

      <div v-if="!resolutions.length" class="ui-help">暂无分辨率设置，点击“添加”或选择预设。</div>

      <div class="ui-stack">
        <div class="ui-row resolution-row" v-for="(item, idx) in resolutions" :key="idx">
          <label class="ui-label resolution-label">宽</label>
          <input
            class="ui-input resolution-input"
            type="number"
            min="1"
            v-model.number="item.width"
            :disabled="loading"
          />
          <label class="ui-label resolution-label">高</label>
          <input
            class="ui-input resolution-input"
            type="number"
            min="1"
            v-model.number="item.height"
            :disabled="loading"
          />
          <button class="ui-button icon" @click="resolutions.splice(idx, 1)" :disabled="loading">✕</button>
        </div>
      </div>
    </div>

    <div v-if="statusMessage" class="ui-help" :class="statusType === 'error' ? 'text-red-400' : ''">
      {{ statusMessage }}
    </div>

    <div class="ui-row">
      <button class="ui-button primary" @click="handleClick" :disabled="loading">
        {{ loading ? '处理中...' : '开始处理' }}
      </button>
      <button class="ui-button ghost" @click="handleReset" :disabled="loading">重置</button>
    </div>

    <div v-if="resizedImages.length" class="ui-stack">
      <div class="ui-row justify-between">
        <span class="ui-label">处理结果</span>
        <span class="ui-badge">共 {{ resizedImages.length }} 项</span>
      </div>
      <div class="ui-panel">
        <div class="ui-stack">
          <div v-for="(item, idx) in resizedImages" :key="idx" class="text-sm break-all text-theme-secondary">
            {{ item }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="modal-backdrop" @click="showModal = false">
      <div class="modal-card" @click.stop>
        <img :src="previewImage.url" class="modal-image" />
        <div class="ui-row justify-between">
          <span class="text-sm text-theme-secondary">{{ previewImage.name }}</span>
          <button class="ui-button" @click="showModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, inject, watch } from "vue"

// @ts-ignore
const vscode = inject<any>("vscode")

const showModal = ref(false)
const loading = ref(false)
const previewImage = ref({
  url: "",
  name: "",
})

type FileItem = {
  id: string
  file: File
  url: string
  name: string
  size: number
}

const fileItems = ref<FileItem[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const statusMessage = ref("")
const statusType = ref<"error" | "info" | "">("")
const outputDir = ref("")
const OUTPUT_DIR_CACHE_KEY = "yongutils.imgAutoResize.outputDir"
const outputFormat = ref<"origin" | "ico" | "png" | "jpg" | "gif" | "bmp" | "tiff">("origin")
const OUTPUT_FORMAT_CACHE_KEY = "yongutils.imgAutoResize.outputFormat"
const outputFileName = ref("")
const OUTPUT_FILE_NAME_CACHE_KEY = "yongutils.imgAutoResize.outputFileName"

const resolutions = ref<
  {
    width: number
    height: number
  }[]
>([])

const resizedImages = ref<string[]>([])

function handlePickOutputDir() {
  if (loading.value) return
  vscode?.postMessage({
    command: "pickImageOutputDir",
  })
}

function triggerFilePicker() {
  if (loading.value) return
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files) return
  addFiles(target.files)
  target.value = ""
}

function handleDragOver() {
  dragOver.value = true
}

function handleDragLeave() {
  dragOver.value = false
}

function handleDrop(event: DragEvent) {
  dragOver.value = false
  if (!event.dataTransfer?.files) return
  addFiles(event.dataTransfer.files)
}

function addFiles(files: FileList | File[]) {
  const incoming = Array.from(files).filter((file) => file.type.startsWith("image/"))
  if (!incoming.length) {
    setStatus("未检测到图片文件", "error")
    return
  }
  const mapped = incoming.map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    file,
    url: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
  }))
  fileItems.value = [...fileItems.value, ...mapped]
  setStatus("")
}

function removeFile(id: string) {
  const item = fileItems.value.find((file) => file.id === id)
  if (item) {
    URL.revokeObjectURL(item.url)
  }
  fileItems.value = fileItems.value.filter((file) => file.id !== id)
}

function clearFiles() {
  fileItems.value.forEach((file) => URL.revokeObjectURL(file.url))
  fileItems.value = []
}

function handlePreview(item: FileItem) {
  previewImage.value = { url: item.url, name: item.name }
  showModal.value = true
}

function handleAddResolution() {
  resolutions.value.push({ width: 0, height: 0 })
}

function handleSelectPreset(presetType: "desktop" | "mobile" | "favicon") {
  switch (presetType) {
    case "desktop":
      resolutions.value = [
        { width: 30, height: 30 },
        { width: 32, height: 32 },
        { width: 44, height: 44 },
        { width: 50, height: 50 },
        { width: 71, height: 71 },
        { width: 89, height: 89 },
        { width: 107, height: 107 },
        { width: 128, height: 128 },
        { width: 142, height: 142 },
        { width: 150, height: 150 },
        { width: 256, height: 256 },
        { width: 284, height: 284 },
        { width: 310, height: 310 },
        { width: 512, height: 512 },
      ]
      outputFormat.value = "origin"
      break
    case "mobile":
      resolutions.value = [
        { width: 72, height: 72 },
        { width: 96, height: 96 },
        { width: 144, height: 144 },
        { width: 192, height: 192 },
        { width: 40, height: 40 },
        { width: 58, height: 58 },
        { width: 60, height: 60 },
        { width: 80, height: 80 },
        { width: 87, height: 87 },
        { width: 120, height: 120 },
        { width: 180, height: 180 },
        { width: 20, height: 20 },
        { width: 29, height: 29 },
        { width: 76, height: 76 },
        { width: 152, height: 152 },
        { width: 167, height: 167 },
      ]
      outputFormat.value = "origin"
      break
    case "favicon":
      resolutions.value = [
        { width: 16, height: 16 },
        { width: 24, height: 24 },
        { width: 32, height: 32 },
        { width: 48, height: 48 },
        { width: 64, height: 64 },
        { width: 128, height: 128 },
        { width: 256, height: 256 },
      ]
      outputFormat.value = "ico"
      if (!outputFileName.value.trim()) {
        outputFileName.value = "favicon"
      }
      setStatus("已应用网站 favicon（.ico）预设，并切换输出格式为 ICO", "info")
      break
  }
}

async function handleClick() {
  if (!fileItems.value.length) {
    setStatus("请先选择图片", "error")
    return
  }
  if (!resolutions.value.length) {
    setStatus("请先设置目标分辨率", "error")
    return
  }
  loading.value = true
  setStatus("正在处理图片...", "info")

  const files = await Promise.all(fileItems.value.map((item) => getFilesData(item.file)))

  vscode?.postMessage({
    command: "imgAutoResize",
    data: {
      files,
      resolutions: JSON.parse(JSON.stringify(resolutions.value)),
      outputDir: outputDir.value,
      outputFormat: outputFormat.value,
      outputFileName: outputFileName.value,
    },
  })
}

function getFilesData(file: File): Promise<{ name: string; file: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64Data = reader.result as string
      resolve({
        name: file.name,
        file: base64Data,
      })
    }
    reader.readAsDataURL(file)
  })
}

function handleReset() {
  resolutions.value = []
  resizedImages.value = []
  setStatus("")
}

function setStatus(message: string, type: "error" | "info" | "" = "") {
  statusMessage.value = message
  statusType.value = type
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function handleMessage(event: MessageEvent) {
  const message = event.data
  if (message.command === "imgAutoResizeDone") {
    resizedImages.value = message.data
    loading.value = false
    setStatus("处理完成", "info")
    return
  }
  if (message.command === "imgAutoResizeError") {
    loading.value = false
    const errorText = message.data?.message || "处理失败，请重试"
    setStatus(errorText, "error")
    return
  }
  if (message.command === "pickImageOutputDirDone") {
    if (typeof message.data === "string" && message.data.trim()) {
      outputDir.value = message.data.trim()
      setStatus("已选择输出目录", "info")
    }
  }
}

onMounted(() => {
  window.addEventListener("message", handleMessage)
  try {
    const cached = localStorage.getItem(OUTPUT_DIR_CACHE_KEY)
    if (cached) outputDir.value = cached
    const cachedOutputFormat = localStorage.getItem(OUTPUT_FORMAT_CACHE_KEY)
    if (
      cachedOutputFormat === "origin" ||
      cachedOutputFormat === "ico" ||
      cachedOutputFormat === "png" ||
      cachedOutputFormat === "jpg" ||
      cachedOutputFormat === "gif" ||
      cachedOutputFormat === "bmp" ||
      cachedOutputFormat === "tiff"
    ) {
      outputFormat.value = cachedOutputFormat
    }
    const cachedOutputFileName = localStorage.getItem(OUTPUT_FILE_NAME_CACHE_KEY)
    if (cachedOutputFileName !== null) {
      outputFileName.value = cachedOutputFileName
    }
  } catch {
    // ignore localStorage errors in restricted environments
  }
})

onUnmounted(() => {
  window.removeEventListener("message", handleMessage)
  clearFiles()
})

watch(outputDir, (value) => {
  try {
    localStorage.setItem(OUTPUT_DIR_CACHE_KEY, value || "")
  } catch {
    // ignore localStorage errors in restricted environments
  }
})

watch(outputFormat, (value) => {
  try {
    localStorage.setItem(OUTPUT_FORMAT_CACHE_KEY, value || "origin")
  } catch {
    // ignore localStorage errors in restricted environments
  }
})

watch(outputFileName, (value) => {
  try {
    localStorage.setItem(OUTPUT_FILE_NAME_CACHE_KEY, value || "")
  } catch {
    // ignore localStorage errors in restricted environments
  }
})
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}

.modal-card {
  width: min(720px, 90vw);
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-image {
  width: 100%;
  border-radius: 10px;
  object-fit: contain;
  max-height: 60vh;
}

.resolution-row {
  flex-wrap: nowrap;
}

.resolution-label {
  flex: 0 0 auto;
  white-space: nowrap;
}

.resolution-input {
  width: 88px;
  min-width: 88px;
  flex: 0 0 88px;
}
</style>
