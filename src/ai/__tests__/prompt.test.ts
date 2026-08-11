import { describe, expect, it } from 'vitest'
import { BLACK, createBoard, WHITE } from '../../core/board'
import { buildSystemPrompt, buildUserMessage } from '../prompt'

describe('buildSystemPrompt', () => {
  it('包含执色、尺寸、坐标说明与输出格式约束', () => {
    const s = buildSystemPrompt({ boardSize: 15, currentPlayer: BLACK, notation: 'plain' })
    expect(s).toContain('黑棋')
    expect(s).toContain('15 x 15')
    expect(s).toContain('{"color": 1, "x": 行号, "y": 列号}')
    expect(s).toContain('0 表示空位；1 表示黑棋；2 表示白棋')
  })

  it('numbered 模式说明奇黑偶白', () => {
    const s = buildSystemPrompt({ boardSize: 11, currentPlayer: WHITE, notation: 'numbered' })
    expect(s).toContain('白棋')
    expect(s).toContain('奇数表示黑棋')
  })

  it('追加额外提示', () => {
    const s = buildSystemPrompt({ boardSize: 7, currentPlayer: BLACK, notation: 'plain', extraPrompt: '尽量防守' })
    expect(s).toContain('尽量防守')
  })
})

describe('buildUserMessage', () => {
  it('plain 模式输出棋盘与轮次', () => {
    const board = createBoard(7)
    const msg = buildUserMessage(board, [], { boardSize: 7, currentPlayer: BLACK, notation: 'plain' })
    expect(msg).toContain('轮到黑棋')
    expect(msg).toContain('[[0,0,0')
  })

  it('numbered 模式按手数编号', () => {
    const board = createBoard(7)
    board[0][0] = BLACK
    const moves = [{ seq: 1, color: BLACK, x: 0, y: 0 }]
    const msg = buildUserMessage(board, moves, { boardSize: 7, currentPlayer: WHITE, notation: 'numbered' })
    expect(msg).toContain('轮到白棋')
    expect(msg).toContain('[[1,0,0')
  })
})