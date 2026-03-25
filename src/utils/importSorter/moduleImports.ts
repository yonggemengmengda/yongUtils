import { parse as babelParse } from "@babel/parser"
import traverse, { NodePath } from "@babel/traverse"
import * as t from "@babel/types"
import * as vscode from "vscode"
import { addNameVariants } from "./nameUtils"
import {
	BUILTIN_MODULES,
	IMPORT_GROUP_ORDER,
	PARSER_PLUGINS,
	type ImportEntry,
	type ImportRenderStyle,
	ImportGroup,
	type ImportSortOptions,
	type ImportSpecifierInfo,
} from "./shared"

type ModuleImportEditInput = {
	document: vscode.TextDocument
	content: string
	baseOffset: number
	options: ImportSortOptions
	extraUsedNames?: Set<string>
	disableUnusedRemoval?: boolean
}

const SORT_RENDER_STYLE: ImportRenderStyle = {
	quote: "'",
	semicolon: true,
	multilineIndent: "\t",
}

export function computeModuleImportEdits(
	input: ModuleImportEditInput
): vscode.TextEdit[] {
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

	const entries = importNodes.map((node) =>
		createImportEntry(
			node,
			input.content,
			input.options.internalLibPrefixes,
			input.options.placeSideEffectImportsFirst,
			input.options.groupNames
		)
	)
	const renderStyle = detectImportRenderStyle(entries)
	const prunedEntries = pruneUnusedImportsIfNeeded(entries, programPath, input)
	const sortedEntries = [...prunedEntries].sort(createImportSorter(input.options))
	const replaceStart = findImportBlockStart(
		input.content,
		importNodes[0].start || 0,
		input.options.groupNames
	)
	const replaceEnd = consumeTrailingWhitespaceLines(
		input.content,
		importNodes[importNodes.length - 1].end || 0
	)
	const originalText = input.content.slice(replaceStart, replaceEnd)
	const replacementText = formatImportEntries(
		sortedEntries,
		input.options,
		input.content.slice(replaceEnd).trim().length > 0,
		renderStyle
	)

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

function pruneUnusedImportsIfNeeded(
	entries: ImportEntry[],
	programPath: NodePath<t.Program>,
	input: Pick<
		ModuleImportEditInput,
		"options" | "disableUnusedRemoval" | "extraUsedNames"
	>
) {
	if (!input.options.removeUnusedImports || input.disableUnusedRemoval) {
		return entries
	}

	return removeUnusedImportSpecifiers(
		entries,
		programPath,
		input.extraUsedNames || new Set<string>()
	)
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
	placeSideEffectImportsFirst: boolean,
	groupNames: Record<string, string>
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
		leadingComments: (node.leadingComments || [])
			.map(formatComment)
			.filter((comment) => comment && !isGeneratedGroupComment(comment, groupNames)),
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
				shouldPreserveImportSpecifier(entry, specifier) ||
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

function shouldPreserveImportSpecifier(
	entry: ImportEntry,
	specifier: ImportSpecifierInfo
): boolean {
	return entry.isTypeOnly || specifier.isTypeOnly
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
	if (programPath.scope.getBinding(localName)?.referenced) {
		return true
	}

	if (extraUsedNames.has(localName)) {
		return true
	}

	const variantNames = new Set<string>()
	addNameVariants(variantNames, localName)
	return Array.from(variantNames).some((name) => extraUsedNames.has(name))
}

function createImportSorter(options: ImportSortOptions) {
	return (left: ImportEntry, right: ImportEntry) => {
		const groupDiff =
			IMPORT_GROUP_ORDER.indexOf(left.group) - IMPORT_GROUP_ORDER.indexOf(right.group)
		if (groupDiff !== 0) {
			return groupDiff
		}

		const bucketDiff = getImportSortBucket(left) - getImportSortBucket(right)
		if (bucketDiff !== 0) {
			return bucketDiff
		}

		const leftSortText = renderImportEntryForSort(left)
		const rightSortText = renderImportEntryForSort(right)
		if (options.sortByLength) {
			const lengthDiff = leftSortText.length - rightSortText.length
			if (lengthDiff !== 0) {
				return lengthDiff
			}
		}

		const pathDiff = left.modulePath.localeCompare(right.modulePath)
		if (pathDiff !== 0) {
			return pathDiff
		}

		return leftSortText.localeCompare(rightSortText)
	}
}

function getImportSortBucket(entry: ImportEntry): number {
	if (entry.isTypeOnly) {
		return 0
	}

	if (hasNamedSpecifiers(entry)) {
		return 2
	}

	return 1
}

function hasNamedSpecifiers(entry: ImportEntry): boolean {
	return entry.specifiers.some((specifier) => specifier.kind === "named")
}

function formatImportEntries(
	entries: ImportEntry[],
	options: ImportSortOptions,
	hasFollowingCode: boolean,
	renderStyle: ImportRenderStyle
): string {
	if (!entries.length) {
		return ""
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

	const output = lines.join("\n")
	return hasFollowingCode ? `${output}\n\n` : `${output}\n`
}

function renderImportEntryForSort(entry: ImportEntry): string {
	return renderImportEntry(entry, SORT_RENDER_STYLE, false)
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

	return comment.type === "CommentBlock" ? `/* ${value} */` : `// ${value}`
}

function isGeneratedGroupComment(
	comment: string,
	groupNames: Record<string, string>
): boolean {
	return Object.values(groupNames)
		.map((label) => String(label || "").trim())
		.filter(Boolean)
		.some((label) => comment.trim() === `// ${label}`)
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

function findImportBlockStart(
	content: string,
	firstImportOffset: number,
	groupNames: Record<string, string>
): number {
	let start = findLineStart(content, firstImportOffset)
	const groupCommentSet = new Set(
		Object.values(groupNames)
			.map((label) => String(label || "").trim())
			.filter(Boolean)
			.map((label) => `// ${label}`)
	)

	while (start > 0) {
		const lineEnd = start - 1
		if (lineEnd < 0) {
			break
		}

		const lineStart = findLineStart(content, lineEnd)
		const lineText = content.slice(lineStart, lineEnd).trim()
		if (!groupCommentSet.has(lineText)) {
			break
		}

		start = lineStart
	}

	return start
}

function consumeTrailingWhitespaceLines(content: string, offset: number): number {
	let cursor = Math.max(offset, 0)

	while (cursor < content.length) {
		const lineStart = cursor
		while (cursor < content.length && content[cursor] !== "\n") {
			cursor += 1
		}

		if (content.slice(lineStart, cursor).trim() !== "") {
			return lineStart
		}

		if (cursor < content.length && content[cursor] === "\n") {
			cursor += 1
		}
	}

	return cursor
}
