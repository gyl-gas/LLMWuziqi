import { createBoard, placeStone } from './board'
import type { Stone } from './board'
import type { MoveEntry } from './notation'
import { checkWinAt } from './rules'

/** 复盘到某一手时的棋盘视图 */
export interface ReplayView {
  board: Stone[][]
  lastMove: MoveEntry | null
  winLine: Array<[number, number]> | null
  winner: Stone | null
}

/**
 * 按棋谱重建到第 upTo 手之后的局面。
 * upTo 越界时截断到最后一手；upTo=0 返回空盘。
 */
export function replayViewAt(boardSize: number, moves: MoveEntry[], upTo: number): ReplayView {
  const board = createBoard(boardSize)
  const limit = Math.min(Math.max(0, upTo), moves.length)
  let last: MoveEntry | null = null

  for (const m of moves) {
    if (m.seq > limit) break
    placeStone(board, m.x, m.y, m.color)
    last = m
  }

  if (last === null) {
    return { board, lastMove: null, winLine: null, winner: null }
  }

  const win = checkWinAt(board, last.x, last.y)
  return {
    board,
    lastMove: last,
    winLine: win !== null ? win.line : null,
    winner: win !== null ? win.winner : null,
  }
}