import { TEMPLATE_IDENTIFIER_BLACKLIST } from "./constants"
import type {
	AstSummary,
	AstSummaryItem,
	AstSummarySection,
	ScriptCollectContext,
	ScriptDefinition,
	ScriptSummaryData,
	TemplateSummaryData,
	TemplateUsage,
	WebAstKind,
	WebAstNode,
	WebLocation,
} from "./types"

export class AstSummaryBuilder {
	public buildVueSummary(
		templateNodes: WebAstNode[],
		templateComponents: Array<{ tag: string; location: WebLocation | undefined }>,
		scriptImportNames: string[],
		scriptNodes: WebAstNode[]
	): AstSummary | undefined {
		const scriptSummary = this.collectScriptSummary(scriptNodes)
		this.mergeFallbackImportDefinitions(
			scriptSummary.definitions,
			scriptImportNames
		)
		this.collectTemplateSummary(
			templateNodes,
			scriptSummary.definitions,
			templateComponents
		)
		const templateTagItems = this.buildTagOverviewItems(templateNodes)
		const sections: AstSummarySection[] = []
		if (templateTagItems.length) {
			sections.push({
				id: "template-tags",
				title: "模板标签",
				description: "快速看当前组件主要由哪些标签或子组件构成。",
				items: templateTagItems,
				emptyText: "没有可展示的标签信息。",
			})
		}
		sections.push(...this.buildScriptSections(scriptSummary))

		if (!sections.length) return undefined
		return {
			title: "Vue 结构工作台",
			subtitle: "先看模板和脚本结构，再决定是否深入原始 AST。",
			cards: [],
			sections,
		}
	}

	public buildScriptSummary(
		nodes: WebAstNode[],
		languageId: string
	): AstSummary | undefined {
		const scriptSummary = this.collectScriptSummary(nodes)
		const sections = this.buildScriptSections(scriptSummary)
		if (!sections.length) return undefined
		return {
			title: "脚本结构摘要",
			subtitle: `按 ${languageId} 文件里的结构入口分组，方便直接导航。`,
			cards: [
				{
					label: "Imports",
					value: String(scriptSummary.imports.length),
					description: "模块依赖入口",
				},
				{
					label: "Functions",
					value: String(scriptSummary.functions.length),
					description: "函数和方法入口",
				},
				{
					label: "State",
					value: String(scriptSummary.state.length),
					description: "变量和属性入口",
				},
				{
					label: "Types / Class",
					value: String(scriptSummary.types.length + scriptSummary.classes.length),
					description: "类型和类定义",
				},
			],
			sections,
		}
	}

	public buildHtmlSummary(nodes: WebAstNode[]): AstSummary | undefined {
		const tagItems = this.buildTagOverviewItems(nodes)
		const textItems = this.buildTextSnippetItems(nodes)
		if (!tagItems.length && !textItems.length) return undefined
		return {
			title: "HTML 结构摘要",
			subtitle: "用标签分布和文本片段快速判断页面骨架。",
			cards: [
				{
					label: "标签",
					value: String(this.countNodesByKind(nodes, "tag")),
					description: "可视标签节点数",
				},
				{
					label: "文本",
					value: String(this.countNodesByKind(nodes, "text")),
					description: "非空文本节点数",
				},
				{
					label: "属性",
					value: String(this.countAttributeNodes(nodes)),
					description: "标签属性子节点数",
				},
				{
					label: "总节点",
					value: String(this.countAllNodes(nodes)),
					description: "当前摘要 AST 节点总数",
				},
			],
			sections: [
				{
					id: "html-tags",
					title: "标签概览",
					description: "先看标签构成，再决定要不要展开整棵树。",
					items: tagItems,
					emptyText: "没有可统计的标签。",
				},
				{
					id: "html-text",
					title: "文本片段",
					description: "帮助快速识别内容区域和静态文案。",
					items: textItems,
					emptyText: "没有非空文本节点。",
				},
			],
		}
	}

