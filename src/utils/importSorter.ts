import * as fs from "fs"
import * as path from "path"
import { builtinModules } from "module"
import * as vscode from "vscode"
import { parse as babelParse } from "@babel/parser"
import traverse, { NodePath } from "@babel/traverse"
import * as t from "@babel/types"
import { parse as parseSFC } from "@vue/compiler-sfc"
import { parse as parseVueTemplate, ElementTypes, NodeTypes } from "@vue/compiler-dom"

export const SUPPORTED_IMPORT_LANGUAGE_IDS = new Set([
	"javascript",
	"javascriptreact",
	"typescript",
	"typescriptreact",
	"vue",
])

const BUILTIN_MODULES = new Set(
	builtinModules.flatMap((name) =>
		name.startsWith("node:") ? [name, name.slice(5)] : [name, `node:${name}`]
	)
)

const PARSER_PLUGINS: Parameters<typeof babelParse>[1]["plugins"] = [
	"jsx",
	"typescript",
	"decorators-legacy",
]

export enum ImportGroup {
	SIDE_EFFECT = "side-effect",
	BUILTIN = "builtin",
	EXTERNAL = "external",
	INTERNAL_ALIAS = "internal-alias",
	PARENT = "parent",
	SIBLING = "sibling",
	INDEX = "index",
}

export type ImportSortOptions = {
	addGroupComments: boolean
	sortByLength: boolean
	sortOnSave: boolean
	removeUnusedImports: boolean
	placeSideEffectImportsFirst: boolean
	groupNames: Record<string, string>
	internalLibPrefixes: string[]
}

type ImportSpecifierInfo = {
	kind: "default" | "namespace" | "named"
	localName: string
	importedName?: string
	isTypeOnly: boolean
}

type ImportEntry = {
	modulePath: string
	group: ImportGroup
	isSideEffect: boolean
	isTypeOnly: boolean
	specifiers: ImportSpecifierInfo[]
	leadingComments: string[]
	isMultiline: boolean
	quote: "'" | '"'
	hasSemicolon: boolean
	multilineIndent: string
}

type ImportRenderStyle = {
	quote: "'" | '"'
	semicolon: boolean
	multilineIndent: string
}

export async function resolveImportSortOptions(
	document: vscode.TextDocument
): Promise<ImportSortOptions> {
	const config = vscode.workspace.getConfiguration(
		"yongutils.importSorter",
		document.uri
	)
	const legacyConfig = vscode.workspace.getConfiguration("importSorter", document.uri)

	const readConfig = <T>(key: string, defaultValue: T): T => {
		const inspected = config.inspect<T>(key)
		const hasScopedValue = Boolean(
			inspected &&
				(inspected.globalValue !== undefined ||
					inspected.workspaceValue !== undefined ||
					inspected.workspaceFolderValue !== undefined)
		)
		if (hasScopedValue) {
			return config.get<T>(key, defaultValue)
		}
		return legacyConfig.get<T>(key, defaultValue)
	}

	const configuredPrefixes = readConfig<string[]>("internalLibPrefixes", [
		"@@@/",
		"@@/",
		"@/",
		"~/",
	])
	const detectedPrefixes = await readNearestPathAliasPrefixes(document.uri)
	const internalLibPrefixes = Array.from(
		new Set(
			[...configuredPrefixes, ...detectedPrefixes]
				.map((item) => String(item || "").trim())
				.filter(Boolean)
		)
	)

	return {
		addGroupComments: readConfig<boolean>("addGroupComments", true),
		sortByLength: readConfig<boolean>("sortByLength", false),
		sortOnSave: readConfig<boolean>("sortOnSave", false),
		removeUnusedImports: readConfig<boolean>("removeUnusedImports", true),
		placeSideEffectImportsFirst: readConfig<boolean>(
			"placeSideEffectImportsFirst",
			true
		),
		groupNames: {
			[ImportGroup.SIDE_EFFECT]: "副作用导入",
			[ImportGroup.BUILTIN]: "Node.js 内置模块",
			[ImportGroup.EXTERNAL]: "第三方依赖",
			[ImportGroup.INTERNAL_ALIAS]: "项目别名模块",
			[ImportGroup.PARENT]: "父级目录模块",
			[ImportGroup.SIBLING]: "同级目录模块",
			[ImportGroup.INDEX]: "Index 模块",
			...(readConfig<Record<string, string>>("customGroupNames", {}) || {}),
		},
		internalLibPrefixes,
	}
}

