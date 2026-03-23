import * as vscode from "vscode"
import {
	inferTargetLanguage,
	TranslationCacheStore,
} from "../utils/translationCache"
import { promptToConfigureAiIfNeeded } from "../utils/aiConfigPrompt"
import { getTranslationAiModelSignature } from "../utils/translationAiConfig"

export function register(
	context: vscode.ExtensionContext,
	translationCache: TranslationCacheStore,
	translateText: (text: string) => Promise<string>
) {
	const hoverProvider = vscode.languages.registerHoverProvider(
		{ scheme: "file", language: "*" },
		{
			provideHover(document, position) {
				const range = document.getWordRangeAtPosition(position)
				const isTurnOn = context.workspaceState.get("isTurnOn", true)
				if (!range) return null

				const word = document.getText(range)
				const hoverContent = new vscode.MarkdownString()
				const targetLanguage = inferTargetLanguage(word)
				const modelSignature = getTranslationAiModelSignature()
				const cached = translationCache.get({
					sourceText: word,
					scene: "general",
					targetLanguage,
					modelSignature,
				})
				if (cached) {
					hoverContent.appendMarkdown(cached)
					return new vscode.Hover(hoverContent)
				}

				if (!isTurnOn) return null
				if (!/[\u4E00-\u9FA5]+|[A-Za-z]+/.test(word)) return null

				return translateText(word)
					.then((translation) => {
						hoverContent.appendMarkdown(translation)
						translationCache.set({
							sourceText: word,
							translatedText: translation,
							scene: "general",
							targetLanguage,
							modelSignature,
						})
						return new vscode.Hover(hoverContent)
					})
					.catch(async (error) => {
						await promptToConfigureAiIfNeeded(error, {
							quiet: true,
						})
						return null
					})
			},
		}
	)

	context.subscriptions.push(hoverProvider)
}
