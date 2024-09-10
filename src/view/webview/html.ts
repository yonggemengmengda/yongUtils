import { Uri, Webview } from "vscode"
import { getNonce } from "./helpers"

export function buildWebviewHtml(webview: Webview, extensionUri: Uri): string {
	const scriptUri = webview.asWebviewUri(
		Uri.joinPath(extensionUri, "dist", "view", "index.js")
	)
	const styleUri = webview.asWebviewUri(
		Uri.joinPath(extensionUri, "dist", "view", "index.css")
	)

	const nonce = getNonce()

	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data: blob:; script-src 'nonce-${nonce}' ${webview.cspSource};">
			<title>My View</title>
			<link href="${styleUri}" rel="stylesheet" crossorigin></link>
		</head>
		<body>
		 <div id="app"></div>
		 <script type="module" nonce="${nonce}" src="${scriptUri}" crossorigin></script>
		</body>
		</html>`
}