export async function computeSortImportEdits(
	document: vscode.TextDocument,
	options: ImportSortOptions
): Promise<vscode.TextEdit[]> {
	if (!supportsImportSorting(document)) {
		return []
	}

	if (document.languageId === "vue") {
		return computeVueImportEdits(document, options)
	}

	return computeModuleImportEdits({
		document,
		content: document.getText(),
		baseOffset: 0,
		options,
	})
}

export function supportsImportSorting(document: vscode.TextDocument): boolean {
	return SUPPORTED_IMPORT_LANGUAGE_IDS.has(document.languageId)
}

async function computeVueImportEdits(
	document: vscode.TextDocument,
	options: ImportSortOptions
): Promise<vscode.TextEdit[]> {
	const source = document.getText()
	const { descriptor } = parseSFC(source)
	const templateUsedNames = descriptor.template
		? collectVueTemplateUsedNames(descriptor.template.content)
		: new Set<string>()
	const scriptBlocks = [descriptor.script, descriptor.scriptSetup].filter(
		Boolean
	) as Array<{
		content: string
		loc: { start: { offset: number }; end: { offset: number } }
	}>

	const edits: vscode.TextEdit[] = []
	for (const block of scriptBlocks) {
		const blockEdits = await computeModuleImportEdits({
			document,
			content: block.content,
			baseOffset: block.loc.start.offset,
			options,
			extraUsedNames: templateUsedNames,
			disableUnusedRemoval: false,
		})
		edits.push(...blockEdits)
	}

	return edits.sort(
		(a, b) => document.offsetAt(a.range.start) - document.offsetAt(b.range.start)
	)
}

async function computeModuleImportEdits(input: {
	document: vscode.TextDocument
	content: string
	baseOffset: number
	options: ImportSortOptions
	extraUsedNames?: Set<string>
	disableUnusedRemoval?: boolean
}): Promise<vscode.TextEdit[]> {
	const ast = parseModuleAst(input.content)
	const programPath = getProgramPath(ast)
	if (!programPath) {
		return []
	}

	const importNodes = programPath.node.body.filter((node): node is t.ImportDeclaration =>
		t.isImportDeclaration(node)
	)
	if (!importNodes.length) {
		return []
	}

	let entries = importNodes.map((node) =>
		createImportEntry(
			node,
			input.content,
			input.options.internalLibPrefixes,
			input.options.placeSideEffectImportsFirst
		)
	)
	const renderStyle = detectImportRenderStyle(entries)

	if (input.options.removeUnusedImports && !input.disableUnusedRemoval) {
		entries = removeUnusedImportSpecifiers(
			entries,
			programPath,
			input.extraUsedNames || new Set<string>()
		)
	}

	const sortedEntries = [...entries].sort(createImportSorter(input.options))
	const replaceStart = findLineStart(input.content, importNodes[0].start || 0)
	const replaceEnd = consumeTrailingWhitespaceLines(
		input.content,
		importNodes[importNodes.length - 1].end || 0
	)
	const hasFollowingCode = input.content.slice(replaceEnd).trim().length > 0
	const replacementText = formatImportEntries(
		sortedEntries,
		input.options,
		hasFollowingCode,
		renderStyle
	)
	const originalText = input.content.slice(replaceStart, replaceEnd)

	if (replacementText === originalText) {
		return []
	}

	return [
		new vscode.TextEdit(
			new vscode.Range(
				input.document.positionAt(input.baseOffset + replaceStart),
				input.document.positionAt(input.baseOffset + replaceEnd)
			),
			replacementText
		),
	]
}

