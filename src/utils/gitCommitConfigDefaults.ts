export const DEFAULT_GIT_COMMIT_DETAIL_SUMMARY_PROMPT = [
	"在提交标题后补充 2-4 条细节描述摘要。",
	"每条摘要单独占一行，并且必须以 `- ` 开头。",
	"摘要要聚焦具体改动、涉及模块、行为变化或影响点，避免空泛表述。",
	"不要重复标题，不要写测试流水账，不要输出 Markdown 标题。",
].join("\n")
