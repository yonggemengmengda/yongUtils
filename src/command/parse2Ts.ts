import * as vscode from "vscode"
import { generateTsTypeFromSource } from "../utils/typeInference"

export function register(context: vscode.ExtensionContext) {
	const parseTsDisposable = vscode.commands.registerCommand(
		"yongutils.parseToTs",
		async () => {
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				vscode.window.showWarningMessage("没有活动的编辑器")
				return
			}

			const selection = editor.selection
			const selectedText = editor.document.getText(selection).trim()
			if (!selectedText) {
				vscode.window.showInformationMessage("请先选中要转换的对象、数组或表达式")
				return
			}

			try {
				const { typeText } = generateTsTypeFromSource(selectedText)
				await editor.edit((editBuilder) => {
					editBuilder.replace(selection, typeText)
				})
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error || "转换失败")
				vscode.window.showErrorMessage(`解析为 TS 类型失败: ${message}`)
			}
		}
	)

	context.subscriptions.push(parseTsDisposable)
}