function parseModuleAst(content: string) {
	return babelParse(content, {
		sourceType: "module",
		plugins: PARSER_PLUGINS,
		errorRecovery: true,
	})
}

function getProgramPath(ast: t.File): NodePath<t.Program> | null {
	let programPath: NodePath<t.Program> | null = null
	traverse(ast, {
		Program(path) {
			programPath = path
			path.stop()
		},
	})
	return programPath
}

function createImportEntry(
	node: t.ImportDeclaration,
	content: string,
	internalLibPrefixes: string[],
	placeSideEffectImportsFirst: boolean
): ImportEntry {
	const modulePath = String(node.source.value || "")
	const isSideEffect = node.specifiers.length === 0
	const originalText = content.slice(node.start || 0, node.end || 0)
	return {
		modulePath,
		group: classifyImportGroup(
			modulePath,
			isSideEffect,
			internalLibPrefixes,
			placeSideEffectImportsFirst
		),
		isSideEffect,
		isTypeOnly: node.importKind === "type",
		specifiers: node.specifiers.map(toSpecifierInfo),
		leadingComments: (node.leadingComments || []).map(formatComment).filter(Boolean),
		isMultiline: /[\r\n]/.test(originalText),
		quote: detectImportQuote(originalText),
		hasSemicolon: /;\s*$/.test(originalText),
		multilineIndent: detectMultilineIndent(originalText),
	}
}

function toSpecifierInfo(
	specifier: t.ImportSpecifier | t.ImportDefaultSpecifier | t.ImportNamespaceSpecifier
): ImportSpecifierInfo {
	if (t.isImportDefaultSpecifier(specifier)) {
		return {
			kind: "default",
			localName: specifier.local.name,
			isTypeOnly: false,
		}
	}

	if (t.isImportNamespaceSpecifier(specifier)) {
		return {
			kind: "namespace",
			localName: specifier.local.name,
			isTypeOnly: false,
		}
	}

	const importedName = t.isIdentifier(specifier.imported)
		? specifier.imported.name
		: String(specifier.imported.value)

	return {
		kind: "named",
		localName: specifier.local.name,
		importedName,
		isTypeOnly: specifier.importKind === "type",
	}
}

function classifyImportGroup(
	modulePath: string,
	isSideEffect: boolean,
	internalLibPrefixes: string[],
	placeSideEffectImportsFirst: boolean
): ImportGroup {
	if (isSideEffect && placeSideEffectImportsFirst) {
		return ImportGroup.SIDE_EFFECT
	}

	if (BUILTIN_MODULES.has(modulePath)) {
		return ImportGroup.BUILTIN
	}

	if (modulePath.startsWith("../")) {
		return ImportGroup.PARENT
	}

	if (isIndexImport(modulePath)) {
		return ImportGroup.INDEX
	}

	if (modulePath.startsWith("./")) {
		return ImportGroup.SIBLING
	}

	if (internalLibPrefixes.some((prefix) => modulePath.startsWith(prefix))) {
		return ImportGroup.INTERNAL_ALIAS
	}

	return ImportGroup.EXTERNAL
}

function isIndexImport(modulePath: string): boolean {
	return (
		modulePath === "." ||
		modulePath === "./" ||
		modulePath === "./index" ||
		/^\.\/index(\.[A-Za-z0-9]+)?$/.test(modulePath)
	)
}

function removeUnusedImportSpecifiers(
	entries: ImportEntry[],
	programPath: NodePath<t.Program>,
	extraUsedNames: Set<string>
): ImportEntry[] {
	const usedNames = new Set([
		...extraUsedNames,
		...collectTypeOnlyImportUsageNames(programPath),
	])

	return entries
		.map((entry) => {
			if (entry.isSideEffect) {
				return entry
			}

			const specifiers = entry.specifiers.filter((specifier) =>
				isImportSpecifierUsed(specifier.localName, programPath, usedNames)
			)

			if (!specifiers.length) {
				return null
			}

			return {
				...entry,
				specifiers,
			}
		})
		.filter((entry): entry is ImportEntry => Boolean(entry))
}