	private collectScriptSummary(nodes: WebAstNode[]): ScriptSummaryData {
		const data: ScriptSummaryData = {
			imports: [],
			functions: [],
			state: [],
			types: [],
			classes: [],
			definitions: new Map<string, ScriptDefinition>(),
			totalEntries: 0,
		}
		for (const node of nodes) {
			this.collectScriptSummaryNode(node, data, {
				exported: false,
				insideFunction: false,
				ownerLabel: "",
			})
		}
		data.totalEntries =
			data.imports.length +
			data.functions.length +
			data.state.length +
			data.types.length +
			data.classes.length
		return data
	}

	private collectScriptSummaryNode(
		node: WebAstNode,
		data: ScriptSummaryData,
		context: ScriptCollectContext
	) {
		const type = node.name || ""
		if (!type) {
			this.walkScriptChildren(node, data, context)
			return
		}

		if (
			type === "ExportNamedDeclaration" ||
			type === "ExportDefaultDeclaration" ||
			type === "ExportAllDeclaration"
		) {
			this.walkScriptChildren(node, data, {
				...context,
				exported: true,
			})
			return
		}

		const exportedBadge = context.exported ? "export" : undefined
		const ownerDescription = context.ownerLabel
			? `属于 ${context.ownerLabel}`
			: undefined

		switch (type) {
			case "ImportDeclaration":
				data.imports.push(
					this.createSummaryItem(node, {
						kind: "import",
						badge: exportedBadge,
					})
				)
				this.addDefinitionSymbols(data.definitions, node, "import")
				return
			case "FunctionDeclaration":
			case "TSDeclareFunction":
				data.functions.push(
					this.createSummaryItem(node, {
						kind: "function",
						badge: exportedBadge,
					})
				)
				this.addDefinitionSymbols(data.definitions, node, "function")
				return
			case "ClassDeclaration":
				data.classes.push(
					this.createSummaryItem(node, {
						kind: "class",
						badge: exportedBadge,
					})
				)
				this.addDefinitionSymbols(data.definitions, node, "class")
				this.walkScriptChildren(node, data, {
					...context,
					ownerLabel: node.symbols?.[0] || node.label,
				})
				return
			case "VariableDeclaration":
				data.state.push(
					this.createSummaryItem(node, {
						kind: "state",
						badge: exportedBadge,
					})
				)
				this.addDefinitionSymbols(data.definitions, node, "state")
				return
			case "ClassMethod":
			case "ObjectMethod":
			case "TSMethodSignature":
				if (!context.insideFunction) {
					data.functions.push(
						this.createSummaryItem(node, {
							kind: "function",
							badge: exportedBadge || "method",
							description: ownerDescription,
						})
					)
					this.addDefinitionSymbols(data.definitions, node, "function")
				}
				return
			case "ClassProperty":
			case "ClassPrivateProperty":
			case "TSPropertySignature":
				if (!context.insideFunction) {
					data.state.push(
						this.createSummaryItem(node, {
							kind: "state",
							badge: exportedBadge || "property",
							description: ownerDescription,
						})
					)
					this.addDefinitionSymbols(data.definitions, node, "state")
				}
				return
			case "TSTypeAliasDeclaration":
			case "TSInterfaceDeclaration":
			case "TSEnumDeclaration":
			case "TSModuleDeclaration":
				data.types.push(
					this.createSummaryItem(node, {
						kind: "type",
						badge: exportedBadge,
					})
				)
				this.addDefinitionSymbols(data.definitions, node, "type")
				return
			default: {
				const nextContext = this.isFunctionType(type)
					? { ...context, insideFunction: true }
					: context
				this.walkScriptChildren(node, data, nextContext)
			}
		}
	}

	private walkScriptChildren(
		node: WebAstNode,
		data: ScriptSummaryData,
		context: ScriptCollectContext
	) {
		if (!Array.isArray(node.children) || node.children.length === 0) return
		for (const child of node.children) {
			this.collectScriptSummaryNode(child, data, context)
		}
	}

