import type { Stone } from '../core/board'

/** AI 返回的落子 */
export interface AiMove {
  color: Stone
  x: number
  y: number
}

/** token 用量（OpenAI 兼容接口的 usage 字段） */
export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export type AiTurnStatus = 'ok' | 'timeout' | 'network' | 'parse' | 'invalid' | 'http'

export interface AiTurnOk {
  status: 'ok'
  move: AiMove
  raw: string
  reasoning?: string
  durationMs: number
  usage?: TokenUsage
}

export interface AiTurnFail {
  status: Exclude<AiTurnStatus, 'ok'>
  message: string
  raw?: string
  durationMs: number
}

export type AiTurnResult = AiTurnOk | AiTurnFail