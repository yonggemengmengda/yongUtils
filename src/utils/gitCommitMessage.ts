import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { execFile } from "child_process"
import { promisify } from "util"
import {
	fillTemplate,
	requestAiText,
} from "./aiClient"
import {
	DEFAULT_GIT_COMMIT_GENERATION_SPEC,
	getGitCommitMessageConfigPayload,
} from "./gitCommitConfig"

const execFileAsync = promisify(execFile)

const DEFAULT_COMMIT_SYSTEM_PROMPT = [
	"你是资深软件工程师，擅长根据 Git 改动生成准确、简洁的 commit 评论。",
	"请严格遵守：",
	"1) 只输出 1 条最终 commit 评论；",
	"2) 不要解释，不要补充说明，不要加引号，不要输出 Markdown；",
	"3) 评论要体现核心改动，避免空泛表述；",
	"4) 严格遵守用户提供的输出规范；若规范与示例冲突，以输出规范为准。",
].join("\n")

const COMMIT_EMOJI_SPEC = [
	"需要在最终结果前增加 1 个与提交类型匹配的 Git Commit Emoji，格式固定为：<emoji> <type>: <summary>",
	"推荐映射：feat => ✨，fix => 🐛，refactor => ♻️，docs => 📝，style => 💄，test => ✅，chore => 🔧，build => 📦️，ci => 👷，perf => ⚡️，revert => ⏪️",
	"只能保留 1 个 emoji，emoji 后保留 1 个空格",
].join("\n")

const DEFAULT_COMMIT_PROMPT_TEMPLATE = [
	"请根据下面的 Git 改动生成 commit 评论。",
	"默认要求：",
	"1) 使用中文；",
	"2) commit 标题长度尽量控制在 72 个字符内；",
	"3) 如果能明确模块或行为，请直接点出。",
	"标题输出规范：",
	"{{generationSpec}}",
	"Emoji 规则：",
	"{{emojiRule}}",
	"细节摘要规则：",
	"{{detailSummaryRule}}",
	"摘要提示词：",
	"{{detailSummaryPrompt}}",
	"额外团队要求：",
	"{{customPrompt}}",
	"仓库路径：{{repoPath}}",
	"生成范围：{{scopeLabel}}",
	"Git 状态：",
	"{{statusText}}",
	"Diff 内容：",
	"{{diffText}}",
].join("\n\n")

const MAX_DIFF_CHARS = 12000
const MAX_UNTRACKED_FILES = 3
const MAX_UNTRACKED_FILE_PREVIEW_CHARS = 1600
const GIT_EXEC_MAX_BUFFER = 8 * 1024 * 1024

export type GitCommitScope = "auto" | "staged" | "workingTree" | "all"

export type GitChangeSummary = {
	hasStagedChanges: boolean
	hasWorkingTreeChanges: boolean
	untrackedPaths: string[]
}

type DiffSection = {
	title: string
	content: string
}

type GitStatusEntry = {
	content: string
	isUntracked: boolean
	stagedCode: string
	workingTreeCode: string
}

function getEmojiRule(includeEmoji: boolean): string {
	if (!includeEmoji) {
		return "不要添加任何 emoji 或 gitmoji，严格输出纯文本 commit 评论。"
	}

	return COMMIT_EMOJI_SPEC
}

function getDetailSummaryRule(includeDetailSummary: boolean): string {
	if (!includeDetailSummary) {
		return [
			"不要生成细节摘要。",
			"最终结果只保留 1 行提交标题。",
		].join("\n")
	}

	return [
		"在标题后保留 1 个空行，再输出细节摘要。",
		"细节摘要输出 2-4 行，每行都必须以 `- ` 开头。",
		"不要在摘要前输出“详情”“说明”等小标题。",
	].join("\n")
}

function getScopeLabel(scope: GitCommitScope): string {
	switch (scope) {
		case "staged":
			return "仅暂存区"
		case "workingTree":
			return "仅工作区更改"
		case "all":
			return "暂存区 + 工作区"
		default:
			return "自动判断"
	}
}

function extractStatusPath(line: string): string {
	const content = line.slice(3).trim()
	const renameSeparator = " -> "
	if (content.includes(renameSeparator)) {
		return content.split(renameSeparator).pop()?.trim() || content
	}
	return content
}

