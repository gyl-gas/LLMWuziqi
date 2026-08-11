import { WIN_LENGTH, inBounds } from './board'
import type { Stone } from './board'

/** 4 个方向：水平、垂直、主对角线、副对角线 */
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

export interface WinResult {
  /** 胜方颜色：1=黑，2=白 */
  winner: Stone
  /** 连成一线的全部棋子坐标（行, 列） */
  line: Array<[number, number]>
}

/**
 * 以 (x, y) 为最新落子点检查是否形成五连。
 * 返回获胜信息；未获胜或该位置为空返回 null。
 */
export function checkWinAt(board: Stone[][], x: number, y: number): WinResult | null {
  const color = board[x][y]
  if (color === 0) return null

  for (const [dx, dy] of DIRECTIONS) {
    const line: Array<[number, number]> = [[x, y]]

    for (let step = 1; step < WIN_LENGTH; step++) {
      const nx = x + dx * step
      const ny = y + dy * step
      if (inBounds(board, nx, ny) && board[nx][ny] === color) {
        line.push([nx, ny])
      } else {
        break
      }
    }

    for (let step = 1; step < WIN_LENGTH; step++) {
      const nx = x - dx * step
      const ny = y - dy * step
      if (inBounds(board, nx, ny) && board[nx][ny] === color) {
        line.unshift([nx, ny])
      } else {
        break
      }
    }

    if (line.length >= WIN_LENGTH) {
      return { winner: color, line }
    }
  }

  return null
}

/** 棋盘是否已下满（平局） */
export function isBoardFull(board: Stone[][]): boolean {
  return board.every((row) => row.every((cell) => cell !== 0))
}