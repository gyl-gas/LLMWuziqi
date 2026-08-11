import { BLACK } from '../core/board'
import type { Stone } from '../core/board'
import { toNotation } from '../core/notation'
import type { MoveEntry, NotationMode } from '../core/notation'

export interface PromptParams {
  boardSize: number
  currentPlayer: Stone
  notation: NotationMode
  extraPrompt?: string
}

/** 动态生成系统提示词（执色/尺寸/表示规则均可配置，为 AI vs AI 预留） */
export function buildSystemPrompt(params: PromptParams): string {
  const colorName = params.currentPlayer === BLACK ? '黑棋' : '白棋'
  const notationRule =
    params.notation === 'plain'
      ? '0 表示空位；1 表示黑棋；2 表示白棋。'
      : '0 表示空位；奇数表示黑棋，偶数表示白棋，数值即该子的落子手数（越大越晚）。'
  const lines = [
    `你是一名五子棋 AI 玩家，本局执${colorName}，执子颜色固定为 ${params.currentPlayer}。`,
    `棋盘大小为 ${params.boardSize} x ${params.boardSize}，行（x）和列（y）的坐标都从 0 开始。`,
    '棋盘表示规则：',
    notationRule,
    '横、竖、斜任意方向先连成 5 子的一方获胜；如果棋盘下满则平局。',
    '轮到己方落子时，请只输出一个 JSON 对象，不要输出任何解释、思考过程或多余文字，格式为：',
    `  {"color": ${params.currentPlayer}, "x": 行号, "y": 列号}`,
    '要求：',
    '  - color 必须等于你的执子颜色；',
    '  - x、y 必须落在棋盘范围内；',
    '  - 落子位置必须是空位。',
  ]
  if (params.extraPrompt !== undefined && params.extraPrompt.trim() !== '') {
    lines.push(`额外要求：${params.extraPrompt.trim()}`)
  }
  return lines.join('\n')
}

/** 生成用户消息：当前棋盘 + 轮次说明 */
export function buildUserMessage(
  board: Stone[][],
  moves: MoveEntry[],
  params: Pick<PromptParams, 'boardSize' | 'currentPlayer' | 'notation'>,
): string {
  const boardJson = JSON.stringify(toNotation(board, params.notation, moves))
  const colorName = params.currentPlayer === BLACK ? '黑棋' : '白棋'
  return `当前棋盘（已下 ${moves.length} 手，轮到${colorName}落子）：\n${boardJson}`
}