	private buildScriptSections(data: ScriptSummaryData): AstSummarySection[] {
		const sections: AstSummarySection[] = []
		if (data.imports.length) {
			sections.push({
				id: "script-imports",
				title: "Imports",
				description: "依赖从哪来，一眼能看出来。",
				items: data.imports,
				emptyText: "没有 import。",
			})
		}
		if (data.functions.length) {
			sections.push({
				id: "script-functions",
				title: "Functions",
				description: "函数和方法入口。",
				items: data.functions,
				emptyText: "没有函数入口。",
			})
		}
		if (data.state.length) {
			sections.push({
				id: "script-state",
				title: "State",
				description: "变量、属性和对外暴露的数据入口。",
				items: data.state,
				emptyText: "没有状态入口。",
			})
		}
		const typeItems = [...data.types, ...data.classes]
		if (typeItems.length) {
			sections.push({
				id: "script-types",
				title: "Types / Class",
				description: "类型和类结构集中看，适合快速找模型定义。",
				items: typeItems,
				emptyText: "没有类型或类定义。",
			})
		}
		return sections
	}

	private collectTemplateSummary(
		nodes: WebAstNode[],
		definitions: Map<string, ScriptDefinition>,
		templateComponents: Array<{ tag: string; location: WebLocation | undefined }>
	): TemplateSummaryData {
		const usages = new Map<string, TemplateUsage>()

		for (const component of templateComponents) {
			const tagName = component?.tag || ""
			if (!tagName) continue
			const componentMatch = this.resolveTemplateComponentMatch(
				tagName,
				definitions
			)
			const componentSymbol = componentMatch.matchedName
			if (componentSymbol) {
				this.addTemplateUsage(
					usages,
					componentSymbol,
					"component",
					component.location
				)
			}
		}

		const visit = (node: WebAstNode, scope: Set<string>) => {
			if (node.kind === "tag") {
				const nextScope = new Set(scope)
				const attrs = Array.isArray(node.attrs) ? node.attrs : []
				for (const attr of attrs) {
					const attrName = attr.name || ""
					if (!attrName) continue
					if (
						attrName === "v-slot" ||
						attrName.startsWith("v-slot:") ||
						attrName.startsWith("#")
					) {
						for (const local of this.extractPatternSymbols(attr.value || "")) {
							nextScope.add(local)
						}
						continue
					}
					if (attrName === "v-for") {
						const parsed = this.parseVForExpression(attr.value || "")
						for (const local of parsed.locals) nextScope.add(local)
					}
				}
				for (const attr of attrs) {
					const attrName = attr.name || ""
					const attrValue = attr.value || ""
					if (!attrName) continue
					if (attrName === "v-for") {
						const parsed = this.parseVForExpression(attrValue)
						this.recordTemplateExpressionUsages(
							usages,
							parsed.source,
							"v-for",
							attr.location || node.location,
							scope
						)
						continue
					}
					if (
						attrName === "v-slot" ||
						attrName.startsWith("v-slot:") ||
						attrName.startsWith("#")
					) {
						continue
					}
					const source = this.classifyTemplateAttribute(attrName)
					if (source === "attr") continue
					this.recordTemplateExpressionUsages(
						usages,
						attrValue,
						source,
						attr.location || node.location,
						nextScope
					)
				}
				for (const child of node.children || []) {
					visit(child, nextScope)
				}
				return
			}
			if (node.kind === "text") {
				for (const expression of this.extractMustacheExpressions(node.value || "")) {
					this.recordTemplateExpressionUsages(
						usages,
						expression,
						"text",
						node.location,
						scope
					)
				}
			}
			for (const child of node.children || []) {
				visit(child, scope)
			}
		}

		for (const node of nodes) {
			visit(node, new Set<string>())
		}

		const linked: AstSummaryItem[] = []
		const missing: AstSummaryItem[] = []
		const entries = [...usages.values()].sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count
			return a.name.localeCompare(b.name)
		})
		for (const entry of entries) {
			const definition = definitions.get(entry.name)
			const summaryItem: AstSummaryItem = {
				label: entry.name,
				kind: entry.primarySource,
				badge: `x${entry.count}`,
				status: definition ? "linked" : "warning",
				description: definition
					? `template: ${entry.sources.join(" / ")} -> script: ${definition.label}`
					: `template: ${entry.sources.join(" / ")} -> script 摘要里未找到同名入口`,
				location: definition?.location || entry.location,
			}
			if (definition) linked.push(summaryItem)
			else missing.push(summaryItem)
		}

		return {
			linked,
			missing,
		}
	}

	private recordTemplateExpressionUsages(
		usages: Map<string, TemplateUsage>,
		expression: string,
		source: string,
		location: WebLocation | undefined,
		scope: Set<string>
	) {
		if (!expression) return
		for (const symbol of this.extractExpressionSymbols(expression)) {
			if (scope.has(symbol)) continue
			this.addTemplateUsage(usages, symbol, source, location)
		}
	}

	private addTemplateUsage(
		usages: Map<string, TemplateUsage>,
		name: string,
		source: string,
		location?: WebLocation
	) {
		if (!name) return
		const existing = usages.get(name)
		if (existing) {
			existing.count += 1
			if (!existing.sources.includes(source)) {
				existing.sources.push(source)
			}
			return
		}
		usages.set(name, {
			name,
			count: 1,
			primarySource: source,
			sources: [source],
			location,
		})
	}

	private buildTagOverviewItems(nodes: WebAstNode[]): AstSummaryItem[] {
		const tags = new Map<string, { count: number; location?: WebLocation }>()
		this.walkNodes(nodes, (node) => {
			if (node.kind !== "tag") return
			const tagName = this.extractTagName(node.label)
			if (!tagName) return
			const existing = tags.get(tagName)
			if (existing) {
				existing.count += 1
				return
			}
			tags.set(tagName, {
				count: 1,
				location: node.location,
			})
		})
		return Array.from(tags.entries())
			.sort((a, b) => {
				if (b[1].count !== a[1].count) return b[1].count - a[1].count
				return a[0].localeCompare(b[0])
			})
			.slice(0, 10)
			.map(([tagName, entry]) => ({
				label: `<${tagName}>`,
				kind: "tag",
				badge: `x${entry.count}`,
				description: "点击可跳到首个出现位置",
				location: entry.location,
			}))
	}

	private buildTextSnippetItems(nodes: WebAstNode[]): AstSummaryItem[] {
		const items: AstSummaryItem[] = []
		this.walkNodes(nodes, (node) => {
			if (items.length >= 8) return
			if (node.kind !== "text") return
			const content = this.normalizeText(node.value || "")
			if (!content) return
			items.push({
				label: `"${content.length > 44 ? `${content.slice(0, 41)}...` : content}"`,
				kind: "text",
				description: "点击可定位到文本节点",
				location: node.location,
			})
		})
		return items
	}

	private walkNodes(nodes: WebAstNode[], visitor: (node: WebAstNode) => void) {
		const stack = [...nodes]
		while (stack.length) {
			const node = stack.pop()
			if (!node) continue
			visitor(node)
			if (Array.isArray(node.children) && node.children.length) {
				stack.push(...node.children)
			}
		}
	}

	private countNodesByKind(nodes: WebAstNode[], kind: WebAstKind): number {
		let count = 0
		this.walkNodes(nodes, (node) => {
			if (node.kind === kind) count += 1
		})
		return count
	}

	private countAttributeNodes(nodes: WebAstNode[]): number {
		let count = 0
		this.walkNodes(nodes, (node) => {
			if (!Array.isArray(node.attrs)) return
			count += node.attrs.length
		})
		return count
	}

	private countAllNodes(nodes: WebAstNode[]): number {
		let count = 0
		this.walkNodes(nodes, () => {
			count += 1
		})
		return count
	}
	private createSummaryItem(
		node: WebAstNode,
		overrides: Partial<AstSummaryItem> = {}
	): AstSummaryItem {
		return {
			label: node.label,
			kind: overrides.kind || this.getSummaryKind(node.name),
			badge: overrides.badge,
			description: overrides.description,
			location: overrides.location || node.location,
			status: overrides.status,
		}
	}

	private addDefinitionSymbols(
		definitions: Map<string, ScriptDefinition>,
		node: WebAstNode,
		category: ScriptDefinition["category"]
	) {
		const symbols = Array.isArray(node.symbols) ? node.symbols : []
		const fallbackSymbols =
			symbols.length === 0
				? this.extractNodeSymbols(String(node.label || ""), node.name)
				: []
		const mergedSymbols = symbols.length > 0 ? symbols : fallbackSymbols
		for (const symbol of mergedSymbols) {
			if (!symbol || definitions.has(symbol)) continue
			definitions.set(symbol, {
				name: symbol,
				label: node.label,
				category,
				location: node.location,
			})
		}
	}

	private mergeFallbackImportDefinitions(
		definitions: Map<string, ScriptDefinition>,
		importNames: string[]
	) {
		for (const rawName of importNames) {
			const name = String(rawName || "").trim()
			if (!name || !this.isIdentifierLike(name) || definitions.has(name)) {
				continue
			}
			definitions.set(name, {
				name,
				label: `import ${name}`,
				category: "import",
			})
		}
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
		return [...new Set(symbols)]
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
		const trimmed = label.trim()
		const eqIndex = trimmed.indexOf("=")
		const candidate = (eqIndex >= 0 ? trimmed.slice(0, eqIndex) : trimmed).trim()
		return this.isIdentifierLike(candidate) ? [candidate] : []
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

	private getSummaryKind(type?: string): string {
		if (!type) return "node"
		if (type.startsWith("Import")) return "import"
		if (
			type.includes("Function") ||
			type.includes("Method") ||
			type === "TSDeclareFunction"
		) {
			return "function"
		}
		if (type.includes("Class")) return "class"
		if (type.startsWith("TS") || type.includes("Type")) return "type"
		if (type.includes("Variable") || type.includes("Property")) return "state"
		return "node"
	}

	private isFunctionType(type: string): boolean {
		return (
			type === "FunctionDeclaration" ||
			type === "TSDeclareFunction" ||
			type === "FunctionExpression" ||
			type === "ArrowFunctionExpression" ||
			type === "ClassMethod" ||
			type === "ObjectMethod"
		)
	}

	private classifyTemplateAttribute(name: string): string {
		if (name.startsWith("@") || name.startsWith("v-on:")) return "event"
		if (name === "v-model" || name.startsWith("v-model:")) return "model"
		if (
			name === "v-if" ||
			name === "v-else-if" ||
			name === "v-show" ||
			name === "v-bind" ||
			name.startsWith(":") ||
			name.startsWith("v-bind:")
		) {
			return "binding"
		}
		if (name.startsWith("v-")) return "directive"
		return "attr"
	}

	private parseVForExpression(value: string): {
		locals: string[]
		source: string
	} {
		const match = value.match(/^(.*?)\s+(?:in|of)\s+([\s\S]+)$/)
		if (!match) {
			return {
				locals: [],
				source: value,
			}
		}
		let left = match[1].trim()
		if (left.startsWith("(") && left.endsWith(")")) {
			left = left.slice(1, -1).trim()
		}
		return {
			locals: this.extractPatternSymbols(left),
			source: match[2].trim(),
		}
	}

	private extractPatternSymbols(value: string): string[] {
		const symbols: string[] = []
		const regex = /[$A-Z_a-z][\w$]*/g
		let match: RegExpExecArray | null = null
		while ((match = regex.exec(value)) !== null) {
			const name = match[0]
			if (!name || TEMPLATE_IDENTIFIER_BLACKLIST.has(name)) continue
			if (!symbols.includes(name)) symbols.push(name)
		}
		return symbols
	}

	private extractMustacheExpressions(value: string): string[] {
		const expressions: string[] = []
		const regex = /{{([\s\S]*?)}}/g
		let match: RegExpExecArray | null = null
		while ((match = regex.exec(value)) !== null) {
			const expression = match[1]?.trim()
			if (expression) expressions.push(expression)
		}
		return expressions
	}

	private extractExpressionSymbols(expression: string): string[] {
		const normalized = expression.trim()
		if (!normalized) return []
		const results: string[] = []
		const regex = /[$A-Z_a-z][\w$]*/g
		let match: RegExpExecArray | null = null
		while ((match = regex.exec(normalized)) !== null) {
			const name = match[0]
			const start = match.index
			const prevChar = start > 0 ? normalized[start - 1] : ""
			if (prevChar === "." || prevChar === "'" || prevChar === `"` || prevChar === "`") {
				continue
			}
			const prevNonSpace = this.getPrevNonSpaceChar(normalized, start - 1)
			const nextNonSpace = this.getNextNonSpaceChar(
				normalized,
				start + name.length
			)
			if (
				nextNonSpace === ":" &&
				(prevNonSpace === "{" || prevNonSpace === "," || prevNonSpace === "(")
			) {
				continue
			}
			if (TEMPLATE_IDENTIFIER_BLACKLIST.has(name)) continue
			if (!results.includes(name)) results.push(name)
		}
		return results
	}

	private getPrevNonSpaceChar(value: string, startIndex: number): string {
		for (let i = startIndex; i >= 0; i--) {
			const char = value[i]
			if (!/\s/.test(char)) return char
		}
		return ""
	}

	private getNextNonSpaceChar(value: string, startIndex: number): string {
		for (let i = startIndex; i < value.length; i++) {
			const char = value[i]
			if (!/\s/.test(char)) return char
		}
		return ""
	}

	private extractTagName(label: string): string {
		const match = label.match(/^<\s*([A-Za-z][\w.-]*)/)
		return match?.[1] || ""
	}

	private resolveTemplateComponentMatch(
		tagName: string,
		definitions: Map<string, ScriptDefinition>
	): { candidates: string[]; matchedName?: string } {
		if (!tagName) return { candidates: [] }
		const candidates = this.buildTemplateComponentCandidates(tagName)
		for (const candidate of candidates) {
			if (definitions.has(candidate)) {
				return { candidates, matchedName: candidate }
			}
		}
		const normalizedCandidates = new Set(
			candidates
				.map((candidate) => this.normalizeComponentLookupKey(candidate))
				.filter(Boolean)
		)
		if (!normalizedCandidates.size) return { candidates }
		const categoryPriority: Record<ScriptDefinition["category"], number> = {
			import: 0,
			state: 1,
			function: 2,
			class: 3,
			type: 4,
		}
		const matchedDefinition = [...definitions.values()]
			.filter((definition) =>
				normalizedCandidates.has(
					this.normalizeComponentLookupKey(definition.name)
				)
			)
			.sort(
				(a, b) => categoryPriority[a.category] - categoryPriority[b.category]
			)[0]
		if (matchedDefinition) {
			return { candidates, matchedName: matchedDefinition.name }
		}
		return { candidates }
	}

	private buildTemplateComponentCandidates(tagName: string): string[] {
		const trimmed = tagName.trim()
		if (!trimmed) return []

		const candidates = new Set<string>()
		const directRoot = trimmed.split(".")[0]
		const normalizedRoot = directRoot.replace(/[:]/g, "-")

		const add = (value: string) => {
			const safe = value.trim()
			if (safe && this.isIdentifierLike(safe)) {
				candidates.add(safe)
			}
		}

		add(trimmed)
		add(directRoot)
		add(this.uppercaseFirst(directRoot))

		if (normalizedRoot.includes("-")) {
			const parts = normalizedRoot
				.split("-")
				.map((part) => part.trim())
				.filter(Boolean)
			if (parts.length) {
				const pascal = parts
					.map((part) => this.uppercaseFirst(part.toLowerCase()))
					.join("")
				const camel = pascal ? pascal[0].toLowerCase() + pascal.slice(1) : ""
				add(pascal)
				add(camel)
			}
		}

		return [...candidates]
	}

	private normalizeComponentLookupKey(value: string): string {
		return value
			.trim()
			.replace(/[<>]/g, "")
			.split(".")[0]
			.replace(/[^A-Za-z0-9_$]/g, "")
			.toLowerCase()
	}

	private uppercaseFirst(value: string): string {
		if (!value) return value
		return value[0].toUpperCase() + value.slice(1)
	}
	private normalizeText(value?: string): string {
		if (!value) return ""
		return value.replace(/\s+/g, " ").trim()
	}
}
