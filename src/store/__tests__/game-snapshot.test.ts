import { beforeEach, describe, expect, it, vi } from 'vitest'

const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v
  },
  removeItem: (k: string) => {
    delete store[k]
  },
})

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  vi.resetModules()
})

describe('棋局暂存', () => {
  it('落子后自动保存，重新加载可恢复棋局', async () => {
    const mod = await import('../game')
    const { state, start, play } = mod.useGame()
    start(9)
    play(4, 4)
    play(5, 5)
    expect(state.moveCount).toBe(2)

    // 模拟页面刷新：重置模块后重新加载
    vi.resetModules()
    const mod2 = await import('../game')
    const { state: state2, restoreSnapshot } = mod2.useGame()
    expect(state2.moveCount).toBe(0)

    expect(restoreSnapshot()).toBe(true)
    expect(state2.boardSize).toBe(9)
    expect(state2.moveCount).toBe(2)
    expect(state2.board[4][4]).toBe(1)
    expect(state2.board[5][5]).toBe(2)
    expect(state2.currentPlayer).toBe(1)
    expect(state2.moves).toHaveLength(2)
    expect(state2.lastMove).toEqual({ seq: 2, color: 2, x: 5, y: 5 })
  })

  it('胜负状态随快照恢复', async () => {
    const mod = await import('../game')
    const { state, start, play } = mod.useGame()
    start(15)
    const seq: Array<[number, number]> = [
      [0, 0], [1, 0],
      [0, 1], [1, 1],
      [0, 2], [1, 2],
      [0, 3], [1, 3],
      [0, 4],
    ]
    for (const [x, y] of seq) play(x, y)
    expect(state.winner).toBe(1)

    vi.resetModules()
    const mod2 = await import('../game')
    const { state: state2, restoreSnapshot } = mod2.useGame()
    expect(restoreSnapshot()).toBe(true)
    expect(state2.winner).toBe(1)
    expect(state2.winLine).not.toBeNull()
    expect(state2.moves).toHaveLength(9)
  })

  it('clearSnapshot 后无法恢复', async () => {
    const mod = await import('../game')
    const { start, play, clearSnapshot } = mod.useGame()
    start(9)
    play(4, 4)
    clearSnapshot()

    vi.resetModules()
    const mod2 = await import('../game')
    expect(mod2.useGame().restoreSnapshot()).toBe(false)
  })

  it('非法快照（越界落子）拒绝恢复', async () => {
    store['gomoku.game'] = JSON.stringify({
      boardSize: 9,
      currentPlayer: 2,
      winner: null,
      isDraw: false,
      winLine: null,
      moveCount: 1,
      moves: [{ seq: 1, color: 1, x: 99, y: 0 }],
      lastMove: null,
      savedAt: Date.now(),
    })
    const mod = await import('../game')
    expect(mod.useGame().restoreSnapshot()).toBe(false)
  })

  it('开始新对局会清除旧暂存', async () => {
    const mod = await import('../game')
    const { start, play } = mod.useGame()
    start(9)
    play(4, 4)
    expect(store['gomoku.game']).toBeDefined()

    start(9)
    expect(store['gomoku.game']).toBeUndefined()
  })
})