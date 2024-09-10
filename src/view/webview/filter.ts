import { IMPORTANT_SCRIPT_TYPES, SCRIPT_HOIST_TYPES } from "./constants"
import type { AstFilterMode, WebAstNode } from "./types"

export class AstFilter {
	public filterAstNodes(nodes: WebAstNode[], mode: AstFilterMode): WebAstNode[] {
		const result: WebAstNode[] = []
		for (const node of nodes) {
			const filtered = this.filterAstNode(node, mode)
			if (!filtered) continue
			if (Array.isArray(filtered)) {
				result.push(...filtered)
			} else {
				result.push(filtered)
			}
		}
		return result
	}

	private filterAstNode(
		node: WebAstNode,
		mode: AstFilterMode
	): WebAstNode | WebAstNode[] | null {
		const filteredChildren = node.children?.length
			? this.filterAstNodes(node.children, mode)
			: []
		const important = this.isImportantNode(node, mode)
		const hoist = this.shouldHoistNode(node, mode)

		if (important) {
			return { ...node, children: filteredChildren }
		}
		if (filteredChildren.length === 0) {
			return null
		}
		if (hoist) {
			return filteredChildren
		}
		return { ...node, children: filteredChildren }
	}

	private isImportantNode(node: WebAstNode, mode: AstFilterMode): boolean {
		if (mode === "html") {
			if (node.kind === "comment") return false
			if (node.kind === "text") {
				return this.isMeaningfulText(node.value)
			}
			return true
		}
		if (mode === "style") {
			return true
		}
		if (mode === "script") {
			return IMPORTANT_SCRIPT_TYPES.has(node.name || "")
		}
		return true
	}

	private shouldHoistNode(node: WebAstNode, mode: AstFilterMode): boolean {
		if (mode === "html") {
			const label = (node.label || "").toLowerCase()
			return label === "#document" || label === "#document-fragment"
		}
		if (mode === "style") {
			return false
		}
		if (mode === "script") {
			return SCRIPT_HOIST_TYPES.has(node.name || "")
		}
		return false
	}

	private normalizeText(value?: string): string {
		if (!value) return ""
		return value.replace(/\s+/g, " ").trim()
	}

	private isMeaningfulText(value?: string): boolean {
		return this.normalizeText(value).length > 0
	}
}
