/**
 * 书库：加载 txt / epub、维护阅读游标，向浏览器端提供状态与下一个阅读块。
 * 小说内容只经 HTTP 发给浏览器渲染，绝不进入模型上下文。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseEpub } from './epub.js'
import { parseNovel, type NovelBook } from './parser.js'
import { ProgressStore, bookIdOf } from './progress.js'

export interface LibraryState {
  hasBook: boolean
  title: string
  totalBlocks: number
}

export interface NextBlock {
  done: boolean
  blockIndex: number
  chapterTitle: string
  text: string
}

export class NovelLibrary {
  private book: NovelBook | null = null
  private bookId = ''
  private title = ''
  private cursor = 0

  constructor(private readonly store: ProgressStore, private readonly chunkSize: number) {}

  /** 加载（或重载）一本小说；路径为空时清空书库 */
  async load(filePath: string): Promise<void> {
    this.book = null
    this.bookId = ''
    this.title = ''
    this.cursor = 0
    if (!filePath) return
    const buf = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.epub') {
      const epub = parseEpub(buf, this.chunkSize)
      this.book = epub
      this.title = epub.title || path.basename(filePath, ext)
    } else {
      this.book = parseNovel(buf, this.chunkSize)
      this.title = path.basename(filePath, ext)
    }
    this.bookId = bookIdOf(filePath, buf.byteLength)
    this.cursor = await this.store.get(this.bookId)
  }

  get state(): LibraryState {
    return {
      hasBook: this.book !== null && this.book.blocks.length > 0,
      title: this.title,
      totalBlocks: this.book?.blocks.length ?? 0,
    }
  }

  /** 取下一个阅读块并推进进度；读完返回 done */
  async next(): Promise<NextBlock> {
    const empty: NextBlock = { done: true, blockIndex: -1, chapterTitle: '', text: '' }
    if (!this.book || this.cursor >= this.book.blocks.length) return empty
    const block = this.book.blocks[this.cursor]!
    this.cursor += 1
    await this.store.set(this.bookId, this.cursor)
    return {
      done: false,
      blockIndex: block.index,
      chapterTitle: block.chapterTitle,
      text: block.text,
    }
  }
}
