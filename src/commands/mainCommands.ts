import * as vscode from "vscode"
import * as path from "path"
import { translateText, translate2EN } from "../utils/translationUtils"
import {
	inferTargetLanguage,
	TranslationCacheStore,
} from "../utils/translationCache"
import { getTranslationAiModelSignature } from "../utils/translationAiConfig"
import {
	buildEnglishNamingCandidates,
	normalizeEnglishNamingText,
} from "../utils/namingUtils"
import {
	buildI18nClipboardText,
	buildI18nKey,
	buildI18nReplacementSnippets,
} from "../utils/i18nUtils"

const DEBUG_STYLE =
	"background: #9C27B0; color: white;font-weight: bold; padding: 2px 4px;"

export function registerCommands(
	context: vscode.ExtensionContext,
	translationCache: TranslationCacheStore
) {
	const getSelectionTarget = (editor: vscode.TextEditor) => {
		if (!editor.selection.isEmpty) {
			return {
				range: editor.selection,
				text: editor.document.getText(editor.selection),
			}
		}

		const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active)
		if (!wordRange) {
			return null
		}

		return {
			range: wordRange,
			text: editor.document.getText(wordRange),
		}
	}

	const getSelectedTextTarget = (editor: vscode.TextEditor) => {
		if (editor.selection.isEmpty) {
			return null
		}

		return {
			range: editor.selection,
			text: editor.document.getText(editor.selection),
		}
	}

	const getExpandedQuotedSelection = (editor: vscode.TextEditor) => {
		const selected = getSelectedTextTarget(editor)
		if (!selected?.text.trim()) {
			return null
		}

		const trimmedText = selected.text.trim()
		if (/^(['"`]).*\1$/.test(trimmedText)) {
			return {
				range: selected.range,
				text: trimmedText.slice(1, -1).trim(),
			}
		}

		const document = editor.document
		const startOffset = document.offsetAt(selected.range.start)
		const endOffset = document.offsetAt(selected.range.end)
		if (startOffset <= 0 || endOffset >= document.getText().length) {
			return {
				range: selected.range,
				text: trimmedText,
			}
		}

		const beforeRange = new vscode.Range(
			document.positionAt(startOffset - 1),
			document.positionAt(startOffset)
		)
		const afterRange = new vscode.Range(
			document.positionAt(endOffset),
			document.positionAt(endOffset + 1)
		)
		const beforeChar = document.getText(beforeRange)
		const afterChar = document.getText(afterRange)

		if (beforeChar && beforeChar === afterChar && [`'`, `"`, "`"].includes(beforeChar)) {
			return {
				range: new vscode.Range(
					document.positionAt(startOffset - 1),
					document.positionAt(endOffset + 1)
				),
				text: trimmedText,
			}
		}

		return {
			range: selected.range,
			text: trimmedText,
		}
	}

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
		async (uri: vscode.Uri) => {
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
			const isTurnOn = context.workspaceState.get("isTurnOn", true)
			await context.workspaceState.update("isTurnOn", !isTurnOn)
			vscode.window.showInformationMessage(
				`AI自动翻译功能${!isTurnOn ? "已开启" : "已关闭"}!`
			)
		}
	)

	const openToolPanelDisposable = vscode.commands.registerCommand(
		"yongutils.openToolPanel",
		async () => {
			await vscode.commands.executeCommand("workbench.view.extension.yongutils")
		}
	)

	const generateEnglishNamesDisposable = vscode.commands.registerCommand(
		"yongutils.generateEnglishNames",
		async () => {
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				vscode.window.showWarningMessage("没有活动的编辑器")
				return
			}

			const target = getSelectionTarget(editor)
			const sourceText = target?.text.trim() || ""
			if (!target || !sourceText) {
				vscode.window.showInformationMessage("请先选中文本，或将光标放在待命名单词上")
				return
			}

			try {
				let normalizedBaseName = sourceText
				if (/[\u4e00-\u9fa5]/.test(sourceText)) {
					const modelSignature = getTranslationAiModelSignature()
					const cached = translationCache.get({
						sourceText,
						scene: "naming",
						targetLanguage: "en",
						modelSignature,
					})
					const translated =
						cached || normalizeEnglishNamingText(await translate2EN(sourceText))

					if (!cached && translated) {
						translationCache.set({
							sourceText,
							translatedText: translated,
							scene: "naming",
							targetLanguage: "en",
							modelSignature,
						})
					}
					normalizedBaseName = translated
				}

				const candidates = buildEnglishNamingCandidates(normalizedBaseName)
				if (!candidates.length) {
					vscode.window.showWarningMessage("未能生成可用的英文命名候选")
					return
				}

				const selected = await vscode.window.showQuickPick(
					candidates.map((item) => ({
						label: item.value,
						description: item.kind,
						detail: item.detail,
					})),
					{
						placeHolder: `为“${sourceText}”选择一个英文命名`,
						matchOnDescription: true,
						matchOnDetail: true,
					}
				)

				if (!selected) {
					return
				}

				await editor.edit((editBuilder) => {
					editBuilder.replace(target.range, selected.label)
				})
			} catch (error) {
				showTranslateError(error)
			}
		}
	)

	const extractI18nEntryDisposable = vscode.commands.registerCommand(
		"yongutils.extractI18nEntry",
		async () => {
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				vscode.window.showWarningMessage("没有活动的编辑器")
				return
			}

			const target = getExpandedQuotedSelection(editor)
			const sourceText = target?.text.trim() || ""
			if (!target || !sourceText) {
				vscode.window.showInformationMessage("请先选中要提取的中文文案")
				return
			}

			if (!/[\u4e00-\u9fa5]/.test(sourceText)) {
				vscode.window.showInformationMessage("当前选中文本中未检测到中文文案")
				return
			}

			try {
				const modelSignature = getTranslationAiModelSignature()
				const cachedNaming = translationCache.get({
					sourceText,
					scene: "naming",
					targetLanguage: "en",
					modelSignature,
				})
				const cachedTranslation = translationCache.get({
					sourceText,
					scene: "general",
					targetLanguage: "en",
					modelSignature,
				})

				const namingSeed =
					cachedNaming || normalizeEnglishNamingText(await translate2EN(sourceText))
				const enText = cachedTranslation || (await translateText(sourceText))

				if (!cachedNaming && namingSeed) {
					translationCache.set({
						sourceText,
						translatedText: namingSeed,
						scene: "naming",
						targetLanguage: "en",
						modelSignature,
					})
				}

				if (!cachedTranslation && enText) {
					translationCache.set({
						sourceText,
						translatedText: enText,
						scene: "general",
						targetLanguage: "en",
						modelSignature,
					})
				}

				const key = buildI18nKey({
					filePath: editor.document.uri.fsPath,
					namingSeed,
				})
				const clipboardText = buildI18nClipboardText({
					key,
					zhText: sourceText,
					enText,
				})
				await vscode.env.clipboard.writeText(clipboardText)

				const snippetOptions = [
					...buildI18nReplacementSnippets(key),
					{
						label: "仅复制语言包条目",
						value: "",
						detail: "不替换代码，只把 key / zh-CN / en-US 条目放进剪贴板",
					},
				]

				const selected = await vscode.window.showQuickPick(
					snippetOptions.map((item) => ({
						label: item.label,
						description:
							item.label === "仅复制语言包条目" ? key : `key: ${key}`,
						detail: item.detail,
					})),
					{
						placeHolder: `已生成 i18n key：${key}，选择要替换成的代码片段`,
						matchOnDescription: true,
						matchOnDetail: true,
					}
				)

				if (selected && selected.label !== "仅复制语言包条目") {
					await editor.edit((editBuilder) => {
						editBuilder.replace(target.range, selected.label)
					})
				}

				vscode.window.showInformationMessage(
					`i18n 条目已复制到剪贴板: ${key}`
				)
			} catch (error) {
				showTranslateError(error)
			}
		}
	)

	const encodeUriDisposable = vscode.commands.registerCommand(
		"yongutils.encodeURIComponent",
		async () => {
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				vscode.window.showWarningMessage("没有活动的编辑器")
				return
			}

			const target = getSelectionTarget(editor)
			if (!target?.text) {
				vscode.window.showInformationMessage("请先选中需要编码的文本")
				return
			}

			await editor.edit((editBuilder) => {
				editBuilder.replace(target.range, encodeURIComponent(target.text))
			})
		}
	)

	const decodeUriDisposable = vscode.commands.registerCommand(
		"yongutils.decodeURIComponent",
		async () => {
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				vscode.window.showWarningMessage("没有活动的编辑器")
				return
			}

			const target = getSelectionTarget(editor)
			if (!target?.text) {
				vscode.window.showInformationMessage("请先选中需要解码的文本")
				return
			}

			try {
				const decodedText = decodeURIComponent(target.text)
				await editor.edit((editBuilder) => {
					editBuilder.replace(target.range, decodedText)
				})
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error || "解码失败")
				vscode.window.showErrorMessage(`URI 解码失败: ${message}`)
			}
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
		translate2EnDisposable,
		translateDisposable,
		translateToggleDisposable,
		openToolPanelDisposable,
		generateEnglishNamesDisposable,
		extractI18nEntryDisposable,
		encodeUriDisposable,
		decodeUriDisposable,
		debuggerDisposable
	)
}
