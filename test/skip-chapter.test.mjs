import assert from 'node:assert/strict'
import { test } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NovelLibrary } from '../lib/novel/library.js'
import { ProgressStore } from '../lib/novel/progress.js'

async function makeBook(dir) {
  const txt = path.join(dir, '跳章测试.txt')
  await fs.writeFile(txt, '第一章 起\n甲\n乙\n第二章 承\n丙\n第三章 合\n丁', 'utf8')
  return txt
}

test('skipChapter: 跳到下一章开头并持久化', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'novel-skip-'))
  try {
    const txt = await makeBook(dir)
    const lib = new NovelLibrary(new ProgressStore(dir), 1)
    await lib.load(txt)
    // 读一块后跳章：应落在第二章开头
    await lib.next()
    const result = await lib.skipChapter()
    assert.equal(result.skipped, true)
    assert.equal(result.chapterTitle, '第二章 承')
    const block = await lib.next()
    assert.equal(block.chapterTitle, '第二章 承')
    assert.equal(block.text, '丙')
    // 重启后游标停在第三章开头（跳章后读了一块）
    const reopened = new NovelLibrary(new ProgressStore(dir), 1)
    await reopened.load(txt)
    assert.equal((await reopened.next()).chapterTitle, '第三章 合')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('skipChapter: 最后一章返回 skipped=false 且不动游标', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'novel-skip-'))
  try {
    const txt = await makeBook(dir)
    const lib = new NovelLibrary(new ProgressStore(dir), 1)
    await lib.load(txt)
    await lib.skipChapter()
    await lib.skipChapter() // 已到第三章
    const before = await lib.next()
    assert.equal(before.chapterTitle, '第三章 合')
    const result = await lib.skipChapter()
    assert.equal(result.skipped, false)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('skipChapter: 无书时安全返回', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'novel-skip-'))
  try {
    const lib = new NovelLibrary(new ProgressStore(dir), 100)
    const result = await lib.skipChapter()
    assert.equal(result.skipped, false)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
