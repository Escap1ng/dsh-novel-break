/**
 * 小说文本解析：编码探测、切章、按字数分块。
 * 纯函数、无外部依赖，便于单元测试。
 */

export interface NovelBlock {
  /** 全局块索引，阅读进度的最小单位 */
  index: number
  /** 所属章节索引 */
  chapterIndex: number
  /** 所属章节标题 */
  chapterTitle: string
  /** 块正文 */
  text: string
}

export interface NovelChapter {
  title: string
  /** 起始块索引（含） */
  startBlock: number
  /** 结束块索引（不含） */
  endBlock: number
}

export interface NovelBook {
  chapters: NovelChapter[]
  blocks: NovelBlock[]
}

/** 章节标题行：第X章/节/回/卷/集/部/篇，允许少量缩进与不超过 40 字的副标题 */
const CHAPTER_RE = /^[ \t]{0,8}(第[0-9零一二三四五六七八九十百千万两]+[章节回卷集部篇][^\n]{0,40})$/gm

/** 解码文本：BOM 优先，其次严格 UTF-8，失败回退 GBK */
export function decodeText(buf: Uint8Array): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.subarray(3))
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf.subarray(2))
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf.subarray(2))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('gbk').decode(buf)
  }
}

/** 按章节标题行切章；标题前的内容归入「前言」，无标题时整本视为一章 */
export function splitChapters(text: string): { title: string; body: string }[] {
  const normalized = text.replace(/\r\n?/g, '\n')
  const matches = [...normalized.matchAll(CHAPTER_RE)]
  if (matches.length === 0) {
    return [{ title: '正文', body: normalized }]
  }
  const chapters: { title: string; body: string }[] = []
  const first = matches[0]!
  if (first.index! > 0) {
    const preface = normalized.slice(0, first.index).trim()
    if (preface) chapters.push({ title: '前言', body: preface })
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!
    const start = m.index! + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : normalized.length
    chapters.push({ title: m[1]!.trim(), body: normalized.slice(start, end) })
  }
  return chapters
}

/** 章内按段落聚合为不超过 chunkSize 字的块；超长段落硬切 */
export function chunkParagraphs(body: string, chunkSize: number): string[] {
  if (chunkSize <= 0) throw new RangeError('chunkSize 必须为正数')
  const paragraphs = body.split(/\n+/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''
  const flush = (): void => {
    if (current) {
      chunks.push(current)
      current = ''
    }
  }
  for (const p of paragraphs) {
    if (p.length > chunkSize) {
      flush()
      for (let i = 0; i < p.length; i += chunkSize) {
        chunks.push(p.slice(i, i + chunkSize))
      }
      continue
    }
    if (current && current.length + p.length + 1 > chunkSize) flush()
    current = current ? `${current}\n${p}` : p
  }
  flush()
  return chunks
}

/** 解析整本小说为章节与阅读块 */
export function parseNovel(buf: Uint8Array, chunkSize: number): NovelBook {
  const text = decodeText(buf)
  const chapters: NovelChapter[] = []
  const blocks: NovelBlock[] = []
  for (const [chapterIndex, ch] of splitChapters(text).entries()) {
    const startBlock = blocks.length
    for (const chunk of chunkParagraphs(ch.body, chunkSize)) {
      blocks.push({ index: blocks.length, chapterIndex, chapterTitle: ch.title, text: chunk })
    }
    chapters.push({ title: ch.title, startBlock, endBlock: blocks.length })
  }
  return { chapters, blocks }
}
