<template>
  <div class="ui-stack h-full w-full">
    <div class="ui-row justify-between">
      <span class="ui-label">输入 Response 或 JSON</span>
      <div class="ui-row">
        <button class="ui-button" @click="parse">生成类型</button>
        <button class="ui-button ghost" @click="clearAll">清空</button>
      </div>
    </div>

    <textarea
      class="ui-textarea"
      v-model="curInputText"
      placeholder="请输入要转换的 response 或 JSON"
      @input="parse"
    />

    <div v-if="errorMessage" class="ui-help text-red-400">
      {{ errorMessage }}
    </div>

    <div class="ui-panel relative">
      <button class="ui-button icon absolute right-2 top-2" @click="copy" :disabled="!parsedText">
        复制
      </button>
      <pre class="break-all whitespace-pre-wrap text-sm">{{ parsedText || '类型结果会显示在这里' }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"

const curInputText = ref("")
const parsedText = ref("")
const errorMessage = ref("")

function parse() {
  errorMessage.value = ""
  const text = curInputText.value.trim()
  if (!text) {
    parsedText.value = ""
    return
  }

  const parsed = parseValue(text)
  if (!parsed.ok) {
    parsedText.value = ""
    errorMessage.value = "无法解析输入，请检查格式。"
    return
  }

  parsedText.value = toTsType(parsed.value)
}

function parseValue(input: string): { ok: true; value: any } | { ok: false } {
  const normalized = normalizeInput(input)
  const candidates = buildParseCandidates(normalized)
  for (const candidate of candidates) {
    const parsed = tryParseCandidate(candidate)
    if (parsed.ok) return parsed
  }
  return { ok: false }
}

function normalizeInput(input: string): string {
  let text = String(input || "").trim()
  const fenceMatch = text.match(/^```[a-zA-Z0-9_-]*\s*([\s\S]*?)```$/)
  if (fenceMatch?.[1]) {
    text = fenceMatch[1].trim()
  }
  return text
}

function buildParseCandidates(input: string): string[] {
  const set = new Set<string>()
  const push = (value: string | undefined) => {
    const text = String(value || "").trim()
    if (text) set.add(text)
  }

  push(input)
  push(input.replace(/;+\s*$/, ""))

  const declarationMatch = input.match(
    /^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*([\s\S]+?)\s*;?$/
  )
  push(declarationMatch?.[1])

  const assignMatch = input.match(/^[A-Za-z_$][\w$]*\s*=\s*([\s\S]+?)\s*;?$/)
  push(assignMatch?.[1])

  const returnMatch = input.match(/^return\s+([\s\S]+?)\s*;?$/i)
  push(returnMatch?.[1])

  const labelMatch = input.match(/^[A-Za-z_$][\w$]*\s*:\s*([\s\S]+)$/)
  push(labelMatch?.[1])

  push(extractWrappedSlice(input, "{", "}"))
  push(extractWrappedSlice(input, "[", "]"))

  const baseCandidates = Array.from(set)
  for (const candidate of baseCandidates) {
    const trimmed = candidate.trim()
    if (!trimmed.startsWith("{") && /:\s*/.test(trimmed)) {
      push(`{${trimmed}}`)
    }
  }

  return Array.from(set)
}

function extractWrappedSlice(input: string, openChar: string, closeChar: string): string {
  const start = input.indexOf(openChar)
  const end = input.lastIndexOf(closeChar)
  if (start < 0 || end <= start) return ""
  return input.slice(start, end + 1).trim()
}

function tryParseCandidate(input: string): { ok: true; value: any } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(input) }
  } catch {
    // fallback: allow JS object literal without eval/new Function
  }

  const looseParsed = tryParseLooseObject(input)
  if (looseParsed.ok) return looseParsed

  return { ok: false }
}

