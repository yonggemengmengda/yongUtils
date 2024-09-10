import OpenAI from "openai"
import { getTranslationAiRuntimeConfig } from "./translationAiConfig"

function fillTemplate(
	template: string,
	params: Record<string, string>
): string {
	let output = template
	for (const [key, value] of Object.entries(params)) {
		const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
		output = output.replace(regex, value)
	}
	return output
}

function normalizeResult(text: string): string {
	return String(text || "").trim().replace(/^["'`]|["'`]$/g, "")
}

function ensureRuntimeConfig() {
	const config = getTranslationAiRuntimeConfig()
	if (!config.apiKey) {
		throw new Error("请先在“翻译管理”中配置 AI 的 API Key")
	}
	if (!config.baseURL) {
		throw new Error("请先在“翻译管理”中配置 AI 的 Base URL")
	}
	if (!config.model) {
		throw new Error("请先在“翻译管理”中配置 AI 的模型名称")
	}
	return config
}

async function requestTranslate(userPrompt: string): Promise<string> {
	const config = ensureRuntimeConfig()
	const client = new OpenAI({
		apiKey: config.apiKey,
		baseURL: config.baseURL,
	})
	const completion = await client.chat.completions.create({
		model: config.model,
		messages: [
			{
				role: "system",
				content: config.systemPrompt,
			},
			{
				role: "user",
				content: userPrompt,
			},
		],
	})
	return normalizeResult(completion.choices[0].message.content || "")
}

export async function translateText(text: string): Promise<string> {
	const sourceText = String(text || "").trim()
	if (!sourceText) return ""
	const isChinese = /[\u4e00-\u9fa5]/.test(sourceText)
	const config = ensureRuntimeConfig()
	const prompt = fillTemplate(config.translatePromptTemplate, {
		text: sourceText,
		targetLanguage: isChinese ? "英文" : "中文",
	})
	return requestTranslate(prompt)
}

export async function translate2EN(text: string): Promise<string> {
	const sourceText = String(text || "").trim()
	if (!sourceText) return ""
	const config = ensureRuntimeConfig()
	const prompt = fillTemplate(config.namingPromptTemplate, {
		text: sourceText,
		targetLanguage: "英文",
	})
	return requestTranslate(prompt)
}
