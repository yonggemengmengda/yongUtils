import * as vscode from "vscode"
import { isAiConfigMissingError } from "./aiClient"

const CONFIG_ACTION_LABEL = "去配置 AI"
const QUIET_PROMPT_INTERVAL_MS = 8000

let lastQuietPromptAt = 0

export async function promptToConfigureAiIfNeeded(
	error: unknown,
	options?: {
		quiet?: boolean
	}
): Promise<boolean> {
	if (!isAiConfigMissingError(error)) {
		return false
	}

	const now = Date.now()
	if (options?.quiet && now - lastQuietPromptAt < QUIET_PROMPT_INTERVAL_MS) {
		return true
	}

	lastQuietPromptAt = now
	const selection = await vscode.window.showWarningMessage(
		error.message,
		CONFIG_ACTION_LABEL
	)

	if (selection === CONFIG_ACTION_LABEL) {
		await vscode.commands.executeCommand("yongutils.openAiConfigPanel")
	}

	return true
}

export async function showAiAwareError(
	prefix: string,
	error: unknown
): Promise<void> {
	const handled = await promptToConfigureAiIfNeeded(error)
	if (handled) {
		return
	}

	const message = error instanceof Error ? error.message : String(error || prefix)
	await vscode.window.showErrorMessage(`${prefix}: ${message}`)
}
