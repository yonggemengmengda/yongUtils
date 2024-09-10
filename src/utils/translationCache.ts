import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"

const CACHE_FILE_NAME = "translation-cache.v2.json"
const CACHE_VERSION = 2
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 90
const MAX_CACHE_ENTRIES = 2000
const SAVE_DEBOUNCE_MS = 800

export type TranslationScene = "general" | "naming"
export type TranslationTargetLanguage = "zh" | "en"

type CacheListItem = {
	original: string
	translated: string
}

type TranslationCacheSetInput = {
	sourceText: string
	translatedText: string
	scene: TranslationScene
	targetLanguage: TranslationTargetLanguage
	modelSignature?: string
}

type TranslationCacheGetInput = {
	sourceText: string
	scene: TranslationScene
	targetLanguage: TranslationTargetLanguage
	modelSignature?: string
}

type TranslationCacheEntry = {
	sourceText: string
	translatedText: string
	scene: TranslationScene
	targetLanguage: TranslationTargetLanguage
	modelSignature: string
	updatedAt: number
	expiresAt: number
}

type TranslationCacheFilePayload = {
	version: number
	entries: Record<string, TranslationCacheEntry>
}

export interface TranslationCacheStore {
	get(input: TranslationCacheGetInput): string | undefined
	set(input: TranslationCacheSetInput): void
	list(keyword?: string): CacheListItem[]
	removeBySourceText(sourceText: string): boolean
	flush(): Promise<void>
}

export function inferTargetLanguage(sourceText: string): TranslationTargetLanguage {
	return /[\u4e00-\u9fa5]/.test(sourceText) ? "en" : "zh"
}

export async function createTranslationCacheStore(
	context: vscode.ExtensionContext
): Promise<TranslationCacheStore> {
	const cacheFilePath = path.join(context.globalStorageUri.fsPath, CACHE_FILE_NAME)
	const storage = new TranslationCacheStorage(cacheFilePath)
	await storage.load()
	return storage
}

class TranslationCacheStorage implements TranslationCacheStore {
	private entries: Record<string, TranslationCacheEntry> = {}
	private saveTimer: NodeJS.Timeout | null = null
	private isSaving = false
	private queuedSave = false

	constructor(private readonly cacheFilePath: string) {}

	async load() {
		await this.ensureDir()
		const payload = await this.loadFromPath(this.cacheFilePath)
		if (payload) {
			this.entries = payload.entries
			this.compactExpiredEntries()
		}
	}

	get(input: TranslationCacheGetInput): string | undefined {
		const sourceText = normalizeSourceText(input.sourceText)
		if (!sourceText) return undefined

		const cacheKey = buildCacheKey({
			sourceText,
			scene: input.scene,
			targetLanguage: input.targetLanguage,
			modelSignature: normalizeModelSignature(input.modelSignature),
		})
		const item = this.entries[cacheKey]
		if (!item) return undefined

		if (item.expiresAt <= Date.now()) {
			delete this.entries[cacheKey]
			this.scheduleSave()
			return undefined
		}

		return item.translatedText
	}

	set(input: TranslationCacheSetInput): void {
		const sourceText = normalizeSourceText(input.sourceText)
		const translatedText = normalizeTranslatedText(input.translatedText)
		if (!sourceText || !translatedText) return

		const modelSignature = normalizeModelSignature(input.modelSignature)
		const now = Date.now()
		const cacheKey = buildCacheKey({
			sourceText,
			scene: input.scene,
			targetLanguage: input.targetLanguage,
			modelSignature,
		})

		this.entries[cacheKey] = {
			sourceText,
			translatedText,
			scene: input.scene,
			targetLanguage: input.targetLanguage,
			modelSignature,
			updatedAt: now,
			expiresAt: now + DEFAULT_TTL_MS,
		}

		this.evictIfNeeded()
		this.scheduleSave()
	}

	list(keyword = ""): CacheListItem[] {
		this.compactExpiredEntries()
		const search = keyword.trim().toLowerCase()
		const latestBySource = new Map<string, TranslationCacheEntry>()

		for (const entry of Object.values(this.entries)) {
			if (
				search &&
				!entry.sourceText.toLowerCase().includes(search) &&
				!entry.translatedText.toLowerCase().includes(search)
			) {
				continue
			}
			const existing = latestBySource.get(entry.sourceText)
			if (!existing || existing.updatedAt < entry.updatedAt) {
				latestBySource.set(entry.sourceText, entry)
			}
		}

		return Array.from(latestBySource.values())
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map((entry) => ({
				original: entry.sourceText,
				translated: entry.translatedText,
			}))
	}

	removeBySourceText(sourceText: string): boolean {
		const normalized = normalizeSourceText(sourceText)
		if (!normalized) return false

		let removed = false
		for (const [key, entry] of Object.entries(this.entries)) {
			if (entry.sourceText === normalized) {
				delete this.entries[key]
				removed = true
			}
		}

		if (removed) {
			this.scheduleSave()
		}
		return removed
	}

