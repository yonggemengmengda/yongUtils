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
	const generateGitCommitMessageDisposable = vscode.commands.registerCommand(
		"yongutils.generateGitCommitMessage",
		async (arg?: SourceControlGroupLike) => {
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
			const repository = await pickRepository(gitApi.repositories, contextUri)
			if (!repository) {
				return
			}

			try {
				const message = await generateGitCommitMessage(
					repository.rootUri.fsPath,
					resolveGitCommitScopeFromGroupId(arg?.id)
				)
				repository.inputBox.value = message
			} catch (error) {
				await showAiAwareError("生成 Git Commit 评论失败", error)
			}
		}
	)

	context.subscriptions.push(generateGitCommitMessageDisposable)
}
