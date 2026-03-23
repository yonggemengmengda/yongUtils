import * as vscode from "vscode"
import { parse as parseSFC } from "@vue/compiler-sfc"
import { resolveImportSortOptions } from "./importSorter/config"
import { computeModuleImportEdits } from "./importSorter/moduleImports"
import {
	ImportGroup,
	type ImportSortOptions,
	SUPPORTED_IMPORT_LANGUAGE_IDS,
} from "./importSorter/shared"
import { collectVueTemplateUsedNames } from "./importSorter/vueTemplate"

export {
	ImportGroup,
	resolveImportSortOptions,
	SUPPORTED_IMPORT_LANGUAGE_IDS,
}
export type { ImportSortOptions }

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
		loc: { start: { offset: number } }
	}>

	const edits: vscode.TextEdit[] = []
	for (const block of scriptBlocks) {
		edits.push(
			...computeModuleImportEdits({
				document,
				content: block.content,
				baseOffset: block.loc.start.offset,
				options,
				extraUsedNames: templateUsedNames,
				disableUnusedRemoval: false,
			})
		)
	}

	return edits.sort(
		(a, b) => document.offsetAt(a.range.start) - document.offsetAt(b.range.start)
	)
}