	async flush(): Promise<void> {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer)
			this.saveTimer = null
		}
		await this.persist()
	}

	private compactExpiredEntries() {
		const now = Date.now()
		let removed = false
		for (const [key, entry] of Object.entries(this.entries)) {
			if (entry.expiresAt <= now) {
				delete this.entries[key]
				removed = true
			}
		}
		if (removed) {
			this.scheduleSave()
		}
	}

	private evictIfNeeded() {
		const keys = Object.keys(this.entries)
		if (keys.length <= MAX_CACHE_ENTRIES) return
		const sorted = keys.sort((a, b) => {
			return this.entries[a].updatedAt - this.entries[b].updatedAt
		})
		const removeCount = keys.length - MAX_CACHE_ENTRIES
		for (let i = 0; i < removeCount; i += 1) {
			delete this.entries[sorted[i]]
		}
	}

	private scheduleSave() {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer)
		}
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null
			void this.persist()
		}, SAVE_DEBOUNCE_MS)
	}

	private async persist() {
		if (this.isSaving) {
			this.queuedSave = true
			return
		}
		this.isSaving = true

		do {
			this.queuedSave = false
			try {
				await this.ensureDir()
				const payload: TranslationCacheFilePayload = {
					version: CACHE_VERSION,
					entries: this.entries,
				}
				const tmpFilePath = `${this.cacheFilePath}.tmp`
				await fs.promises.writeFile(
					tmpFilePath,
					JSON.stringify(payload, null, 2),
					"utf-8"
				)
				await fs.promises.rename(tmpFilePath, this.cacheFilePath)
			} catch (error) {
				console.error("Failed to save translation cache:", error)
			}
		} while (this.queuedSave)

		this.isSaving = false
	}

	private async ensureDir() {
		await fs.promises.mkdir(path.dirname(this.cacheFilePath), {
			recursive: true,
		})
	}

	private async loadFromPath(filePath: string): Promise<TranslationCacheFilePayload | null> {
		if (!fs.existsSync(filePath)) return null
		try {
			const text = await fs.promises.readFile(filePath, "utf-8")
			const parsed = JSON.parse(text)
			const normalized = normalizePayload(parsed)
			return normalized
		} catch (error) {
			console.error("Failed to load translation cache:", error)
			return null
		}
	}

}

function normalizePayload(input: unknown): TranslationCacheFilePayload | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) return null
	const parsed = input as Partial<TranslationCacheFilePayload>
	if (parsed.version !== CACHE_VERSION || !parsed.entries) return null

	const entries: Record<string, TranslationCacheEntry> = {}
	for (const [key, value] of Object.entries(parsed.entries)) {
		if (!value || typeof value !== "object") continue
		const sourceText = normalizeSourceText((value as TranslationCacheEntry).sourceText)
		const translatedText = normalizeTranslatedText(
			(value as TranslationCacheEntry).translatedText
		)
		const scene = normalizeScene((value as TranslationCacheEntry).scene)
		const targetLanguage = normalizeTargetLanguage(
			(value as TranslationCacheEntry).targetLanguage,
			sourceText
		)
		const modelSignature = normalizeModelSignature(
			(value as TranslationCacheEntry).modelSignature
		)
		const updatedAt = Number((value as TranslationCacheEntry).updatedAt) || Date.now()
		const expiresAt = Number((value as TranslationCacheEntry).expiresAt) || updatedAt + DEFAULT_TTL_MS
		if (!sourceText || !translatedText) continue
		entries[key] = {
			sourceText,
			translatedText,
			scene,
			targetLanguage,
			modelSignature,
			updatedAt,
			expiresAt,
		}
	}

	return {
		version: CACHE_VERSION,
		entries,
	}
}

function normalizeScene(scene: string | undefined): TranslationScene {
	return scene === "naming" ? "naming" : "general"
}

function normalizeTargetLanguage(
	targetLanguage: string | undefined,
	sourceText: string
): TranslationTargetLanguage {
	if (targetLanguage === "en" || targetLanguage === "zh") return targetLanguage
	return inferTargetLanguage(sourceText)
}

function normalizeSourceText(text: string | undefined): string {
	return String(text || "").trim()
}

function normalizeTranslatedText(text: string | undefined): string {
	return String(text || "").trim()
}

function normalizeModelSignature(signature?: string): string {
	const value = String(signature || "default").trim()
	return value || "default"
}

function buildCacheKey(input: {
	sourceText: string
	scene: TranslationScene
	targetLanguage: TranslationTargetLanguage
	modelSignature: string
}): string {
	return [
		input.scene,
		input.targetLanguage,
		input.modelSignature,
		input.sourceText,
	].join("::")
}
