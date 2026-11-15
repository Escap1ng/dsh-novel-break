/**
 * 小说卡片：挂载时向宿主端取一个阅读块，可折叠、可跳过。
 * 纯展示组件，内容不进入模型上下文。
 */
import { useCallback, useEffect, useState } from 'react'
import type { NovelBlockPayload } from './types.js'

const API_BASE = '/_novel'

async function fetchBlock(): Promise<NovelBlockPayload | null> {
  try {
    const res = await fetch(`${API_BASE}/next`)
    if (!res.ok) return null
    return (await res.json()) as NovelBlockPayload
  } catch {
    return null
  }
}

export function NovelCard(): JSX.Element | null {
  const [block, setBlock] = useState<NovelBlockPayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchBlock().then((payload) => {
      if (cancelled) return
      if (payload && !payload.done) setBlock(payload)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const skip = useCallback(() => {
    setBlock(null)
    void fetchBlock().then((payload) => {
      if (payload && !payload.done) setBlock(payload)
      else setFailed(true)
    })
  }, [])

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
            skip()
          }}
          style={{ marginLeft: 12, fontSize: '0.85em', cursor: 'pointer' }}
        >
          换一段
        </button>
      </summary>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, marginTop: 6 }}>{block.text}</div>
    </details>
  )
}
