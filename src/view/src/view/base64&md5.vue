<template>
  <div class="ui-stack h-full w-full">
    <div class="ui-row justify-between">
      <span class="ui-label">输入内容</span>
      <div class="ui-segmented">
        <button :data-active="previewType === 'base64'" @click="previewType = 'base64'">Base64</button>
        <button :data-active="previewType === 'md5'" @click="previewType = 'md5'">MD5</button>
      </div>
    </div>

    <textarea
      class="ui-textarea"
      v-model="curInputText"
      :placeholder="previewType === 'base64' ? '请输入 base64 编码或待编码文本' : '请输入要生成 MD5 的文本'"
    />

    <div class="ui-row">
      <button v-if="previewType === 'base64'" class="ui-button" @click="decode">解码</button>
      <button class="ui-button primary" @click="encode">{{ previewType === 'base64' ? '编码' : '生成 MD5' }}</button>
      <button class="ui-button ghost" @click="clearAll">清空</button>
    </div>

    <div v-if="errorMessage" class="ui-help text-red-400">
      {{ errorMessage }}
    </div>

    <div class="ui-panel relative">
      <button class="ui-button icon absolute right-2 top-2" @click="copy" :disabled="!parsedText">
        复制
      </button>
      <pre class="break-all whitespace-pre-wrap text-sm">{{ parsedText || '结果会显示在这里' }}</pre>
    </div>

    <div class="ui-help">
      输出长度：{{ parsedText.length }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import CryptoJS from "crypto-js"

const curInputText = ref("")
const previewType = ref<"base64" | "md5">("base64")
const parsedText = ref("")
const errorMessage = ref("")

function base64Encode(input: string) {
  const bytes = new TextEncoder().encode(input)
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function base64Decode(input: string) {
  const binary = atob(input)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function decode() {
  errorMessage.value = ""
  if (previewType.value !== "base64") return
  try {
    parsedText.value = base64Decode(curInputText.value.trim())
  } catch (error) {
    parsedText.value = ""
    errorMessage.value = "Base64 解码失败，请检查输入。"
  }
}

function encode() {
  errorMessage.value = ""
  if (previewType.value === "base64") {
    try {
      parsedText.value = base64Encode(curInputText.value)
    } catch (error) {
      parsedText.value = ""
      errorMessage.value = "Base64 编码失败。"
    }
    return
  }
  parsedText.value = CryptoJS.MD5(curInputText.value).toString()
}

function clearAll() {
  curInputText.value = ""
  parsedText.value = ""
  errorMessage.value = ""
}

function copy() {
  if (!parsedText.value) return
  navigator.clipboard
    .writeText(parsedText.value)
    .catch((err) => console.error("Could not copy text: ", err))
}
</script>
