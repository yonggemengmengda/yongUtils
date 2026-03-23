export function addNameVariants(output: Set<string>, rawName: string) {
	const kebab = toKebabCase(rawName)
	const camel = toCamelCase(rawName)
	const pascal = toPascalCase(rawName)

	;[rawName, kebab, camel, pascal].forEach((item) => {
		if (item) {
			output.add(item)
		}
	})
}

export function toKebabCase(value: string): string {
	return String(value || "")
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase()
}

export function toCamelCase(value: string): string {
	const normalized = toKebabCase(value)
	return normalized.replace(/-([a-z0-9])/g, (_, letter) =>
		String(letter).toUpperCase()
	)
}

export function toPascalCase(value: string): string {
	const camel = toCamelCase(value)
	return camel ? camel[0].toUpperCase() + camel.slice(1) : ""
}
