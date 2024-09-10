import * as vscode from "vscode"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"
import { Jimp } from "jimp"

function getDesktopPath(): string {
	const homeDir = os.homedir()
	let desktopPath: string

	switch (process.platform) {
		case "win32":
			desktopPath = path.join(homeDir, "Desktop")
			break
		case "darwin":
			desktopPath = path.join(homeDir, "Desktop")
			break
		case "linux":
			desktopPath = path.join(homeDir, "Desktop")
			break
		default:
			throw new Error("Unsupported operating system")
	}

	return desktopPath
}

export async function imgAutoResize({
	files,
	resolutions,
	outputDir,
	outputFormat,
	outputFileName,
}: {
	files: {
		file: string
		name: string
	}[]
	resolutions: {
		width: number
		height: number
	}[]
	outputDir?: string
	outputFormat?: string
	outputFileName?: string
}) {
	if (!files?.length || !resolutions?.length) {
		return []
	}

	const rootDir = resolveOutputDir(outputDir)
	ensureOutputDir(rootDir)

	let donePaths: string[] = []
	const errorMessages: string[] = []
	let attemptCount = 0
	const validResolutions = resolutions.filter(
		(item) =>
			Number.isFinite(item.width) &&
			Number.isFinite(item.height) &&
			item.width > 0 &&
			item.height > 0
	)
	if (!validResolutions.length) {
		throw new Error("分辨率无效，请确保宽高都大于 0")
	}

	for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
		const fileItem = files[fileIndex]
		if (!fileItem) {
			errorMessages.push(`文件 ${fileIndex + 1} 数据无效: 条目为空`)
			continue
		}
		let parsedInput: { buffer: Buffer; inputExt: string }
		try {
			parsedInput = parseImageInput(fileItem.file)
		} catch (error) {
			errorMessages.push(`文件 ${fileItem.name || fileIndex + 1} 数据无效: ${toMessage(error)}`)
			continue
		}
		const buffer = parsedInput.buffer
		const fileType = parsedInput.inputExt
		let image: any
		try {
			// @ts-ignore 根据图片路径读取图片
			image = await Jimp.read(buffer)
		} catch (error) {
			errorMessages.push(
				`读取图片失败(${fileItem.name || fileIndex + 1}): ${toMessage(error)}`
			)
			continue
		}
		const baseName = resolveOutputBaseName({
			originalFileName: fileItem.name,
			outputFileName,
			fileIndex,
			totalFiles: files.length,
		})
		const safeFileType = resolveOutputFileExtension(fileType, outputFormat)
		if (safeFileType === "ico") {
			for (const resolution of validResolutions) {
				attemptCount += 1
				try {
					const writtenFilePath = await writeIcoFile({
						image,
						rootDir,
						baseName: `${baseName}_${resolution.width}x${resolution.height}`,
						resolutions: [resolution],
					})
					donePaths.push(writtenFilePath)
				} catch (error) {
					errorMessages.push(
						`生成失败(${fileItem.name || fileIndex + 1}, ICO ${resolution.width}x${resolution.height}): ${toMessage(
							error
						)}`
					)
				}
			}
			continue
		}
		// 根据分辨率列表生成不同尺寸的图片
		for (const resolution of validResolutions) {
			attemptCount += 1
			try {
				const writtenFilePath = await writeImageWithFallback({
					image: image.clone().resize({ w: resolution.width, h: resolution.height }),
					rootDir,
					baseName,
					width: resolution.width,
					height: resolution.height,
					targetExt: safeFileType,
				})
				donePaths.push(writtenFilePath)
			} catch (error) {
				errorMessages.push(
					`生成失败(${fileItem.name || fileIndex + 1}, ${resolution.width}x${resolution.height}): ${toMessage(
						error
					)}`
				)
			}
		}
	}
	if (!donePaths.length) {
		const firstError = errorMessages[0] || "未捕获到子步骤错误"
		const debugInfo = `debug(files=${files.length}, resolutions=${resolutions.length}, validResolutions=${validResolutions.length}, attempts=${attemptCount}, rootDir=${rootDir})`
		throw new Error(
			`${firstError}。未生成任何输出文件，请检查输入文件和参数。${debugInfo}`
		)
	}
	return donePaths
}

function ensureOutputDir(rootDir: string) {
	if (!fs.existsSync(rootDir)) {
		fs.mkdirSync(rootDir, { recursive: true })
		return
	}
	const stat = fs.statSync(rootDir)
	if (!stat.isDirectory()) {
		throw new Error(`输出目录不是文件夹: ${rootDir}`)
	}
}

