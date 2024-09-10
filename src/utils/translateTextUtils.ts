import * as vscode from "vscode"
import { translate2EN } from "./translationUtils"
import { getTranslationAiModelSignature } from "./translationAiConfig"
import { TranslationCacheStore } from "./translationCache"

export async function translateText2EN(
	translationCache: TranslationCacheStore,
	matches: string[] | null,
	editor: vscode.TextEditor
) {
	if (!matches) return
	const modelSignature = getTranslationAiModelSignature()
	for (const match of matches) {
		const className = match
			.split(/\s+/)
			.filter((item) => /[\u4e00-\u9fa5]+/.test(item))
		for (const cn of className) {
			const newDomText = editor.document.getText()
			const chineseText = cn.replace(/[^\u4e00-\u9fa5]/g, "")
			let text = translationCache.get({
				sourceText: chineseText,
				scene: "naming",
				targetLanguage: "en",
				modelSignature,
			})
			const symbolLen = cn.indexOf(chineseText)
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
			const startIdx = newDomText.indexOf(cn) + symbolLen
			const endIdx = startIdx + chineseText.length
			await editor.edit((editBuilder) => {
				editBuilder.replace(
					new vscode.Range(
						editor.document.positionAt(startIdx),
						editor.document.positionAt(endIdx)
					),
					text
				)
			})
		}
	}
}
