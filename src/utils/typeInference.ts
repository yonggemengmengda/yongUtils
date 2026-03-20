import { parse, parseExpression } from "@babel/parser"
import * as t from "@babel/types"
import { toTypeName } from "./namingUtils"

const PARSER_PLUGINS: Parameters<typeof parse>[1]["plugins"] = [
	"typescript",
	"jsx",
	"decorators-legacy",
]

type ParsedSelection = {
	name?: string
	node: t.Expression
}

export function generateTsTypeFromSource(sourceText: string): {
	rootName: string
	typeText: string
} {
	const parsed = parseSelectedSource(sourceText)
	const rootName = toTypeName(parsed.name || "GeneratedType")
	const body = inferExpressionType(parsed.node, 0)

	if (t.isObjectExpression(unwrapExpression(parsed.node))) {
		return {
			rootName,
			typeText: `interface ${rootName} ${body}`,
		}
	}

	return {
		rootName,
		typeText: `type ${rootName} = ${body}`,
	}
}

function parseSelectedSource(sourceText: string): ParsedSelection {
	const rawText = String(sourceText || "").trim()
	if (!rawText) {
		throw new Error("请先选中要转换的对象、数组或变量初始化表达式")
	}

	const expression = tryParseExpression(rawText)
	if (expression) {
		return {
			node: expression,
		}
	}

	const program = parse(rawText, {
		sourceType: "module",
		plugins: PARSER_PLUGINS,
	})

	for (const statement of program.program.body) {
		const parsed = extractNodeFromStatement(statement)
		if (parsed) {
			return parsed
		}
	}

	throw new Error("暂不支持当前选中内容，请选择对象、数组或变量初始化表达式")
}

function tryParseExpression(sourceText: string): t.Expression | null {
	const attempts = [sourceText, sourceText.replace(/;+\s*$/, "")]
	for (const text of attempts) {
		if (!text) continue
		try {
			return unwrapExpression(parseExpression(text, { plugins: PARSER_PLUGINS }))
		} catch {
			// ignore
		}
	}
	return null
}

function extractNodeFromStatement(statement: t.Statement): ParsedSelection | null {
	if (t.isVariableDeclaration(statement)) {
		for (const declaration of statement.declarations) {
			if (!declaration.init) continue
			if (t.isIdentifier(declaration.id) && t.isExpression(declaration.init)) {
				return {
					name: declaration.id.name,
					node: unwrapExpression(declaration.init),
				}
			}
		}
	}

	if (t.isExpressionStatement(statement)) {
		return {
			node: unwrapExpression(statement.expression),
		}
	}

	if (t.isReturnStatement(statement) && statement.argument) {
		return {
			node: unwrapExpression(statement.argument),
		}
	}

	if (
		t.isExportDefaultDeclaration(statement) &&
		t.isExpression(statement.declaration)
	) {
		return {
			name: "DefaultExport",
			node: unwrapExpression(statement.declaration),
		}
	}

	return null
}

function unwrapExpression(node: t.Expression): t.Expression {
	if (t.isTSAsExpression(node) || t.isTSTypeAssertion(node)) {
		return unwrapExpression(node.expression)
	}
	if (t.isParenthesizedExpression(node)) {
		return unwrapExpression(node.expression)
	}
	return node
}

function inferExpressionType(node: t.Expression, depth: number): string {
	const target = unwrapExpression(node)

	if (t.isStringLiteral(target) || t.isTemplateLiteral(target)) {
		return "string"
	}
	if (t.isNumericLiteral(target)) {
		return "number"
	}
	if (t.isBooleanLiteral(target)) {
		return "boolean"
	}
	if (t.isNullLiteral(target)) {
		return "null"
	}
	if (t.isBigIntLiteral(target)) {
		return "bigint"
	}
	if (t.isRegExpLiteral(target)) {
		return "RegExp"
	}
	if (t.isObjectExpression(target)) {
		return inferObjectType(target, depth)
	}
	if (t.isArrayExpression(target)) {
		return inferArrayType(target, depth)
	}
	if (t.isArrowFunctionExpression(target) || t.isFunctionExpression(target)) {
		return "(...args: any[]) => any"
	}
	if (t.isIdentifier(target)) {
		return inferIdentifierType(target)
	}
	if (t.isUnaryExpression(target)) {
		return inferUnaryType(target)
	}
	if (t.isConditionalExpression(target)) {
		return buildUnionType([
			inferExpressionType(target.consequent, depth),
			inferExpressionType(target.alternate, depth),
		])
	}
	if (t.isLogicalExpression(target)) {
		return buildUnionType([
			inferExpressionType(target.left, depth),
			inferExpressionType(target.right, depth),
		])
	}
	if (t.isBinaryExpression(target)) {
		return inferBinaryType(target)
	}
	if (t.isNewExpression(target)) {
		return inferNewExpressionType(target)
	}
	if (t.isCallExpression(target)) {
		return "unknown"
	}

	return "unknown"
}

