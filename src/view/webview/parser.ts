import { TextDocument } from "vscode"
import { parseHtmlFile, parseTsFile, parseVueFile } from "../../ast-parser"
import { AstFilter } from "./filter"
import { AstSummaryBuilder } from "./summary"
import type {
	AstDocumentPayload,
	WebAstKind,
	WebAstNode,
	WebLocation,
} from "./types"

export class AstParser {
	constructor(
		private readonly filter = new AstFilter(),
		private readonly summary = new AstSummaryBuilder()
	) {}
	public buildAstForDocument(document: TextDocument): {
		payload?: AstDocumentPayload
		error?: string
	} {
		const content = document.getText()
		const languageId = document.languageId

		try {
			if (languageId === "vue") {
				const vueAst = parseVueFile(content)
				const nodes: WebAstNode[] = []
				let templateChildren: WebAstNode[] = []
				const templateComponents = (vueAst.templateComponents || []).map((entry) => ({
					tag: entry.tag,
					location: entry.location
						? this.toWebLocation(entry.location)
						: undefined,
				}))
				const scriptImportNamesFromAst = Array.isArray(vueAst.scriptImportNames)
					? vueAst.scriptImportNames
					: []
				const scriptImportNames = Array.from(new Set([
					scriptImportNamesFromAst,
					this.extractImportNamesFromContent(content),
					this.extractVueScriptImportNames(content),
					this.extractVueComponentImportNames(content),
				].flat()))
				let scriptChildren: WebAstNode[] = []
				let scriptSummaryNodes: WebAstNode[] = []
				let styleChildren: WebAstNode[] = []
				if (vueAst.template?.length) {
					templateChildren = this.filter.filterAstNodes(
						this.normalizeAstNodes(vueAst.template),
						"html"
					)
					nodes.push({
						label: "template",
						name: "vue-template",
						location: vueAst.templateLocation
							? this.toWebLocation(vueAst.templateLocation)
							: undefined,
						children: templateChildren,
					})
				}
				if (vueAst.script) {
					scriptSummaryNodes = this.normalizeAstNodes(vueAst.script)
					scriptChildren = this.filter.filterAstNodes(
						scriptSummaryNodes,
						"script"
					)
					nodes.push({
						label: "script",
						name: "javascript",
						location: vueAst.scriptLocation
							? this.toWebLocation(vueAst.scriptLocation)
							: undefined,
						children: scriptChildren,
					})
				}
				if (vueAst.styles?.length) {
					styleChildren = this.filter.filterAstNodes(
						this.normalizeAstNodes(vueAst.styles),
						"style"
					)
					nodes.push({
						label: "styles",
						name: "css",
						location: vueAst.styleLocations?.[0]
							? this.toWebLocation(vueAst.styleLocations[0])
							: undefined,
						children: styleChildren,
					})
				}
				return {
					payload: {
						ast: nodes,
						viewKind: "vue",
						summary: this.summary.buildVueSummary(
							templateChildren,
							templateComponents,
							scriptImportNames,
							scriptSummaryNodes
						),
					},
				}
			}

			if (languageId === "html") {
				const htmlAst = parseHtmlFile(content)
				const nodes = this.filter.filterAstNodes(
					this.normalizeAstNodes(htmlAst),
					"html"
				)
				return {
					payload: {
						ast: nodes,
						viewKind: "html",
						summary: this.summary.buildHtmlSummary(nodes),
					},
				}
			}

			if (
				languageId === "javascript" ||
				languageId === "javascriptreact" ||
				languageId === "typescript" ||
				languageId === "typescriptreact"
			) {
				const tsAst = parseTsFile(content)
				const nodes = this.filter.filterAstNodes(
					this.normalizeAstNodes(tsAst),
					"script"
				)
				return {
					payload: {
						ast: nodes,
						viewKind: "script",
						summary: this.summary.buildScriptSummary(nodes, languageId),
					},
				}
			}
		} catch (error) {
			return {
				error: "解析 AST 失败，请检查文件内容。",
			}
		}

		return {
			error: `暂不支持解析该类型文件（${languageId}）。`,
		}
	}
	private normalizeAstNodes(input: any): WebAstNode[] {
		if (!input) return []
		if (Array.isArray(input)) {
			return input.map((node) => this.toWebAstNode(node))
		}
		return [this.toWebAstNode(input)]
	}
	private toWebAstNode(node: any): WebAstNode {
		const rawLabelValue = node.label ?? node.name ?? node.type ?? "node"
		const rawLabel =
			typeof rawLabelValue === "string"
				? rawLabelValue
				: String(rawLabelValue)
		const name = node.type ?? node.name ?? undefined
		const value = typeof node.value === "string" ? node.value : undefined
		const attrs = Array.isArray(node.attrs)
			? node.attrs
					.filter((attr: any) => attr && attr.name)
					.map((attr: any) => ({
						name: String(attr.name),
						value: attr.value ? String(attr.value) : "",
						location: attr.location
							? this.toWebLocation(attr.location)
							: undefined,
					}))
			: undefined
		const kind = this.getNodeKind(rawLabel, name)
		const label = this.buildDisplayLabel(node, rawLabel, name, value, kind, attrs)
		const attrChildren =
			kind === "tag" ? this.buildAttributeChildren(node.attrs) : []
		const baseChildren = Array.isArray(node.children)
			? node.children.map((child: any) => this.toWebAstNode(child))
			: []
		const children = attrChildren.length
			? [...attrChildren, ...baseChildren]
			: baseChildren

		return {
			label,
			name,
			kind,
			value,
			attrs,
			symbols:
				Array.isArray(node.symbols) && node.symbols.length
					? node.symbols
					: this.extractNodeSymbols(rawLabel, name),
			location: node.location ? this.toWebLocation(node.location) : undefined,
			children,
		}
	}

