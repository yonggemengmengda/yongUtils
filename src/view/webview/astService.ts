import {
	Range,
	Selection,
	TextDocument,
	TextEditorRevealType,
	Uri,
	window,
	workspace,
} from "vscode"
import { AstParser } from "./parser"
import type { AstDocumentPayload, WebLocation } from "./types"

export class AstService {
	private readonly parser = new AstParser()

	public buildAstForDocument(document: TextDocument): {
		payload?: AstDocumentPayload
		error?: string
	} {
		return this.parser.buildAstForDocument(document)
	}

	public async revealAstLocation(location?: WebLocation) {
		if (!location?.range?.length) return
		const [start, end] = location.range
		const range = new Range(start.line, start.character, end.line, end.character)

		let targetUri: Uri | undefined
		if (location.uri?.fsPath) {
			targetUri = Uri.file(location.uri.fsPath)
		} else if (location.uri?.scheme && location.uri.path) {
			targetUri = Uri.from({
				scheme: location.uri.scheme,
				path: location.uri.path,
			})
		} else {
			targetUri = window.activeTextEditor?.document.uri
		}

		if (!targetUri) return
		const doc = await workspace.openTextDocument(targetUri)
		const editor = await window.showTextDocument(doc, {
			preview: false,
		})
		editor.selection = new Selection(range.start, range.end)
		editor.revealRange(range, TextEditorRevealType.InCenter)
	}
}
