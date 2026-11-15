import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeText, splitChapters, chunkParagraphs, parseNovel } from '../lib/novel/parser.js'

const enc = (s) => new TextEncoder().encode(s)

test('decodeText: UTF-8 与 BOM', () => {
  assert.equal(decodeText(enc('你好，世界')), '你好，世界')
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('正文')])
  assert.equal(decodeText(bom), '正文')
})

test('decodeText: GBK 回退', () => {
  // “中文” 的 GBK 字节：D6 D0 CE C4
  const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])
  assert.equal(decodeText(gbk), '中文')
})

test('splitChapters: 中文数字章节与前言', () => {
  const text = '楔子内容\n第一章 起点\n甲\n第二章 转折\n乙'
  const chapters = splitChapters(text)
  assert.deepEqual(chapters.map((c) => c.title), ['前言', '第一章 起点', '第二章 转折'])
  assert.equal(chapters[1].body.trim(), '甲')
})

test('splitChapters: 无章节标题时整本一章', () => {
  const chapters = splitChapters('就是一段散文\n没有章节')
  assert.equal(chapters.length, 1)
  assert.equal(chapters[0].title, '正文')
})

test('chunkParagraphs: 聚合不超限、超长段硬切', () => {
  const chunks = chunkParagraphs('一二三\n四五六\n七八九', 7)
  assert.deepEqual(chunks, ['一二三\n四五六', '七八九'])
  const long = chunkParagraphs('abcdefghij', 4)
  assert.deepEqual(long, ['abcd', 'efgh', 'ij'])
})

test('chunkParagraphs: 非法块大小报错', () => {
  assert.throws(() => chunkParagraphs('x', 0), RangeError)
})

test('parseNovel: 块索引连续且章节区间正确', () => {
  const text = '第一章 起\n段落一\n段落二\n\n第二章 承\n段落三'
  const book = parseNovel(enc(text), 3)
  assert.equal(book.chapters.length, 2)
  assert.equal(book.blocks.length, 3)
  assert.deepEqual(book.blocks.map((b) => b.index), [0, 1, 2])
  assert.equal(book.chapters[0].startBlock, 0)
  assert.equal(book.chapters[0].endBlock, 2)
  assert.equal(book.blocks[2].chapterTitle, '第二章 承')
})
