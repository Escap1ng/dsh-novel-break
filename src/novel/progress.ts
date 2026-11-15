/**
 * 阅读进度持久化：按书（文件名 + 字节数指纹）记录阅读块索引。
 * 写入采用临时文件 + 改名，避免中途崩溃损坏进度文件。
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface ReadingProgress {
  blockIndex: number
  updatedAt: string
}

type ProgressMap = Record<string, ReadingProgress>

/** 书籍指纹：同名同大小的文件视为同一本书 */
export function bookIdOf(filePath: string, byteLength: number): string {
  return createHash('sha1')
    .update(path.basename(filePath))
    .update(String(byteLength))
    .digest('hex')
    .slice(0, 16)
}

export class ProgressStore {
  private readonly file: string
  private cache: ProgressMap | null = null

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'progress.json')
  }

  private async load(): Promise<ProgressMap> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      this.cache = parsed && typeof parsed === 'object' ? (parsed as ProgressMap) : {}
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  /** 未读过的书返回 0 */
  async get(bookId: string): Promise<number> {
    const map = await this.load()
    const entry = map[bookId]
    return entry && Number.isInteger(entry.blockIndex) && entry.blockIndex >= 0 ? entry.blockIndex : 0
  }

  async set(bookId: string, blockIndex: number): Promise<void> {
    if (!Number.isInteger(blockIndex) || blockIndex < 0) {
      throw new RangeError('blockIndex 必须为非负整数')
    }
    const map = await this.load()
    map[bookId] = { blockIndex, updatedAt: new Date().toISOString() }
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(map, null, 2), 'utf8')
    await fs.rename(tmp, this.file)
  }
}
