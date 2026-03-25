import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import {
	DEFAULT_GROUP_NAMES,
	DEFAULT_INTERNAL_LIB_PREFIXES,
	type ImportSortOptions,
} from "./shared"

export async function resolveImportSortOptions(
	document: vscode.TextDocument
): Promise<ImportSortOptions> {
	const config = vscode.workspace.getConfiguration(
		"yongutils.importSorter",
		document.uri
	)
	const legacyConfig = vscode.workspace.getConfiguration("importSorter", document.uri)

	const readConfig = <T>(key: string, defaultValue: T): T => {
		if (hasScopedConfigValue(config.inspect<T>(key))) {
			return config.get<T>(key, defaultValue)
		}
		return legacyConfig.get<T>(key, defaultValue)
	}

	const configuredPrefixes = readConfig<string[]>(
		"internalLibPrefixes",
		DEFAULT_INTERNAL_LIB_PREFIXES
	)
	const detectedPrefixes = await readNearestPathAliasPrefixes(document.uri)

	return {
		addGroupComments: readConfig<boolean>("addGroupComments", true),
		sortByLength: readConfig<boolean>("sortByLength", true),
		sortOnSave: readConfig<boolean>("sortOnSave", false),
		removeUnusedImports: readConfig<boolean>("removeUnusedImports", true),
		placeSideEffectImportsFirst: readConfig<boolean>(
			"placeSideEffectImportsFirst",
			true
		),
		groupNames: {
			...DEFAULT_GROUP_NAMES,
			...(readConfig<Record<string, string>>("customGroupNames", {}) || {}),
		},
		internalLibPrefixes: mergePrefixes(configuredPrefixes, detectedPrefixes),
	}
}

function hasScopedConfigValue<T>(
	inspected:
		| {
				globalValue?: T
				workspaceValue?: T
				workspaceFolderValue?: T
		  }
		| undefined
) {
	return Boolean(
		inspected &&
			(inspected.globalValue !== undefined ||
				inspected.workspaceValue !== undefined ||
				inspected.workspaceFolderValue !== undefined)
	)
}

function mergePrefixes(configured: string[], detected: string[]): string[] {
	return Array.from(
		new Set(
			[...configured, ...detected]
				.map((item) => String(item || "").trim())
				.filter(Boolean)
		)
	)
}

async function readNearestPathAliasPrefixes(uri: vscode.Uri): Promise<string[]> {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
	if (!workspaceFolder) {
		return []
	}

	const workspaceRoot = workspaceFolder.uri.fsPath
	const candidates = ["tsconfig.json", "jsconfig.json"]
	let currentDir = path.dirname(uri.fsPath)

	while (currentDir.startsWith(workspaceRoot)) {
		for (const fileName of candidates) {
			const filePath = path.join(currentDir, fileName)
			if (!fs.existsSync(filePath)) {
				continue
			}

			try {
				const parsed = JSON.parse(await fs.promises.readFile(filePath, "utf-8"))
				return extractPathAliasPrefixes(parsed)
			} catch {
				// ignore invalid config and continue searching upward
			}
		}

		if (currentDir === workspaceRoot) {
			break
		}
		currentDir = path.dirname(currentDir)
	}

	return []
}

function extractPathAliasPrefixes(config: any): string[] {
	const paths = config?.compilerOptions?.paths
	if (!paths || typeof paths !== "object") {
		return []
	}

	return Object.keys(paths)
		.map((key) => String(key || "").trim().replace(/\*.*$/, ""))
		.filter(Boolean)
}
