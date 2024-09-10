export type AstFilterMode = "html" | "script" | "style"

export type WebLocation = {
	uri?: {
		scheme: string
		path: string
		fsPath: string
	}
	range: Array<{ line: number; character: number }>
}

export type WebAstNode = {
	label: string
	name?: string
	kind?: WebAstKind
	value?: string
	attrs?: Array<{ name: string; value?: string; location?: WebLocation }>
	symbols?: string[]
	location?: WebLocation
	children: WebAstNode[]
}

export type WebAstKind = "tag" | "text" | "comment" | "node"

export type AstDocumentPayload = {
	ast: WebAstNode[]
	viewKind: "vue" | "script" | "html"
	summary?: AstSummary
}

export type AstSummary = {
	title: string
	subtitle?: string
	cards: AstSummaryCard[]
	sections: AstSummarySection[]
}

export type AstSummaryCard = {
	label: string
	value: string
	description?: string
	tone?: "default" | "success" | "warning"
}

export type AstSummarySection = {
	id: string
	title: string
	description?: string
	items: AstSummaryItem[]
	emptyText?: string
}

export type AstSummaryItem = {
	label: string
	description?: string
	kind?: string
	badge?: string
	status?: "linked" | "warning"
	location?: WebLocation
}

export type ScriptDefinition = {
	name: string
	label: string
	category: "import" | "function" | "state" | "type" | "class"
	location?: WebLocation
}

export type ScriptSummaryData = {
	imports: AstSummaryItem[]
	functions: AstSummaryItem[]
	state: AstSummaryItem[]
	types: AstSummaryItem[]
	classes: AstSummaryItem[]
	definitions: Map<string, ScriptDefinition>
	totalEntries: number
}

export type ScriptCollectContext = {
	exported: boolean
	insideFunction: boolean
	ownerLabel: string
}

export type TemplateUsage = {
	name: string
	count: number
	primarySource: string
	sources: string[]
	location?: WebLocation
}

export type TemplateSummaryData = {
	linked: AstSummaryItem[]
	missing: AstSummaryItem[]
}
