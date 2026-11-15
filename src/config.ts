/**
 * 插件配置：Schemastery schema，用户在 cordis.yml 的 config 字段填写，
 * 修改后由 Cordis 热替换生效。
 */
import Schema from '@deepseek-ai/schemastery'

export interface Config {
  /** 总开关：关闭后思维链原样渲染 */
  enabled: boolean
  /** 小说 txt 文件的绝对路径；留空则不插入 */
  novelPath: string
  /** 每个阅读块的字数上限 */
  chunkSize: number
  /** 每多少个思维块插入一张小说卡片 */
  insertEvery: number
  /** 思维链短于该字数时不插入，避免打扰 */
  minReasoningChars: number
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true),
  novelPath: Schema.string().default(''),
  chunkSize: Schema.number().default(400),
  insertEvery: Schema.number().default(3),
  minReasoningChars: Schema.number().default(200),
})
