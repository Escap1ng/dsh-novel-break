import assert from 'node:assert/strict'
import { test } from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProgressStore, bookIdOf } from '../lib/novel/progress.js'

test('bookIdOf: 同名同大小稳定、不同大小不同', () => {
  const a = bookIdOf('D:/books/测试.txt', 1024)
  assert.equal(a, bookIdOf('E:/other/测试.txt', 1024))
  assert.notEqual(a, bookIdOf('D:/books/测试.txt', 2048))
})

test('ProgressStore: 读写往返与默认值', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'novel-break-test-'))
  try {
    const store = new ProgressStore(dir)
    assert.equal(await store.get('book-a'), 0)
    await store.set('book-a', 42)
    // 新实例模拟重启后恢复
    const reopened = new ProgressStore(dir)
    assert.equal(await reopened.get('book-a'), 42)
    assert.equal(await reopened.get('book-b'), 0)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('ProgressStore: 非法索引报错', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'novel-break-test-'))
  try {
    const store = new ProgressStore(dir)
    await assert.rejects(() => store.set('book-a', -1), RangeError)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