function inferObjectType(node: t.ObjectExpression, depth: number): string {
	const lines: string[] = []
	let needsIndexSignature = false

	for (const property of node.properties) {
		if (t.isSpreadElement(property)) {
			needsIndexSignature = true
			continue
		}

		if (t.isObjectMethod(property)) {
			const key = getPropertyKey(property.key, property.computed)
			if (!key) {
				needsIndexSignature = true
				continue
			}
			lines.push(
				`${indent(depth + 1)}${formatPropertyKey(key)}: (...args: any[]) => any;`
			)
			continue
		}

		if (!t.isObjectProperty(property) || !t.isExpression(property.value)) {
			needsIndexSignature = true
			continue
		}

		const key = getPropertyKey(property.key, property.computed)
		if (!key) {
			needsIndexSignature = true
			continue
		}

		lines.push(
			`${indent(depth + 1)}${formatPropertyKey(key)}: ${inferExpressionType(property.value, depth + 1)};`
		)
	}

	if (needsIndexSignature) {
		lines.push(`${indent(depth + 1)}[key: string]: unknown;`)
	}

	if (!lines.length) {
		return "{}"
	}

	return `{\n${lines.join("\n")}\n${indent(depth)}}`
}

function inferArrayType(node: t.ArrayExpression, depth: number): string {
	const elementTypes = node.elements
		.filter((item): item is t.Expression => Boolean(item) && t.isExpression(item))
		.map((item) => inferExpressionType(item, depth + 1))

	if (!elementTypes.length) {
		return "unknown[]"
	}

	const union = buildUnionType(elementTypes)
	return needsGenericArraySyntax(union) ? `Array<${union}>` : `${union}[]`
}

function inferIdentifierType(node: t.Identifier): string {
	if (node.name === "undefined") {
		return "undefined"
	}
	if (node.name === "Infinity" || node.name === "NaN") {
		return "number"
	}
	return "unknown"
}

function inferUnaryType(node: t.UnaryExpression): string {
	if (node.operator === "void") {
		return "undefined"
	}
	if (node.operator === "!") {
		return "boolean"
	}
	if (node.operator === "typeof") {
		return "string"
	}
	if (["+", "-", "~"].includes(node.operator)) {
		return "number"
	}
	return "unknown"
}

function inferBinaryType(node: t.BinaryExpression): string {
	const booleanOperators = new Set([
		"==",
		"===",
		"!=",
		"!==",
		">",
		">=",
		"<",
		"<=",
		"in",
		"instanceof",
	])
	if (booleanOperators.has(node.operator)) {
		return "boolean"
	}
	if (node.operator === "+") {
		const leftType = inferExpressionType(node.left, 0)
		const rightType = inferExpressionType(node.right, 0)
		return leftType === "string" || rightType === "string" ? "string" : "number"
	}
	if (["-", "*", "/", "%", "**", "|", "&", "^", "<<", ">>", ">>>"].includes(node.operator)) {
		return "number"
	}
	return "unknown"
}

function inferNewExpressionType(node: t.NewExpression): string {
	if (t.isIdentifier(node.callee)) {
		if (node.callee.name === "Date") {
			return "Date"
		}
		if (node.callee.name === "RegExp") {
			return "RegExp"
		}
		if (node.callee.name === "Map") {
			return "Map<unknown, unknown>"
		}
		if (node.callee.name === "Set") {
			return "Set<unknown>"
		}
	}
	return "unknown"
}

function buildUnionType(values: string[]): string {
	const unique = Array.from(
		new Set(values.map((item) => item.trim()).filter(Boolean))
	)
	if (!unique.length) {
		return "unknown"
	}
	if (unique.length === 1) {
		return unique[0]
	}
	return unique.join(" | ")
}

function needsGenericArraySyntax(typeText: string): boolean {
	return /[\s|{};]/.test(typeText)
}

function getPropertyKey(
	key: t.Expression | t.PrivateName,
	computed: boolean
): string | null {
	if (computed) {
		return null
	}
	if (t.isIdentifier(key)) {
		return key.name
	}
	if (t.isStringLiteral(key) || t.isNumericLiteral(key)) {
		return String(key.value)
	}
	return null
}

function formatPropertyKey(key: string): string {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
}

function indent(depth: number): string {
	return "  ".repeat(depth)
}
