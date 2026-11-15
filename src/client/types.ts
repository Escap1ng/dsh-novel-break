/**
 * 浏览器端最小类型声明。
 *
 * 注意：DSH 处于开发者预览期，官方客户端类型包（如
 * @deepseek-ai/dsh-client-ui-primitives）尚未纳入本框架依赖。
 * 集成联调时应替换为官方类型，这里只声明本插件用到的契约，
 * 依据官方源码 packages/client/ui-chat/src/client/chat/register-node-renderers.ts。
 */
import type { ReactNode } from 'react'

/** conversation.chat.reasoning.body 槽位的组件入参（官方 DefaultReasoningBody 同款） */
export interface ReasoningBodyProps {
  /** 当前思维块全文（流式增长） */
  text: string
  /** 是否仍在流式输出 */
  running: boolean
  /** 渲染官方工厂槽（用于原样渲染思维链正文） */
  renderFactorySlot: (name: string, props: Record<string, unknown>) => ReactNode
}

export interface SlotRegistrationOptions {
  name: string
  /** 数值越低优先级越高；官方 reasoning.body 默认实现为 100 */
  priority?: number
  key?: string
  [extra: string]: unknown
}

export interface ClientContext {
  slots: {
    inject(name: string, callback: () => void | (() => void)): unknown
    register(options: SlotRegistrationOptions, component: unknown): unknown
  }
}

/** 宿主端 /_novel/state 返回的配置快照 */
export interface NovelState {
  enabled: boolean
  hasBook: boolean
  title: string
  insertEvery: number
  minReasoningChars: number
  totalBlocks: number
}

/** 宿主端 /_novel/next 返回的一个阅读块 */
export interface NovelBlockPayload {
  done: boolean
  blockIndex: number
  chapterTitle: string
  text: string
}
