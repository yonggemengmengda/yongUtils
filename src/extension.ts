import "./utils/bufferShim"
import {
	window,
	ExtensionContext,
	commands,
} from "vscode"
import { MyViewProvider } from "./view/webviewProvider"
import { registerCommands } from "./commands/mainCommands"
import { registerGitCommitCommands } from "./commands/gitCommitCommands"
import { register as registerSortImportRegister } from "./command/sortImport"
import { register as parse2TsRegister } from "./command/parse2Ts"
import { register as hoverProviderRegister } from "./command/hoverProvider"
import {
	createTranslationCacheStore,
	TranslationCacheStore,
} from "./utils/translationCache"
import { initTranslationAiConfig } from "./utils/translationAiConfig"

let translationCacheRef: TranslationCacheStore | null = null

export async function activate(context: ExtensionContext) {
	// 从持久化存储中加载缓存
	console.log('Congratulations, your extension "yongutils" is now active!')
	
	await initTranslationAiConfig(context)
	const translationCache = await createTranslationCacheStore(context)
	translationCacheRef = translationCache
	const viewProvider = new MyViewProvider(context, translationCache)
	
	registerCommands(context, translationCache)
	registerGitCommitCommands(context)

	context.subscriptions.push(
		commands.registerCommand("yongutils.openAiConfigPanel", async () => {
			await viewProvider.revealTool("AiConfig")
		}),
		window.registerWebviewViewProvider(
			"yongUtils.webview",
			viewProvider
		)
	)
	
	parse2TsRegister(context)
	hoverProviderRegister(context, translationCache, 
		async (text: string) => {
			const { translateText } = await import("./utils/translationUtils")
			return await translateText(text)
		})
	registerSortImportRegister(context)
}

export async function deactivate() {
	if (translationCacheRef) {
		await translationCacheRef.flush()
		translationCacheRef = null
	}
}