function collectTypeOnlyImportUsageNames(
	programPath: NodePath<t.Program>
): Set<string> {
	const usedNames = new Set<string>()

	programPath.traverse({
		TSTypeReference(path) {
			addImportBindingUsage(path.get("typeName"), usedNames)
		},
		TSExpressionWithTypeArguments(path) {
			addImportBindingUsage(path.get("expression"), usedNames)
		},
		TSTypeQuery(path) {
			addImportBindingUsage(path.get("exprName"), usedNames)
		},
	})

	return usedNames
}

function addImportBindingUsage(
	referencePath: NodePath<any> | null | undefined,
	usedNames: Set<string>
) {
	const identifierPath = getLeftMostReferenceIdentifierPath(referencePath)
	if (!identifierPath) {
		return
	}

	const binding = identifierPath.scope.getBinding(identifierPath.node.name)
	if (
		binding?.path.isImportSpecifier() ||
		binding?.path.isImportDefaultSpecifier() ||
		binding?.path.isImportNamespaceSpecifier()
	) {
		usedNames.add(identifierPath.node.name)
	}
}

function getLeftMostReferenceIdentifierPath(
	path: NodePath<any> | null | undefined
): NodePath<t.Identifier> | null {
	if (!path) {
		return null
	}

	if (path.isIdentifier()) {
		return path as NodePath<t.Identifier>
	}

	if (path.isTSQualifiedName()) {
		return getLeftMostReferenceIdentifierPath(path.get("left"))
	}

	if (path.isMemberExpression()) {
		return getLeftMostReferenceIdentifierPath(path.get("object"))
	}

	return null
}

function isImportSpecifierUsed(
	localName: string,
	programPath: NodePath<t.Program>,
	extraUsedNames: Set<string>
): boolean {
	const binding = programPath.scope.getBinding(localName)
	if (binding?.referenced) {
		return true
	}

	if (extraUsedNames.has(localName)) {
		return true
	}

	const kebab = toKebabCase(localName)
	const camel = toCamelCase(localName)
	const pascal = toPascalCase(localName)
	return (
		extraUsedNames.has(kebab) ||
		extraUsedNames.has(camel) ||
		extraUsedNames.has(pascal)
	)
}

function createImportSorter(options: ImportSortOptions) {
	const groupOrder = [
		ImportGroup.SIDE_EFFECT,
		ImportGroup.BUILTIN,
		ImportGroup.EXTERNAL,
		ImportGroup.INTERNAL_ALIAS,
		ImportGroup.PARENT,
		ImportGroup.SIBLING,
		ImportGroup.INDEX,
	]

	return (left: ImportEntry, right: ImportEntry) => {
		const groupDiff =
			groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group)
		if (groupDiff !== 0) {
			return groupDiff
		}

		const pathDiff = left.modulePath.localeCompare(right.modulePath)
		if (pathDiff !== 0) {
			return pathDiff
		}

		if (left.isTypeOnly !== right.isTypeOnly) {
			return left.isTypeOnly ? 1 : -1
		}

		if (options.sortByLength) {
			const lengthDiff =
				renderImportEntryForSort(left).length -
				renderImportEntryForSort(right).length
			if (lengthDiff !== 0) {
				return lengthDiff
			}
		}

		return renderImportEntryForSort(left).localeCompare(
			renderImportEntryForSort(right)
		)
	}
}

function formatImportEntries(
	entries: ImportEntry[],
	options: ImportSortOptions,
	hasFollowingCode: boolean,
	renderStyle: ImportRenderStyle
): string {
	if (!entries.length) {
		return hasFollowingCode ? "" : ""
	}

	const lines: string[] = []
	let currentGroup: ImportGroup | null = null

	for (const entry of entries) {
		if (entry.group !== currentGroup) {
			if (lines.length) {
				lines.push("")
			}
			if (options.addGroupComments) {
				const label = options.groupNames[entry.group]
				if (label) {
					lines.push(`// ${label}`)
				}
			}
			currentGroup = entry.group
		}

		for (const comment of entry.leadingComments) {
			if (comment) {
				lines.push(comment)
			}
		}
		lines.push(renderImportEntry(entry, renderStyle))
	}

	let output = lines.join("\n")
	if (hasFollowingCode) {
		output = `${output}\n\n`
	} else {
		output = `${output}\n`
	}

	return output
}

