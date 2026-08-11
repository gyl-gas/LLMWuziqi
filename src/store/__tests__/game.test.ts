import { beforeEach, describe, expect, it } from 'vitest'
import { BLACK, WHITE } from '../../core/board'
import { useGame } from '../game'

const { state, start, play } = useGame()

beforeEach(() => {
  start(15)
})

describe('useGame / start', () => {
  it('start 重置对局并按尺寸重建棋盘', () => {
    play(7, 7)
    expect(state.moveCount).toBe(1)
    start(9)
    expect(state.boardSize).toBe(9)
    expect(state.moveCount).toBe(0)
    expect(state.winner).toBeNull()
    expect(state.isDraw).toBe(false)
    expect(state.board.every((row) => row.every((cell) => cell === 0))).toBe(true)
  })
})

describe('useGame / play', () => {
  it('黑先手，合法落子后切换到白棋', () => {
    expect(state.currentPlayer).toBe(BLACK)
    expect(play(7, 7)).toBe(true)
    expect(state.board[7][7]).toBe(BLACK)
    expect(state.currentPlayer).toBe(WHITE)
    expect(state.moveCount).toBe(1)
    expect(state.lastMove).toEqual({ seq: 1, color: BLACK, x: 7, y: 7 })
  })

  it('重复落子返回 false 且不切换回合', () => {
    play(7, 7)
    expect(play(7, 7)).toBe(false)
    expect(state.currentPlayer).toBe(WHITE)
    expect(state.moveCount).toBe(1)
  })

  it('黑棋五连后判定胜负并禁止继续落子', () => {
    const sequence: Array<[number, number]> = [
      [0, 0], [1, 0],
      [0, 1], [1, 1],
      [0, 2], [1, 2],
      [0, 3], [1, 3],
      [0, 4],
    ]
    for (const [x, y] of sequence) {
      expect(play(x, y)).toBe(true)
    }
    expect(state.winner).toBe(BLACK)
    expect(state.winLine).not.toBeNull()
    expect(state.currentPlayer).toBe(BLACK)
    expect(play(5, 5)).toBe(false)
    expect(state.moveCount).toBe(9)
  })
})