function parseImageInput(raw: unknown): { buffer: Buffer; inputExt: string } {
	const rawText = String(raw || "").trim()
	if (!rawText) {
		throw new Error("图片数据为空")
	}

	if (rawText.startsWith("data:")) {
		const commaIndex = rawText.indexOf(",")
		if (commaIndex <= 0) {
			throw new Error("DataURL 格式不完整")
		}
		const header = rawText.slice(0, commaIndex)
		const payload = rawText.slice(commaIndex + 1)
		const mimeMatch = header.match(/^data:image\/([^;,]+)/i)
		const inputExt = normalizeFileExtension(mimeMatch?.[1] || "png")
		const isBase64 = /;base64/i.test(header)
		if (!payload) {
			throw new Error("DataURL payload 为空")
		}
		const buffer = isBase64
			? Buffer.from(payload, "base64")
			: Buffer.from(decodeURIComponent(payload), "utf8")
		if (!buffer.length) {
			throw new Error("图片二进制内容为空")
		}
		return { buffer, inputExt }
	}

	// 兼容直接传 base64 字符串的情况
	const compactBase64 = rawText.replace(/\s+/g, "")
	const buffer = Buffer.from(compactBase64, "base64")
	if (!buffer.length) {
		throw new Error("无法从输入中解析出图片数据")
	}
	return { buffer, inputExt: "png" }
}

function resolveOutputDir(outputDir?: string): string {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
	const baseRoot = workspaceRoot || getDesktopPath()
	const fallbackDir = "icons"
	const rawDir = String(outputDir || "").trim()
	const targetDir = rawDir || fallbackDir

	if (path.isAbsolute(targetDir)) {
		return targetDir
	}
	return path.join(baseRoot, targetDir)
}

function sanitizeFileBaseName(name: string): string {
	const normalized = name.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
	return normalized || "image"
}

function resolveOutputBaseName({
	originalFileName,
	outputFileName,
	fileIndex,
	totalFiles,
}: {
	originalFileName: string
	outputFileName?: string
	fileIndex: number
	totalFiles: number
}): string {
	const originalBaseName = sanitizeFileBaseName(
		path.parse(String(originalFileName || "").trim()).name || "image"
	)
	const rawCustomBaseName = String(outputFileName || "").trim()
	if (!rawCustomBaseName) {
		return originalBaseName
	}
	const customBaseName = sanitizeFileBaseName(rawCustomBaseName)
	// 避免多文件批量处理时自定义同名导致覆盖
	if (totalFiles > 1) {
		return `${customBaseName}_${fileIndex + 1}`
	}
	return customBaseName
}

function normalizeFileExtension(ext: string): string {
	const normalized = String(ext || "").toLowerCase().trim()
	if (!normalized) return "png"
	const cleaned = normalized.replace(/[^a-z0-9]/g, "")
	if (!cleaned) return "png"
	if (cleaned === "jpeg") return "jpg"
	if (cleaned === "tif") return "tiff"
	if (cleaned === "ico" || cleaned === "xicon" || cleaned === "vndmicrosofticon") {
		return "ico"
	}
	if (SUPPORTED_OUTPUT_EXTENSIONS.has(cleaned)) return cleaned
	return "png"
}

const SUPPORTED_OUTPUT_EXTENSIONS = new Set([
	"png",
	"jpg",
	"gif",
	"bmp",
	"tiff",
	"ico",
])

function normalizeOutputFormat(format: string | undefined): string {
	const normalized = String(format || "origin").toLowerCase().trim()
	if (!normalized) return "origin"
	if (normalized === "jpeg") return "jpg"
	if (normalized === "tif") return "tiff"
	if (normalized === "original") return "origin"
	return normalized
}

function resolveOutputFileExtension(originalExt: string, outputFormat?: string): string {
	const normalizedOutput = normalizeOutputFormat(outputFormat)
	if (normalizedOutput === "origin") {
		return normalizeFileExtension(originalExt)
	}
	if (SUPPORTED_OUTPUT_EXTENSIONS.has(normalizedOutput)) {
		return normalizedOutput
	}
	return normalizeFileExtension(originalExt)
}

function resolveOutputMimeByExt(
	ext: string
): "image/png" | "image/jpeg" | "image/gif" | "image/bmp" | "image/tiff" {
	const normalized = normalizeFileExtension(ext)
	switch (normalized) {
		case "jpg":
			return "image/jpeg"
		case "gif":
			return "image/gif"
		case "bmp":
			return "image/bmp"
		case "tiff":
			return "image/tiff"
		default:
			return "image/png"
	}
}

async function writeImageToFile(
	image: any,
	filePath: `${string}.${string}`,
	ext: string
) {
	const outputMime = resolveOutputMimeByExt(ext)
	let bufferError: unknown = null
	try {
		const outputBuffer = await image.getBuffer(outputMime)
		await fs.promises.writeFile(filePath, outputBuffer)
		await fs.promises.access(filePath, fs.constants.F_OK)
		return
	} catch (error) {
		bufferError = error
	}

	let writeError: unknown = null
	try {
		await image.write(filePath)
		await fs.promises.access(filePath, fs.constants.F_OK)
		return
	} catch (error) {
		writeError = error
	}

	throw new Error(
		`buffer写入失败(${toMessage(bufferError)}); direct写入失败(${toMessage(writeError)})`
	)
}