function renderImportEntryForSort(entry: ImportEntry): string {
	return renderImportEntry(entry, {
		quote: "'",
		semicolon: true,
		multilineIndent: "\t",
	}, false)
}

function renderImportEntry(
	entry: ImportEntry,
	style: ImportRenderStyle,
	preserveMultiline = true
): string {
	const statementEnding = style.semicolon ? ";" : ""
	const quote = style.quote
	if (entry.isSideEffect) {
		return `import ${quote}${entry.modulePath}${quote}${statementEnding}`
	}

	const defaultSpecifier = entry.specifiers.find((item) => item.kind === "default")
	const namespaceSpecifier = entry.specifiers.find(
		(item) => item.kind === "namespace"
	)
	const namedSpecifiers = entry.specifiers
		.filter((item): item is ImportSpecifierInfo => item.kind === "named")
		.sort((left, right) => {
			const leftName = `${left.importedName || ""}:${left.localName}`
			const rightName = `${right.importedName || ""}:${right.localName}`
			return leftName.localeCompare(rightName)
		})

	const parts: string[] = []
	if (defaultSpecifier) {
		parts.push(defaultSpecifier.localName)
	}
	if (namespaceSpecifier) {
		parts.push(`* as ${namespaceSpecifier.localName}`)
	}
	if (namedSpecifiers.length) {
		const formattedNamedSpecifiers = namedSpecifiers.map(formatNamedSpecifier)
		if (preserveMultiline && shouldRenderMultilineImport(entry, namedSpecifiers)) {
			parts.push(
				`{\n${formattedNamedSpecifiers
					.map((specifier) => `${style.multilineIndent}${specifier},`)
					.join("\n")}\n}`
			)
		} else {
			parts.push(`{ ${formattedNamedSpecifiers.join(", ")} }`)
		}
	}

	const keyword = entry.isTypeOnly ? "import type" : "import"
	return `${keyword} ${parts.join(", ")} from ${quote}${entry.modulePath}${quote}${statementEnding}`
}

function formatNamedSpecifier(specifier: ImportSpecifierInfo): string {
	const importedName = specifier.importedName || specifier.localName
	const aliasText =
		importedName === specifier.localName
			? importedName
			: `${importedName} as ${specifier.localName}`
	return specifier.isTypeOnly ? `type ${aliasText}` : aliasText
}

function formatComment(comment: t.Comment): string {
	const value = String(comment.value || "").trim()
	if (!value) {
		return ""
	}
	if (comment.type === "CommentBlock") {
		return `/* ${value} */`
	}
	return `// ${value}`
}

function detectImportRenderStyle(entries: ImportEntry[]): ImportRenderStyle {
	const quote = entries.find((entry) => entry.quote)?.quote || `"`
	const semicolon = entries.find((entry) => entry.hasSemicolon)?.hasSemicolon || false
	const multilineIndent =
		entries.find((entry) => entry.isMultiline && entry.multilineIndent.trim().length > 0)
			?.multilineIndent || "\t"

	return {
		quote,
		semicolon,
		multilineIndent,
	}
}

