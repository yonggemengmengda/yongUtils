import * as path from "path"
import { buildEnglishNamingCandidates } from "./namingUtils"

export type I18nReplacementSnippet = {
	label: string
	value: string
	detail: string
}

export function buildI18nKey(input: {
	filePath?: string
	namingSeed: string
}): string {
	const filePrefix = buildFilePrefix(input.filePath)
	const messageKey =
		pickNamingVariant(input.namingSeed, "camelCase") ||
		pickNamingVariant(input.namingSeed, "kebab-case")?.replace(/-([a-z])/g, (_, letter) =>
			String(letter).toUpperCase()
		) ||
		"message"

	return [filePrefix, messageKey].filter(Boolean).join(".")
}

export function buildI18nClipboardText(input: {
	key: string
	zhText: string
	enText: string
}): string {
	return [
		`key: ${input.key}`,
		"",
		"zh-CN:",
		JSON.stringify({ [input.key]: input.zhText }, null, 2),
		"",
		"en-US:",
		JSON.stringify({ [input.key]: input.enText }, null, 2),
	].join("\n")
}

export function buildI18nReplacementSnippets(
	key: string
): I18nReplacementSnippet[] {
	return [
		{
			label: `t('${key}')`,
			value: `t('${key}')`,
			detail: "通用函数调用，适合 script/setup 或常见 hooks 风格",
		},
		{
			label: `{{ t('${key}') }}`,
			value: `{{ t('${key}') }}`,
			detail: "适合 Vue template 文本节点",
		},
		{
			label: `$t('${key}')`,
			value: `$t('${key}')`,
			detail: "适合部分模板表达式或选项式写法",
		},
		{
			label: `this.$t('${key}')`,
			value: `this.$t('${key}')`,
			detail: "适合 Vue Options API / class 风格",
		},
	]
}

function buildFilePrefix(filePath?: string): string {
	const rawPath = String(filePath || "").trim()
	if (!rawPath) {
		return "common"
	}

	let name = path.parse(rawPath).name || "common"
	if (name.toLowerCase() === "index") {
		name = path.basename(path.dirname(rawPath)) || name
	}

	return pickNamingVariant(name, "camelCase") || "common"
}

function pickNamingVariant(
	input: string,
	kind: string
): string | undefined {
	return buildEnglishNamingCandidates(input).find((item) => item.kind === kind)?.value
}
