import { describe, expect, it } from 'vitest'
import { BLACK, WHITE, createBoard, placeStone } from '../board'
import type { Stone } from '../board'
import { checkWinAt, isBoardFull } from '../rules'

function placeLine(board: Stone[][], cells: Array<[number, number]>, color: Stone) {
  for (const [x, y] of cells) placeStone(board, x, y, color)
}

describe('checkWinAt', () => {
  it('水平五连判胜', () => {
    const board = createBoard(15)
    placeLine(board, [[7, 3], [7, 4], [7, 5], [7, 6]], BLACK)
    placeStone(board, 7, 7, BLACK)
    const result = checkWinAt(board, 7, 7)
    expect(result?.winner).toBe(BLACK)
    expect(result?.line).toHaveLength(5)
  })

  it('垂直五连判胜', () => {
    const board = createBoard(15)
    placeLine(board, [[3, 8], [4, 8], [5, 8], [6, 8]], WHITE)
    placeStone(board, 7, 8, WHITE)
    expect(checkWinAt(board, 7, 8)?.winner).toBe(WHITE)
  })

  it('主对角线五连判胜', () => {
    const board = createBoard(15)
    placeLine(board, [[2, 2], [3, 3], [4, 4], [5, 5]], BLACK)
    placeStone(board, 6, 6, BLACK)
    expect(checkWinAt(board, 6, 6)?.winner).toBe(BLACK)
  })

  it('副对角线五连判胜', () => {
    const board = createBoard(15)
    placeLine(board, [[2, 6], [3, 5], [4, 4], [5, 3]], BLACK)
    placeStone(board, 6, 2, BLACK)
    const result = checkWinAt(board, 6, 2)
    expect(result?.winner).toBe(BLACK)
    expect(result?.line).toHaveLength(5)
  })

  it('四连不判胜', () => {
    const board = createBoard(15)
    placeLine(board, [[0, 0], [0, 1], [0, 2], [0, 3]], BLACK)
    placeStone(board, 5, 5, BLACK)
    expect(checkWinAt(board, 5, 5)).toBeNull()
  })

  it('六连同样判胜', () => {
    const board = createBoard(15)
    placeLine(board, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], BLACK)
    placeStone(board, 0, 5, BLACK)
    const result = checkWinAt(board, 0, 5)
    expect(result?.winner).toBe(BLACK)
    expect(result?.line!.length).toBeGreaterThanOrEqual(5)
  })

  it('空位不判胜', () => {
    const board = createBoard(15)
    expect(checkWinAt(board, 0, 0)).toBeNull()
  })
})

describe('isBoardFull', () => {
  it('空盘不满', () => {
    expect(isBoardFull(createBoard(7))).toBe(false)
  })

  it('下满判平局', () => {
    const board = createBoard(7)
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) {
        placeStone(board, x, y, (x + y) % 2 === 0 ? BLACK : WHITE)
      }
    }
    expect(isBoardFull(board)).toBe(true)
  })
})