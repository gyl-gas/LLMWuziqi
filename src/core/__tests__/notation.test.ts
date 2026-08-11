import { describe, expect, it } from 'vitest'
import { BLACK, EMPTY, WHITE, createBoard, placeStone } from '../board'
import {
  colorFromSeq,
  fromNotation,
  toNotation,
  type MoveEntry,
} from '../notation'

const moves: MoveEntry[] = [
  { seq: 1, color: BLACK, x: 0, y: 0 },
  { seq: 2, color: WHITE, x: 1, y: 1 },
  { seq: 3, color: BLACK, x: 2, y: 2 },
]

describe('toNotation / plain', () => {
  it('plain 模式原样返回 0/1/2', () => {
    const board = createBoard(7)
    placeStone(board, 0, 0, BLACK)
    placeStone(board, 1, 1, WHITE)
    const out = toNotation(board, 'plain', moves)
    expect(out[0][0]).toBe(1)
    expect(out[1][1]).toBe(2)
    expect(out[6][6]).toBe(0)
  })
})

describe('toNotation / numbered', () => {
  it('按手数编号：奇黑偶白', () => {
    const board = createBoard(7)
    placeStone(board, 0, 0, BLACK)
    placeStone(board, 1, 1, WHITE)
    placeStone(board, 2, 2, BLACK)
    const out = toNotation(board, 'numbered', moves)
    expect(out[0][0]).toBe(1)
    expect(out[1][1]).toBe(2)
    expect(out[2][2]).toBe(3)
    expect(out[3][3]).toBe(0)
  })

  it('numbered 下被覆盖的编号不存在', () => {
    const board = createBoard(5)
    const out = toNotation(board, 'numbered', [])
    expect(out.every((row) => row.every((cell) => cell === 0))).toBe(true)
  })
})

describe('fromNotation', () => {
  it('plain 还原：1/2 映射，其他值归 0', () => {
    const notation = [
      [1, 2, 0],
      [0, 9, 2],
      [1, 1, 1],
    ]
    const board = fromNotation(notation, 'plain')
    expect(board[0][0]).toBe(BLACK)
    expect(board[0][1]).toBe(WHITE)
    expect(board[1][1]).toBe(EMPTY)
  })

  it('numbered 还原：奇数→黑，偶数→白', () => {
    const notation = [
      [1, 2, 0],
      [3, 4, 0],
      [0, 0, 5],
    ]
    const board = fromNotation(notation, 'numbered')
    expect(board[0][0]).toBe(BLACK)
    expect(board[0][1]).toBe(WHITE)
    expect(board[1][0]).toBe(BLACK)
    expect(board[1][1]).toBe(WHITE)
    expect(board[2][2]).toBe(BLACK)
  })
})

describe('colorFromSeq', () => {
  it('奇数为黑，偶数为白', () => {
    expect(colorFromSeq(1)).toBe(BLACK)
    expect(colorFromSeq(2)).toBe(WHITE)
    expect(colorFromSeq(99)).toBe(BLACK)
    expect(colorFromSeq(100)).toBe(WHITE)
  })
})