	private getNodeKind(rawLabel: string, type?: string): WebAstKind {
		const label = (rawLabel || "").toLowerCase()
		if (label.startsWith("#text")) return "text"
		if (label.startsWith("#comment")) return "comment"
		if (!type && label && !label.startsWith("#")) return "tag"
		return "node"
	}

	private buildDisplayLabel(
		node: any,
		rawLabel: string,
		type: string | undefined,
		value: string | undefined,
		kind: WebAstKind,
		attrs?: Array<{ name: string; value?: string }>
	): string {
		const trimmedLabel = rawLabel?.trim() || "node"
		if (kind === "text") {
			return this.formatTextLabel(value || "")
		}
		if (kind === "comment") {
			return this.formatTextLabel(value || "", "comment")
		}
		if (kind === "tag") {
			return this.formatTagLabel(trimmedLabel, attrs)
		}

		if (type) {
			const prefix = this.getTypePrefix(type, node)
			if (prefix) {
				if (trimmedLabel && trimmedLabel !== type) {
					return `${prefix} ${trimmedLabel}`
				}
				return prefix
			}

			if (trimmedLabel === type) {
				return this.simplifyTypeLabel(type)
			}
		}

		return trimmedLabel
	}

	private formatTagLabel(
		tagName: string,
		attrs?: Array<{ name: string; value?: string }>
	): string {
		const safeTag = tagName || "div"
		if (!attrs || attrs.length === 0) {
			return `<${safeTag}>`
		}
		const ordered = this.orderTagAttributes(attrs)
		const maxAttrs = 4
		const maxLength = 60
		const parts: string[] = []
		let totalLength = 0
		for (const attr of ordered) {
			if (parts.length >= maxAttrs) break
			const fragment = this.formatTagAttribute(attr)
			if (!fragment) continue
			if (parts.length > 0 && totalLength + fragment.length > maxLength) {
				break
			}
			parts.push(fragment)
			totalLength += fragment.length + 1
		}
		const omitted = ordered.length - parts.length
		const suffix = omitted > 0 ? ` ...+${omitted}` : ""
		const attrSection = parts.length ? ` ${parts.join(" ")}` : ""
		return `<${safeTag}${attrSection}${suffix}>`
	}

