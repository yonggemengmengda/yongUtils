import { ElementTypes, NodeTypes, parse as parseVueTemplate } from "@vue/compiler-dom"
import { addNameVariants } from "./nameUtils"

export function collectVueTemplateUsedNames(content: string): Set<string> {
	const names = new Set<string>()

	try {
		const root = parseVueTemplate(content)
		visitTemplateNode(root, names)
	} catch {
		// ignore template parse errors
	}

	return names
}

function visitTemplateNode(node: any, names: Set<string>) {
	if (!node || typeof node !== "object") {
		return
	}

	if (node.type === NodeTypes.ELEMENT) {
		collectElementIdentifiers(node, names)
	}

	if (node.type === NodeTypes.INTERPOLATION) {
		collectExpressionIdentifiers(String(node.content?.content || ""), names)
	}

	for (const child of node.children || []) {
		visitTemplateNode(child, names)
	}

	for (const branch of node.branches || []) {
		visitTemplateNode(branch, names)
	}
}

function collectElementIdentifiers(node: any, names: Set<string>) {
	if (node.tagType === ElementTypes.COMPONENT && node.tag) {
		addNameVariants(names, String(node.tag))
	}

	for (const prop of node.props || []) {
		if (prop.type !== NodeTypes.DIRECTIVE) {
			continue
		}

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

function collectExpressionIdentifiers(expression: string, output: Set<string>) {
	const sanitized = String(expression || "")
		.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, " ")
		.replace(
			/\b(?:true|false|null|undefined|this|new|return|typeof|instanceof|in|of)\b/g,
			" "
		)
	const matches = sanitized.match(/[$A-Za-z_][\w$-]*/g) || []

	for (const match of matches) {
		addNameVariants(output, match)
	}
}
