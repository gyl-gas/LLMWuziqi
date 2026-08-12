import type { Stone } from './board'

/** 棋盘表示模式：plain=位型(0/1/2)，numbered=顺序编号(0/奇数黑/偶数白) */
export type NotationMode = 'plain' | 'numbered'

/** 一步落子记录 */
export interface MoveEntry {
  /** 1 起始的手数 */
  seq: number
  /** 落子颜色 */
  color: Stone
  /** 行号（0 起始） */
  x: number
  /** 列号（0 起始） */
  y: number
  /** 落子来源（棋谱/复盘用） */
  source?: 'human' | 'ai'
  /** 调用的模型名（AI 落子时记录） */
  model?: string
  /** AI 原始返回内容 */
  raw?: string
  /** AI 思考内容（推理模型） */
  reasoning?: string
  /** 本次 AI 调用耗时 ms */
  durationMs?: number
  /** AI 该手落子的失败重试次数 */
  retries?: number
  /** AI 响应 token 用量（服务商返回 usage 字段时记录） */
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

/** AI 请求失败记录：仅用于审计，不属于有效落子。 */
export interface AiFailureEntry {
  /** 全局失败序号，从 1 开始递增。 */
  seq: number
  /** 截至本次失败时已有的有效落子数。 */
  moveCount: number
  color: Stone
  model: string
  status: 'timeout' | 'network' | 'parse' | 'invalid' | 'http'
  message: string
  raw?: string
  reasoning?: string
  finishReason?: string
  durationMs: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

/** 由手数推导颜色：奇数为黑(1)，偶数为白(2) */
export function colorFromSeq(seq: number): Stone {
  return seq % 2 === 1 ? 1 : 2
}

/**
 * 将内部棋盘（0/1/2）转换为发送给 AI 的表示。
 * - plain：原样返回
 * - numbered：0=空位，奇数=黑，偶数=白，数值即落子手数（依赖 moves 序列）
 */
export function toNotation(
  board: Stone[][],
  mode: NotationMode,
  moves: MoveEntry[],
): number[][] {
  if (mode === 'plain') {
    return board.map((row) => row.slice())
  }
  const size = board.length
  const out: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(0))
  for (const m of moves) {
    if (m.x >= 0 && m.y >= 0 && m.x < size && m.y < size) {
      out[m.x][m.y] = m.seq
    }
  }
  return out
}

/**
 * 将 AI 侧表示还原为内部棋盘（0/1/2）。
 * - plain：0/1/2 直接映射，其余值按 0 处理
 * - numbered：0=空，奇数→黑，偶数→白
 */
export function fromNotation(notation: number[][], mode: NotationMode): Stone[][] {
  if (mode === 'plain') {
    return notation.map((row) =>
      row.map((cell): Stone => (cell === 1 || cell === 2 ? cell : 0)),
    )
  }
  return notation.map((row) => row.map((cell): Stone => (cell === 0 ? 0 : colorFromSeq(cell))))
}
