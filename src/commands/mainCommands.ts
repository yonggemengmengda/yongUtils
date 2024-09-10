import * as vscode from "vscode"
import * as path from "path"
import { translateText2EN } from "../utils/translateTextUtils"
import { translateText, translate2EN } from "../utils/translationUtils"
import {
	inferTargetLanguage,
	TranslationCacheStore,
} from "../utils/translationCache"
import { getTranslationAiModelSignature } from "../utils/translationAiConfig"

const DEBUG_STYLE =
	"background: #9C27B0; color: white;font-weight: bold; padding: 2px 4px;"

export function registerCommands(
	context: vscode.ExtensionContext,
	translationCache: TranslationCacheStore
) {
	const showTranslateError = (error: unknown) => {
		const message = error instanceof Error ? error.message : String(error || "翻译失败")
		vscode.window.showErrorMessage(`翻译失败: ${message}`)
	}

	const translate2EnDisposable = vscode.commands.registerCommand(
		"yongutils.translateEN",
		async () => {
			const editor = vscode.window.activeTextEditor
			if (editor) {
				const selection = editor.selection
				// @ts-ignore
				const selectText = editor.document.getText(selection)
				// 提取中文部分
				const chineseText = selectText.replace(/[^\u4e00-\u9fa5]/g, "")
				if (!chineseText) {
					vscode.window.showInformationMessage("未检测到可翻译的中文文本")
					return
				}

				try {
					const modelSignature = getTranslationAiModelSignature()
					let text = translationCache.get({
						sourceText: chineseText,
						scene: "naming",
						targetLanguage: "en",
						modelSignature,
					})
					if (!text) {
						text = await translate2EN(chineseText)
						translationCache.set({
							sourceText: chineseText,
							translatedText: text,
							scene: "naming",
							targetLanguage: "en",
							modelSignature,
						})
					}
					editor.edit((editBuilder) => {
						editBuilder.replace(
							selection,
							selectText.replace(/[\u4e00-\u9fa5]+/g, text)
						)
					})
				} catch (error) {
					showTranslateError(error)
				}
			}
		}
	)
	
	const translateAll2EnDisposable = vscode.commands.registerCommand(
		"yongutils.translateAll2EN",
		async () => {
			const editor = vscode.window.activeTextEditor
			// 获取当前文档.或#开头，且后面跟着中文的文本，非贪婪匹配,多次匹配
			if (!editor) return
			const domText = editor.document.getText()
			try {
				const styleMatches = domText.match(/[\.|\#]([\u4e00-\u9fa5]+)/g)
				await translateText2EN(translationCache, styleMatches, editor)
				const htmlMatches = domText.match(/(class|id)=["|'].*["|']/g)
				await translateText2EN(translationCache, htmlMatches, editor)
			} catch (error) {
				showTranslateError(error)
			}
		}
	)
	
	const translateDisposable = vscode.commands.registerCommand(
		"yongutils.translate",
		async () => {
			const editor = vscode.window.activeTextEditor
			if (editor && editor.selection) {
				const selection = editor.selection
				const selectText = editor.document.getText(selection)
				if (selectText) {
					try {
						const targetLanguage = inferTargetLanguage(selectText)
						const modelSignature = getTranslationAiModelSignature()
						const cached = translationCache.get({
							sourceText: selectText,
							scene: "general",
							targetLanguage,
							modelSignature,
						})
						if (cached) {
							return vscode.window.showInformationMessage(
								`翻译: ${cached}`
							)
						}
						const translatedText = await translateText(selectText)
						translationCache.set({
							sourceText: selectText,
							translatedText,
							scene: "general",
							targetLanguage,
							modelSignature,
						})
						vscode.window.showInformationMessage(`翻译: ${translatedText}`)
					} catch (error) {
						showTranslateError(error)
					}
				}
			}
		}
	)
	
	const addEnglishFileDisposable = vscode.commands.registerCommand(
		"yongutils.createEnglishFile",
		async (uri: vscode.Uri, _selectedUris: vscode.Uri[]) => {
			let targetDir: string
			const stat = await vscode.workspace.fs.stat(uri)
			if (stat.type === vscode.FileType.Directory) {
				// 右键的是文件夹
				targetDir = uri.fsPath
			} else {
				// 右键的是文件，取其父目录
				targetDir = path.dirname(uri.fsPath)
			}
			const userInput = await vscode.window.showInputBox({
				prompt: "请输入文件名及后缀（如：myFile.txt）",
				placeHolder: "example.txt",
			})
			if (!userInput) {
				return
			}
			const ext = path.extname(userInput)
			const nameWithoutExt = path.basename(userInput, ext)
			let translatedName = ""
			try {
				const modelSignature = getTranslationAiModelSignature()
				const cached = translationCache.get({
					sourceText: nameWithoutExt,
					scene: "naming",
					targetLanguage: "en",
					modelSignature,
				})
				translatedName = (cached || (await translate2EN(nameWithoutExt)) || "")
				if (!cached && translatedName) {
					translationCache.set({
						sourceText: nameWithoutExt,
						translatedText: translatedName,
						scene: "naming",
						targetLanguage: "en",
						modelSignature,
					})
				}
				translatedName = translatedName.replace(/\s+/g, "")
			} catch (error) {
				showTranslateError(error)
				return
			}
			const fullPath = path.join(targetDir, `${translatedName}${ext}`)
			const fileUri = vscode.Uri.file(fullPath)
			try {
				await vscode.workspace.fs.stat(fileUri)
				// 文件存在，询问是否覆盖
				const overwrite = await vscode.window.showWarningMessage(
					`文件 "${translatedName}${ext}" 已存在，是否覆盖？`,
					{ modal: true },
					"是",
					"否"
				)
				if (overwrite !== "是") {
					return
				}
			} catch {
				// 文件不存在，直接创建
			}
			await vscode.workspace.fs.writeFile(fileUri, new Uint8Array())
			// 6. （可选）在编辑器中打开新文件
			const document = await vscode.workspace.openTextDocument(fileUri)
			await vscode.window.showTextDocument(document)
		}
	)
	
	const translateToggleDisposable = vscode.commands.registerCommand(
		"yongutils.translateToggle",
		async () => {
			const isTurnOn = context.workspaceState.get("isTurnOn", false)
			context.workspaceState.update("isTurnOn", !isTurnOn)
			vscode.window.showInformationMessage(
				`AI自动翻译功能${!isTurnOn ? "已开启" : "已关闭"}!`
			)
		}
	)

	// 快捷debugger
	const debuggerDisposable = vscode.commands.registerCommand(
		"yongutils.debugLogger",
		async () => {
			const editor = vscode.window.activeTextEditor
			if (editor) {
				let selectText = ""
				let selectionStartLine
				if (editor.selection.isEmpty) {
					// 优先使用剪切板中的内容
					const clipboardTxt = await vscode.env.clipboard.readText()
					if (clipboardTxt) {
						selectText = clipboardTxt.replace(/`/g, "\\`")
						selectionStartLine = editor.selection.active.line
					} else {
						// 自动选中光标位置的单词
						const wordRange = editor.document.getWordRangeAtPosition(
							editor.selection.active
						)
						if (!wordRange) return
						selectText = editor.document.getText(wordRange).replace(/`/g, "\\`")
						selectionStartLine = editor.selection.active.line
					}
					// editor.selection = new vscode.Selection(
					// 	wordRange.start,
					// 	wordRange.end
					// )
				} else {
					selectText = editor.document
						.getText(editor.selection)
						.replace(/`/g, "\\`")
					selectionStartLine = editor.selection.start.line
				}
				const lineEnd = editor.document.lineAt(selectionStartLine).range.end
				// 获取该行第一个单词位置
				const indent =
					editor.document.lineAt(
						selectionStartLine
					).firstNonWhitespaceCharacterIndex
				const spaces = " ".repeat(indent)
				editor
					.edit((editBuilder) => {
						editBuilder.insert(
							new vscode.Position(selectionStartLine, lineEnd.character),
							`\n${spaces}console.debug("%c🐛 ${selectText} →", '${DEBUG_STYLE}', ${selectText});`
						)
					})
					.then(() => {
						const character = indent + 20
						const debuggerLineRange = new vscode.Range(
							new vscode.Position(selectionStartLine + 1, character),
							new vscode.Position(
								selectionStartLine + 1,
								character + selectText.length
							)
						)
						editor.selection = new vscode.Selection(
							debuggerLineRange.start,
							debuggerLineRange.end
						)
					})
			}
		}
	)

	context.subscriptions.push(
		addEnglishFileDisposable,
		translateAll2EnDisposable,
		translate2EnDisposable,
		translateDisposable,
		translateToggleDisposable,
		debuggerDisposable
	)
}