function parseGitStatusEntries(statusText: string): GitStatusEntry[] {
	const entries: GitStatusEntry[] = []

	for (const rawLine of statusText.split(/\r?\n/)) {
		const line = rawLine.trimEnd()
		if (!line) {
			continue
		}

		const code = line.slice(0, 2)
		const content = line.slice(3).trim()
		if (!content) {
			continue
		}

		if (code === "??") {
			entries.push({
				content,
				isUntracked: true,
				stagedCode: "?",
				workingTreeCode: "?",
			})
			continue
		}

		entries.push({
			content,
			isUntracked: false,
			stagedCode: code[0] || " ",
			workingTreeCode: code[1] || " ",
		})
	}

	return entries
}

export function summarizeGitStatus(statusText: string): GitChangeSummary {
	const summary: GitChangeSummary = {
		hasStagedChanges: false,
		hasWorkingTreeChanges: false,
		untrackedPaths: [],
	}

	for (const entry of parseGitStatusEntries(statusText)) {
		if (entry.isUntracked) {
			summary.hasWorkingTreeChanges = true
			const untrackedPath = extractStatusPath(`?? ${entry.content}`)
			if (untrackedPath) {
				summary.untrackedPaths.push(untrackedPath)
			}
			continue
		}

		if (entry.stagedCode !== " ") {
			summary.hasStagedChanges = true
		}
		if (entry.workingTreeCode !== " ") {
			summary.hasWorkingTreeChanges = true
		}
	}

	return summary
}

export function resolveEffectiveGitCommitScope(
	requestedScope: GitCommitScope,
	summary: GitChangeSummary
): Exclude<GitCommitScope, "auto"> {
	const hasWorkingTreeContext =
		summary.hasWorkingTreeChanges || summary.untrackedPaths.length > 0

	if (requestedScope !== "all" && summary.hasStagedChanges && hasWorkingTreeContext) {
		return "staged"
	}

	if (requestedScope !== "auto") {
		return requestedScope
	}

	if (summary.hasStagedChanges) {
		return "staged"
	}

	if (summary.hasWorkingTreeChanges || summary.untrackedPaths.length) {
		return "workingTree"
	}

	return "workingTree"
}

export function buildScopedGitStatusText(
	statusText: string,
	scope: Exclude<GitCommitScope, "auto">
): string {
	if (scope === "all") {
		return statusText.trim()
	}

	const lines: string[] = []

	for (const entry of parseGitStatusEntries(statusText)) {
		if (entry.isUntracked) {
			if (scope === "workingTree") {
				lines.push(`?? ${entry.content}`)
			}
			continue
		}

		if (scope === "staged" && entry.stagedCode !== " ") {
			lines.push(`${entry.stagedCode}  ${entry.content}`)
			continue
		}

		if (scope === "workingTree" && entry.workingTreeCode !== " ") {
			lines.push(` ${entry.workingTreeCode} ${entry.content}`)
		}
	}

	return lines.join("\n").trim()
}

function trimSectionContent(content: string, maxChars: number): string {
	const normalized = content.trim()
	if (normalized.length <= maxChars) {
		return normalized
	}

	const suffix = "\n...[内容已截断]"
	const safeLength = Math.max(0, maxChars - suffix.length)
	return `${normalized.slice(0, safeLength)}${suffix}`
}

function buildDiffText(sections: DiffSection[]): string {
	let remaining = MAX_DIFF_CHARS
	const output: string[] = []

	for (const section of sections) {
		const content = section.content.trim()
		if (!content || remaining <= 0) {
			continue
		}

		const title = `## ${section.title}\n`
		const titleLength = title.length
		if (titleLength >= remaining) {
			break
		}

		const trimmedContent = trimSectionContent(content, remaining - titleLength)
		const block = `${title}${trimmedContent}`
		output.push(block)
		remaining -= block.length + 2
	}

	return output.join("\n\n").trim()
}

function isTextBuffer(buffer: Buffer): boolean {
	return !buffer.includes(0)
}

async function buildUntrackedPreview(
	repoPath: string,
	untrackedPaths: string[]
): Promise<string> {
	const sections: string[] = []

	for (const relativePath of untrackedPaths.slice(0, MAX_UNTRACKED_FILES)) {
		try {
			const absolutePath = path.join(repoPath, relativePath)
			const buffer = await fs.readFile(absolutePath)
			if (!isTextBuffer(buffer)) {
				sections.push(`${relativePath}\n[二进制文件，跳过内容预览]`)
				continue
			}

			const content = buffer.toString("utf8").replace(/\r/g, "")
			const preview = trimSectionContent(content, MAX_UNTRACKED_FILE_PREVIEW_CHARS)
			sections.push(`${relativePath}\n${preview}`)
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error || "读取失败")
			sections.push(`${relativePath}\n[读取预览失败: ${message}]`)
		}
	}

	return sections.join("\n\n").trim()
}

