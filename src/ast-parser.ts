import * as parse5 from "parse5"
import { parse as parseSFC } from "@vue/compiler-sfc"
import { parse as parseVueTemplate, NodeTypes, ElementTypes } from "@vue/compiler-dom"
import { parse as babelParse } from "@babel/parser"
import traverse from "@babel/traverse"
import * as vscode from "vscode"
import postcss from "postcss"

type Parse5Node = {
	childNodes?: Parse5Node[]
	[key: string]: any
}

interface AstNode {
	label: string
	type: string
	kind?: string
	location: vscode.Location
	children?: AstNode[]
}
interface VueFile {
	template?: HtmlAstNode[]
	script?: AstNode[]
	styles?: AstNode[]
	customBlocks?: AstNode[]
	templateComponents?: VueTemplateComponent[]
	scriptImportNames?: string[]
	templateLocation?: vscode.Location
	scriptLocation?: vscode.Location
	styleLocations?: vscode.Location[]
}
interface HtmlAstNode {
	label: string
	value: string | null
	attrs?: Array<{ name: string; value: string; location?: vscode.Location }>
	location: vscode.Location
	children?: HtmlAstNode[]
}
interface VueTemplateComponent {
	tag: string
	location: vscode.Location
}
type PositionLike = { line: number; column: number }
type PositionOffset = { line: number; column: number }

function normalizeOffset(offset?: PositionOffset): PositionOffset | undefined {
	if (!offset) return undefined
	return {
		line: Math.max(offset.line, 1),
		column: Math.max(offset.column, 1),
	}
}

function applyOffset(position: PositionLike, offset?: PositionOffset): PositionLike {
	if (!offset) return position
	const line = position.line + offset.line - 1
	const column =
		position.line === 1
			? position.column + offset.column - 1
			: position.column
	return { line, column }
}

function traverseHtml(
	node: Parse5Node,
	offset?: PositionOffset
): HtmlAstNode[] {
	if (!node || !Array.isArray(node.childNodes)) return []
	return [].slice
		.apply(node.childNodes)
		.map((child: Parse5Node) => {
			const locInfo = (child as any).sourceCodeLocation
			if (!locInfo) return null
			const rawAttrs = (child as any).attrs
			const rawAttrLocations = (locInfo as any)?.attrs
			const attrs = Array.isArray(rawAttrs)
				? rawAttrs
						.filter((attr: any) => attr && attr.name)
						.map((attr: any) => {
							const attrLocationInfo =
								rawAttrLocations && attr.name
									? rawAttrLocations[attr.name]
									: undefined
							const location =
								attrLocationInfo?.startLine && attrLocationInfo?.endLine
									? createLocation(
											{
												line: attrLocationInfo.startLine,
												column: attrLocationInfo.startCol,
											},
											{
												line: attrLocationInfo.endLine,
												column: attrLocationInfo.endCol,
											},
											offset
									  )
									: undefined
							return {
								name: String(attr.name),
								value: attr.value ? String(attr.value) : "",
								location,
							}
						})
				: undefined
			const location = createLocation(
				{ line: locInfo.startLine, column: locInfo.startCol },
				{ line: locInfo.endLine, column: locInfo.endCol },
				offset
			)
			const rawNodeValue =
				typeof (child as any).nodeValue === "string"
					? (child as any).nodeValue
					: typeof (child as any).value === "string"
					? (child as any).value
					: typeof (child as any).data === "string"
					? (child as any).data
					: null

			return {
				label: child.nodeName,
				location: location,
				value: rawNodeValue,
				attrs,
				children: traverseHtml(child, offset),
			}
		})
		.filter((node) => Boolean(node && node.label)) as HtmlAstNode[]
}

function collectVueTemplateComponents(
	content: string,
	offset?: PositionOffset
): VueTemplateComponent[] {
	const root = parseVueTemplate(content)
	const components: VueTemplateComponent[] = []

	const visit = (node: any) => {
		if (!node || typeof node !== "object") return

		if (node.type === NodeTypes.ELEMENT && node.tagType === ElementTypes.COMPONENT) {
			const loc = node.loc
			if (loc?.start && loc?.end && node.tag) {
				components.push({
					tag: String(node.tag),
					location: createLocation(loc.start, loc.end, offset),
				})
			}
		}

		if (Array.isArray(node.children)) {
			for (const child of node.children) {
				visit(child)
			}
		}

		if (Array.isArray(node.branches)) {
			for (const branch of node.branches) {
				visit(branch)
			}
		}
	}

	visit(root)
	return components
}

