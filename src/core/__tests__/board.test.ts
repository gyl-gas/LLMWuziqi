import { describe, expect, it } from 'vitest'
import {
  BLACK,
  EMPTY,
  WHITE,
  cloneBoard,
  createBoard,
  inBounds,
  isValidMove,
  placeStone,
} from '../board'

describe('createBoard', () => {
  it('按尺寸创建全空棋盘', () => {
    const board = createBoard(7)
    expect(board).toHaveLength(7)
    for (const row of board) {
      expect(row).toHaveLength(7)
      expect(row.every((cell) => cell === EMPTY)).toBe(true)
    }
  })
})

describe('placeStone / isValidMove', () => {
  it('在空位正常落子', () => {
    const board = createBoard(9)
    placeStone(board, 3, 4, BLACK)
    expect(board[3][4]).toBe(BLACK)
  })

  it('越界位置非法', () => {
    const board = createBoard(9)
    expect(isValidMove(board, -1, 0)).toBe(false)
    expect(isValidMove(board, 0, 9)).toBe(false)
    expect(isValidMove(board, 9, 0)).toBe(false)
  })

  it('已占用位置非法', () => {
    const board = createBoard(9)
    placeStone(board, 2, 2, WHITE)
    expect(isValidMove(board, 2, 2)).toBe(false)
  })

  it('非法落子抛错', () => {
    const board = createBoard(9)
    placeStone(board, 2, 2, BLACK)
    expect(() => placeStone(board, 2, 2, BLACK)).toThrow()
    expect(() => placeStone(board, 0, 9, BLACK)).toThrow()
    expect(() => placeStone(board, 0, 0, EMPTY)).toThrow()
  })
})

describe('cloneBoard', () => {
  it('深拷贝，修改副本不影响原盘', () => {
    const board = createBoard(5)
    placeStone(board, 1, 1, BLACK)
    const copy = cloneBoard(board)
    copy[1][1] = WHITE
    expect(board[1][1]).toBe(BLACK)
    expect(copy[1][1]).toBe(WHITE)
  })
})

describe('inBounds', () => {
  it('判断坐标是否在界内', () => {
    const board = createBoard(7)
    expect(inBounds(board, 0, 0)).toBe(true)
    expect(inBounds(board, 6, 6)).toBe(true)
    expect(inBounds(board, 7, 0)).toBe(false)
    expect(inBounds(board, 0, -1)).toBe(false)
  })
})