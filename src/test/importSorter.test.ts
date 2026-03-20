import * as assert from "assert"
import * as vscode from "vscode"
import {
	computeSortImportEdits,
	ImportGroup,
	type ImportSortOptions,
} from "../utils/importSorter"

suite("Import Sorter", () => {
	test("keeps multiline type-only usages when removing unused imports", async () => {
		const source = `import {
	createTranslationCacheStore,
	TranslationCacheStore,
	UnusedThing,
} from "./utils/translationCache"

let translationCacheRef: TranslationCacheStore | null = null
const translationCache = createTranslationCacheStore(context)
`

		const document = await vscode.workspace.openTextDocument({
			language: "typescript",
			content: source,
		})
		const edits = await computeSortImportEdits(document, createTestOptions())
		const output = applyTextEdits(document, edits)

		assert.match(
			output,
			/import \{\n\tcreateTranslationCacheStore,\n\tTranslationCacheStore,\n\} from "\.\/utils\/translationCache"/
		)
		assert.doesNotMatch(output, /\bUnusedThing\b/)
	})
})

function createTestOptions(): ImportSortOptions {
	return {
		addGroupComments: false,
		sortByLength: false,
		sortOnSave: false,
		removeUnusedImports: true,
		placeSideEffectImportsFirst: true,
		groupNames: {
			[ImportGroup.SIDE_EFFECT]: "",
			[ImportGroup.BUILTIN]: "",
			[ImportGroup.EXTERNAL]: "",
			[ImportGroup.INTERNAL_ALIAS]: "",
			[ImportGroup.PARENT]: "",
			[ImportGroup.SIBLING]: "",
			[ImportGroup.INDEX]: "",
		},
		internalLibPrefixes: ["@/"],
	}
}

function applyTextEdits(
	document: vscode.TextDocument,
	edits: readonly vscode.TextEdit[]
): string {
	if (!edits.length) {
		return document.getText()
	}

	const sortedEdits = [...edits].sort(
		(left, right) => document.offsetAt(right.range.start) - document.offsetAt(left.range.start)
	)

	let output = document.getText()
	for (const edit of sortedEdits) {
		const start = document.offsetAt(edit.range.start)
		const end = document.offsetAt(edit.range.end)
		output = `${output.slice(0, start)}${edit.newText}${output.slice(end)}`
	}

	return output
}