async function runGit(repoPath: string, args: string[]): Promise<string> {
	try {
		const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
			maxBuffer: GIT_EXEC_MAX_BUFFER,
			windowsHide: true,
		})
		return String(stdout || "").replace(/\r/g, "")
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error || "")

		if (/safe\.directory|dubious ownership/i.test(message)) {
			throw new Error(
				`Git 拒绝访问当前仓库。请执行 git config --global --add safe.directory "${repoPath}" 后重试。`
			)
		}

		if (/not a git repository/i.test(message)) {
			throw new Error("当前目录不是 Git 仓库")
		}

		if (/ENOENT|spawn git/i.test(message)) {
			throw new Error("未检测到 Git 可执行文件，请先确认系统已安装 Git")
		}

		throw new Error(`读取 Git 改动失败: ${message}`)
	}
}

async function collectDiffSections(
	repoPath: string,
	scope: Exclude<GitCommitScope, "auto">,
	summary: GitChangeSummary
): Promise<DiffSection[]> {
	const sections: DiffSection[] = []

	if (scope === "staged" || scope === "all") {
		const stagedDiff = await runGit(repoPath, [
			"diff",
			"--cached",
			"--no-ext-diff",
			"--no-color",
			"--unified=2",
			"--",
			".",
		])
		if (stagedDiff.trim()) {
			sections.push({
				title: "暂存区 Diff",
				content: stagedDiff,
			})
		}
	}

	if (scope === "workingTree" || scope === "all") {
		const workingTreeDiff = await runGit(repoPath, [
			"diff",
			"--no-ext-diff",
			"--no-color",
			"--unified=2",
			"--",
			".",
		])
		if (workingTreeDiff.trim()) {
			sections.push({
				title: "工作区 Diff",
				content: workingTreeDiff,
			})
		}
	}

	if ((scope === "workingTree" || scope === "all") && summary.untrackedPaths.length) {
		const untrackedPreview = await buildUntrackedPreview(
			repoPath,
			summary.untrackedPaths
		)
		if (untrackedPreview) {
			sections.push({
				title: "未跟踪文件预览",
				content: untrackedPreview,
			})
		}
	}

	return sections
}

export function resolveGitCommitScopeFromGroupId(
	groupId?: string
): GitCommitScope {
	if (groupId === "index") {
		return "staged"
	}

	if (groupId === "workingTree" || groupId === "untracked") {
		return "workingTree"
	}

	return "auto"
}

export async function generateGitCommitMessage(
	repoPath: string,
	requestedScope: GitCommitScope = "auto"
): Promise<string> {
	const repoUri = vscode.Uri.file(repoPath)
	const statusText = await runGit(repoPath, [
		"status",
		"--short",
		"--untracked-files=all",
	])
	const summary = summarizeGitStatus(statusText)
	const effectiveScope = resolveEffectiveGitCommitScope(requestedScope, summary)
	const scopedStatusText = buildScopedGitStatusText(statusText, effectiveScope)

	if (
		!summary.hasStagedChanges &&
		!summary.hasWorkingTreeChanges &&
		!summary.untrackedPaths.length
	) {
		throw new Error("当前仓库没有可用于生成 commit 评论的改动")
	}

	if (effectiveScope === "staged" && !summary.hasStagedChanges) {
		throw new Error("暂存区没有可用于生成 commit 评论的改动")
	}

	if (
		effectiveScope === "workingTree" &&
		!summary.hasWorkingTreeChanges &&
		!summary.untrackedPaths.length
	) {
		throw new Error("工作区没有可用于生成 commit 评论的改动")
	}

	const diffSections = await collectDiffSections(repoPath, effectiveScope, summary)
	const diffText = buildDiffText(diffSections)
	const settings = await getGitCommitMessageConfigPayload(repoUri)
	const prompt = fillTemplate(DEFAULT_COMMIT_PROMPT_TEMPLATE, {
		generationSpec:
			settings.generationSpec || DEFAULT_GIT_COMMIT_GENERATION_SPEC,
		emojiRule: getEmojiRule(settings.includeEmoji),
		detailSummaryRule: getDetailSummaryRule(settings.includeDetailSummary),
		detailSummaryPrompt:
			settings.detailSummaryPrompt || settings.defaultDetailSummaryPrompt,
		customPrompt: settings.customPrompt || "无",
		repoPath,
		scopeLabel: getScopeLabel(effectiveScope),
		statusText: scopedStatusText || "无",
		diffText: diffText || "无可用 Diff 内容，请根据状态列表和文件预览生成。",
	})

	return requestAiText({
		systemPrompt: DEFAULT_COMMIT_SYSTEM_PROMPT,
		userPrompt: prompt,
	})
}