function extractImportNamesFromSpecifier(specifier: string): string[] {
	const normalized = specifier.replace(/\s+/g, " ").trim()
	if (!normalized) return []
	const names: string[] = []
	const add = (value: string) => {
		const candidate = value.trim()
		if (!candidate) return
		if (!/^[$A-Z_a-z][\w$]*$/.test(candidate)) return
		if (!names.includes(candidate)) names.push(candidate)
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
			const base = part.replace(/^type\s+/, "").trim()
			add(base)
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

	return names
}

function collectScriptImportNames(content: string): string[] {
	const imports = new Set<string>()
	const importRegex = /import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g
	let match: RegExpExecArray | null = null
	while ((match = importRegex.exec(content)) !== null) {
		const specifier = match[1] || ""
		for (const name of extractImportNamesFromSpecifier(specifier)) {
			imports.add(name)
		}
	}
	return Array.from(imports)
}

function traverseJs(astNode: any, offset?: PositionOffset): any {
	const loc = formatBabelLoc(astNode.loc)!
	const rootNode = {
		type: astNode.type,
		kind: astNode.kind,
		location: createLocation(loc.start, loc.end, offset),
		label: getBabelNodeName(astNode),
		children: [],
	}

	// 使用栈结构维护父子关系
	const stack: any[] = [{ node: rootNode, depth: 0 }]

	traverse(astNode, {
		enter(path) {
			if (path.node === astNode) return

			const parent = stack[stack.length - 1]
			const loc = formatBabelLoc(path.node.loc)!
			const newNode = {
				type: path.node.type,
				kind: (path.node as any).kind,
				location: createLocation(loc.start, loc.end, offset),
				label: getBabelNodeName(path.node),
				children: [],
			}

			parent.node.children.push(newNode)
			stack.push({ node: newNode, depth: parent.depth + 1 })
		},
		exit(path) {
			if (path.node !== astNode) {
				stack.pop()
			}
		},
	})

	return rootNode
}
function traverseStyle(
	content: string,
	type: string,
	offset?: PositionOffset
): AstNode[] {
	try {
		const root = postcss.parse(content, { map: { inline: false } })
		return root.nodes.map((rule) => {
			// 添加类型保护
			const hasNodes = ["rule", "atrule"].includes(rule.type)
			const location = createLocation(
				rule.source!.start!,
				rule.source!.end!,
				offset
			)

			return {
				label:
					rule.type === "rule"
						? (rule as postcss.Rule).selector
						: rule.type === "atrule"
						? (rule as postcss.AtRule).name
						: rule.type,
				type: type,
				location: location,
				children: hasNodes
					? (rule as postcss.Container).nodes?.map((decl) => ({
							label:
								"prop" in decl
									? `${decl.prop}: ${decl.value || ""}`.trim()
									: decl.type,
							type: "CSS Property",
							location: createLocation(
								decl.source!.start!,
								decl.source!.end!,
								offset
							),
					  })) || []
					: [],
			}
		})
	} catch (e) {
		return [createFallbackNode(content, type, offset)]
	}
}

function createLocation(
	start: { line: number; column: number },
	end: { line: number; column: number },
	offset?: PositionOffset
) {
	const normalizedOffset = normalizeOffset(offset)
	const adjustedStart = applyOffset(start, normalizedOffset)
	const adjustedEnd = applyOffset(end, normalizedOffset)
	const safeStart = {
		line: Math.max(adjustedStart.line - 1, 0),
		column: Math.max(adjustedStart.column - 1, 0),
	}
	const safeEnd = {
		line: Math.max(adjustedEnd.line - 1, 0),
		column: Math.max(adjustedEnd.column - 1, 0),
	}

	return new vscode.Location(
		vscode.window.activeTextEditor!.document.uri,
		new vscode.Range(
			safeStart.line,
			safeStart.column,
			safeEnd.line,
			safeEnd.column
		)
	)
}
function createFallbackNode(
	content: string,
	type: string,
	offset?: PositionOffset
) {
	const lineCount = content.split("\n").length
	return {
		label: "Unparsable Style",
		type: type,
		location: createLocation(
			{ line: 1, column: 1 },
			{ line: lineCount, column: 1 },
			offset
		),
	}
}
export function parseVueFile(content: string): VueFile {
	if (!vscode.window.activeTextEditor?.document) return {}
	const vueFile: VueFile = {}
	const { descriptor } = parseSFC(content, {
		sourceMap: true,
		templateParseOptions: {},
	})
	if (descriptor.template) {
		vueFile.templateLocation = createLocation(
			descriptor.template.loc.start,
			descriptor.template.loc.end
		)
		vueFile.templateComponents = collectVueTemplateComponents(
			descriptor.template.content,
			descriptor.template.loc.start
		)
		const root = parse5.parseFragment(descriptor.template.content, {
			sourceCodeLocationInfo: true,
		}) as unknown as Parse5Node
		vueFile.template = traverseHtml(
			root,
			descriptor.template.loc.start
		)
	}
	const scriptBlocks = [descriptor.script, descriptor.scriptSetup].filter(
		Boolean
	) as Array<{ content: string; loc: { start: PositionLike; end: PositionLike } }>
	if (scriptBlocks.length > 0) {
		vueFile.scriptLocation = createLocation(
			scriptBlocks[0].loc.start,
			scriptBlocks[scriptBlocks.length - 1].loc.end
		)
		const importNames = new Set<string>()
		const scriptAstNodes: any[] = []
		for (const block of scriptBlocks) {
			for (const name of collectScriptImportNames(block.content)) {
				importNames.add(name)
			}
			try {
				const ast = babelParse(block.content, {
					sourceType: "module",
					plugins: ["jsx", "typescript"],
				})
				scriptAstNodes.push(traverseJs(ast, block.loc.start))
			} catch (error) {
				console.warn("error", error)
			}
		}
		if (scriptAstNodes.length === 1) {
			vueFile.script = scriptAstNodes[0]
		} else if (scriptAstNodes.length > 1) {
			vueFile.script = scriptAstNodes
		}
		if (importNames.size) {
			vueFile.scriptImportNames = Array.from(importNames)
		}
	}
	if (descriptor.styles.length > 0) {
		vueFile.styleLocations = descriptor.styles.map((style) =>
			createLocation(style.loc.start, style.loc.end)
		)
		vueFile.styles = descriptor.styles.map((style) => {
			const startPos = style.loc.start
			const endPos = style.loc.end
			return {
				label: `Style (lang=${style.lang || "css"})`,
				type: "vue-style",
				location: createLocation(startPos, endPos),
				children: traverseStyle(style.content, "css-rule", style.loc.start),
			}
		})
	}
	// if (customBlocks.length > 0) {
	// 	vueFile.customBlocks = customBlocks.map((block) => {
	// 		return traverseCustomBlock(block, document)
	// 	})
	// }
	return vueFile
}

export function parseHtmlFile(content: string): HtmlAstNode[] {
	const root = parse5.parseFragment(content, {
		sourceCodeLocationInfo: true,
	}) as unknown as Parse5Node
	return traverseHtml(root)
}
export function parseTsFile(content: string): AstNode[] {
	try {
		const ast = babelParse(content, {
			sourceType: "module",
			plugins: ["jsx", "typescript"],
		})
		return traverseJs(ast)
	} catch (e) {
		console.warn("error", e)
		return []
	}
}

// 格式化位置信息
const formatBabelLoc = (loc: any) => {
	if (!loc) return null
	return {
		start: { line: loc.start.line, column: loc.start.column + 1 },
		end: { line: loc.end.line, column: loc.end.column + 1 },
	}
}

const formatParamName = (param: any): string => {
	if (!param) return ""
	if (param.type === "Identifier") return param.name || ""
	if (param.type === "RestElement") {
		const arg = formatParamName(param.argument)
		return arg ? `...${arg}` : "..."
	}
	if (param.type === "AssignmentPattern") {
		const left = formatParamName(param.left)
		return left ? `${left}=?` : "=?"
	}
	if (param.type === "ObjectPattern") return "{...}"
	if (param.type === "ArrayPattern") return "[...]"
	if (param.type === "TSParameterProperty") {
		return formatParamName(param.parameter)
	}
	return ""
}

const formatPropertyKey = (key: any, computed?: boolean): string => {
	if (!key) return ""
	let keyText = ""
	if (key.type === "Identifier") keyText = key.name || ""
	else if (key.type === "StringLiteral") keyText = String(key.value)
	else if (key.type === "NumericLiteral") keyText = String(key.value)
	else if (key.type === "PrivateName") {
		const privateName = key.id?.name || ""
		keyText = privateName ? `#${privateName}` : ""
	} else if (key.type === "TemplateLiteral") {
		keyText = "..."
	} else {
		keyText = key.name || key.value || ""
	}
	if (computed) return keyText ? `[${keyText}]` : "[...]"
	return keyText
}

const formatAssignmentTarget = (target: any): string => {
	if (!target) return ""
	if (target.type === "Identifier") return target.name || ""
	if (
		target.type === "MemberExpression" ||
		target.type === "OptionalMemberExpression"
	) {
		return formatCalleeName(target)
	}
	if (target.type === "ObjectPattern") {
		const properties = Array.isArray(target.properties) ? target.properties : []
		if (!properties.length) return "{}"
		const shown: string[] = []
		const maxProperties = 6
		for (const property of properties) {
			if (shown.length >= maxProperties) break
			if (!property) continue
			if (property.type === "RestElement") {
				const argument = formatAssignmentTarget(property.argument)
				shown.push(argument ? `...${argument.replace(/^\.\.\./, "")}` : "...")
				continue
			}
			if (property.type === "ObjectProperty" || property.type === "Property") {
				const keyText = formatPropertyKey(property.key, property.computed)
				const valueText = formatAssignmentTarget(property.value)
				if (property.shorthand && keyText) {
					shown.push(keyText)
					continue
				}
				if (keyText && valueText) {
					shown.push(keyText === valueText ? keyText : `${keyText}: ${valueText}`)
					continue
				}
				if (valueText || keyText) {
					shown.push(valueText || keyText)
				}
				continue
			}
			const fallback = formatAssignmentTarget(
				property.argument || property.value || property
			)
			if (fallback) shown.push(fallback)
		}
		if (!shown.length) return "{...}"
		const suffix = properties.length > shown.length ? ", ..." : ""
		return `{ ${shown.join(", ")}${suffix} }`
	}
	if (target.type === "ArrayPattern") {
		const elements = Array.isArray(target.elements) ? target.elements : []
		if (!elements.length) return "[]"
		const shown: string[] = []
		const maxElements = 6
		for (const element of elements) {
			if (shown.length >= maxElements) break
			if (!element) {
				shown.push("_")
				continue
			}
			const text = formatAssignmentTarget(element)
			shown.push(text || "_")
		}
		if (!shown.length) return "[...]"
		const suffix = elements.length > shown.length ? ", ..." : ""
		return `[ ${shown.join(", ")}${suffix} ]`
	}
	if (target.type === "AssignmentPattern") {
		return formatAssignmentTarget(target.left)
	}
	if (target.type === "RestElement") {
		const arg = formatAssignmentTarget(target.argument)
		return arg ? `...${arg}` : "..."
	}
	if (target.type === "TSParameterProperty") {
		return formatAssignmentTarget(target.parameter)
	}
	if (target.type === "StringLiteral") return String(target.value)
	if (target.type === "NumericLiteral") return String(target.value)
	return target.name || target.type || ""
}

const formatVariableDeclaration = (node: any): string | null => {
	if (!node) return null
	const declarations = Array.isArray(node.declarations) ? node.declarations : []
	if (!declarations.length) return null

	const shown: string[] = []
	const maxDeclarations = 4
	for (const declaration of declarations) {
		if (shown.length >= maxDeclarations) break
		if (!declaration) continue
		const left = formatAssignmentTarget(declaration.id)
		const right = formatValueSummary(declaration.init)
		if (left && right) {
			shown.push(`${left} = ${right}`)
			continue
		}
		if (left) {
			shown.push(left)
			continue
		}
		if (right) shown.push(right)
	}

	if (!shown.length) return null
	const suffix = declarations.length > shown.length ? ", ..." : ""
	return `${shown.join(", ")}${suffix}`
}

const formatFunctionSignature = (node: any): string | null => {
	if (!node) return null
	const rawName =
		node.id?.name ||
		(node.key ? formatPropertyKey(node.key, node.computed) : "") ||
		node.callee?.name ||
		""
	const rawParams = Array.isArray(node.params)
		? node.params
		: Array.isArray(node.parameters)
		? node.parameters
		: []
	const params = rawParams.map(formatParamName).filter(Boolean)
	const maxParams = 4
	const shown = params.slice(0, maxParams)
	const suffix = params.length > maxParams ? ", ..." : ""
	const paramText = `(${shown.join(", ")}${suffix})`
	if (rawName) return `${rawName}${paramText}`
	if (params.length) return paramText
	return null
}

const formatImportDeclaration = (node: any): string | null => {
	if (!node) return null
	const specifiers = Array.isArray(node.specifiers) ? node.specifiers : []
	let defaultName = ""
	let namespaceName = ""
	const named: string[] = []

	for (const spec of specifiers) {
		if (spec.type === "ImportDefaultSpecifier") {
			defaultName = spec.local?.name || defaultName
			continue
		}
		if (spec.type === "ImportNamespaceSpecifier") {
			namespaceName = spec.local?.name || namespaceName
			continue
		}
		if (spec.type === "ImportSpecifier") {
			const imported =
				spec.imported?.name || spec.imported?.value || spec.imported
			const local = spec.local?.name || spec.local?.value || spec.local
			if (imported && local && imported !== local) {
				named.push(`${imported} as ${local}`)
			} else if (imported) {
				named.push(String(imported))
			}
		}
	}

	const parts: string[] = []
	if (defaultName) parts.push(defaultName)
	if (namespaceName) parts.push(`* as ${namespaceName}`)
	if (named.length) {
		const maxNamed = 5
		const shown = named.slice(0, maxNamed)
		const suffix = named.length > maxNamed ? ", ..." : ""
		parts.push(`{ ${shown.join(", ")}${suffix} }`)
	}

	const spec = parts.join(", ")
	const source =
		node.source?.value != null ? String(node.source.value) : ""

	if (spec && source) return `${spec} from "${source}"`
	if (spec) return spec
	if (source) return `"${source}"`
	return null
}

const formatCalleeName = (callee: any): string => {
	if (!callee) return ""
	if (callee.type === "Identifier") return callee.name || ""
	if (callee.type === "ThisExpression") return "this"
	if (callee.type === "Super") return "super"
	if (callee.type === "MemberExpression") {
		const object = formatCalleeName(callee.object)
		if (callee.computed) {
			return object ? `${object}[...]` : "[...]"
		}
		const property = formatCalleeName(callee.property)
		if (object && property) return `${object}.${property}`
		return object || property || ""
	}
	if (callee.type === "OptionalMemberExpression") {
		const object = formatCalleeName(callee.object)
		if (callee.computed) {
			return object ? `${object}?.[...]` : "?.[...]"
		}
		const property = formatCalleeName(callee.property)
		if (object && property) return `${object}?.${property}`
		return object || property || ""
	}
	return ""
}

const normalizeInline = (value: string): string => {
	return value.replace(/\s+/g, " ").trim()
}

const truncateText = (value: string, maxLength = 40): string => {
	const normalized = normalizeInline(value)
	if (normalized.length <= maxLength) return normalized
	const sliceLength = Math.max(maxLength - 3, 1)
	return `${normalized.slice(0, sliceLength)}...`
}

const formatValueSummary = (value: any): string => {
	if (!value) return ""
	switch (value.type) {
		case "Identifier":
			return value.name || ""
		case "StringLiteral":
			return `"${truncateText(String(value.value), 36)}"`
		case "NumericLiteral":
			return String(value.value)
		case "BooleanLiteral":
			return value.value ? "true" : "false"
		case "NullLiteral":
			return "null"
		case "BigIntLiteral":
			return value.value != null ? `${value.value}n` : "0n"
		case "TemplateLiteral":
			return "`...`"
		case "ObjectPattern":
			return "{...}"
		case "ArrayPattern":
			return "[...]"
		case "ObjectExpression":
			return "{...}"
		case "ArrayExpression":
			return "[...]"
		case "AssignmentPattern": {
			const left = formatAssignmentTarget(value.left)
			const right = formatValueSummary(value.right)
			if (left && right) return `${left} = ${right}`
			return left || right || "=?"
		}
		case "FunctionExpression":
		case "ArrowFunctionExpression": {
			const signature = formatFunctionSignature(value)
			if (!signature) return "fn"
			return signature.startsWith("(")
				? `fn${signature}`
				: `fn ${signature}`
		}
		case "CallExpression": {
			const callee = formatCalleeName(value.callee)
			return callee ? `${callee}()` : "call()"
		}
		case "MemberExpression":
		case "OptionalMemberExpression":
			return formatCalleeName(value)
		case "UnaryExpression": {
			const arg = formatValueSummary(value.argument)
			return arg ? `${value.operator}${arg}` : value.operator
		}
		case "BinaryExpression":
		case "LogicalExpression": {
			const left = formatValueSummary(value.left)
			const right = formatValueSummary(value.right)
			if (left && right) {
				return `${left} ${value.operator} ${right}`
			}
			return value.operator
		}
		default:
			return value.type || ""
	}
}

const formatPropertyLabel = (
	node: any,
	separator: ":" | "=" = ":"
): string | null => {
	if (!node) return null
	const keyText = formatPropertyKey(node.key, node.computed)
	if (!keyText) return null
	const valueText = formatValueSummary(node.value)
	if (!valueText) return keyText
	return `${keyText}${separator} ${valueText}`
}

// 获取 Babel 节点名称
const getBabelNodeName = (node: any) => {
	switch (node.type) {
		case "ImportDeclaration":
			return formatImportDeclaration(node)
		case "FunctionDeclaration":
		case "TSDeclareFunction":
			return formatFunctionSignature(node)
		case "FunctionExpression":
		case "ArrowFunctionExpression":
			return formatFunctionSignature(node)
		case "VariableDeclarator":
			{
				const left = formatAssignmentTarget(node.id)
				const right = formatValueSummary(node.init)
				if (left && right) return `${left} = ${right}`
				return left || node.id?.name
			}
		case "VariableDeclaration":
			return formatVariableDeclaration(node)
		case "Identifier":
			return node.name
		case "ObjectProperty":
			return formatPropertyLabel(node, ":")
		case "StringLiteral":
			return node.value
		case "CallExpression":
			return formatCalleeName(node.callee) || node.callee?.name
		case "AssignmentExpression": {
			const left = formatAssignmentTarget(node.left)
			const right = formatValueSummary(node.right)
			if (left && right) return `${left} ${node.operator} ${right}`
			if (left) return `${left} ${node.operator}`
			return node.operator
		}
		case "ClassDeclaration":
			return node.id?.name
		case "ClassProperty":
		case "ClassPrivateProperty":
			return formatPropertyLabel(node, "=")
		case "ObjectMethod":
		case "ClassMethod":
		case "TSMethodSignature":
			return formatFunctionSignature(node)
		case "ImportSpecifier":
		case "ImportDefaultSpecifier":
		case "ImportNamespaceSpecifier":
			return node.local?.name
		case "TSPropertySignature":
			return node.key?.name
		case "TSInterfaceDeclaration":
			return node.id?.name
		case "TSTypeAliasDeclaration":
			return node.id?.name
		case "TSEnumDeclaration":
			return node.id?.name
		case "TSModuleDeclaration":
			return node.id?.name
		case "TSTypeLiteral":
			return node.members
				.map((member: any) => getBabelNodeName(member))
				.filter(Boolean)
				.join(",")
		case "TSTypeParameterInstantiation":
			return node.params
				.map((param: any) => getBabelNodeName(param))
				.filter(Boolean)
				.join(",")
		case "TSModuleBlock":
			return node.body
				.map((body: any) => getBabelNodeName(body))
				.filter(Boolean)
				.join(",")
		default:
			return null
	}
}