	private orderTagAttributes(
		attrs: Array<{ name: string; value?: string }>
	): Array<{ name: string; value?: string }> {
		const priorityOrder = [
			"id",
			"class",
			"name",
			"type",
			"src",
			"href",
			"value",
			"key",
			"ref",
		]
		const ordered: Array<{ name: string; value?: string }> = []
		const used = new Set<number>()
		for (const priority of priorityOrder) {
			for (let i = 0; i < attrs.length; i++) {
				const attr = attrs[i]
				if (used.has(i)) continue
				if (attr.name === priority) {
					ordered.push(attr)
					used.add(i)
				}
			}
		}
		for (let i = 0; i < attrs.length; i++) {
			if (!used.has(i)) ordered.push(attrs[i])
		}
		return ordered
	}

	private formatTagAttribute(attr: { name: string; value?: string }): string {
		const name = attr.name
		const value = this.normalizeText(attr.value || "")
		if (!value) return name
		const trimmed = value.length > 30 ? `${value.slice(0, 27)}...` : value
		return `${name}="${trimmed}"`
	}

	private formatAttributeChildLabel(attr: { name: string; value?: string }): string {
		const name = attr.name
		const value = this.normalizeText(attr.value || "")
		if (!value) return name
		const maxLength = 80
		const trimmed = value.length > maxLength
			? `${value.slice(0, maxLength - 3)}...`
			: value
		return `${name}="${trimmed}"`
	}

	private buildAttributeChildren(
		attrs?: Array<{ name: string; value?: string; location?: any }>
	): WebAstNode[] {
		if (!Array.isArray(attrs) || attrs.length === 0) return []
		const children: WebAstNode[] = []
		for (const attr of attrs) {
			if (!attr || !attr.name) continue
			children.push({
				label: this.formatAttributeChildLabel(attr),
				kind: "node",
				value: typeof attr.value === "string" ? attr.value : undefined,
				location: attr.location ? this.toWebLocation(attr.location) : undefined,
				children: [],
			})
		}
		return children
	}
	private extractVueScriptImportNames(content: string): string[] {
		const names = new Set<string>()
		const scriptBlockRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
		let blockMatch: RegExpExecArray | null = null
		while ((blockMatch = scriptBlockRegex.exec(content)) !== null) {
			const blockContent = blockMatch[1] || ""
			const importRegex = /import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g
			let importMatch: RegExpExecArray | null = null
			while ((importMatch = importRegex.exec(blockContent)) !== null) {
				const specifier = importMatch[1] || ""
				for (const name of this.extractImportNamesFromSpecifier(specifier)) {
					names.add(name)
				}
			}
		}
		return Array.from(names)
	}

	private extractImportNamesFromContent(content: string): string[] {
		const names = new Set<string>()
		const importRegex = /^\s*import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/gm
		let match: RegExpExecArray | null = null
		while ((match = importRegex.exec(content)) !== null) {
			const specifier = match[1] || ""
			for (const name of this.extractImportNamesFromSpecifier(specifier)) {
				names.add(name)
			}
		}
		return Array.from(names)
	}

