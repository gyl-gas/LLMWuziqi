import { isValidMove } from '../core/board'
import type { Stone } from '../core/board'

export interface ParsedMove {
  color: Stone
  x: number
  y: number
}

export type ParseResult =
  | { ok: true; move: ParsedMove }
  | { ok: false; reason: string }

/** 从文本中提取第一个 JSON 对象 */
export function extractJson(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (match === null) return null
  try {
    return JSON.parse(match[0]) as unknown
  } catch {
    return null
  }
}

/**
 * 解析并校验 AI 落子响应。
 * 校验：color 与当前回合一致、坐标为整数且在界内、落点为空格。
 */
export function parseAiMove(
  raw: string,
  boardSize: number,
  expectedColor: Stone,
  board: Stone[][],
): ParseResult {
  const data = extractJson(raw)
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: '响应中未找到可解析的 JSON 对象' }
  }
  const { color, x, y } = data as Record<string, unknown>

  if (color !== 1 && color !== 2) {
    return { ok: false, reason: `color 必须为 1 或 2，收到：${String(color)}` }
  }
  if (color !== expectedColor) {
    return { ok: false, reason: `color ${color} 与当前回合（${expectedColor}）不符` }
  }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) {
    return { ok: false, reason: 'x、y 必须为整数坐标' }
  }
  if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) {
    return { ok: false, reason: `坐标 (${x}, ${y}) 超出 ${boardSize} x ${boardSize} 棋盘范围` }
  }
  if (!isValidMove(board, x, y)) {
    return { ok: false, reason: `位置 (${x}, ${y}) 已有棋子，不能落子` }
  }
  return { ok: true, move: { color: color as Stone, x, y } }
}