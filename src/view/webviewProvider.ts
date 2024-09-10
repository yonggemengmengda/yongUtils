import {
	ExtensionContext,
	Uri,
	Webview,
	WebviewView,
	WebviewViewProvider,
	window,
	workspace,
} from "vscode"
import { imgAutoResize } from "../utils/imageUtils"
import {
	getTranslationAiConfigPayload,
	saveTranslationAiConfig,
} from "../utils/translationAiConfig"
import { TranslationCacheStore } from "../utils/translationCache"
import { AstService } from "./webview/astService"
import { copyToClipboard, toErrorMessage } from "./webview/helpers"
import { buildWebviewHtml } from "./webview/html"
import type { WebLocation } from "./webview/types"

export class MyViewProvider implements WebviewViewProvider {
	private translationCache: TranslationCacheStore
	private webviewView?: WebviewView
	private astUpdateTimer: NodeJS.Timeout | null = null
	private astListenersRegistered = false
	private readonly astService = new AstService()

	constructor(
		private readonly context: ExtensionContext,
		translationCache: TranslationCacheStore
	) {
		this.translationCache = translationCache
	}

	resolveWebviewView(webviewView: WebviewView) {
		this.webviewView = webviewView
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				Uri.joinPath(this.context.extensionUri, "dist"),
				Uri.joinPath(this.context.extensionUri, "media"),
			],
		}
		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview)
		webviewView.webview.onDidReceiveMessage(
			async (message) => {
				await this.handleWebviewMessage(webviewView, message)
			},
			null,
			this.context.subscriptions
		)

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this.scheduleAstUpdate()
			}
		})

		if (!this.astListenersRegistered) {
			this.astListenersRegistered = true
			this.context.subscriptions.push(
				window.onDidChangeActiveTextEditor(() => this.scheduleAstUpdate()),
				workspace.onDidChangeTextDocument((event) => {
					const activeDoc = window.activeTextEditor?.document
					if (activeDoc && event.document === activeDoc) {
						this.scheduleAstUpdate()
					}
				})
			)
		}
	}

	private async handleWebviewMessage(webviewView: WebviewView, message: any) {
		if (message.command === "copyToClipboard") {
			copyToClipboard(message.text)
		}
		if (message.command === "imgAutoResize") {
			try {
				const donePaths = await imgAutoResize(message.data)
				window.showInformationMessage("图片生成完毕")
				webviewView.webview.postMessage({
					command: "imgAutoResizeDone",
					data: donePaths,
				})
			} catch (error) {
				const messageText = toErrorMessage(error)
				window.showErrorMessage(`图片处理失败: ${messageText}`)
				webviewView.webview.postMessage({
					command: "imgAutoResizeError",
					data: { message: messageText },
				})
			}
		}
		if (message.command === "pickImageOutputDir") {
			const selected = await window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: "选择输出目录",
			})
			webviewView.webview.postMessage({
				command: "pickImageOutputDirDone",
				data: selected?.[0]?.fsPath || "",
			})
		}
		if (message.command === "getTranslatedList") {
			const list = this.translationCache.list(message.data?.kw)
			webviewView.webview.postMessage({
				command: "getTranslatedListRes",
				data: list,
			})
		}
		if (message.command === "getTranslationAiConfig") {
			webviewView.webview.postMessage({
				command: "getTranslationAiConfigRes",
				data: getTranslationAiConfigPayload(),
			})
		}
		if (message.command === "saveTranslationAiConfig") {
			try {
				const payload = await saveTranslationAiConfig(message.data || {})
				webviewView.webview.postMessage({
					command: "saveTranslationAiConfigRes",
					data: payload,
				})
			} catch (error) {
				webviewView.webview.postMessage({
					command: "translationAiConfigError",
					data: {
						message: toErrorMessage(error),
					},
				})
			}
		}
		if (message.command === "removeTranslated") {
			this.translationCache.removeBySourceText(String(message.data || ""))
		}
		if (message.command === "getCurrentAst") {
			this.postCurrentAst()
		}
		if (message.command === "revealAstLocation") {
			await this.astService.revealAstLocation(message.data as WebLocation)
		}
	}

	getHtmlForWebview(webview: Webview): string {
		return buildWebviewHtml(webview, this.context.extensionUri)
	}

	private scheduleAstUpdate() {
		if (!this.webviewView || !this.webviewView.visible) return
		if (this.astUpdateTimer) {
			clearTimeout(this.astUpdateTimer)
		}
		this.astUpdateTimer = setTimeout(() => {
			this.postCurrentAst()
		}, 200)
	}

	private postCurrentAst() {
		if (!this.webviewView) return
		const editor = window.activeTextEditor
		if (!editor) {
			this.webviewView.webview.postMessage({
				command: "currentAstError",
				data: { message: "请先打开一个文件以生成 AST。" },
			})
			return
		}

		const { payload, error } = this.astService.buildAstForDocument(editor.document)
		if (error) {
			this.webviewView.webview.postMessage({
				command: "currentAstError",
				data: { message: error },
			})
			return
		}

		this.webviewView.webview.postMessage({
			command: "currentAstChanged",
			data: payload,
		})
	}
}
