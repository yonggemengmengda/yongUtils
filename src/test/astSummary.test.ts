import * as assert from "assert"
import * as vscode from "vscode"
import { AstParser } from "../view/webview/parser"

suite("AST Summary", () => {
	test("links inline defineProps type literal fields into template summary", async () => {
		const summary = await buildVueSummary(`<script setup lang="ts">
const props = defineProps<{
	item: GetStagnantListResType
	fieldJson?: string[]
	extraData: Record<string, any>
}>()
</script>
<template>
	<div>{{ item }}</div>
	<div>{{ fieldJson?.length }}</div>
	<div>{{ extraData.foo }}</div>
</template>`)

		assertTemplateLinked(summary, ["item", "fieldJson", "extraData"])
		assertTemplateMissing(summary, [])
	})

	test("links referenced defineProps interface fields into template summary", async () => {
		const summary = await buildVueSummary(`<script setup lang="ts">
interface Props {
	item: string
	count?: number
}

const props = defineProps<Props>()
</script>
<template>
	<div>{{ item }} {{ count }}</div>
</template>`)

		assertTemplateLinked(summary, ["item", "count"])
		assertTemplateMissing(summary, [])
	})
})

async function buildVueSummary(source: string) {
	const document = await vscode.workspace.openTextDocument({
		language: "vue",
		content: source,
	})
	await vscode.window.showTextDocument(document)

	const parser = new AstParser()
	const { payload, error } = parser.buildAstForDocument(document)

	assert.strictEqual(error, undefined)
	assert.ok(payload?.summary, "expected vue summary to be created")

	return payload!.summary!
}

function assertTemplateLinked(
	summary: NonNullable<Awaited<ReturnType<typeof buildVueSummary>>>,
	expectedLabels: string[]
) {
	const linkedLabels = new Set(getSectionLabels(summary, "template-links"))
	for (const label of expectedLabels) {
		assert.ok(linkedLabels.has(label), `expected ${label} to appear in template-links`)
	}
}

function assertTemplateMissing(
	summary: NonNullable<Awaited<ReturnType<typeof buildVueSummary>>>,
	unexpectedLabels: string[]
) {
	const missingLabels = new Set(getSectionLabels(summary, "template-missing"))
	for (const label of unexpectedLabels) {
		assert.ok(
			!missingLabels.has(label),
			`expected ${label} to be absent from template-missing`
		)
	}
}

function getSectionLabels(
	summary: NonNullable<Awaited<ReturnType<typeof buildVueSummary>>>,
	sectionId: string
): string[] {
	return summary.sections
		.find((section) => section.id === sectionId)
		?.items.map((item) => item.label) || []
}