	private extractVueComponentImportNames(content: string): string[] {
		const names = new Set<string>()
		const regex =
			/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]+\.vue(?:\?[^'"]*)?['"]/g
		let match: RegExpExecArray | null = null
		while ((match = regex.exec(content)) !== null) {
			const name = String(match[1] || "").trim()
			if (name) names.add(name)
		}
		return Array.from(names)
	}

	private extractImportNamesFromSpecifier(specifier: string): string[] {
		const normalized = specifier.replace(/\s+/g, " ").trim()
		if (!normalized) return []
		const names = new Set<string>()
		const add = (value: string) => {
			const candidate = value.trim()
			if (!candidate || !this.isIdentifierLike(candidate)) return
			names.add(candidate)
		}

		const namedMatch = normalized.match(/\{([^}]*)\}/)
		if (namedMatch) {
			for (const rawPart of namedMatch[1].split(",")) {
				const part = rawPart.trim()
				if (!part) continue
				const aliasMatch = part.match(/\s+as\s+([A-Za-z_$][\w$]*)$/)
				if (aliasMatch?.[1]) {
					add(aliasMatch[1])
					continue
				}
				add(part.replace(/^type\s+/, "").trim())
			}
		}

		const namespaceMatch = normalized.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
		if (namespaceMatch?.[1]) add(namespaceMatch[1])

		let remainder = normalized
		if (namedMatch) remainder = remainder.replace(namedMatch[0], " ")
		if (namespaceMatch) remainder = remainder.replace(namespaceMatch[0], " ")
		remainder = remainder.replace(/\btype\b/g, " ")
		for (const candidate of remainder.split(",")) {
			add(candidate)
		}

		return Array.from(names)
	}
	private extractNodeSymbols(rawLabel: string, type?: string): string[] {
		if (!type) return []
		switch (type) {
			case "ImportDeclaration":
				return this.extractImportSymbols(rawLabel)
			case "FunctionDeclaration":
			case "TSDeclareFunction":
			case "FunctionExpression":
			case "ArrowFunctionExpression":
			case "ObjectMethod":
			case "ClassMethod":
			case "TSMethodSignature":
				return this.extractFunctionLikeSymbols(rawLabel)
			case "VariableDeclaration":
				return this.extractAssignmentSymbols(rawLabel)
			case "ClassProperty":
			case "ClassPrivateProperty":
			case "TSPropertySignature":
				return this.extractPropertySymbols(rawLabel)
			case "ClassDeclaration":
			case "TSInterfaceDeclaration":
			case "TSTypeAliasDeclaration":
			case "TSEnumDeclaration":
			case "TSModuleDeclaration":
				return this.extractSimpleSymbols(rawLabel)
			default:
				return []
		}
	}

	private extractImportSymbols(label: string): string[] {
		let source = label.trim().replace(/^import\s+/, "")
		const fromIndex = source.lastIndexOf(" from ")
		if (fromIndex >= 0) {
			source = source.slice(0, fromIndex).trim()
		}
		if (!source || source.startsWith(`"` ) || source.startsWith(`'`)) {
			return []
		}

		const symbols: string[] = []
		const namedMatch = source.match(/\{([^}]*)\}/)
		if (namedMatch) {
			for (const rawPart of namedMatch[1].split(",")) {
				const part = rawPart.trim()
				if (!part) continue
				const aliasMatch = part.match(/\s+as\s+([A-Za-z_$][\w$]*)$/)
				if (aliasMatch?.[1]) {
					symbols.push(aliasMatch[1])
					continue
				}
				if (this.isIdentifierLike(part)) symbols.push(part)
			}
			source = source.replace(namedMatch[0], "").replace(/,,/g, ",").trim()
		}

		const namespaceMatch = source.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
		if (namespaceMatch?.[1]) {
			symbols.push(namespaceMatch[1])
			source = source.replace(namespaceMatch[0], "").trim()
		}

