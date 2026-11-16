/**
 * 小说卡片：挂载时向宿主端取一个阅读块，可折叠、换一段、跳下一章、全局暂停。
 * 纯展示组件，内容不进入模型上下文。
 *
 * 会话回放去重：同一思维块重渲染（刷新页面/回放历史）时，
 * 从 sessionStorage 恢复已取过的块，不重复消耗阅读进度。
 */
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { NovelBlockPayload, SkipChapterPayload } from './types.js'

const API_BASE = '/_novel'
const PAUSE_KEY = 'dsh-novel-break.paused'
const blockKey = (slotId: string): string => `dsh-novel-break.block.${slotId}`

export function isPaused(): boolean {
  try {
    return window.sessionStorage.getItem(PAUSE_KEY) === '1'
  } catch {
    return false
  }
}

export function setPaused(paused: boolean): void {
  try {
    if (paused) window.sessionStorage.setItem(PAUSE_KEY, '1')
    else window.sessionStorage.removeItem(PAUSE_KEY)
  } catch {
    // 存储不可用时仅影响本次会话的暂停记忆
  }
}

async function fetchBlock(): Promise<NovelBlockPayload | null> {
  try {
    const res = await fetch(`${API_BASE}/next`)
    if (!res.ok) return null
    return (await res.json()) as NovelBlockPayload
  } catch {
    return null
  }
}

async function skipChapter(): Promise<SkipChapterPayload | null> {
  try {
    const res = await fetch(`${API_BASE}/skip-chapter`, { method: 'POST' })
    if (!res.ok) return null
    return (await res.json()) as SkipChapterPayload
  } catch {
    return null
  }
}

function readCache(slotId: string): NovelBlockPayload | null {
  try {
    const raw = window.sessionStorage.getItem(blockKey(slotId))
    return raw ? (JSON.parse(raw) as NovelBlockPayload) : null
  } catch {
    return null
  }
}

function writeCache(slotId: string, block: NovelBlockPayload): void {
  try {
    window.sessionStorage.setItem(blockKey(slotId), JSON.stringify(block))
  } catch {
    // 存储满或不可用时退化为每次取新块
  }
}

const buttonStyle: CSSProperties = {
  marginLeft: 10,
  fontSize: '0.85em',
  cursor: 'pointer',
}

export interface NovelCardProps {
  /** 同一思维块内稳定的槽位标识，用于回放去重 */
  slotId: string
}

export function NovelCard({ slotId }: NovelCardProps): JSX.Element | null {
  const [block, setBlock] = useState<NovelBlockPayload | null>(() => readCache(slotId))
  const [failed, setFailed] = useState(false)
  const [paused, setPausedState] = useState(isPaused)

  const takeBlock = useCallback(() => {
    void fetchBlock().then((payload) => {
      if (payload && !payload.done) {
        setBlock(payload)
        writeCache(slotId, payload)
      } else {
        setFailed(true)
      }
    })
  }, [slotId])

  useEffect(() => {
    if (isPaused()) {
      setPausedState(true)
      return
    }
    if (readCache(slotId)) return // 回放：直接用缓存，不消耗进度
    takeBlock()
  }, [slotId, takeBlock])

  const replace = useCallback(() => {
    setBlock(null)
    takeBlock()
  }, [takeBlock])

  const jumpChapter = useCallback(() => {
    void skipChapter().then((result) => {
      if (result?.skipped) replace()
    })
  }, [replace])

  const togglePause = useCallback(() => {
    const next = !isPaused()
    setPaused(next)
    setPausedState(next)
  }, [])

  if (paused) {
    return (
      <div style={{ margin: '6px 0', fontSize: '0.85em', opacity: 0.6 }}>
        📖 小说插播已暂停
        <button type="button" onClick={togglePause} style={buttonStyle}>
          继续
        </button>
      </div>
    )
  }
  if (failed || !block) return null

  return (
    <details
      open
      style={{
        margin: '8px 0',
        padding: '8px 12px',
        borderLeft: '3px solid #8b5cf6',
        background: 'rgba(139, 92, 246, 0.06)',
        borderRadius: '6px',
        fontSize: '0.92em',
      }}
    >
      <summary style={{ cursor: 'pointer', userSelect: 'none', opacity: 0.75 }}>
        📖 {block.chapterTitle} · 第 {block.blockIndex + 1} 段
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            replace()
          }}
          style={buttonStyle}
        >
          换一段
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            jumpChapter()
          }}
          style={buttonStyle}
        >
          下一章
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            togglePause()
          }}
          style={buttonStyle}
        >
          暂停
        </button>
      </summary>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, marginTop: 6 }}>{block.text}</div>
    </details>
  )
}
