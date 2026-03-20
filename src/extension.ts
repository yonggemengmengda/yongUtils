import "./utils/bufferShim"
import {
	window,
	ExtensionContext,
} from "vscode"
import { MyViewProvider } from "./view/webviewProvider"
import { registerCommands } from "./commands/mainCommands"
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
	
	registerCommands(context, translationCache)

	context.subscriptions.push(
		window.registerWebviewViewProvider(
			"yongUtils.webview",
			new MyViewProvider(context, translationCache)
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
