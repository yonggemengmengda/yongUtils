import { parse as babelParse } from "@babel/parser"
import { builtinModules } from "module"

export const SUPPORTED_IMPORT_LANGUAGE_IDS = new Set([
	"javascript",
	"javascriptreact",
	"typescript",
	"typescriptreact",
	"vue",
])

export const BUILTIN_MODULES = new Set(
	builtinModules.flatMap((name) =>
		name.startsWith("node:") ? [name, name.slice(5)] : [name, `node:${name}`]
	)
)

export const PARSER_PLUGINS: NonNullable<
	Parameters<typeof babelParse>[1]
>["plugins"] = [
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

export const IMPORT_GROUP_ORDER: ImportGroup[] = [
	ImportGroup.SIDE_EFFECT,
	ImportGroup.BUILTIN,
	ImportGroup.EXTERNAL,
	ImportGroup.INTERNAL_ALIAS,
	ImportGroup.PARENT,
	ImportGroup.SIBLING,
	ImportGroup.INDEX,
]

export const DEFAULT_GROUP_NAMES: Record<ImportGroup, string> = {
	[ImportGroup.SIDE_EFFECT]: "副作用导入",
	[ImportGroup.BUILTIN]: "Node.js 内置模块",
	[ImportGroup.EXTERNAL]: "第三方依赖",
	[ImportGroup.INTERNAL_ALIAS]: "项目别名模块",
	[ImportGroup.PARENT]: "父级目录模块",
	[ImportGroup.SIBLING]: "同级目录模块",
	[ImportGroup.INDEX]: "Index 模块",
}

export const DEFAULT_INTERNAL_LIB_PREFIXES = ["@@@/", "@@/", "@/", "~/"]

export type ImportSortOptions = {
	addGroupComments: boolean
	sortByLength: boolean
	sortOnSave: boolean
	removeUnusedImports: boolean
	placeSideEffectImportsFirst: boolean
	groupNames: Record<string, string>
	internalLibPrefixes: string[]
}

export type ImportSpecifierInfo = {
	kind: "default" | "namespace" | "named"
	localName: string
	importedName?: string
	isTypeOnly: boolean
}

export type ImportEntry = {
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

export type ImportRenderStyle = {
	quote: "'" | '"'
	semicolon: boolean
	multilineIndent: string
}
