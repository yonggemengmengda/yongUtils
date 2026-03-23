import * as vscode from "vscode"
import {
	CommitlintDetectedPreset,
	detectCommitlintPreset,
} from "./commitlintPreset"
import { DEFAULT_GIT_COMMIT_DETAIL_SUMMARY_PROMPT } from "./gitCommitConfigDefaults"

export const DEFAULT_GIT_COMMIT_GENERATION_SPEC = [
	"严格按团队规范固定输出，格式必须为：<type>: <summary>",
	"type 仅允许使用：feat、fix、refactor、docs、style、test、chore、build、ci、perf、revert",
	"summary 使用简洁中文，直接描述核心改动，不超过 50 个汉字",
	"不要添加 scope、不要添加句号、不要换行、不要补充额外说明",
].join("\n")

export type GitCommitMessageConfig = {
	generationSpec: string
	customPrompt: string
	includeEmoji: boolean
	includeDetailSummary: boolean
	detailSummaryPrompt: string
}

export type GitCommitGenerationSpecSource = "custom" | "commitlint" | "default"

export type GitCommitMessageConfigPayload = GitCommitMessageConfig & {
	defaultGenerationSpec: string
	defaultDetailSummaryPrompt: string
	recommendedGenerationSpec: string
	generationSpecSource: GitCommitGenerationSpecSource
	generationSpecSourceLabel: string
	detectedPreset: CommitlintDetectedPreset | null
	saveScopeLabel: string
}

function resolveConfigTarget() {
	return vscode.workspace.workspaceFolders?.length
		? vscode.ConfigurationTarget.Workspace
		: vscode.ConfigurationTarget.Global
}

function resolveSaveScopeLabel() {
	return vscode.workspace.workspaceFolders?.length
		? "当前工作区"
		: "当前 VS Code 用户"
}

function getExplicitConfigValue(
	config: vscode.WorkspaceConfiguration,
	key: keyof GitCommitMessageConfig
): string | boolean | undefined {
	const inspected = config.inspect<string | boolean>(key)
	return (
		inspected?.workspaceFolderValue ??
		inspected?.workspaceValue ??
		inspected?.globalValue
	)
}

function resolveGenerationSpecSourceLabel(
	source: GitCommitGenerationSpecSource,
	detectedPreset: CommitlintDetectedPreset | null
): string {
	if (source === "custom") {
		return "使用你当前保存的自定义规范"
	}

	if (source === "commitlint" && detectedPreset?.sourceFileName) {
		return `自动根据 ${detectedPreset.sourceFileName} 生成`
	}

	return "使用内置团队规范"
}

export async function getGitCommitMessageConfigPayload(
	resourceUri?: vscode.Uri
): Promise<GitCommitMessageConfigPayload> {
	const config = vscode.workspace.getConfiguration(
		"yongutils.gitCommitMessage",
		resourceUri
	)
	const detectedPreset = await detectCommitlintPreset(resourceUri)
	const explicitGenerationSpec = String(
		getExplicitConfigValue(config, "generationSpec") || ""
	).trim()
	const explicitCustomPrompt = String(
		getExplicitConfigValue(config, "customPrompt") || ""
	).trim()
	const explicitIncludeEmoji = getExplicitConfigValue(config, "includeEmoji")
	const explicitIncludeDetailSummary = getExplicitConfigValue(
		config,
		"includeDetailSummary"
	)
	const explicitDetailSummaryPrompt = String(
		getExplicitConfigValue(config, "detailSummaryPrompt") || ""
	).trim()
	const generationSpecSource: GitCommitGenerationSpecSource = explicitGenerationSpec
		? "custom"
		: detectedPreset
			? "commitlint"
			: "default"
	const recommendedGenerationSpec =
		detectedPreset?.generationSpec || DEFAULT_GIT_COMMIT_GENERATION_SPEC
	const generationSpec = explicitGenerationSpec || recommendedGenerationSpec

	return {
		generationSpec,
		customPrompt:
			explicitCustomPrompt || config.get<string>("customPrompt", "").trim(),
		includeEmoji:
			typeof explicitIncludeEmoji === "boolean"
				? explicitIncludeEmoji
				: config.get<boolean>("includeEmoji", false),
		includeDetailSummary:
			typeof explicitIncludeDetailSummary === "boolean"
				? explicitIncludeDetailSummary
				: config.get<boolean>("includeDetailSummary", true),
		detailSummaryPrompt:
			explicitDetailSummaryPrompt ||
			config
				.get<string>(
					"detailSummaryPrompt",
					DEFAULT_GIT_COMMIT_DETAIL_SUMMARY_PROMPT
				)
				.trim(),
		defaultGenerationSpec: DEFAULT_GIT_COMMIT_GENERATION_SPEC,
		defaultDetailSummaryPrompt: DEFAULT_GIT_COMMIT_DETAIL_SUMMARY_PROMPT,
		recommendedGenerationSpec,
		generationSpecSource,
		generationSpecSourceLabel: resolveGenerationSpecSourceLabel(
			generationSpecSource,
			detectedPreset
		),
		detectedPreset,
		saveScopeLabel: resolveSaveScopeLabel(),
	}
}

export async function saveGitCommitMessageConfig(
	update: Partial<GitCommitMessageConfig>,
	resourceUri?: vscode.Uri
): Promise<GitCommitMessageConfigPayload> {
	const config = vscode.workspace.getConfiguration(
		"yongutils.gitCommitMessage",
		resourceUri
	)
	const target = resolveConfigTarget()

	if (Object.prototype.hasOwnProperty.call(update, "generationSpec")) {
		const generationSpec = String(update.generationSpec || "").trim()
		await config.update("generationSpec", generationSpec || undefined, target)
	}

	if (Object.prototype.hasOwnProperty.call(update, "customPrompt")) {
		const customPrompt = String(update.customPrompt || "").trim()
		await config.update("customPrompt", customPrompt || undefined, target)
	}

	if (Object.prototype.hasOwnProperty.call(update, "includeEmoji")) {
		await config.update("includeEmoji", Boolean(update.includeEmoji), target)
	}

	if (Object.prototype.hasOwnProperty.call(update, "includeDetailSummary")) {
		await config.update(
			"includeDetailSummary",
			Boolean(update.includeDetailSummary),
			target
		)
	}

	if (Object.prototype.hasOwnProperty.call(update, "detailSummaryPrompt")) {
		const detailSummaryPrompt = String(update.detailSummaryPrompt || "").trim()
		await config.update(
			"detailSummaryPrompt",
			detailSummaryPrompt || undefined,
			target
		)
	}

	return await getGitCommitMessageConfigPayload(resourceUri)
}
