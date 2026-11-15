import assert from 'node:assert/strict'
import { test } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NovelLibrary } from '../lib/novel/library.js'
import { ProgressStore } from '../lib/novel/progress.js'

async function makeFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'novel-break-lib-'))
  const txt = path.join(dir, '测试书.txt')
  await fs.writeFile(txt, '第一章 起\n甲段\n\n乙段\n第二章 承\n丙段', 'utf8')
  return { dir, txt }
}

test('NovelLibrary: 顺序出块、读完 done、进度跨实例恢复', async () => {
  const { dir, txt } = await makeFixture()
  try {
    const lib = new NovelLibrary(new ProgressStore(dir), 2)
    assert.equal(lib.state.hasBook, false)
    await lib.load(txt)
    assert.equal(lib.state.hasBook, true)
    assert.equal(lib.state.title, '测试书')
    const total = lib.state.totalBlocks
    assert.ok(total >= 3)

    const first = await lib.next()
    assert.equal(first.done, false)
    assert.equal(first.blockIndex, 0)

    // 模拟重启：新实例应从块 1 继续
    const reopened = new NovelLibrary(new ProgressStore(dir), 2)
    await reopened.load(txt)
    const second = await reopened.next()
    assert.equal(second.blockIndex, 1)

    for (let i = 1; i < total; i++) await reopened.next()
    const end = await reopened.next()
    assert.equal(end.done, true)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('NovelLibrary: 空路径清空书库', async () => {
  const { dir, txt } = await makeFixture()
  try {
    const lib = new NovelLibrary(new ProgressStore(dir), 100)
    await lib.load(txt)
    assert.equal(lib.state.hasBook, true)
    await lib.load('')
    assert.equal(lib.state.hasBook, false)
    assert.equal((await lib.next()).done, true)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
