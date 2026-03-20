import * as vscode from "vscode"
import {
	computeSortImportEdits,
	resolveImportSortOptions,
	supportsImportSorting,
} from "../utils/importSorter"

const IMPORT_SORT_SELECTOR: vscode.DocumentSelector = [
	{ scheme: "file", language: "javascript" },
	{ scheme: "file", language: "javascriptreact" },
	{ scheme: "file", language: "typescript" },
	{ scheme: "file", language: "typescriptreact" },
	{ scheme: "file", language: "vue" },
]

class ImportSortCodeActionProvider implements vscode.CodeActionProvider {
	provideCodeActions(document: vscode.TextDocument): vscode.CodeAction[] {
		if (!supportsImportSorting(document)) {
			return []
		}

		const action = new vscode.CodeAction(
			"Sort Imports (YongUtils)",
			vscode.CodeActionKind.SourceOrganizeImports
		)
		action.command = {
			command: "yongutils.sortImports",
			title: "Sort Imports (YongUtils)",
		}
		action.isPreferred = true
		return [action]
	}
}

export function register(context: vscode.ExtensionContext) {
	const sortImportsCommand = vscode.commands.registerCommand(
		"yongutils.sortImports",
		async () => {
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				vscode.window.showErrorMessage("没有活动的编辑器")
				return
			}

			const document = editor.document
			if (!supportsImportSorting(document)) {
				vscode.window.showErrorMessage("当前文件类型不支持 Imports 整理")
				return
			}

			try {
				const options = await resolveImportSortOptions(document)
				const edits = await computeSortImportEdits(document, options)
				if (!edits.length) {
					return
				}

				const workspaceEdit = new vscode.WorkspaceEdit()
				workspaceEdit.set(document.uri, edits)
				const applied = await vscode.workspace.applyEdit(workspaceEdit)
				if (!applied) {
					vscode.window.showErrorMessage("Imports 整理失败：无法应用编辑")
					return
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error || "未知错误")
				vscode.window.showErrorMessage(`Imports 整理失败: ${message}`)
			}
		}
	)

	const codeActionProvider = vscode.languages.registerCodeActionsProvider(
		IMPORT_SORT_SELECTOR,
		new ImportSortCodeActionProvider(),
		{
			providedCodeActionKinds: [vscode.CodeActionKind.SourceOrganizeImports],
		}
	)

	const willSaveDisposable = vscode.workspace.onWillSaveTextDocument((event) => {
		if (!supportsImportSorting(event.document)) {
			return
		}

		event.waitUntil(
			(async () => {
				try {
					const options = await resolveImportSortOptions(event.document)
					if (!options.sortOnSave) {
						return []
					}
					return computeSortImportEdits(event.document, options)
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error || "未知错误")
					vscode.window.showErrorMessage(`保存时整理 Imports 失败: ${message}`)
					return []
				}
			})()
		)
	})

	context.subscriptions.push(
		sortImportsCommand,
		codeActionProvider,
		willSaveDisposable
	)
}
