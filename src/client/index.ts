/**
 * 浏览器端入口：以低优先级接管 conversation.chat.reasoning.body 槽位，
 * 原文照常经官方工厂槽渲染，仅在思维块之间插入小说卡片。
 * 参考：官方 register-node-renderers.ts 与 UncleK/dsh-think-translate 的槽位实践。
 */
import { createElement, Fragment } from 'react'
import type { ReactNode } from 'react'
import { isPaused, NovelCard } from './NovelCard.js'
import type { ClientContext, NovelState, ReasoningBodyProps } from './types.js'

export const name = 'dsh-novel-break-client'
export const inject = ['slots']

/** 宿主配置快照；取不到时用保守默认值（少插、不打扰） */
let state: NovelState = {
  enabled: true,
  hasBook: false,
  title: '',
  insertEvery: 3,
  minReasoningChars: 200,
  totalBlocks: 0,
}

let lastRefresh = 0
const REFRESH_INTERVAL_MS = 30_000

async function refreshState(): Promise<void> {
  lastRefresh = Date.now()
  try {
    const res = await fetch('/_novel/state')
    if (res.ok) state = (await res.json()) as NovelState
  } catch {
    // 宿主不可达时保持默认，不影响思维链渲染
  }
}

/** 渲染时节流刷新配置，让 cordis.yml 热更新在半分钟内生效 */
function maybeRefresh(): void {
  if (Date.now() - lastRefresh > REFRESH_INTERVAL_MS) void refreshState()
}

/** 思维链内容指纹（FNV-1a）：同一消息重渲染时槽位标识稳定，供回放去重 */
function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** 按空行把思维链切成块 */
function splitReasoning(text: string): string[] {
  return text.split(/\n{2,}/).filter((s) => s.trim().length > 0)
}

function NovelReasoningBody({ text, running, renderFactorySlot }: ReasoningBodyProps): ReactNode {
  maybeRefresh()
  const original = renderFactorySlot('conversation.chat.reasoning.content', { text, running })
  if (!state.enabled || !state.hasBook || isPaused() || text.length < state.minReasoningChars) {
    return original
  }
  const blocks = splitReasoning(text)
  if (blocks.length < state.insertEvery) return original

  const parts: ReactNode[] = []
  let sinceInsert = 0
  for (const [i, block] of blocks.entries()) {
    // 每块仍走官方渲染，保持原有样式与流式行为
    parts.push(
      createElement(
        Fragment,
        { key: `r-${i}` },
        renderFactorySlot('conversation.chat.reasoning.content', { text: block, running: running && i === blocks.length - 1 }),
      ),
    )
    sinceInsert += 1
    const isLast = i === blocks.length - 1
    // 流式中的最后一块不插卡片，避免打断正在输出的内容
    if (sinceInsert >= state.insertEvery && !(running && isLast)) {
      parts.push(createElement(NovelCard, { key: `novel-${i}`, slotId: `${hashText(text)}-${i}` }))
      sinceInsert = 0
    }
  }
  return createElement(Fragment, null, ...parts)
}

export function apply(ctx: ClientContext): void {
  void refreshState()
  ctx.slots.inject('conversation.chat.reasoning.body', () => {
    // 官方默认实现 priority 100，低值接管；卸载时由槽系统自动注销
    ctx.slots.register(
      { name: 'conversation.chat.reasoning.body', priority: 50 },
      NovelReasoningBody,
    )
  })
}
