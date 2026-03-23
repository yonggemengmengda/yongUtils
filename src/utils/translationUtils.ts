import {
	ensureAiRuntimeConfig,
	fillTemplate,
	requestAiText,
} from "./aiClient"

export async function translateText(text: string): Promise<string> {
	const sourceText = String(text || "").trim()
	if (!sourceText) return ""
	const isChinese = /[\u4e00-\u9fa5]/.test(sourceText)
	const config = ensureAiRuntimeConfig()
	const prompt = fillTemplate(config.translatePromptTemplate, {
		text: sourceText,
		targetLanguage: isChinese ? "英文" : "中文",
	})
	return requestAiText({
		systemPrompt: config.systemPrompt,
		userPrompt: prompt,
	})
}

export async function translate2EN(text: string): Promise<string> {
	const sourceText = String(text || "").trim()
	if (!sourceText) return ""
	const config = ensureAiRuntimeConfig()
	const prompt = fillTemplate(config.namingPromptTemplate, {
		text: sourceText,
		targetLanguage: "英文",
	})
	return requestAiText({
		systemPrompt: config.systemPrompt,
		userPrompt: prompt,
	})
}