type IcoEntry = {
	width: number
	height: number
	pngBuffer: Buffer
}

function normalizeIcoResolutions(
	resolutions: {
		width: number
		height: number
	}[]
) {
	const normalized: { width: number; height: number }[] = []
	const seen = new Set<string>()
	for (const item of resolutions) {
		const width = Math.round(Number(item.width))
		const height = Math.round(Number(item.height))
		if (!Number.isFinite(width) || !Number.isFinite(height)) continue
		if (width <= 0 || height <= 0) continue
		// ICO 单图尺寸上限 256x256
		if (width > 256 || height > 256) continue
		const key = `${width}x${height}`
		if (seen.has(key)) continue
		seen.add(key)
		normalized.push({ width, height })
	}
	return normalized.sort((a, b) =>
		a.width === b.width ? a.height - b.height : a.width - b.width
	)
}

function createIcoBuffer(entries: IcoEntry[]): Buffer {
	if (!entries.length) {
		throw new Error("ICO 条目为空")
	}

	const count = entries.length
	const headerSize = 6
	const tableSize = count * 16
	const directorySize = headerSize + tableSize
	const imageDataSize = entries.reduce((sum, item) => sum + item.pngBuffer.length, 0)
	const output = Buffer.alloc(directorySize + imageDataSize)

	// ICONDIR
	output.writeUInt16LE(0, 0) // reserved
	output.writeUInt16LE(1, 2) // type: icon
	output.writeUInt16LE(count, 4) // image count

	let imageOffset = directorySize
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index]
		const entryOffset = headerSize + index * 16
		output.writeUInt8(entry.width >= 256 ? 0 : entry.width, entryOffset)
		output.writeUInt8(entry.height >= 256 ? 0 : entry.height, entryOffset + 1)
		output.writeUInt8(0, entryOffset + 2) // color palette
		output.writeUInt8(0, entryOffset + 3) // reserved
		output.writeUInt16LE(1, entryOffset + 4) // color planes
		output.writeUInt16LE(32, entryOffset + 6) // bits per pixel
		output.writeUInt32LE(entry.pngBuffer.length, entryOffset + 8)
		output.writeUInt32LE(imageOffset, entryOffset + 12)

		entry.pngBuffer.copy(output, imageOffset)
		imageOffset += entry.pngBuffer.length
	}

	return output
}

async function writeIcoFile({
	image,
	rootDir,
	baseName,
	resolutions,
}: {
	image: any
	rootDir: string
	baseName: string
	resolutions: {
		width: number
		height: number
	}[]
}): Promise<string> {
	const icoResolutions = normalizeIcoResolutions(resolutions)
	if (!icoResolutions.length) {
		throw new Error("ICO 尺寸无效，请确保宽高在 1~256 之间")
	}

	const entries: IcoEntry[] = []
	for (const resolution of icoResolutions) {
		const pngBuffer = await image
			.clone()
			.resize({ w: resolution.width, h: resolution.height })
			.getBuffer("image/png")
		entries.push({
			width: resolution.width,
			height: resolution.height,
			pngBuffer,
		})
	}

	const icoBuffer = createIcoBuffer(entries)
	const filePath = path.join(rootDir, `${baseName}.ico`) as `${string}.${string}`
	await fs.promises.writeFile(filePath, icoBuffer)
	await fs.promises.access(filePath, fs.constants.F_OK)
	return filePath
}

async function writeImageWithFallback({
	image,
	rootDir,
	baseName,
	width,
	height,
	targetExt,
}: {
	image: any
	rootDir: string
	baseName: string
	width: number
	height: number
	targetExt: string
}): Promise<string> {
	const primaryExt = resolveOutputFileExtension(targetExt, targetExt)
	const primaryPath = path.join(
		rootDir,
		`${baseName}_${width}x${height}.${primaryExt}`
	) as `${string}.${string}`
	let primaryError: unknown = null
	try {
		await writeImageToFile(image.clone(), primaryPath, primaryExt)
		return primaryPath
	} catch (error) {
		primaryError = error
	}

	// 目标格式失败时，自动兜底为 PNG，尽量保证有结果产出
	if (primaryExt !== "png") {
		const fallbackExt = "png"
		const fallbackPath = path.join(
			rootDir,
			`${baseName}_${width}x${height}.${fallbackExt}`
		) as `${string}.${string}`
		try {
			await writeImageToFile(image.clone(), fallbackPath, fallbackExt)
			return fallbackPath
		} catch (fallbackError) {
			throw new Error(
				`目标格式(${primaryExt})写入失败: ${toMessage(primaryError)}; PNG兜底也失败: ${toMessage(
					fallbackError
				)}`
			)
		}
	}

	throw new Error(`目标格式(${primaryExt})写入失败: ${toMessage(primaryError)}`)
}

function toMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	return String(error || "未知错误")
}
