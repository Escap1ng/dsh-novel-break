import assert from 'node:assert/strict'
import { test } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { parseEpub, xhtmlToText } from '../lib/novel/epub.js'
import { NovelLibrary } from '../lib/novel/library.js'
import { ProgressStore } from '../lib/novel/progress.js'

const CONTAINER = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'

/** 构造最小 epub：spine 故意先 c2 后 c1，验证按 spine 顺序而非 manifest 顺序 */
function makeEpub() {
  const opf = `<?xml version="1.0"?>
<package><metadata><dc:title>测试书</dc:title></metadata>
<manifest>
<item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
</manifest>
<spine toc="ncx"><itemref idref="c2"/><itemref idref="c1"/></spine></package>`
  const ncx = `<ncx><navMap>
<navPoint id="n1"><navLabel><text>第一章 起</text></navLabel><content src="text/ch1.xhtml"/></navPoint>
<navPoint id="n2"><navLabel><text>第二章 转</text></navLabel><content src="text/ch2.xhtml"/></navPoint>
</navMap></ncx>`
  const ch1 = '<html><body><h1>第一章 起</h1><p>甲说：&quot;你好&amp;欢迎&quot;。</p><p>乙段落。</p><script>evil()</script></body></html>'
  const ch2 = '<html><body><div>丙段落<br/>丁段落</div><style>p{}</style></body></html>'
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/toc.ncx': strToU8(ncx),
    'OEBPS/text/ch1.xhtml': strToU8(ch1),
    'OEBPS/text/ch2.xhtml': strToU8(ch2),
  })
}

test('xhtmlToText: 块级换行、剥标签与实体解码', () => {
  const html = '<p>A&amp;B</p><div>C<br/>D</div><script>x()</script><style>p{}</style><p>&#x4F60;&#22909;</p>'
  assert.equal(xhtmlToText(html), 'A&B\nC\nD\n你好')
})

test('parseEpub: 元数据书名、spine 顺序与 NCX 章节名', () => {
  const book = parseEpub(makeEpub(), 100)
  assert.equal(book.title, '测试书')
  assert.deepEqual(book.chapters.map((c) => c.title), ['第二章 转', '第一章 起'])
  assert.equal(book.blocks[0].text, '丙段落\n丁段落')
  const allText = book.blocks.map((b) => b.text).join('\n')
  assert.ok(allText.includes('你好&欢迎'))
  assert.ok(!allText.includes('evil()'))
})

test('parseEpub: OPF 相对路径归一化与标题回退', () => {
  const opf = '<package><metadata><dc:title>路径书</dc:title></metadata><manifest><item id="a" href="../text/a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>'
  const buf = zipSync({
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(opf),
    'text/a.xhtml': strToU8('<p>内容甲</p>'),
  })
  const book = parseEpub(buf, 100)
  assert.equal(book.blocks[0].text, '内容甲')
  assert.equal(book.chapters[0].title, '第 1 节')
})

test('parseEpub: 缺少 container.xml 报错', () => {
  const buf = zipSync({ mimetype: strToU8('application/epub+zip') })
  assert.throws(() => parseEpub(buf, 100), /container\.xml/)
})

test('NovelLibrary: epub 加载与进度跨实例恢复', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'novel-break-epub-'))
  try {
    const file = path.join(dir, '测试书.epub')
    await fs.writeFile(file, makeEpub())
    const lib = new NovelLibrary(new ProgressStore(dir), 100)
    await lib.load(file)
    assert.equal(lib.state.hasBook, true)
    assert.equal(lib.state.title, '测试书')
    const first = await lib.next()
    assert.equal(first.blockIndex, 0)
    assert.equal(first.chapterTitle, '第二章 转')
    const reopened = new NovelLibrary(new ProgressStore(dir), 100)
    await reopened.load(file)
    assert.equal((await reopened.next()).blockIndex, 1)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
