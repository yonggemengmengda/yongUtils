import * as path from "path"
import * as vscode from "vscode"
import { showAiAwareError } from "../utils/aiConfigPrompt"
import {
	generateGitCommitMessage,
	resolveGitCommitScopeFromGroupId,
} from "../utils/gitCommitMessage"

type GitInputBox = {
	value: string
}

type GitRepository = {
	rootUri: vscode.Uri
	inputBox: GitInputBox
}

type GitApi = {
	repositories: GitRepository[]
}

type GitExtensionExports = {
	getAPI(version: 1): GitApi
}

type SourceControlGroupLike = Partial<vscode.SourceControlResourceGroup> & {
	sourceControl?: {
		rootUri?: vscode.Uri
	}
}

const TYPEWRITER_FRAME_INTERVAL_MS = 32
const TYPEWRITER_MAX_FRAMES = 36
const GIT_COMMIT_GENERATING_CONTEXT = "yongutils.gitCommitMessageGenerating"
const activeTypewriterSessions = new WeakMap<GitInputBox, number>()
let isGeneratingGitCommitMessage = false

function startTypewriterSession(inputBox: GitInputBox): number {
	const nextSessionId = (activeTypewriterSessions.get(inputBox) || 0) + 1
	activeTypewriterSessions.set(inputBox, nextSessionId)
	return nextSessionId
}

function isTypewriterSessionActive(
	inputBox: GitInputBox,
	sessionId: number
): boolean {
	return activeTypewriterSessions.get(inputBox) === sessionId
}

function getTypewriterChunkSize(content: string): number {
	const charCount = Array.from(content).length
	if (charCount <= TYPEWRITER_MAX_FRAMES) {
		return 1
	}
	return Math.max(1, Math.ceil(charCount / TYPEWRITER_MAX_FRAMES))
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function setGitCommitGeneratingContext(isGenerating: boolean) {
	await vscode.commands.executeCommand(
		"setContext",
		GIT_COMMIT_GENERATING_CONTEXT,
		isGenerating
	)
}

async function applyTypewriterCommitMessage(
	inputBox: GitInputBox,
	message: string
) {
	const chars = Array.from(message)
	const chunkSize = getTypewriterChunkSize(message)
	const sessionId = startTypewriterSession(inputBox)

	inputBox.value = ""
	let rendered = ""

	for (let index = 0; index < chars.length; index += chunkSize) {
		if (!isTypewriterSessionActive(inputBox, sessionId)) {
			return
		}
		// 用户中途手动改了输入框时，停止动画，避免覆盖用户输入。
		if (inputBox.value !== rendered) {
			return
		}

		rendered = chars
			.slice(0, Math.min(index + chunkSize, chars.length))
			.join("")
		inputBox.value = rendered

		if (rendered === message) {
			return
		}
		await wait(TYPEWRITER_FRAME_INTERVAL_MS)
	}
}

function isPathWithinRepo(repoPath: string, targetPath: string): boolean {
	const relativePath = path.relative(repoPath, targetPath)
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
	)
}

async function getGitApi(): Promise<GitApi | null> {
	const gitExtension =
		vscode.extensions.getExtension<GitExtensionExports>("vscode.git")
	if (!gitExtension) {
		return null
	}

	const exports = gitExtension.isActive
		? gitExtension.exports
		: await gitExtension.activate()

	if (!exports?.getAPI) {
		return null
	}

	return exports.getAPI(1)
}

function getGroupContextUri(arg?: SourceControlGroupLike): vscode.Uri | undefined {
	if (arg?.sourceControl?.rootUri) {
		return arg.sourceControl.rootUri
	}

	const firstResource = arg?.resourceStates?.[0]
	return firstResource?.resourceUri
}

function findBestMatchingRepository(
	repositories: GitRepository[],
	targetUri?: vscode.Uri
): GitRepository | undefined {
	if (!targetUri) {
		return undefined
	}

	return repositories
		.filter((repository) =>
			isPathWithinRepo(repository.rootUri.fsPath, targetUri.fsPath)
		)
		.sort(
			(left, right) =>
				right.rootUri.fsPath.length - left.rootUri.fsPath.length
		)[0]
}

async function pickRepository(
	repositories: GitRepository[],
	contextUri?: vscode.Uri
): Promise<GitRepository | undefined> {
	const matchedRepository = findBestMatchingRepository(repositories, contextUri)
	if (matchedRepository) {
		return matchedRepository
	}

	if (repositories.length === 1) {
		return repositories[0]
	}

	const selected = await vscode.window.showQuickPick(
		repositories.map((repository) => ({
			label: path.basename(repository.rootUri.fsPath),
			description: repository.rootUri.fsPath,
			repository,
		})),
		{
			placeHolder: "选择要生成 commit 评论的 Git 仓库",
			matchOnDescription: true,
		}
	)

	return selected?.repository
}

export function registerGitCommitCommands(context: vscode.ExtensionContext) {
	void setGitCommitGeneratingContext(false)

	const generateGitCommitMessageDisposable = vscode.commands.registerCommand(
		"yongutils.generateGitCommitMessage",
		async (arg?: SourceControlGroupLike) => {
			if (isGeneratingGitCommitMessage) {
				return
			}

			isGeneratingGitCommitMessage = true
			await setGitCommitGeneratingContext(true)

			try {
				const gitApi = await getGitApi()
				if (!gitApi?.repositories?.length) {
					vscode.window.showWarningMessage(
						"当前没有可用的 Git 仓库，或 VS Code 内置 Git 扩展不可用"
					)
					return
				}

				const contextUri =
					getGroupContextUri(arg) ||
					vscode.window.activeTextEditor?.document.uri ||
					vscode.workspace.workspaceFolders?.[0]?.uri
				const repository = await pickRepository(
					gitApi.repositories,
					contextUri
				)
				if (!repository) {
					return
				}

				try {
					const message = await generateGitCommitMessage(
						repository.rootUri.fsPath,
						resolveGitCommitScopeFromGroupId(arg?.id)
					)
					await applyTypewriterCommitMessage(repository.inputBox, message)
				} catch (error) {
					await showAiAwareError("生成 Git Commit 评论失败", error)
				}
			} finally {
				isGeneratingGitCommitMessage = false
				await setGitCommitGeneratingContext(false)
			}
		}
	)

	const generateGitCommitMessageLoadingDisposable = vscode.commands.registerCommand(
		"yongutils.generateGitCommitMessageLoading",
		() => undefined
	)

	context.subscriptions.push(
		generateGitCommitMessageDisposable,
		generateGitCommitMessageLoadingDisposable
	)
}
