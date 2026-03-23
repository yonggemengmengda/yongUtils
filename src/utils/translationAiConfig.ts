import * as vscode from "vscode"

const CONFIG_KEY = "yongutils.translationAi.config.v1"
const API_KEY_SECRET_KEY = "yongutils.translationAi.apiKey.v1"

const DEFAULT_SYSTEM_PROMPT = [
	"你是资深双语软件工程翻译助手，负责中英技术文本互译。",
	"请严格遵守：",
	"1) 准确保留代码、变量名、函数名、路径、命令、占位符、大小写和符号；",
	"2) 不要解释，不要补充背景，不要输出引号；",
	"3) 仅输出翻译结果，保持简洁；",
	"4) 若原文已是目标语言且无需改动，原样返回。",
].join("\n")

const DEFAULT_TRANSLATE_PROMPT_TEMPLATE = [
	"请将下列文本在编程语境下翻译为{{targetLanguage}}：",
	"{{text}}",
].join("\n")

const DEFAULT_NAMING_PROMPT_TEMPLATE = [
	"请将下列文本转换为英文命名，要求：kebab-case、小写、单词用连字符连接。",
	"仅输出结果，不要解释：",
	"{{text}}",
].join("\n")

export type TranslationAiPreset = {
	id: string
	name: string
	baseURL: string
	model: string
}

export type TranslationAiConfig = {
	presetId: string
	baseURL: string
	model: string
	systemPrompt: string
	translatePromptTemplate: string
	namingPromptTemplate: string
}

export type TranslationAiConfigUpdate = Partial<TranslationAiConfig> & {
	apiKey?: string
}

export type TranslationAiRuntimeConfig = TranslationAiConfig & {
	apiKey: string
}

export type TranslationAiConfigPayload = TranslationAiRuntimeConfig & {
	presets: TranslationAiPreset[]
}

export type TranslationPromptConfigPayload = {
	systemPrompt: string
	translatePromptTemplate: string
	namingPromptTemplate: string
}

const BUILTIN_PRESETS: TranslationAiPreset[] = [
	{
		id: "qwen",
		name: "通义千问（阿里云兼容）",
		baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		model: "qwen-turbo",
	},
	{
		id: "openai",
		name: "OpenAI",
		baseURL: "https://api.openai.com/v1",
		model: "gpt-4o-mini",
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		baseURL: "https://api.deepseek.com/v1",
		model: "deepseek-chat",
	},
	{
		id: "siliconflow",
		name: "SiliconFlow",
		baseURL: "https://api.siliconflow.cn/v1",
		model: "Qwen/Qwen2.5-7B-Instruct",
	},
	{
		id: "custom",
		name: "自定义",
		baseURL: "",
		model: "",
	},
]

const DEFAULT_CONFIG: TranslationAiConfig = {
	presetId: "qwen",
	baseURL: BUILTIN_PRESETS[0].baseURL,
	model: BUILTIN_PRESETS[0].model,
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
	translatePromptTemplate: DEFAULT_TRANSLATE_PROMPT_TEMPLATE,
	namingPromptTemplate: DEFAULT_NAMING_PROMPT_TEMPLATE,
}

let contextRef: vscode.ExtensionContext | null = null
let currentConfig: TranslationAiConfig = { ...DEFAULT_CONFIG }
let currentApiKey = ""

function normalizeConfig(input: Partial<TranslationAiConfig>): TranslationAiConfig {
	const presetId = String(input.presetId || currentConfig.presetId || DEFAULT_CONFIG.presetId)
	const preset = BUILTIN_PRESETS.find((item) => item.id === presetId)
	const fallbackPreset =
		BUILTIN_PRESETS.find((item) => item.id === DEFAULT_CONFIG.presetId) ||
		BUILTIN_PRESETS[0]
	const resolvedPreset = preset || fallbackPreset
	const presetBaseURL = resolvedPreset?.id === "custom" ? "" : resolvedPreset?.baseURL
	const presetModel = resolvedPreset?.id === "custom" ? "" : resolvedPreset?.model

	const baseURL = String(input.baseURL || "").trim()
	const model = String(input.model || "").trim()
	const systemPrompt = String(input.systemPrompt || "").trim()
	const translatePromptTemplate = String(input.translatePromptTemplate || "").trim()
	const namingPromptTemplate = String(input.namingPromptTemplate || "").trim()

	return {
		presetId: resolvedPreset?.id || "custom",
		baseURL: baseURL || presetBaseURL || "",
		model: model || presetModel || "",
		systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
		translatePromptTemplate:
			translatePromptTemplate || DEFAULT_TRANSLATE_PROMPT_TEMPLATE,
		namingPromptTemplate: namingPromptTemplate || DEFAULT_NAMING_PROMPT_TEMPLATE,
	}
}

export async function initTranslationAiConfig(context: vscode.ExtensionContext) {
	contextRef = context
	const stored = context.globalState.get<Partial<TranslationAiConfig>>(CONFIG_KEY)
	currentConfig = normalizeConfig(stored || {})
	currentApiKey = (await context.secrets.get(API_KEY_SECRET_KEY)) || ""
}

export function getTranslationAiConfigPayload(): TranslationAiConfigPayload {
	return {
		...currentConfig,
		apiKey: currentApiKey,
		presets: BUILTIN_PRESETS.map((item) => ({ ...item })),
	}
}

export function getTranslationAiRuntimeConfig(): TranslationAiRuntimeConfig {
	return {
		...currentConfig,
		apiKey: currentApiKey,
	}
}

export function getTranslationPromptConfigPayload(): TranslationPromptConfigPayload {
	return {
		systemPrompt: currentConfig.systemPrompt,
		translatePromptTemplate: currentConfig.translatePromptTemplate,
		namingPromptTemplate: currentConfig.namingPromptTemplate,
	}
}

export function getTranslationAiModelSignature(): string {
	return `${currentConfig.baseURL || ""}::${currentConfig.model || ""}`
}

export async function saveTranslationAiConfig(
	update: TranslationAiConfigUpdate
): Promise<TranslationAiConfigPayload> {
	if (!contextRef) {
		throw new Error("翻译配置模块尚未初始化")
	}
	currentConfig = normalizeConfig({
		...currentConfig,
		...update,
	})
	await contextRef.globalState.update(CONFIG_KEY, currentConfig)

	if (typeof update.apiKey === "string") {
		currentApiKey = update.apiKey.trim()
		if (currentApiKey) {
			await contextRef.secrets.store(API_KEY_SECRET_KEY, currentApiKey)
		} else {
			await contextRef.secrets.delete(API_KEY_SECRET_KEY)
		}
	}

	return getTranslationAiConfigPayload()
}

export async function saveTranslationPromptConfig(
	update: TranslationPromptConfigPayload
): Promise<TranslationPromptConfigPayload> {
	await saveTranslationAiConfig({
		systemPrompt: update.systemPrompt,
		translatePromptTemplate: update.translatePromptTemplate,
		namingPromptTemplate: update.namingPromptTemplate,
	})

	return getTranslationPromptConfigPayload()
}
