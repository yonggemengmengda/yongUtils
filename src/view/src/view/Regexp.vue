<template>
  <div class="ui-stack h-full w-full">
    <div class="ui-stack">
      <label class="ui-label">正则表达式</label>
      <textarea
        class="ui-textarea"
        v-model="curRegexpText"
        placeholder="例如: ^[a-z0-9_-]{3,16}$"
      />
    </div>

    <div class="ui-stack">
      <label class="ui-label">待匹配文本</label>
      <textarea
        class="ui-textarea"
        v-model="curPatternText"
        placeholder="请输入要匹配的内容"
      />
    </div>

    <div class="ui-row justify-between">
      <div class="ui-segmented">
        <button :data-active="matchType === ''" @click="matchType = ''">默认</button>
        <button :data-active="matchType === 'g'" @click="matchType = 'g'">全局</button>
        <button :data-active="matchType === 'i'" @click="matchType = 'i'">忽略大小写</button>
        <button :data-active="matchType === 'gi'" @click="matchType = 'gi'">全局忽略大小写</button>
      </div>
      <button class="ui-button" @click="copy">复制表达式</button>
    </div>

    <div v-if="errorMessage" class="ui-help text-red-400">
      {{ errorMessage }}
    </div>

    <div class="ui-panel">
      <pre class="break-all whitespace-pre-wrap text-sm">{{ matchedText }}</pre>
    </div>

    <div class="ui-divider"></div>

    <div class="ui-stack flex-1">
      <div class="ui-row justify-between">
        <span class="ui-label">速查表</span>
        <div class="ui-row">
          <input
            class="ui-input w-48"
            v-model="searchKW"
            placeholder="关键字搜索"
          />
        </div>
      </div>

      <div class="ui-stack overflow-auto">
        <div class="ui-card" v-for="(value, key) in viewRegExpList" :key="key">
          <div class="ui-row justify-between">
            <span class="ui-label">{{ key }}</span>
            <span class="ui-badge">{{ value.length }}</span>
          </div>
          <div class="ui-stack">
            <div class="ui-row" v-for="item in value" :key="item.code">
              <span class="ui-pill">{{ item.code }}</span>
              <span class="text-sm text-theme-secondary break-all">{{ item.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import regexpList from "./regexpExp"
import { ref, computed, watchEffect } from "vue"

const viewRegExpList = ref(regexpList)
const curRegexpText = ref("")
const curPatternText = ref("")
const matchType = ref<"g" | "i" | "gi" | "">("")
const searchKW = ref("")
const errorMessage = ref("")

const matchedText = computed(() => {
  errorMessage.value = ""
  if (!curRegexpText.value) {
    return "请输入正则表达式"
  }
  try {
    const regexp = new RegExp(curRegexpText.value, matchType.value)
    if (matchType.value.includes("g")) {
      const matches = Array.from(curPatternText.value.matchAll(regexp)).map((item) => ({
        match: item[0],
        index: item.index ?? 0,
        groups: item.groups ?? {},
        captures: item.slice(1),
      }))
      return matches.length ? JSON.stringify(matches, null, 2) : "未匹配到"
    }
    const matched = regexp.exec(curPatternText.value)
    return matched ? JSON.stringify(matched, null, 2) : "未匹配到"
  } catch (error: any) {
    errorMessage.value = error.message || "正则表达式格式错误"
    return "无法解析正则表达式"
  }
})

watchEffect(() => {
  const newViewRegExpList = {} as typeof regexpList
  const newViewPattern = new RegExp(searchKW.value, "ig")
  for (const key in regexpList) {
    const _key = key as keyof typeof regexpList
    const value = regexpList[_key]
    const newValue = value.filter((item) => {
      return newViewPattern.test(item.code) || newViewPattern.test(item.desc)
    })
    if (newValue.length > 0) {
      newViewRegExpList[_key] = newValue
    }
  }
  viewRegExpList.value = newViewRegExpList
})

function copy() {
  const text = `/${curRegexpText.value}/${matchType.value}`
  navigator.clipboard
    .writeText(text)
    .catch((err) => console.error("Could not copy text: ", err))
}
</script>
