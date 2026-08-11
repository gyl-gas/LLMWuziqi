import { describe, expect, it } from 'vitest'
import { BLACK, WHITE } from '../board'
import type { MoveEntry } from '../notation'
import { replayViewAt } from '../replay'

const moves: MoveEntry[] = [
  { seq: 1, color: BLACK, x: 0, y: 0 },
  { seq: 2, color: WHITE, x: 1, y: 1 },
  { seq: 3, color: BLACK, x: 2, y: 2 },
]

describe('replayViewAt', () => {
  it('重建到指定手数', () => {
    const view = replayViewAt(9, moves, 2)
    expect(view.board[0][0]).toBe(BLACK)
    expect(view.board[1][1]).toBe(WHITE)
    expect(view.board[2][2]).toBe(0)
    expect(view.lastMove).toEqual(moves[1])
  })

  it('upTo 越界截断到最后一手', () => {
    const view = replayViewAt(9, moves, 99)
    expect(view.board[2][2]).toBe(BLACK)
    expect(view.lastMove).toEqual(moves[2])
  })

  it('upTo=0 返回空盘', () => {
    const view = replayViewAt(9, moves, 0)
    expect(view.lastMove).toBeNull()
    expect(view.board.every((r) => r.every((c) => c === 0))).toBe(true)
  })

  it('复盘到五连手时高亮连线并给出胜方', () => {
    const five: MoveEntry[] = [
      { seq: 1, color: BLACK, x: 0, y: 0 },
      { seq: 2, color: WHITE, x: 1, y: 0 },
      { seq: 3, color: BLACK, x: 0, y: 1 },
      { seq: 4, color: WHITE, x: 1, y: 1 },
      { seq: 5, color: BLACK, x: 0, y: 2 },
      { seq: 6, color: WHITE, x: 1, y: 2 },
      { seq: 7, color: BLACK, x: 0, y: 3 },
      { seq: 8, color: WHITE, x: 1, y: 3 },
      { seq: 9, color: BLACK, x: 0, y: 4 },
    ]
    const view = replayViewAt(15, five, 9)
    expect(view.winner).toBe(BLACK)
    expect(view.winLine).not.toBeNull()
    expect(view.winLine!.length).toBeGreaterThanOrEqual(5)
  })
})