function detectImportQuote(value: string): "'" | '"' {
	const fromMatch = value.match(/\bfrom\s+(['"])/)
	if (fromMatch?.[1] === `'` || fromMatch?.[1] === `"`) {
		return fromMatch[1]
	}
	const sideEffectMatch = value.match(/^import\s+(['"])/)
	if (sideEffectMatch?.[1] === `'` || sideEffectMatch?.[1] === `"`) {
		return sideEffectMatch[1]
	}
	return `"`
}

function detectMultilineIndent(value: string): string {
	const match = value.match(/\r?\n([ \t]+)\S/)
	return match?.[1] || "\t"
}

function shouldRenderMultilineImport(
	entry: ImportEntry,
	namedSpecifiers: ImportSpecifierInfo[]
): boolean {
	return entry.isMultiline || namedSpecifiers.length >= 4
}

function findLineStart(content: string, offset: number): number {
	let cursor = Math.max(offset, 0)
	while (cursor > 0 && content[cursor - 1] !== "\n") {
		cursor -= 1
	}
	return cursor
}

function consumeTrailingWhitespaceLines(content: string, offset: number): number {
	let cursor = Math.max(offset, 0)
	while (cursor < content.length) {
		const lineStart = cursor
		while (cursor < content.length && content[cursor] !== "\n") {
			cursor += 1
		}
		const lineText = content.slice(lineStart, cursor)
		if (lineText.trim() !== "") {
			return lineStart
		}
		if (cursor < content.length && content[cursor] === "\n") {
			cursor += 1
		}
	}
	return cursor
}

async function readNearestPathAliasPrefixes(uri: vscode.Uri): Promise<string[]> {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
	if (!workspaceFolder) {
		return []
	}

	let currentDir = path.dirname(uri.fsPath)
	const workspaceRoot = workspaceFolder.uri.fsPath
	const candidates = ["tsconfig.json", "jsconfig.json"]

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

function collectVueTemplateUsedNames(content: string): Set<string> {
	const names = new Set<string>()

	try {
		const root = parseVueTemplate(content)
		const visit = (node: any) => {
			if (!node || typeof node !== "object") {
				return
			}

			if (node.type === NodeTypes.ELEMENT) {
				if (node.tagType === ElementTypes.COMPONENT && node.tag) {
					addTemplateNameVariants(names, String(node.tag))
				}

				for (const prop of node.props || []) {
					if (prop.type === NodeTypes.DIRECTIVE) {
						const expressionContent = String(prop.exp?.content || "")
						collectExpressionIdentifiers(expressionContent, names)
						if (prop.name === "for") {
							const rightSide = expressionContent.split(/\s+(?:in|of)\s+/).pop()
							collectExpressionIdentifiers(String(rightSide || ""), names)
						}
						const argContent = String(prop.arg?.content || "")
						if (argContent && !prop.arg?.isStatic) {
							collectExpressionIdentifiers(argContent, names)
						}
					}
				}
			}

			if (node.type === NodeTypes.INTERPOLATION) {
				collectExpressionIdentifiers(String(node.content?.content || ""), names)
			}

			for (const child of node.children || []) {
				visit(child)
			}

			for (const branch of node.branches || []) {
				visit(branch)
			}
		}

		visit(root)
	} catch {
		// ignore template parse errors
	}

	return names
}

function collectExpressionIdentifiers(expression: string, output: Set<string>) {
	const sanitized = String(expression || "")
		.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, " ")
		.replace(/\b(?:true|false|null|undefined|this|new|return|typeof|instanceof|in|of)\b/g, " ")
	const matches = sanitized.match(/[$A-Za-z_][\w$-]*/g) || []
	for (const match of matches) {
		addTemplateNameVariants(output, match)
	}
}

function addTemplateNameVariants(output: Set<string>, rawName: string) {
	const kebab = toKebabCase(rawName)
	const camel = toCamelCase(rawName)
	const pascal = toPascalCase(rawName)
	;[rawName, kebab, camel, pascal].forEach((item) => {
		if (item) {
			output.add(item)
		}
	})
}

function toKebabCase(value: string): string {
	return String(value || "")
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase()
}

function toCamelCase(value: string): string {
	const normalized = toKebabCase(value)
	return normalized.replace(/-([a-z0-9])/g, (_, letter) =>
		String(letter).toUpperCase()
	)
}

function toPascalCase(value: string): string {
	const camel = toCamelCase(value)
	return camel ? camel[0].toUpperCase() + camel.slice(1) : ""
}
