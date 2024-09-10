import * as vscode from "vscode"

export function register(context: vscode.ExtensionContext) {
	const parseTsDisposable = vscode.commands.registerCommand(
		"yongutils.parseToTs",
		() => {
			const editor = vscode.window.activeTextEditor
			if (editor) {
				const selection = editor.selection
				// @ts-ignore
				const selectText = editor.document.getText(selection)
				try {
					eval(`var inputStr = ${selectText};
            function getTSDataType(data) {
              const type = typeof data
              switch (type) {
                case "number":
                  return "number"
                case "string":
                  return "string"
                case "boolean":
                  return "boolean"
                case "object":
                  if (data === null) {
                    return "null"
                  } else if (Array.isArray(data)) {
                    // 如果是数组，递归获取数组元素的类型
                    if (data.length > 0) {
                      const arrayElementType = data
                        .map((item) => getTSDataType(item))
                        //去重
                        .filter((item, index, array) => array.indexOf(item) === index)
                      return arrayElementType.length === 1 ? \`\$\{arrayElementType[0]\}[]\` : \`(\$\{arrayElementType.join("\\n | ")\})[]\`
                    } else {
                      return "unknown[]"
                    }
                  } else if (data instanceof Date) {
                    return "Date"
                  } else if (data instanceof RegExp) {
                    return "RegExp"
                  } else {
                    // 如果是对象，递归获取对象属性的类型
                    const objType = {}
                    for (const key in data) {
                      if (data.hasOwnProperty(key)) {
                        objType[key] = getTSDataType(data[key])
                      }
                    }
                    return \`\{\\n\$\{Object.keys(objType)
                      .map((key) => \`  \${key}: \$\{objType[key]\}\`)
                      .join("\\n")\} \\n}\`
                  }
                case "function":
                  return "Function"
                case "undefined":
                  return "undefined"
                default:
                  return "any"
              }
            };
            editor.edit((editBuilder) => {
              editBuilder.replace(selection, getTSDataType(inputStr));
            })
         `)
				} catch (e) {
					console.log(e)
				}
			}
		}
	)
	context.subscriptions.push(parseTsDisposable)
}
