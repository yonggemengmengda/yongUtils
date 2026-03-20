export type NamingCandidate = {
	kind: string
	value: string
	detail: string
}

export function normalizeEnglishNamingText(input: string): string {
	const words = splitWords(input)
	return words.join("-")
}

export function buildEnglishNamingCandidates(input: string): NamingCandidate[] {
	const words = splitWords(input)
	if (!words.length) {
		return []
	}

	const variants: NamingCandidate[] = [
		{
			kind: "camelCase",
			value: toCamelCase(words),
			detail: "适合变量名、函数名、hooks",
		},
		{
			kind: "PascalCase",
			value: toPascalCase(words),
			detail: "适合组件名、类型名、类名",
		},
		{
			kind: "kebab-case",
			value: words.join("-"),
			detail: "适合文件名、路由、类名片段",
		},
		{
			kind: "snake_case",
			value: words.join("_"),
			detail: "适合部分配置字段或后端约定",
		},
		{
			kind: "CONSTANT_CASE",
			value: words.join("_").toUpperCase(),
			detail: "适合常量名、枚举成员",
		},
	]

	const seen = new Set<string>()
	return variants.filter((item) => {
		if (!item.value || seen.has(item.value)) {
			return false
		}
		seen.add(item.value)
		return true
	})
}

export function toTypeName(input: string): string {
	const words = splitWords(input)
	if (!words.length) {
		return "GeneratedType"
	}
	return toPascalCase(words)
}

function splitWords(input: string): string[] {
	const normalized = String(input || "")
		.trim()
		.replace(/^[`"']+|[`"']+$/g, "")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_/\\.-]+/g, " ")
		.replace(/[^A-Za-z0-9\s]+/g, " ")
		.toLowerCase()

	return normalized
		.split(/\s+/)
		.map((item) => item.trim())
		.filter(Boolean)
}

function toCamelCase(words: string[]): string {
	return words
		.map((word, index) => (index === 0 ? word : capitalize(word)))
		.join("")
}

function toPascalCase(words: string[]): string {
	return words.map(capitalize).join("")
}

function capitalize(word: string): string {
	if (!word) return ""
	return word[0].toUpperCase() + word.slice(1)
}