		const defaultImport = source
			.split(",")
			.map((part) => part.trim())
			.find((part) => this.isIdentifierLike(part))
		if (defaultImport) symbols.push(defaultImport)
		return Array.from(new Set(symbols))
	}

	private extractFunctionLikeSymbols(label: string): string[] {
		const trimmed = label.trim()
		const index = trimmed.indexOf("(")
		if (index < 0) return []
		const candidate = trimmed.slice(0, index).trim()
		if (!this.isIdentifierLike(candidate) && !candidate.startsWith("#")) {
			return []
		}
		return [candidate]
	}

	private extractAssignmentSymbols(label: string): string[] {
		const trimmed = this.stripVariableDeclarationPrefix(label.trim())
		const eqIndex = this.findTopLevelCharIndex(trimmed, ["="])
		const candidate = (eqIndex >= 0 ? trimmed.slice(0, eqIndex) : trimmed).trim()
		return this.extractBindingPatternSymbols(candidate)
	}

	private extractBindingPatternSymbols(pattern: string): string[] {
		const normalized = this.stripTopLevelTypeAnnotation(
			this.unwrapTopLevelParentheses(pattern.trim())
		)
		if (!normalized) return []

		const assignmentIndex = this.findTopLevelCharIndex(normalized, ["="])
		if (assignmentIndex >= 0) {
			return this.extractBindingPatternSymbols(
				normalized.slice(0, assignmentIndex)
			)
		}

		if (normalized.startsWith("{") && normalized.endsWith("}")) {
			const symbols: string[] = []
			for (const part of this.splitTopLevel(normalized.slice(1, -1), ",")) {
				const entry = part.trim()
				if (!entry) continue
				const spreadEntry = entry.startsWith("...") ? entry.slice(3).trim() : entry
				const colonIndex = this.findTopLevelCharIndex(spreadEntry, [":"])
				const target =
					colonIndex >= 0
						? spreadEntry.slice(colonIndex + 1).trim()
						: spreadEntry
				for (const name of this.extractBindingPatternSymbols(target)) {
					if (!symbols.includes(name)) symbols.push(name)
				}
			}
			return symbols
		}

		if (normalized.startsWith("[") && normalized.endsWith("]")) {
			const symbols: string[] = []
			for (const part of this.splitTopLevel(normalized.slice(1, -1), ",")) {
				for (const name of this.extractBindingPatternSymbols(part.trim())) {
					if (!symbols.includes(name)) symbols.push(name)
				}
			}
			return symbols
		}

		return this.isIdentifierLike(normalized) ? [normalized] : []
	}

	private stripVariableDeclarationPrefix(value: string): string {
		return value.replace(/^(?:const|let|var)\s+/, "").trim()
	}

	private stripTopLevelTypeAnnotation(value: string): string {
		const colonIndex = this.findTopLevelCharIndex(value, [":"])
		return (colonIndex >= 0 ? value.slice(0, colonIndex) : value).trim()
	}

	private unwrapTopLevelParentheses(value: string): string {
		let current = value.trim()
		while (this.isWrappedByPair(current, "(", ")")) {
			current = current.slice(1, -1).trim()
		}
		return current
	}

	private isWrappedByPair(value: string, open: string, close: string): boolean {
		if (!value.startsWith(open) || !value.endsWith(close)) return false
		let depth = 0
		let quote: string | null = null
		let escaped = false
		for (let index = 0; index < value.length; index++) {
			const char = value[index]
			if (quote) {
				if (escaped) {
					escaped = false
					continue
				}
				if (char === "\\") {
					escaped = true
					continue
				}
				if (char === quote) {
					quote = null
				}
				continue
			}
			if (char === `"` || char === `'` || char === "`") {
				quote = char
				continue
			}
			if (char === open) {
				depth += 1
				continue
			}
			if (char === close) {
				depth -= 1
				if (depth === 0 && index < value.length - 1) {
					return false
				}
			}
		}
		return depth === 0
	}

	private splitTopLevel(value: string, separator: string): string[] {
		const result: string[] = []
		let current = ""
		let parenDepth = 0
		let bracketDepth = 0
		let braceDepth = 0
		let quote: string | null = null
		let escaped = false

		for (let index = 0; index < value.length; index++) {
			const char = value[index]
			if (quote) {
				current += char
				if (escaped) {
					escaped = false
					continue
				}
				if (char === "\\") {
					escaped = true
					continue
				}
				if (char === quote) {
					quote = null
				}
				continue
			}

			if (char === `"` || char === `'` || char === "`") {
				quote = char
				current += char
				continue
			}
			if (char === "(") parenDepth += 1
			else if (char === ")") parenDepth = Math.max(0, parenDepth - 1)
			else if (char === "[") bracketDepth += 1
			else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1)
			else if (char === "{") braceDepth += 1
			else if (char === "}") braceDepth = Math.max(0, braceDepth - 1)

			if (
				char === separator &&
				parenDepth === 0 &&
				bracketDepth === 0 &&
				braceDepth === 0
			) {
				result.push(current)
				current = ""
				continue
			}

			current += char
		}

		if (current || value.endsWith(separator)) {
			result.push(current)
		}

		return result
	}

	private findTopLevelCharIndex(value: string, targets: string[]): number {
		let parenDepth = 0
		let bracketDepth = 0
		let braceDepth = 0
		let quote: string | null = null
		let escaped = false

		for (let index = 0; index < value.length; index++) {
			const char = value[index]
			if (quote) {
				if (escaped) {
					escaped = false
					continue
				}
				if (char === "\\") {
					escaped = true
					continue
				}
				if (char === quote) {
					quote = null
				}
				continue
			}
			if (char === `"` || char === `'` || char === "`") {
				quote = char
				continue
			}
			if (char === "(") parenDepth += 1
			else if (char === ")") parenDepth = Math.max(0, parenDepth - 1)
			else if (char === "[") bracketDepth += 1
			else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1)
			else if (char === "{") braceDepth += 1
			else if (char === "}") braceDepth = Math.max(0, braceDepth - 1)

			if (
				parenDepth === 0 &&
				bracketDepth === 0 &&
				braceDepth === 0 &&
				targets.includes(char)
			) {
				return index
			}
		}

		return -1
	}

	private extractPropertySymbols(label: string): string[] {
		const trimmed = label.trim()
		const separatorIndex = ["=", ":"]
			.map((token) => trimmed.indexOf(token))
			.filter((index) => index >= 0)
			.sort((a, b) => a - b)[0]
		const candidate =
			separatorIndex >= 0 ? trimmed.slice(0, separatorIndex).trim() : trimmed
		if (!candidate.startsWith("#") && !this.isIdentifierLike(candidate)) {
			return []
		}
		return [candidate]
	}

	private extractSimpleSymbols(label: string): string[] {
		const trimmed = label.trim()
		return this.isIdentifierLike(trimmed) ? [trimmed] : []
	}

	private isIdentifierLike(value: string): boolean {
		return /^[$A-Z_a-z][\w$]*$/.test(value)
	}
	private getTypePrefix(type: string, node: any): string | undefined {
		switch (type) {
			case "ImportDeclaration":
				return "import"
			case "ExportNamedDeclaration":
				return "export"
			case "ExportDefaultDeclaration":
				return "export default"
			case "ExportAllDeclaration":
				return "export *"
			case "FunctionDeclaration":
			case "TSDeclareFunction":
				return "function"
			case "FunctionExpression":
				return "function"
			case "ArrowFunctionExpression":
				return "arrow"
			case "VariableDeclaration":
				return node?.kind || "var"
			case "ClassDeclaration":
				return "class"
			case "ClassProperty":
			case "ClassPrivateProperty":
				return "property"
			case "ObjectMethod":
			case "ClassMethod":
			case "TSMethodSignature":
				return "method"
			case "TSPropertySignature":
				return "prop"
			case "CallExpression":
				return "call"
			case "TSTypeAliasDeclaration":
				return "type"
			case "TSInterfaceDeclaration":
				return "interface"
			case "TSEnumDeclaration":
				return "enum"
			case "TSModuleDeclaration":
				return "namespace"
			default:
				return undefined
		}
	}

	private simplifyTypeLabel(type: string): string {
		const trimmed = type
			.replace(/(Declaration|Expression|Statement|Specifier|Pattern|Literal)$/g, "")
			.replace(/^TS/, "ts ")
		return trimmed.trim() || type
	}

	private formatTextLabel(value: string, prefix = "text"): string {
		const normalized = this.normalizeText(value)
		if (!normalized) return prefix
		const truncated =
			normalized.length > 40 ? `${normalized.slice(0, 37)}...` : normalized
		return `${prefix}: "${truncated}"`
	}

	private normalizeText(value?: string): string {
		if (!value) return ""
		return value.replace(/\s+/g, " ").trim()
	}

	private toWebLocation(location: any): WebLocation {
		const range = location.range
		return {
			uri: location.uri
				? {
						scheme: location.uri.scheme,
						path: location.uri.path,
						fsPath: location.uri.fsPath,
				  }
				: undefined,
			range: [
				{
					line: range.start.line,
					character: range.start.character,
				},
				{
					line: range.end.line,
					character: range.end.character,
				},
			],
		}
	}
}
