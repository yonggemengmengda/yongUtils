import * as path from "path"
import * as vscode from "vscode"

const COMMITLINT_CONFIG_FILE_NAMES = [
	".commitlintrc.js",
	".commitlintrc.cjs",
	"commitlint.config.js",
	"commitlint.config.cjs",
	".commitlintrc.json",
]

const CONVENTIONAL_COMMIT_TYPES = [
	"feat",
	"fix",
	"refactor",
	"docs",
	"style",
	"test",
	"chore",
	"build",
	"ci",
	"perf",
	"revert",
]

export type CommitlintDetectedPreset = {
	sourceFileName: string
	sourceFilePath: string
	workspaceName: string
	generationSpec: string
	summary: string
	typeNames: string[]
}

type ParsedCommitlintRules = {
	typeNames: string[]
	scopeMode: "optional" | "required" | "forbidden"
	scopeNames: string[]
	headerMaxLength?: number
	extendsConventional: boolean
}

function stripQuotes(text: string): string {
	return String(text || "").trim().replace(/^['"`]|['"`]$/g, "")
}

function resolveWorkspaceRootUri(resourceUri?: vscode.Uri): vscode.Uri | undefined {
	if (resourceUri) {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(resourceUri)
		if (workspaceFolder?.uri) {
			return workspaceFolder.uri
		}
	}

	return vscode.workspace.workspaceFolders?.[0]?.uri
}

function splitTopLevelArrayElements(arrayLiteral: string): string[] {
	const source = arrayLiteral.trim().replace(/^\[/, "").replace(/\]$/, "")
	const parts: string[] = []
	let current = ""
	let stringQuote = ""
	let escaped = false
	let bracketDepth = 0
	let braceDepth = 0
	let parenDepth = 0

	for (const char of source) {
		current += char

		if (stringQuote) {
			if (escaped) {
				escaped = false
				continue
			}
			if (char === "\\") {
				escaped = true
				continue
			}
			if (char === stringQuote) {
				stringQuote = ""
			}
			continue
		}

		if (char === "'" || char === '"' || char === "`") {
			stringQuote = char
			continue
		}

		if (char === "[") {
			bracketDepth += 1
			continue
		}
		if (char === "]") {
			bracketDepth = Math.max(0, bracketDepth - 1)
			continue
		}
		if (char === "{") {
			braceDepth += 1
			continue
		}
		if (char === "}") {
			braceDepth = Math.max(0, braceDepth - 1)
			continue
		}
		if (char === "(") {
			parenDepth += 1
			continue
		}
		if (char === ")") {
			parenDepth = Math.max(0, parenDepth - 1)
			continue
		}

		if (
			char === "," &&
			bracketDepth === 0 &&
			braceDepth === 0 &&
			parenDepth === 0
		) {
			parts.push(current.slice(0, -1).trim())
			current = ""
		}
	}

	const tail = current.trim()
	if (tail) {
		parts.push(tail)
	}

	return parts
}

function findArrayLiteralAfterRule(source: string, ruleName: string): string | undefined {
	const pattern = new RegExp(`["']${ruleName}["']\\s*:\\s*\\[`, "m")
	const match = pattern.exec(source)
	if (!match) {
		return undefined
	}

	const startIndex = match.index + match[0].lastIndexOf("[")
	let depth = 0
	let stringQuote = ""
	let escaped = false

	for (let index = startIndex; index < source.length; index += 1) {
		const char = source[index]

		if (stringQuote) {
			if (escaped) {
				escaped = false
				continue
			}
			if (char === "\\") {
				escaped = true
				continue
			}
			if (char === stringQuote) {
				stringQuote = ""
			}
			continue
		}

		if (char === "'" || char === '"' || char === "`") {
			stringQuote = char
			continue
		}

		if (char === "[") {
			depth += 1
			continue
		}
		if (char === "]") {
			depth -= 1
			if (depth === 0) {
				return source.slice(startIndex, index + 1)
			}
		}
	}

	return undefined
}

function parseQuotedStringList(source: string): string[] {
	const values: string[] = []
	const regex = /['"`]([^'"`]+)['"`]/g
	for (const match of source.matchAll(regex)) {
		const value = match[1]?.trim()
		if (value) {
			values.push(value)
		}
	}
	return values
}

function parseRuleEnum(source: string, ruleName: string): string[] {
	const ruleLiteral = findArrayLiteralAfterRule(source, ruleName)
	if (!ruleLiteral) {
		return []
	}

	const parts = splitTopLevelArrayElements(ruleLiteral)
	const enumSource = parts[2] || ""
	return parseQuotedStringList(enumSource)
}

function parseRuleMode(
	source: string,
	ruleName: string
): string | undefined {
	const ruleLiteral = findArrayLiteralAfterRule(source, ruleName)
	if (!ruleLiteral) {
		return undefined
	}

	const parts = splitTopLevelArrayElements(ruleLiteral)
	return stripQuotes(parts[1] || "")
}

function parseRuleNumber(
	source: string,
	ruleName: string
): number | undefined {
	const ruleLiteral = findArrayLiteralAfterRule(source, ruleName)
	if (!ruleLiteral) {
		return undefined
	}

	const parts = splitTopLevelArrayElements(ruleLiteral)
	const value = Number(parts[2])
	return Number.isFinite(value) ? value : undefined
}

function parseCommitlintRules(source: string): ParsedCommitlintRules {
	const extendsConventional = /@commitlint\/config-conventional/.test(source)
	const typeNames = parseRuleEnum(source, "type-enum")
	const scopeNames = parseRuleEnum(source, "scope-enum")
	const scopeModeRaw = parseRuleMode(source, "scope-empty")
	const headerMaxLength = parseRuleNumber(source, "header-max-length")

	return {
		typeNames:
			typeNames.length > 0
				? typeNames
				: extendsConventional
					? [...CONVENTIONAL_COMMIT_TYPES]
					: [],
		scopeMode:
			scopeModeRaw === "never"
				? "required"
				: scopeModeRaw === "always"
					? "forbidden"
					: "optional",
		scopeNames,
		headerMaxLength,
		extendsConventional,
	}
}

function buildCommitlintGenerationSpec(parsed: ParsedCommitlintRules): string {
	const lines: string[] = []

	if (parsed.scopeMode === "required") {
		lines.push(
			"严格按项目 commitlint 规范输出，格式必须为：<type>(<scope>): <summary>"
		)
	} else if (parsed.scopeMode === "forbidden") {
		lines.push(
			"严格按项目 commitlint 规范输出，格式必须为：<type>: <summary>"
		)
	} else {
		lines.push(
			"严格按项目 commitlint 规范输出；优先使用 <type>(<scope>): <summary>，若无法明确 scope，可使用 <type>: <summary>"
		)
	}

	if (parsed.typeNames.length) {
		lines.push(`type 仅允许使用：${parsed.typeNames.join("、")}`)
	} else if (parsed.extendsConventional) {
		lines.push(
			`type 优先使用 conventional commits 常见类型：${CONVENTIONAL_COMMIT_TYPES.join("、")}`
		)
	} else {
		lines.push("type 请优先遵守项目 commitlint 的类型约束")
	}

	if (parsed.scopeMode === "forbidden") {
		lines.push("不要添加 scope")
	} else if (parsed.scopeNames.length) {
		const prefix =
			parsed.scopeMode === "required" ? "scope 为必填" : "如使用 scope"
		lines.push(`${prefix}，建议仅使用：${parsed.scopeNames.join("、")}`)
	} else if (parsed.scopeMode === "required") {
		lines.push("scope 为必填，请使用能准确概括模块或子系统的英文标识")
	}

	lines.push("summary 使用简洁中文单行，直接描述本次核心改动")

	if (parsed.headerMaxLength) {
		lines.push(`commit header 总长度尽量控制在 ${parsed.headerMaxLength} 字符以内`)
	}

	lines.push("不要换行、不要补充解释、不要添加句号或多余前后缀")

	return lines.join("\n")
}

function buildCommitlintSummary(parsed: ParsedCommitlintRules): string {
	const summaryParts: string[] = []

	if (parsed.typeNames.length) {
		summaryParts.push(`type ${parsed.typeNames.length} 项`)
	} else if (parsed.extendsConventional) {
		summaryParts.push("沿用 conventional commits 类型")
	}

	if (parsed.scopeMode === "required") {
		summaryParts.push("scope 必填")
	} else if (parsed.scopeMode === "forbidden") {
		summaryParts.push("禁止 scope")
	} else {
		summaryParts.push("scope 可选")
	}

	if (parsed.headerMaxLength) {
		summaryParts.push(`header <= ${parsed.headerMaxLength}`)
	}

	return summaryParts.join("，")
}

async function readCommitlintConfigFile(
	rootUri: vscode.Uri
): Promise<{ fileUri: vscode.Uri; content: string } | null> {
	for (const fileName of COMMITLINT_CONFIG_FILE_NAMES) {
		const fileUri = vscode.Uri.joinPath(rootUri, fileName)
		try {
			const bytes = await vscode.workspace.fs.readFile(fileUri)
			return {
				fileUri,
				content: Buffer.from(bytes).toString("utf8"),
			}
		} catch {
			continue
		}
	}

	return null
}

export async function detectCommitlintPreset(
	resourceUri?: vscode.Uri
): Promise<CommitlintDetectedPreset | null> {
	const rootUri = resolveWorkspaceRootUri(resourceUri)
	if (!rootUri) {
		return null
	}

	const workspaceFolder = vscode.workspace.getWorkspaceFolder(rootUri)
	const commitlintConfig = await readCommitlintConfigFile(rootUri)
	if (!commitlintConfig) {
		return null
	}

	const parsed = parseCommitlintRules(commitlintConfig.content)
	return {
		sourceFileName: path.basename(commitlintConfig.fileUri.fsPath),
		sourceFilePath: commitlintConfig.fileUri.fsPath,
		workspaceName:
			workspaceFolder?.name ||
			path.basename(rootUri.fsPath) ||
			"当前工作区",
		generationSpec: buildCommitlintGenerationSpec(parsed),
		summary: buildCommitlintSummary(parsed) || "已根据 commitlint 规则生成推荐预设",
		typeNames: parsed.typeNames,
	}
}
