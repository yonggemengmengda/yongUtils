import * as assert from "assert"
import {
	buildScopedGitStatusText,
	resolveEffectiveGitCommitScope,
	summarizeGitStatus,
} from "../utils/gitCommitMessage"

suite("Git Commit Message", () => {
	test("prefers staged scope when staged and working tree changes coexist", () => {
		const statusText = [
			"M  src/only-staged.ts",
			" M src/only-working-tree.ts",
			"MM src/both-sides.ts",
			"?? src/new-file.ts",
		].join("\n")

		const summary = summarizeGitStatus(statusText)

		assert.strictEqual(resolveEffectiveGitCommitScope("auto", summary), "staged")
		assert.strictEqual(
			resolveEffectiveGitCommitScope("workingTree", summary),
			"staged"
		)
		assert.strictEqual(resolveEffectiveGitCommitScope("staged", summary), "staged")
		assert.strictEqual(resolveEffectiveGitCommitScope("all", summary), "all")
	})

	test("filters scoped status down to staged entries only", () => {
		const statusText = [
			"M  src/only-staged.ts",
			" M src/only-working-tree.ts",
			"MM src/both-sides.ts",
			"?? src/new-file.ts",
		].join("\n")

		assert.strictEqual(
			buildScopedGitStatusText(statusText, "staged"),
			["M  src/only-staged.ts", "M  src/both-sides.ts"].join("\n")
		)
	})

	test("filters scoped status down to working tree entries and untracked files", () => {
		const statusText = [
			"M  src/only-staged.ts",
			" M src/only-working-tree.ts",
			"MM src/both-sides.ts",
			"?? src/new-file.ts",
		].join("\n")

		assert.strictEqual(
			buildScopedGitStatusText(statusText, "workingTree"),
			[" M src/only-working-tree.ts", " M src/both-sides.ts", "?? src/new-file.ts"].join("\n")
		)
	})
})
