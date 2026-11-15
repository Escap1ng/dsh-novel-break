/**
 * epub 解析：解包 → container.xml → OPF（metadata + manifest + spine）
 * → 按 spine 顺序提取纯文本 → 复用 txt 的分块逻辑。
 *
 * 面向小说阅读场景的轻量正则实现：不处理 DRM、不渲染样式；
 * NCX 嵌套目录只取每层首个标签（小说目录通常为平铺结构），
 * 无目录标签时回退到正文 h1–h3 标题，再回退到「第 N 节」。
 */
import { unzipSync } from 'fflate'
import { buildBook, decodeText, type NovelBook } from './parser.js'

export interface EpubBook extends NovelBook {
  /** OPF dc:title 书名；缺失时为空串 */
  title: string
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    let code: number | null = null
    if (/^#x/i.test(body)) code = Number.parseInt(body.slice(2), 16)
    else if (body.startsWith('#')) code = Number.parseInt(body.slice(1), 10)
    if (code !== null) {
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** XHTML → 纯文本：丢弃脚本/样式/注释，块级标签产生换行，其余标签剥离 */
export function xhtmlToText(html: string): string {
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return decodeEntities(cleaned)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** 归一化 zip 内路径：相对 baseDir 解析 ../ 与 ./，去掉 URL 片段 */
function resolveZipPath(baseDir: string, href: string): string {
  const clean = safeDecode(href.split('#')[0] ?? '')
  const segments = (baseDir ? `${baseDir}/${clean}` : clean).split('/')
  const out: string[] = []
  for (const seg of segments) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}

/** 读取 XML 标签属性值（单双引号均可） */
function attrOf(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return m ? (m[1] ?? m[2]) : undefined
}

function dirOf(zipPath: string): string {
  return zipPath.includes('/') ? zipPath.slice(0, zipPath.lastIndexOf('/')) : ''
}

/** 解析 epub 为书名、章节与阅读块；非法文件抛出 Error */
export function parseEpub(buf: Uint8Array, chunkSize: number): EpubBook {
  const files = unzipSync(buf)
  const readEntry = (name: string): string | null => {
    const data = files[name]
    return data ? decodeText(data) : null
  }

  const containerXml = readEntry('META-INF/container.xml')
  if (!containerXml) throw new Error('无效的 epub：缺少 META-INF/container.xml')
  const rootfileTag = containerXml.match(/<rootfile\b[^>]*>/i)?.[0]
  const opfHref = rootfileTag ? attrOf(rootfileTag, 'full-path') : undefined
  if (!opfHref) throw new Error('无效的 epub：container.xml 未声明 OPF 路径')
  const opfPath = resolveZipPath('', opfHref)
  const opf = readEntry(opfPath)
  if (!opf) throw new Error(`无效的 epub：OPF 文件缺失（${opfPath}）`)
  const opfDir = dirOf(opfPath)

  const title = decodeEntities(
    opf.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '',
  )

  // manifest：id → zip 内路径；顺带记录 NCX 目录文件
  const manifest = new Map<string, string>()
  let ncxPath: string | null = null
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = attrOf(m[0], 'id')
    const href = attrOf(m[0], 'href')
    if (!id || !href) continue
    const full = resolveZipPath(opfDir, href)
    manifest.set(id, full)
    const type = attrOf(m[0], 'media-type') ?? ''
    if (type === 'application/x-dtbncx+xml' || full.toLowerCase().endsWith('.ncx')) ncxPath = full
  }

  // spine：阅读顺序
  const spineBlock = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i)?.[1] ?? ''
  const spineIds = [...spineBlock.matchAll(/<itemref\b[^>]*>/gi)]
    .map((m) => attrOf(m[0], 'idref'))
    .filter((id): id is string => Boolean(id))

  // NCX：content src（去片段）→ 章节名
  const tocTitles = new Map<string, string>()
  if (ncxPath) {
    const ncx = readEntry(ncxPath)
    if (ncx) {
      const ncxDir = dirOf(ncxPath)
      for (const m of ncx.matchAll(/<navPoint\b[^>]*>([\s\S]*?)<\/navPoint>/gi)) {
        const label = m[1]!.match(/<text\b[^>]*>([\s\S]*?)<\/text>/i)?.[1]
        const contentTag = m[1]!.match(/<content\b[^>]*>/i)?.[0]
        const src = contentTag ? attrOf(contentTag, 'src') : undefined
        if (!label || !src) continue
        const full = resolveZipPath(ncxDir, src)
        if (!tocTitles.has(full)) {
          tocTitles.set(full, decodeEntities(label.replace(/<[^>]+>/g, '')).trim())
        }
      }
    }
  }

  const rawChapters: { title: string; body: string }[] = []
  for (const [i, id] of spineIds.entries()) {
    const entryPath = manifest.get(id)
    if (!entryPath) continue
    const xhtml = readEntry(entryPath)
    if (xhtml === null) continue
    const body = xhtmlToText(xhtml)
    if (!body.trim()) continue
    const heading = xhtml.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1]
    const headingText = heading
      ? decodeEntities(heading.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
      : ''
    rawChapters.push({ title: tocTitles.get(entryPath) || headingText || `第 ${i + 1} 节`, body })
  }
  if (rawChapters.length === 0) throw new Error('无效的 epub：spine 中没有可读正文')

  return { title, ...buildBook(rawChapters, chunkSize) }
}
