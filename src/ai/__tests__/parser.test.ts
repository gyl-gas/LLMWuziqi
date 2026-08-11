import { describe, expect, it } from 'vitest'
import { BLACK, createBoard, placeStone, WHITE } from '../../core/board'
import { extractJson, parseAiMove } from '../parser'

describe('extractJson', () => {
  it('从文本中提取 JSON 对象', () => {
    expect(extractJson('好的，落子为 {"color": 1, "x": 0, "y": 1}')).toEqual({ color: 1, x: 0, y: 1 })
  })
  it('无 JSON 返回 null', () => {
    expect(extractJson('没有内容')).toBeNull()
  })
  it('非法 JSON 返回 null', () => {
    expect(extractJson('{"color": 1,')).toBeNull()
  })
})

describe('parseAiMove', () => {
  it('接受纯 JSON 响应', () => {
    const board = createBoard(9)
    const r = parseAiMove('{"color":1,"x":3,"y":4}', 9, BLACK, board)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.move).toEqual({ color: BLACK, x: 3, y: 4 })
  })

  it('从带解释的文本中提取 JSON', () => {
    const board = createBoard(9)
    const r = parseAiMove('我下这里：{"color":1,"x":2,"y":5}', 9, BLACK, board)
    expect(r.ok).toBe(true)
  })

  it('无 JSON 时失败', () => {
    const board = createBoard(9)
    expect(parseAiMove('我想了很久，不知道下哪', 9, BLACK, board).ok).toBe(false)
  })

  it('color 与当前回合不符时失败', () => {
    const board = createBoard(9)
    const r = parseAiMove('{"color":2,"x":3,"y":4}', 9, BLACK, board)
    expect(r.ok).toBe(false)
  })

  it('坐标越界时失败', () => {
    const board = createBoard(9)
    expect(parseAiMove('{"color":1,"x":9,"y":0}', 9, BLACK, board).ok).toBe(false)
    expect(parseAiMove('{"color":1,"x":-1,"y":0}', 9, BLACK, board).ok).toBe(false)
  })

  it('落点已占用时失败', () => {
    const board = createBoard(9)
    placeStone(board, 3, 4, WHITE)
    const r = parseAiMove('{"color":1,"x":3,"y":4}', 9, BLACK, board)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('已有棋子')
  })

  it('非整数坐标时失败', () => {
    const board = createBoard(9)
    expect(parseAiMove('{"color":1,"x":1.5,"y":2}', 9, BLACK, board).ok).toBe(false)
  })
})