function tryParseLooseObject(input: string): { ok: true; value: any } | { ok: false } {
  const normalized = normalizeJsObjectLikeToJson(input)
  if (!normalized) return { ok: false }
  try {
    const value = JSON.parse(normalized)
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}

function normalizeJsObjectLikeToJson(input: string): string {
  const text = String(input || "").trim()
  if (!text) return ""

  let output = ""
  let i = 0
  const stack: Array<{ type: "object" | "array"; expectingKey: boolean }> = []

  while (i < text.length) {
    const char = text[i]
    const top = stack[stack.length - 1]

    if (char === '"' || char === "'") {
      const parsedString = readQuotedString(text, i, char)
      if (!parsedString) return ""
      output += parsedString.value
      i = parsedString.end + 1
      continue
    }

    if (char === "{") {
      stack.push({ type: "object", expectingKey: true })
      output += char
      i += 1
      continue
    }

    if (char === "[") {
      stack.push({ type: "array", expectingKey: false })
      output += char
      i += 1
      continue
    }

    if (char === "}") {
      stack.pop()
      output += char
      i += 1
      continue
    }

    if (char === "]") {
      stack.pop()
      output += char
      i += 1
      continue
    }

    if (char === ",") {
      const nextIdx = findNextNonWhitespace(text, i + 1)
      if (nextIdx >= 0 && (text[nextIdx] === "}" || text[nextIdx] === "]")) {
        i += 1
        continue
      }
      if (top?.type === "object") {
        top.expectingKey = true
      }
      output += char
      i += 1
      continue
    }

    if (char === ":" && top?.type === "object") {
      top.expectingKey = false
      output += char
      i += 1
      continue
    }

    if (top?.type === "object" && top.expectingKey) {
      if (/\s/.test(char)) {
        output += char
        i += 1
        continue
      }
      if (isIdentifierStart(char)) {
        let end = i + 1
        while (end < text.length && isIdentifierPart(text[end])) {
          end += 1
        }
        const key = text.slice(i, end)
        const nextIdx = findNextNonWhitespace(text, end)
        if (nextIdx >= 0 && text[nextIdx] === ":") {
          output += JSON.stringify(key)
          i = end
          continue
        }
      }
    }

    output += char
    i += 1
  }

  return output
}

function readQuotedString(
  text: string,
  start: number,
  quote: '"' | "'"
): { value: string; end: number } | null {
  let i = start + 1
  let escaped = false
  while (i < text.length) {
    const ch = text[i]
    if (escaped) {
      escaped = false
      i += 1
      continue
    }
    if (ch === "\\") {
      escaped = true
      i += 1
      continue
    }
    if (ch === quote) {
      break
    }
    i += 1
  }
  if (i >= text.length) return null

  const rawToken = text.slice(start, i + 1)
  if (quote === '"') {
    return { value: rawToken, end: i }
  }

  const inner = rawToken
    .slice(1, -1)
    .replace(/\\'/g, "'")
    .replace(/"/g, '\\"')
  return { value: `"${inner}"`, end: i }
}

function findNextNonWhitespace(text: string, start: number): number {
  for (let i = start; i < text.length; i += 1) {
    if (!/\s/.test(text[i])) return i
  }
  return -1
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char)
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char)
}

function toTsType(data: any, depth = 0): string {
  const type = typeof data
  if (data === null) return "null"
  if (type === "string") return "string"
  if (type === "number") return "number"
  if (type === "boolean") return "boolean"
  if (type === "undefined") return "undefined"
  if (type === "function") return "Function"
  if (data instanceof Date) return "Date"
  if (data instanceof RegExp) return "RegExp"

  if (Array.isArray(data)) {
    if (data.length === 0) return "unknown[]"
    const arrayTypes = Array.from(new Set(data.map((item) => toTsType(item, depth))))
    const union = arrayTypes.length === 1 ? arrayTypes[0] : `(${arrayTypes.join(" | ")})`
    return `${union}[]`
  }

  if (type === "object") {
    const indent = "  ".repeat(depth + 1)
    const closingIndent = "  ".repeat(depth)
    const entries = Object.keys(data).map((key) => {
      const safeKey = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
      return `${indent}${safeKey}: ${toTsType(data[key], depth + 1)}`
    })
    return `{
${entries.join("\n")}
${closingIndent}}`
  }

  return "any"
}

function copy() {
  if (!parsedText.value) return
  navigator.clipboard
    .writeText(parsedText.value)
    .catch((err) => console.error("Could not copy text: ", err))
}

function clearAll() {
  curInputText.value = ""
  parsedText.value = ""
  errorMessage.value = ""
}
</script>
