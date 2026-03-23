import * as assert from "assert"
import {
	buildScopedGitStatusText,
	normalizeGeneratedGitCommitMessage,
	resolveEffectiveGitCommitScope,
	selectCommitEmoji,
	selectCommitType,
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

	test("selects dependency emoji from commit title content", () => {
		assert.strictEqual(selectCommitEmoji("chore: 升级 pnpm 依赖"), "⬆️")
	})

	test("selects docs type from commit title content", () => {
		assert.strictEqual(selectCommitType("feat: 更新 README 文档"), "docs")
	})

	test("selects build type from release title content", () => {
		assert.strictEqual(selectCommitType("chore: 发布 0.1.4 版本"), "build")
	})

	test("selects docs emoji from commit title content", () => {
		assert.strictEqual(selectCommitEmoji("feat: 更新 README 文档"), "📝")
	})

	test("selects rocket emoji from release title content", () => {
		assert.strictEqual(selectCommitEmoji("chore: 发布 0.1.4 版本"), "🚀")
	})

	test("prepends auto-selected emoji and preserves detail summary", () => {
		assert.strictEqual(
			normalizeGeneratedGitCommitMessage(
				"chore: 升级 pnpm 依赖\n\n- 更新 lockfile\n- 调整安装脚本",
				true
			),
			"⬆️ build: 升级 pnpm 依赖\n\n- 更新 lockfile\n- 调整安装脚本"
		)
	})

	test("rewrites feat docs title into docs with matching emoji", () => {
		assert.strictEqual(
			normalizeGeneratedGitCommitMessage("feat: 更新 README 文档", true),
			"📝 docs: 更新 README 文档"
		)
	})

	test("rewrites release title into build with rocket emoji", () => {
		assert.strictEqual(
			normalizeGeneratedGitCommitMessage("chore: 发布 0.1.4 版本", true),
			"🚀 build: 发布 0.1.4 版本"
		)
	})

	test("drops scope when current generation spec forbids scope", () => {
		assert.strictEqual(
			normalizeGeneratedGitCommitMessage(
				"chore(version): 更新 admin 和 chain 服务版本号",
				true
			),
			"🚀 build: 更新 admin 和 chain 服务版本号"
		)
	})

	test("keeps scope when current generation spec requires scope", () => {
		assert.strictEqual(
			normalizeGeneratedGitCommitMessage(
				"chore(version): 更新 admin 和 chain 服务版本号",
				true,
				"严格按项目 commitlint 规范输出，格式必须为：<type>(<scope>): <summary>"
			),
			"🚀 build(version): 更新 admin 和 chain 服务版本号"
		)
	})

	test("drops scope when current generation spec only makes scope optional", () => {
		assert.strictEqual(
			normalizeGeneratedGitCommitMessage(
				"chore(site): 更新站点版本号",
				true,
				"严格按项目 commitlint 规范输出；优先使用 <type>(<scope>): <summary>，若无法明确 scope，可使用 <type>: <summary>"
			),
			"🚀 build: 更新站点版本号"
		)
	})

	test("removes leading emoji when emoji mode is disabled", () => {
		assert.strictEqual(
			normalizeGeneratedGitCommitMessage("✨ feat: 新增 Git Commit 配置页", false),
			"feat: 新增 Git Commit 配置页"
		)
	})
})
