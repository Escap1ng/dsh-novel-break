/**
 * 宿主端入口：加载小说、持久化进度，向浏览器半提供同源 HTTP 路由。
 *
 * 路由写法参考 UncleK/dsh-think-translate 的实测教训：
 * ctx.effect 需要「返回 disposer 的工厂」，直接传 register() 的返回值
 * 会导致路由注册后立即被注销。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.js'
import { NovelLibrary } from './novel/library.js'
import { ProgressStore } from './novel/progress.js'

export const name = 'dsh-novel-break'
export const inject = ['webServer']
export { Config }

interface WebServerLike {
  register(route: {
    kind: 'exact'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function apply(ctx: Context, config: Config): void {
  const dataDir = path.join(process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh'), 'dsh-novel-break')
  const library = new NovelLibrary(new ProgressStore(dataDir), config.chunkSize)

  void library.load(config.novelPath).catch((error: unknown) => {
    ctx.logger.warn('[dsh-novel-break] 小说加载失败：%s', error instanceof Error ? error.message : error)
  })

  const webServer = ctx.get('webServer') as WebServerLike | undefined
  if (!webServer) return

  ctx.effect(function () {
    const disposeState = webServer.register({
      kind: 'exact',
      path: '/_novel/state',
      handler: (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' })
        sendJson(res, 200, {
          enabled: config.enabled,
          insertEvery: config.insertEvery,
          minReasoningChars: config.minReasoningChars,
          ...library.state,
        })
      },
    })
    const disposeNext = webServer.register({
      kind: 'exact',
      path: '/_novel/next',
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' })
        try {
          sendJson(res, 200, await library.next())
        } catch {
          sendJson(res, 503, { done: true, blockIndex: -1, chapterTitle: '', text: '' })
        }
      },
    })
    const disposeSkip = webServer.register({
      kind: 'exact',
      path: '/_novel/skip-chapter',
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
        try {
          sendJson(res, 200, await library.skipChapter())
        } catch {
          sendJson(res, 503, { skipped: false, blockIndex: -1, chapterTitle: '' })
        }
      },
    })
    return () => {
      disposeState()
      disposeNext()
      disposeSkip()
    }
  })
}
