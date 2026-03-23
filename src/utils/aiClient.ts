import OpenAI from "openai"
import { getTranslationAiRuntimeConfig } from "./translationAiConfig"

export class AiConfigMissingError extends Error {
	readonly code = "AI_CONFIG_MISSING"

	constructor(message: string) {
		super(message)
		this.name = "AiConfigMissingError"
	}
}

export function fillTemplate(
	template: string,
	params: Record<string, string>
): string {
	let output = template
	for (const [key, value] of Object.entries(params)) {
		const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g")
		output = output.replace(regex, value)
	}
	return output
}

export function normalizeAiText(text: string): string {
	return String(text || "").trim().replace(/^["'`]|["'`]$/g, "")
}

export function isAiConfigMissingError(
	error: unknown
): error is AiConfigMissingError {
	return error instanceof AiConfigMissingError || (
		error instanceof Error &&
		(error as { code?: string }).code === "AI_CONFIG_MISSING"
	)
}

export function ensureAiRuntimeConfig() {
	const config = getTranslationAiRuntimeConfig()
	if (!config.apiKey) {
		throw new AiConfigMissingError("请先在“AI基础配置”中配置 AI 的 API Key")
	}
	if (!config.baseURL) {
		throw new AiConfigMissingError("请先在“AI基础配置”中配置 AI 的 Base URL")
	}
	if (!config.model) {
		throw new AiConfigMissingError("请先在“AI基础配置”中配置 AI 的模型名称")
	}
	return config
}

export async function requestAiText(options: {
	systemPrompt: string
	userPrompt: string
}): Promise<string> {
	const config = ensureAiRuntimeConfig()
	const client = new OpenAI({
		apiKey: config.apiKey,
		baseURL: config.baseURL,
	})
	const completion = await client.chat.completions.create({
		model: config.model,
		messages: [
			{
				role: "system",
				content: options.systemPrompt,
			},
			{
				role: "user",
				content: options.userPrompt,
			},
		],
	})
	return normalizeAiText(completion.choices[0].message.content || "")
}
