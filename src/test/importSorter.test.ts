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

	test("does not duplicate generated group comments on repeated sorts", async () => {
		const source = `import localThing from "./localThing"
import react from "react"
import fs from "node:fs"
`

		const firstPass = await sortImports(source, createTestOptions({
			addGroupComments: true,
			removeUnusedImports: false,
		}))
		const secondPass = await sortImports(firstPass, createTestOptions({
			addGroupComments: true,
			removeUnusedImports: false,
		}))

		assert.strictEqual(secondPass, firstPass)
		assert.strictEqual((secondPass.match(/\/\/ /g) || []).length, 3)
	})

	test("does not stack group comment above first import", async () => {
		const source = `// Node.js 内置模块
import fs from "node:fs"
import react from "react"
`

		const firstPass = await sortImports(source, createTestOptions({
			addGroupComments: true,
			removeUnusedImports: false,
		}))
		const secondPass = await sortImports(firstPass, createTestOptions({
			addGroupComments: true,
			removeUnusedImports: false,
		}))

		assert.strictEqual(secondPass, firstPass)
		assert.strictEqual((secondPass.match(/\/\/ Node\.js 内置模块/g) || []).length, 1)
	})
})

function createTestOptions(
	overrides: Partial<ImportSortOptions> = {}
): ImportSortOptions {
	const baseOptions: ImportSortOptions = {
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

	return {
		...baseOptions,
		...overrides,
		groupNames: overrides.groupNames || baseOptions.groupNames,
		internalLibPrefixes:
			overrides.internalLibPrefixes || baseOptions.internalLibPrefixes,
	}
}

async function sortImports(
	source: string,
	options: ImportSortOptions
): Promise<string> {
	const document = await vscode.workspace.openTextDocument({
		language: "typescript",
		content: source,
	})
	const edits = await computeSortImportEdits(document, options)
	return applyTextEdits(document, edits)
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
