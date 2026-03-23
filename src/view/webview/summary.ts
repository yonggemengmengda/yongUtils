import { builtinModules } from "module"
import { TEMPLATE_IDENTIFIER_BLACKLIST } from "./constants"
import type {
	AstSummary,
	AstSummaryItem,
	AstSummarySection,
	DependencyInsight,
	ScriptCollectContext,
	ScriptDefinition,
	ScriptSummaryData,
	TemplateSummaryData,
	TemplateUsage,
	VueCompositionInsight,
	WebAstKind,
	WebAstNode,
	WebLocation,
} from "./types"

const TEMPLATE_EXPRESSION_KEYWORDS = new Set([
	"function",
	"return",
	"typeof",
	"instanceof",
	"new",
	"in",
	"of",
	"await",
	"async",
	"let",
	"const",
	"var",
	"if",
	"else",
	"for",
	"while",
	"do",
	"switch",
	"case",
	"default",
	"try",
	"catch",
	"finally",
	"throw",
])

const BUILTIN_MODULES = new Set(
	builtinModules.flatMap((name) =>
		name.startsWith("node:") ? [name, name.slice(5)] : [name, `node:${name}`]
	)
)

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
		this.mergeVuePropDefinitions(scriptSummary.definitions, scriptNodes)
		this.mergeVueExposeExports(scriptSummary)
		const templateSummary = this.collectTemplateSummary(
			templateNodes,
			scriptSummary.definitions,
			templateComponents
		)
		const templateTagItems = this.buildTagOverviewItems(templateNodes)
		const sections: AstSummarySection[] = []
		sections.push(...this.buildDependencySections(scriptSummary.dependencies))
		if (templateTagItems.length) {
			sections.push({
				id: "template-tags",
				title: "模板标签",
				description: "快速看当前组件主要由哪些标签或子组件构成。",
				items: templateTagItems,
				emptyText: "没有可展示的标签信息。",
			})
		}
		sections.push(...this.buildTemplateLinkSections(templateSummary))
		sections.push(...this.buildVueCompositionSections(scriptSummary.vueComposition))
		sections.push(...this.buildScriptSections(scriptSummary))

		if (!sections.length) return undefined
		const compositionCount = this.countVueCompositionItems(scriptSummary.vueComposition)
		return {
			title: "Vue 结构工作台",
			subtitle: "先看模板和脚本结构，再决定是否深入原始 AST。",
			cards: [
				{
					label: "依赖模块",
					value: String(scriptSummary.dependencies.length),
					description: "当前文件 import 的模块数",
				},
				{
					label: "模板联动",
					value: String(templateSummary.linked.length),
					description: "模板引用能在脚本里找到入口",
					tone: templateSummary.linked.length ? "success" : "default",
				},
				{
					label: "模板缺口",
					value: String(templateSummary.missing.length),
					description: "模板里引用了，但摘要里没定位到定义",
					tone: templateSummary.missing.length ? "warning" : "success",
				},
				{
					label: "对外暴露",
					value: String(scriptSummary.exports.length),
					description: "export / defineExpose 的入口数量",
				},
				{
					label: "组合式 API",
					value: String(compositionCount),
					description: "props、emits、ref、computed、watch 等",
				},
			],
			sections,
		}
	}

	public buildScriptSummary(
		nodes: WebAstNode[],
		languageId: string
	): AstSummary | undefined {
		const scriptSummary = this.collectScriptSummary(nodes)
		const sections = [
			...this.buildDependencySections(scriptSummary.dependencies),
			...this.buildScriptSections(scriptSummary),
		]
		if (!sections.length) return undefined
		return {
			title: "脚本结构摘要",
			subtitle: `按 ${languageId} 文件里的结构入口分组，方便直接导航。`,
			cards: [
				{
					label: "依赖模块",
					value: String(scriptSummary.dependencies.length),
					description: "按模块聚合后的依赖入口",
				},
				{
					label: "Exports",
					value: String(scriptSummary.exports.length),
					description: "对外暴露入口",
				},
				{
					label: "Hooks",
					value: String(scriptSummary.hooks.length),
					description: "hooks / composables 入口",
				},
				{
					label: "Functions",
					value: String(scriptSummary.functions.length),
					description: "函数和方法入口",
				},
				{
					label: "Types / Class",
					value: String(
						scriptSummary.types.length + scriptSummary.classes.length
					),
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
			exports: [],
			functions: [],
			hooks: [],
			state: [],
			types: [],
			classes: [],
			definitions: new Map<string, ScriptDefinition>(),
			dependencies: [],
			vueComposition: this.createEmptyVueCompositionInsight(),
			totalEntries: 0,
		}
		for (const node of nodes) {
			this.collectScriptSummaryNode(node, data, {
				exported: false,
				insideFunction: false,
				ownerLabel: "",
			})
		}
		data.vueComposition = this.collectVueCompositionInsights(nodes)
		data.totalEntries =
			data.exports.length +
			data.imports.length +
			data.hooks.length +
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
				{
					const item = this.createSummaryItem(node, {
						kind: "import",
						badge: exportedBadge,
					})
					data.imports.push(item)
					this.recordDependencyInsight(data.dependencies, node)
				}
				this.addDefinitionSymbols(data.definitions, node, "import")
				return
			case "FunctionDeclaration":
			case "TSDeclareFunction":
				{
					const item = this.createSummaryItem(node, {
						kind: "function",
						badge: exportedBadge,
					})
					data.functions.push(item)
					this.maybeAddHookSummary(data.hooks, item, node)
					this.maybeAddExportSummary(data.exports, item, context.exported)
				}
				this.addDefinitionSymbols(data.definitions, node, "function")
				return
			case "ClassDeclaration":
				{
					const item = this.createSummaryItem(node, {
						kind: "class",
						badge: exportedBadge,
					})
					data.classes.push(item)
					this.maybeAddExportSummary(data.exports, item, context.exported)
				}
				this.addDefinitionSymbols(data.definitions, node, "class")
				this.walkScriptChildren(node, data, {
					...context,
					ownerLabel: node.symbols?.[0] || node.label,
				})
				return
			case "VariableDeclaration":
				{
					const item = this.createSummaryItem(node, {
						kind: "state",
						badge: exportedBadge,
					})
					data.state.push(item)
					this.maybeAddHookSummary(data.hooks, item, node)
					this.maybeAddExportSummary(data.exports, item, context.exported)
				}
				this.addDefinitionSymbols(data.definitions, node, "state")
				return
			case "ClassMethod":
			case "ObjectMethod":
			case "TSMethodSignature":
				if (!context.insideFunction) {
					const item = this.createSummaryItem(node, {
						kind: "function",
						badge: exportedBadge || "method",
						description: ownerDescription,
					})
					data.functions.push(item)
					this.maybeAddHookSummary(data.hooks, item, node)
					this.maybeAddExportSummary(data.exports, item, context.exported)
					this.addDefinitionSymbols(data.definitions, node, "function")
				}
				return
			case "ClassProperty":
			case "ClassPrivateProperty":
			case "TSPropertySignature":
				if (!context.insideFunction) {
					const item = this.createSummaryItem(node, {
						kind: "state",
						badge: exportedBadge || "property",
						description: ownerDescription,
					})
					data.state.push(item)
					this.maybeAddExportSummary(data.exports, item, context.exported)
					this.addDefinitionSymbols(data.definitions, node, "state")
				}
				return
			case "TSTypeAliasDeclaration":
			case "TSInterfaceDeclaration":
			case "TSEnumDeclaration":
			case "TSModuleDeclaration":
				{
					const item = this.createSummaryItem(node, {
						kind: "type",
						badge: exportedBadge,
					})
					data.types.push(item)
					this.maybeAddExportSummary(data.exports, item, context.exported)
				}
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
		if (data.exports.length) {
			sections.push({
				id: "script-exports",
				title: "Exports",
				description: "对外暴露的函数、状态、类型与类入口。",
				items: data.exports,
				emptyText: "没有 export 入口。",
			})
		}
		if (data.imports.length) {
			sections.push({
				id: "script-imports",
				title: "Imports",
				description: "依赖从哪来，一眼能看出来。",
				items: data.imports,
				emptyText: "没有 import。",
			})
		}
		if (data.hooks.length) {
			sections.push({
				id: "script-hooks",
				title: "Hooks / Composables",
				description: "useXxx 入口，适合快速定位副作用或复用逻辑。",
				items: data.hooks,
				emptyText: "没有 hooks 或 composables。",
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
				copyText: entry.name,
				actionLabel: definition ? "复制联动符号" : "复制缺口符号",
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
				copyText: tagName,
				actionLabel: "复制标签名",
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
				copyText: content,
				actionLabel: "复制文本片段",
			})
		})
		return items
	}

	private buildTemplateLinkSections(
		templateSummary: TemplateSummaryData
	): AstSummarySection[] {
		const sections: AstSummarySection[] = []
		if (templateSummary.linked.length) {
			sections.push({
				id: "template-links",
				title: "模板到脚本联动",
				description: "模板里使用的组件、变量和函数，已在脚本摘要中找到对应入口。",
				items: templateSummary.linked,
				emptyText: "还没有可确认的模板联动。",
			})
		}
		if (templateSummary.missing.length) {
			sections.push({
				id: "template-missing",
				title: "模板潜在缺口",
				description: "模板里引用了，但脚本摘要里还没定位到，适合优先排查。",
				items: templateSummary.missing,
				emptyText: "没有明显的模板缺口。",
			})
		}
		return sections
	}

	private buildDependencySections(
		dependencies: DependencyInsight[]
	): AstSummarySection[] {
		const groups: Array<{
			id: DependencyInsight["group"]
			title: string
			description: string
		}> = [
			{
				id: "builtin",
				title: "Node.js 内置依赖",
				description: "运行时自带模块，通常代表 IO、路径或系统能力。",
			},
			{
				id: "external",
				title: "第三方依赖",
				description: "npm / pnpm 装进来的依赖，适合快速判断文件外部耦合面。",
			},
			{
				id: "internal",
				title: "项目内部依赖",
				description: "本地 alias 或相对路径依赖，能帮助你顺着文件关系继续追。",
			},
		]

		return groups
			.map((group) => {
				const items = dependencies
					.filter((entry) => entry.group === group.id)
					.sort((a, b) => a.modulePath.localeCompare(b.modulePath))
					.map((entry) => ({
						label: entry.modulePath,
						kind: group.id,
						badge: entry.importedCount ? `${entry.importedCount} imports` : undefined,
						description: entry.symbols.length
							? `引入: ${entry.symbols.join(", ")}`
							: "副作用依赖或未显式命名导入",
						location: entry.location,
						copyText: entry.modulePath,
						actionLabel: "复制模块路径",
					}))

				if (!items.length) return null
				return {
					id: `dependency-${group.id}`,
					title: group.title,
					description: group.description,
					items,
					emptyText: "暂无依赖。",
				} as AstSummarySection
			})
			.filter((section): section is AstSummarySection => Boolean(section))
	}

	private buildVueCompositionSections(
		insight: VueCompositionInsight
	): AstSummarySection[] {
		const sections: AstSummarySection[] = []
		const contractItems = [
			...insight.props,
			...insight.emits,
			...insight.expose,
		]
		if (contractItems.length) {
			sections.push({
				id: "vue-contract",
				title: "组件契约",
				description: "props、emits、expose 是这个组件对外怎么沟通的入口。",
				items: contractItems,
				emptyText: "没有识别到组件契约入口。",
			})
		}

		const reactivityItems = [
			...insight.refs,
			...insight.reactive,
			...insight.computed,
		]
		if (reactivityItems.length) {
			sections.push({
				id: "vue-reactivity",
				title: "响应式状态",
				description: "ref / reactive / computed 帮你快速判断状态来源和派生关系。",
				items: reactivityItems,
				emptyText: "没有识别到响应式状态入口。",
			})
		}

		const effectItems = [...insight.watches, ...insight.lifecycle]
		if (effectItems.length) {
			sections.push({
				id: "vue-effects",
				title: "副作用与生命周期",
				description: "watch 和生命周期钩子是定位副作用最有效的入口。",
				items: effectItems,
				emptyText: "没有识别到副作用或生命周期入口。",
			})
		}

		return sections
	}

	private countVueCompositionItems(insight: VueCompositionInsight): number {
		return (
			insight.props.length +
			insight.emits.length +
			insight.expose.length +
			insight.refs.length +
			insight.computed.length +
			insight.reactive.length +
			insight.watches.length +
			insight.lifecycle.length
		)
	}

	private createEmptyVueCompositionInsight(): VueCompositionInsight {
		return {
			props: [],
			emits: [],
			expose: [],
			refs: [],
			computed: [],
			reactive: [],
			watches: [],
			lifecycle: [],
		}
	}

	private collectVueCompositionInsights(nodes: WebAstNode[]): VueCompositionInsight {
		const insight = this.createEmptyVueCompositionInsight()
		this.walkNodes(nodes, (node) => {
			const type = node.name || ""
			if (type === "VariableDeclaration") {
				for (const declaration of this.extractVariableCallEntries(node.label)) {
					const item: AstSummaryItem = {
						label: `${declaration.name} = ${declaration.callee}()`,
						kind: declaration.callee,
						location: node.location,
						copyText: declaration.name,
						actionLabel: "复制变量名",
					}
					if (this.isRefCallee(declaration.callee)) {
						insight.refs.push(item)
					} else if (this.isReactiveCallee(declaration.callee)) {
						insight.reactive.push(item)
					} else if (this.isComputedCallee(declaration.callee)) {
						insight.computed.push(item)
					}
				}
				return
			}

			if (type !== "CallExpression") {
				return
			}

			const callName = this.getCallExpressionName(node)
			if (!callName) return
			const item: AstSummaryItem = {
				label: `${callName}()`,
				kind: "call",
				location: node.location,
				copyText: callName,
				actionLabel: "复制调用名",
			}

			if (callName === "defineProps" || callName === "withDefaults") {
				insight.props.push({
					...item,
					kind: "props",
				})
				return
			}
			if (callName === "defineEmits") {
				insight.emits.push({
					...item,
					kind: "emits",
				})
				return
			}
			if (callName === "defineExpose") {
				const exposeItems = this.extractVueExposeItems(node)
				if (exposeItems.length) {
					insight.expose.push(...exposeItems)
					return
				}
				insight.expose.push({
					...item,
					kind: "expose",
					badge: "defineExpose",
					description: "defineExpose 对外暴露入口",
				})
				return
			}
			if (this.isWatchCallee(callName)) {
				insight.watches.push({
					...item,
					kind: "watch",
				})
				return
			}
			if (this.isLifecycleCallee(callName)) {
				insight.lifecycle.push({
					...item,
					kind: "lifecycle",
				})
			}
		})
		return insight
	}

	private mergeVueExposeExports(scriptSummary: ScriptSummaryData) {
		if (!scriptSummary.vueComposition.expose.length) {
			return
		}
		this.mergeSummaryItems(scriptSummary.exports, scriptSummary.vueComposition.expose)
		scriptSummary.totalEntries =
			scriptSummary.exports.length +
			scriptSummary.imports.length +
			scriptSummary.hooks.length +
			scriptSummary.functions.length +
			scriptSummary.state.length +
			scriptSummary.types.length +
			scriptSummary.classes.length
	}

	private maybeAddExportSummary(
		target: AstSummaryItem[],
		item: AstSummaryItem,
		isExported: boolean
	) {
		if (!isExported) return
		target.push({
			...item,
			badge: item.kind || item.badge || "export",
			copyText: item.copyText || item.label,
			actionLabel: item.actionLabel || "复制入口",
		})
	}

	private maybeAddHookSummary(
		target: AstSummaryItem[],
		item: AstSummaryItem,
		node: WebAstNode
	) {
		const names = Array.isArray(node.symbols) ? node.symbols : []
		const hookName = names.find((name) => /^use[A-Z0-9_]/.test(name))
		if (!hookName && !this.looksLikeUseCall(node.label)) {
			return
		}
		target.push({
			...item,
			kind: "hook",
			badge: item.badge || "use",
			copyText: hookName || item.copyText || item.label,
			actionLabel: "复制 hook 名",
		})
	}

	private extractVueExposeItems(node: WebAstNode): AstSummaryItem[] {
		const items: AstSummaryItem[] = []
		for (const child of node.children || []) {
			if (child.name !== "ObjectExpression") {
				continue
			}
			for (const entry of child.children || []) {
				if (
					entry.name !== "ObjectProperty" &&
					entry.name !== "ObjectMethod"
				) {
					continue
				}
				const exposedName =
					entry.name === "ObjectMethod"
						? this.extractFunctionLikeSymbols(entry.label)[0] || ""
						: this.extractPropertyLikeName(entry.label)
				if (!this.isIdentifierLike(exposedName)) {
					continue
				}
				const isMethod = entry.name === "ObjectMethod"
				items.push({
					label: isMethod ? `${exposedName}()` : exposedName,
					kind: "expose",
					badge: "defineExpose",
					description: "defineExpose 对外暴露成员",
					location: entry.location || node.location,
					copyText: exposedName,
					actionLabel: isMethod ? "复制暴露方法名" : "复制暴露字段名",
				})
			}
		}
		return this.deduplicateSummaryItems(items)
	}

	private recordDependencyInsight(
		dependencies: DependencyInsight[],
		node: WebAstNode
	) {
		const modulePath = this.extractImportModulePath(node.label)
		if (!modulePath) return
		const symbols = this.extractImportSymbols(node.label)
		const existing = dependencies.find((entry) => entry.modulePath === modulePath)
		if (existing) {
			const merged = new Set([...existing.symbols, ...symbols])
			existing.symbols = [...merged]
			existing.importedCount = existing.symbols.length
			return
		}
		dependencies.push({
			modulePath,
			group: this.classifyDependencyGroup(modulePath),
			importedCount: symbols.length,
			symbols,
			location: node.location,
		})
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
			copyText: overrides.copyText || node.label,
			actionLabel: overrides.actionLabel,
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

	private mergeVuePropDefinitions(
		definitions: Map<string, ScriptDefinition>,
		nodes: WebAstNode[]
	) {
		const localTypeDefinitions = this.collectLocalTypeDefinitions(nodes)
		const propDefinitions = this.collectVuePropDefinitions(
			nodes,
			localTypeDefinitions
		)
		for (const [name, definition] of propDefinitions) {
			if (definitions.has(name)) continue
			definitions.set(name, definition)
		}
	}

	private collectLocalTypeDefinitions(
		nodes: WebAstNode[]
	): Map<string, WebAstNode> {
		const definitions = new Map<string, WebAstNode>()
		this.walkNodes(nodes, (node) => {
			if (
				node.name !== "TSInterfaceDeclaration" &&
				node.name !== "TSTypeAliasDeclaration"
			) {
				return
			}
			const typeName = this.extractTypeDefinitionName(node)
			if (!typeName || definitions.has(typeName)) return
			definitions.set(typeName, node)
		})
		return definitions
	}

	private collectVuePropDefinitions(
		nodes: WebAstNode[],
		localTypeDefinitions: Map<string, WebAstNode>
	): Map<string, ScriptDefinition> {
		const definitions = new Map<string, ScriptDefinition>()
		this.walkNodes(nodes, (node) => {
			if (
				node.name === "CallExpression" &&
				this.getCallExpressionName(node) === "defineProps"
			) {
				for (const prop of this.extractVuePropsFromDefinePropsNode(
					node,
					localTypeDefinitions
				)) {
					if (!definitions.has(prop.name)) {
						definitions.set(prop.name, prop)
					}
				}
				return
			}

			if (
				node.name === "ObjectProperty" &&
				this.extractPropertyLikeName(node.label) === "props"
			) {
				for (const prop of this.extractVuePropsFromPropsOptionNode(
					node,
					localTypeDefinitions
				)) {
					if (!definitions.has(prop.name)) {
						definitions.set(prop.name, prop)
					}
				}
			}
		})
		return definitions
	}

	private extractVuePropsFromDefinePropsNode(
		node: WebAstNode,
		localTypeDefinitions: Map<string, WebAstNode>
	): ScriptDefinition[] {
		const definitions: ScriptDefinition[] = []
		for (const child of node.children || []) {
			if (child.name === "ObjectExpression") {
				definitions.push(...this.extractVuePropsFromObjectExpression(child))
				continue
			}
			if (child.name === "ArrayExpression") {
				definitions.push(...this.extractVuePropsFromArrayExpression(child))
				continue
			}
			if (
				child.name === "TSTypeParameterInstantiation" ||
				child.name === "TypeParameterInstantiation" ||
				this.isSupportedVuePropTypeNode(child.name)
			) {
				definitions.push(
					...this.extractVuePropsFromTypeNode(child, localTypeDefinitions)
				)
			}
		}
		return this.deduplicateScriptDefinitions(definitions)
	}

	private extractVuePropsFromPropsOptionNode(
		node: WebAstNode,
		localTypeDefinitions: Map<string, WebAstNode>
	): ScriptDefinition[] {
		const definitions: ScriptDefinition[] = []
		for (const child of node.children || []) {
			if (child.name === "Identifier" && child.label === "props") {
				continue
			}
			if (child.name === "ObjectExpression") {
				definitions.push(...this.extractVuePropsFromObjectExpression(child))
				continue
			}
			if (child.name === "ArrayExpression") {
				definitions.push(...this.extractVuePropsFromArrayExpression(child))
				continue
			}
			if (this.isSupportedVuePropTypeNode(child.name)) {
				definitions.push(
					...this.extractVuePropsFromTypeNode(child, localTypeDefinitions)
				)
			}
		}
		return this.deduplicateScriptDefinitions(definitions)
	}

	private extractVuePropsFromObjectExpression(
		node: WebAstNode
	): ScriptDefinition[] {
		const definitions: ScriptDefinition[] = []
		for (const child of node.children || []) {
			if (
				child.name !== "ObjectProperty" &&
				child.name !== "ObjectMethod" &&
				child.name !== "TSPropertySignature" &&
				child.name !== "TSMethodSignature"
			) {
				continue
			}
			const propName = this.extractPropertyNodeName(child)
			const definition = this.createVuePropDefinition(propName, child.location)
			if (definition) {
				definitions.push(definition)
			}
		}
		return definitions
	}

	private extractVuePropsFromArrayExpression(node: WebAstNode): ScriptDefinition[] {
		const definitions: ScriptDefinition[] = []
		for (const child of node.children || []) {
			const propName = this.extractArrayItemPropName(child)
			const definition = this.createVuePropDefinition(propName, child.location)
			if (definition) {
				definitions.push(definition)
			}
		}
		return definitions
	}

	private extractVuePropsFromTypeNode(
		node: WebAstNode,
		localTypeDefinitions: Map<string, WebAstNode>,
		visitedTypes = new Set<string>()
	): ScriptDefinition[] {
		if (!node.name) return []

		if (
			node.name === "TSTypeParameterInstantiation" ||
			node.name === "TypeParameterInstantiation" ||
			node.name === "TSTypeAnnotation" ||
			node.name === "TSParenthesizedType" ||
			node.name === "TSIntersectionType" ||
			node.name === "TSUnionType"
		) {
			return this.deduplicateScriptDefinitions(
				(node.children || []).flatMap((child) =>
					this.extractVuePropsFromTypeNode(
						child,
						localTypeDefinitions,
						visitedTypes
					)
				)
			)
		}

		if (node.name === "TSTypeLiteral" || node.name === "TSInterfaceBody") {
			return this.extractVuePropsFromObjectExpression(node)
		}

		if (
			node.name === "TSInterfaceDeclaration" ||
			node.name === "TSTypeAliasDeclaration"
		) {
			return this.deduplicateScriptDefinitions(
				(node.children || []).flatMap((child) =>
					this.extractVuePropsFromTypeNode(
						child,
						localTypeDefinitions,
						visitedTypes
					)
				)
			)
		}

		if (node.name === "TSTypeReference") {
			const typeName = this.extractTypeReferenceName(node)
			if (!typeName || visitedTypes.has(typeName)) {
				return []
			}
			const referencedNode = localTypeDefinitions.get(typeName)
			if (!referencedNode) {
				return []
			}
			const nextVisitedTypes = new Set(visitedTypes)
			nextVisitedTypes.add(typeName)
			return this.extractVuePropsFromTypeNode(
				referencedNode,
				localTypeDefinitions,
				nextVisitedTypes
			)
		}

		return []
	}

	private extractTypeReferenceName(node: WebAstNode): string {
		for (const child of node.children || []) {
			if (child.name === "Identifier") {
				return String(child.label || "").trim()
			}
		}
		return ""
	}

	private isSupportedVuePropTypeNode(type?: string): boolean {
		return !!type && [
			"TSTypeLiteral",
			"TSInterfaceBody",
			"TSTypeReference",
			"TSTypeAliasDeclaration",
			"TSInterfaceDeclaration",
			"TSTypeParameterInstantiation",
			"TypeParameterInstantiation",
			"TSTypeAnnotation",
			"TSParenthesizedType",
			"TSIntersectionType",
			"TSUnionType",
		].includes(type)
	}

	private extractArrayItemPropName(node: WebAstNode): string {
		const rawName = String(node.label || "").trim()
		return this.isIdentifierLike(rawName) ? rawName : ""
	}

	private createVuePropDefinition(
		name: string,
		location?: WebLocation
	): ScriptDefinition | undefined {
		const normalizedName = String(name || "").trim()
		if (!this.isIdentifierLike(normalizedName)) {
			return undefined
		}
		return {
			name: normalizedName,
			label: `prop ${normalizedName}`,
			category: "state",
			location,
		}
	}

	private extractNodePrimarySymbol(node: WebAstNode): string {
		const symbols = Array.isArray(node.symbols) ? node.symbols : []
		for (const rawSymbol of symbols) {
			const symbol = String(rawSymbol || "").trim()
			if (this.isIdentifierLike(symbol)) {
				return symbol
			}
		}
		return ""
	}

	private extractTypeDefinitionName(node: WebAstNode): string {
		const symbol = this.extractNodePrimarySymbol(node)
		if (symbol) return symbol
		const normalized = String(node.label || "")
			.replace(/^(?:interface|type|enum|namespace)\s+/, "")
			.trim()
		return this.isIdentifierLike(normalized) ? normalized : ""
	}

	private extractPropertyNodeName(node: WebAstNode): string {
		const symbol = this.extractNodePrimarySymbol(node)
		if (symbol) return symbol
		const normalized = this.extractPropertyLikeName(node.label)
		return this.isIdentifierLike(normalized) ? normalized : ""
	}

	private deduplicateScriptDefinitions(
		definitions: ScriptDefinition[]
	): ScriptDefinition[] {
		const unique = new Map<string, ScriptDefinition>()
		for (const definition of definitions) {
			if (!definition?.name || unique.has(definition.name)) continue
			unique.set(definition.name, definition)
		}
		return [...unique.values()]
	}

	private deduplicateSummaryItems(items: AstSummaryItem[]): AstSummaryItem[] {
		const unique = new Map<string, AstSummaryItem>()
		for (const item of items) {
			const identity = this.getSummaryItemIdentity(item)
			if (!identity || unique.has(identity)) continue
			unique.set(identity, item)
		}
		return [...unique.values()]
	}

	private mergeSummaryItems(target: AstSummaryItem[], items: AstSummaryItem[]) {
		const existing = new Set(
			target.map((item) => this.getSummaryItemIdentity(item))
		)
		for (const item of items) {
			const identity = this.getSummaryItemIdentity(item)
			if (!identity || existing.has(identity)) {
				continue
			}
			existing.add(identity)
			target.push(item)
		}
	}

	private getSummaryItemIdentity(item: AstSummaryItem): string {
		return String(item.copyText || item.label || "").trim()
	}

	private getCallExpressionName(node: WebAstNode): string {
		const label = String(node.label || "").trim()
		if (!label) return ""
		if (label.startsWith("call ")) {
			return label.slice(5).trim()
		}
		return label.replace(/\(\)$/, "").trim()
	}

	private extractImportModulePath(label: string): string {
		const source = label.trim()
		const match = source.match(/\sfrom\s+["']([^"']+)["']$/)
		if (match?.[1]) {
			return match[1]
		}
		const sideEffectMatch = source.match(/^import\s+["']([^"']+)["']$/)
		return sideEffectMatch?.[1] || ""
	}

	private classifyDependencyGroup(
		modulePath: string
	): DependencyInsight["group"] {
		if (
			modulePath.startsWith("./") ||
			modulePath.startsWith("../") ||
			modulePath.startsWith("@/") ||
			modulePath.startsWith("@@/") ||
			modulePath.startsWith("@@@/") ||
			modulePath.startsWith("~/")
		) {
			return "internal"
		}
		if (BUILTIN_MODULES.has(modulePath)) {
			return "builtin"
		}
		return "external"
	}

	private extractVariableCallEntries(
		label: string
	): Array<{ name: string; callee: string }> {
		const entries: Array<{ name: string; callee: string }> = []
		const regex = /([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\(/g
		let match: RegExpExecArray | null = null
		while ((match = regex.exec(label)) !== null) {
			const name = String(match[1] || "").trim()
			const callee = String(match[2] || "").trim()
			if (!name || !callee) continue
			entries.push({ name, callee })
		}
		return entries
	}

	private looksLikeUseCall(label: string): boolean {
		return /=\s*use[A-Z0-9_][\w$]*\(/.test(label)
	}

	private isRefCallee(callee: string): boolean {
		return new Set(["ref", "shallowRef", "toRef", "customRef"]).has(callee)
	}

	private isReactiveCallee(callee: string): boolean {
		return new Set(["reactive", "shallowReactive", "readonly"]).has(callee)
	}

	private isComputedCallee(callee: string): boolean {
		return callee === "computed"
	}

	private isWatchCallee(callee: string): boolean {
		return new Set([
			"watch",
			"watchEffect",
			"watchPostEffect",
			"watchSyncEffect",
		]).has(callee)
	}

	private isLifecycleCallee(callee: string): boolean {
		return new Set([
			"onMounted",
			"onUpdated",
			"onUnmounted",
			"onBeforeMount",
			"onBeforeUpdate",
			"onBeforeUnmount",
			"onActivated",
			"onDeactivated",
			"onErrorCaptured",
			"onServerPrefetch",
			"onRenderTracked",
			"onRenderTriggered",
		]).has(callee)
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

	private extractPropertyLikeName(label: string): string {
		const trimmed = label.trim()
		const separatorIndex = this.findTopLevelCharIndex(trimmed, [":", "="])
		const candidate =
			separatorIndex >= 0 ? trimmed.slice(0, separatorIndex).trim() : trimmed
		const normalized = candidate.replace(/^["'`](.*)["'`]$/, "$1").trim()
		return normalized
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
		const inlineParams = this.extractInlineFunctionParams(normalized)
		const results: string[] = []
		const regex = /[$A-Z_a-z][\w$]*/g
		let match: RegExpExecArray | null = null
		while ((match = regex.exec(normalized)) !== null) {
			const name = match[0]
			const start = match.index
			if (this.isInsideStringLiteral(normalized, start)) {
				continue
			}
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
			if (TEMPLATE_EXPRESSION_KEYWORDS.has(name)) continue
			if (inlineParams.has(name)) continue
			if (!results.includes(name)) results.push(name)
		}
		return results
	}

	private extractInlineFunctionParams(expression: string): Set<string> {
		const params = new Set<string>()
		const addParams = (raw: string) => {
			for (const name of this.extractPatternSymbols(raw)) {
				params.add(name)
			}
		}
		const arrowParenRegex = /\(([^)]*)\)\s*=>/g
		let match: RegExpExecArray | null = null
		while ((match = arrowParenRegex.exec(expression)) !== null) {
			if (this.isInsideStringLiteral(expression, match.index)) continue
			addParams(match[1] || "")
		}

		const arrowSingleRegex = /\b([$A-Z_a-z][\w$]*)\s*=>/g
		while ((match = arrowSingleRegex.exec(expression)) !== null) {
			if (this.isInsideStringLiteral(expression, match.index)) continue
			addParams(match[1] || "")
		}

		const functionRegex = /\bfunction\s*(?:\*?\s*)?\(([^)]*)\)/g
		while ((match = functionRegex.exec(expression)) !== null) {
			if (this.isInsideStringLiteral(expression, match.index)) continue
			addParams(match[1] || "")
		}

		return params
	}

	private isInsideStringLiteral(value: string, index: number): boolean {
		let quote: string | null = null
		let escaped = false
		for (let i = 0; i < value.length; i++) {
			const char = value[i]
			if (quote) {
				if (i === index) {
					return true
				}
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

			if (char === "'" || char === `"` || char === "`") {
				quote = char
				if (i === index) {
					return true
				}
			}
		}
		return false
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
