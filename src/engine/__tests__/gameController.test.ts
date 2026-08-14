import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../../core/board'
import { useConfig } from '../../store/config'
import { buildExport, parseExport } from '../../store/export'
import { useGameController } from '../gameController'

const storage: Record<string, string> = {}

const { config } = useConfig()
const { state, phase, aiError, newGame, onHumanPlay, restoreGame, resumeGame } = useGameController()

function mockFetch(content: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    })),
  )
}

/** 延迟解析的 AI 响应：用于控制对弈节奏，避免 AI 在断言前连下多手 */
function deferredMove(content: string, delayMs: number) {
  return {
    ok: true,
    json: async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return { choices: [{ message: { content } }] }
    },
  }
}

beforeEach(() => {
  for (const k of Object.keys(storage)) delete storage[k]
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => {
      storage[k] = v
    },
    removeItem: (k: string) => {
      delete storage[k]
    },
  })
  config.providers = [{ id: 'mock', name: 'Mock', baseUrl: 'http://mock/v1', apiKey: 'k', models: ['m'], enabled: true }]
  config.active = { providerId: 'mock', model: 'm' }
  config.game.autoRequestAi = true
  config.game.humanColor = 1
  config.game.notation = 'plain'
  config.ai.maxAutoRetries = 1
  config.ai.timeoutMs = 5000
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useGameController / 人机回合', () => {
  it('人类落子后 AI 自动落子并切回人类回合', async () => {
    mockFetch('{"color":2,"x":7,"y":8}')
    newGame(15)
    expect(phase.value).toBe('humanTurn')

    onHumanPlay(7, 7)
    await vi.waitFor(() => expect(state.moveCount).toBe(2))

    expect(state.board[7][7]).toBe(BLACK)
    expect(state.board[7][8]).toBe(WHITE)
    expect(state.moves[0].source).toBe('human')
    expect(state.moves[1].source).toBe('ai')
    expect(state.moves[1].model).toBe('m')
    expect(phase.value).toBe('humanTurn')
  })

  it('AI 执白先手（人类执白时 AI 先走）', async () => {
    mockFetch('{"color":1,"x":3,"y":3}')
    config.game.humanColor = 2
    newGame(15)
    await vi.waitFor(() => expect(state.moveCount).toBe(1))
    expect(state.board[3][3]).toBe(BLACK)
    expect(phase.value).toBe('humanTurn')
  })

  it('AI 返回非法落子后自动重试，重试成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":2,"x":99,"y":0}' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":2,"x":7,"y":8}' } }] }) })
    vi.stubGlobal('fetch', fetchMock)

    newGame(15)
    onHumanPlay(7, 7)
    await vi.waitFor(() => expect(state.moveCount).toBe(2))

    expect(state.board[7][8]).toBe(WHITE)
    expect(state.moves[1].retries).toBe(1)
    expect(state.aiFailures).toHaveLength(1)
    expect(state.aiFailures[0]).toMatchObject({
      seq: 1,
      moveCount: 1,
      color: WHITE,
      model: 'm',
      status: 'invalid',
      raw: '{"color":2,"x":99,"y":0}',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 第二次请求包含修正提示
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondBody.messages.at(-1).content).toContain('不合法')
  })

  it('自动重试耗尽后自动暂停，手动继续后重新请求', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"color":2,"x":99,"y":0}' } }] }),
      })),
    )
    newGame(15)
    onHumanPlay(7, 7)
    await vi.waitFor(() => expect(phase.value).toBe('paused'))
    expect(state.moveCount).toBe(1)

    resumeGame()
    await vi.waitFor(() => expect(phase.value).toBe('paused'))
    expect(state.moveCount).toBe(1)
    expect(state.aiFailures).toHaveLength(4)
  })

  it('AI 返回空内容时提示并转手动重试', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
      })),
    )
    newGame(15)
    onHumanPlay(7, 7)
    await vi.waitFor(() => expect(phase.value).toBe('paused'))
    expect(state.moveCount).toBe(1)
    expect(aiError.value?.message).toContain('为空')
  })

  it('恢复暂存：未终局默认暂停，继续后由 AI 续走', async () => {
    mockFetch('{"color":2,"x":7,"y":8}')
    storage['gomoku.game'] = JSON.stringify({
      boardSize: 15,
      currentPlayer: 2,
      winner: null,
      isDraw: false,
      winLine: null,
      moveCount: 1,
      moves: [{ seq: 1, color: 1, x: 7, y: 7, source: 'human' }],
      lastMove: { seq: 1, color: 1, x: 7, y: 7, source: 'human' },
      savedAt: Date.now(),
    })

    expect(restoreGame()).toBe(true)
    expect(phase.value).toBe('paused')
    expect(state.moveCount).toBe(1)
    resumeGame()
    await vi.waitFor(() => expect(state.moveCount).toBe(2))
    expect(state.board[7][8]).toBe(WHITE)
    expect(state.moves[1].source).toBe('ai')
    expect(phase.value).toBe('humanTurn')

    // 回归：AI 续走后的快照必须包含完整元数据（source/model/raw/durationMs）
    const saved = JSON.parse(storage['gomoku.game'])
    expect(saved.moves[1].source).toBe('ai')
    expect(saved.moves[1].model).toBe('m')
    expect(saved.moves[1].raw).toContain('7')
    expect(typeof saved.moves[1].durationMs).toBe('number')
  })

  it('恢复暂存：已结束的对局直接进入 over', async () => {
    storage['gomoku.game'] = JSON.stringify({
      boardSize: 15,
      currentPlayer: 1,
      winner: 1,
      isDraw: false,
      winLine: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
      moveCount: 5,
      moves: [
        { seq: 1, color: 1, x: 0, y: 0 },
        { seq: 2, color: 2, x: 1, y: 0 },
        { seq: 3, color: 1, x: 0, y: 1 },
        { seq: 4, color: 2, x: 1, y: 1 },
        { seq: 5, color: 1, x: 0, y: 2 },
      ],
      lastMove: { seq: 5, color: 1, x: 0, y: 2 },
      savedAt: Date.now(),
    })

    expect(restoreGame()).toBe(true)
    expect(state.winner).toBe(BLACK)
    expect(phase.value).toBe('over')
  })

  it('AI 五连后对局结束', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":0,"y":0}' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":0,"y":1}' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":0,"y":2}' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":0,"y":3}' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":0,"y":4}' } }] }) })
    vi.stubGlobal('fetch', fetchMock)
    config.game.humanColor = 2
    newGame(15)
    // AI 执黑先手
    await vi.waitFor(() => expect(state.moveCount).toBe(1))
    expect(state.board[0][0]).toBe(BLACK)
    expect(phase.value).toBe('humanTurn')
    // 人类白棋依次回应，AI 黑棋连成 (0,0)-(0,4)
    for (const y of [0, 1, 2, 3]) {
      onHumanPlay(1, y)
      if (y < 3) {
        await vi.waitFor(() => {
          expect(state.moveCount).toBe(2 * y + 3)
          expect(phase.value).toBe('humanTurn')
        })
      } else {
        await vi.waitFor(() => expect(state.moveCount).toBe(2 * y + 3))
      }
    }
    // 最后一步 AI 黑棋 (0,4) 形成五连
    expect(state.winner).toBe(BLACK)
    expect(phase.value).toBe('over')
  })

  it('AI 响应中的 token 用量记录到棋谱', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"color":2,"x":7,"y":8}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      })),
    )
    newGame(15)
    onHumanPlay(7, 7)
    await vi.waitFor(() => expect(state.moveCount).toBe(2))
    expect(state.moves[1].promptTokens).toBe(100)
    expect(state.moves[1].completionTokens).toBe(50)
    expect(state.moves[1].totalTokens).toBe(150)
  })
})

describe('useGameController / AI 对弈', () => {
  const { gameNotice, resumeGame, pauseGame } = useGameController()

  beforeEach(() => {
    config.game.mode = 'ai-ai'
    config.game.aiBlack = { providerId: 'mock', model: 'm' }
    config.game.aiWhite = { providerId: 'mock', model: 'm' }
  })

  afterEach(() => {
    config.game.mode = 'human-ai'
  })

  it('newGame 后黑方 AI 先手，双方自动轮流落子', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":7,"y":7}' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":2,"x":7,"y":8}' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":8,"y":8}' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":2,"x":8,"y":9}' } }] }) })
    vi.stubGlobal('fetch', fetchMock)

    newGame(15)
    await vi.waitFor(() => expect(state.moveCount).toBe(4))
    expect(state.board[7][7]).toBe(BLACK)
    expect(state.board[7][8]).toBe(WHITE)
    expect(state.board[8][8]).toBe(BLACK)
    expect(state.board[8][9]).toBe(WHITE)
    expect(state.moves[0].source).toBe('ai')
    expect(state.moves[0].model).toBe('m')
    expect(state.moves[1].model).toBe('m')
  })

  it('黑方五连后对局结束，不再发起模型调用', async () => {
    const fetchMock = vi.fn()
    for (let y = 0; y < 5; y++) {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":0,"y":' + y + '}' } }] }) })
      if (y < 4) {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":2,"x":1,"y":' + y + '}' } }] }) })
      }
    }
    vi.stubGlobal('fetch', fetchMock)

    newGame(15)
    await vi.waitFor(() => expect(state.winner).toBe(BLACK))
    expect(phase.value).toBe('over')
    expect(state.moveCount).toBe(9)
    expect(fetchMock).toHaveBeenCalledTimes(9)
  })

  it('某方重试耗尽后自动暂停且不判负', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"color":1,"x":99,"y":0}' } }] }),
      })),
    )
    config.ai.maxAutoRetries = 2

    newGame(15)
    await vi.waitFor(() => expect(phase.value).toBe('paused'))
    expect(state.winner).toBeNull()
    expect(state.moveCount).toBe(0)
    expect(state.aiFailures).toHaveLength(3)
    expect(state.aiFailures.every((failure) => failure.status === 'invalid')).toBe(true)
    expect(gameNotice.value).toBeNull()
  })

  it('某方未配置模型时直接判对方获胜且不调用模型', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    config.game.aiBlack = null

    newGame(15)
    await vi.waitFor(() => expect(phase.value).toBe('over'))
    expect(state.winner).toBe(WHITE)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('恢复暂存：AI 对弈未终局默认暂停，继续后恢复自动对弈', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":2,"x":7,"y":8}' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":7,"y":9}' } }] }) })
    vi.stubGlobal('fetch', fetchMock)

    storage['gomoku.game'] = JSON.stringify({
      boardSize: 15,
      currentPlayer: 2,
      winner: null,
      isDraw: false,
      winLine: null,
      moveCount: 1,
      moves: [{ seq: 1, color: 1, x: 7, y: 7, source: 'ai', model: 'm' }],
      lastMove: { seq: 1, color: 1, x: 7, y: 7, source: 'ai', model: 'm' },
      savedAt: Date.now(),
    })

    expect(restoreGame()).toBe(true)
    expect(phase.value).toBe('paused')
    expect(state.moveCount).toBe(1)
    resumeGame()
    await vi.waitFor(() => expect(state.moveCount).toBe(3))
    expect(state.board[7][8]).toBe(WHITE)
    expect(state.board[7][9]).toBe(BLACK)
  })

  it('暂停时 AI 正在重试：停止后续请求，不落子不判负', async () => {
    const fetchMock = vi.fn()
    // 黑方第一次返回非法落子（触发重试），延迟确保暂停能插在重试发起前
    fetchMock.mockResolvedValueOnce(deferredMove('{"color":1,"x":99,"y":0}', 200))
    vi.stubGlobal('fetch', fetchMock)
    config.game.aiBlack = { providerId: 'mock', model: 'm' }
    config.game.aiWhite = { providerId: 'mock', model: 'm' }

    newGame(15)
    // 等第一手请求在途后暂停
    await new Promise((resolve) => setTimeout(resolve, 50))
    pauseGame()
    // 等第一手返回（非法落子）：不应重试、不应判负
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(state.moveCount).toBe(0)
    expect(state.winner).toBeNull()
    expect(phase.value).toBe('paused')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('useGameController / 暂停与继续', () => {
  const { pauseGame, resumeGame } = useGameController()

  afterEach(() => {
    config.game.mode = 'human-ai'
  })

  it('AI 对弈暂停后放行在途请求但不再发起下一步，继续后恢复', async () => {
    const contents = [
      '{"color":1,"x":7,"y":7}',
      '{"color":2,"x":7,"y":8}',
      '{"color":1,"x":8,"y":8}',
      '{"color":2,"x":8,"y":9}',
    ]
    const fetchMock = vi.fn()
    // 前两手延迟较长：确保 waitFor 能稳定捕捉到第 1 手后再暂停，同时第 2 手仍在途
    fetchMock.mockResolvedValueOnce(deferredMove(contents[0], 200))
    fetchMock.mockResolvedValueOnce(deferredMove(contents[1], 200))
    for (const c of contents.slice(2)) {
      fetchMock.mockResolvedValueOnce(deferredMove(c, 30))
    }
    vi.stubGlobal('fetch', fetchMock)
    config.game.mode = 'ai-ai'
    config.game.aiBlack = { providerId: 'mock', model: 'm' }
    config.game.aiWhite = { providerId: 'mock', model: 'm' }

    newGame(15)
    await vi.waitFor(() => expect(state.moveCount).toBe(1))
    pauseGame()
    // 在途的白方请求仍会落子，但黑方不再自动发起
    await vi.waitFor(() => expect(state.moveCount).toBe(2))
    expect(phase.value).toBe('paused')

    resumeGame()
    await vi.waitFor(() => expect(state.moveCount).toBe(3))
    expect(state.board[8][8]).toBe(BLACK)
  })

  it('暂停后棋盘不可落子，继续后恢复人类回合', async () => {
    config.game.mode = 'pvp'
    newGame(15)
    expect(phase.value).toBe('humanTurn')
    pauseGame()
    expect(phase.value).toBe('paused')
    onHumanPlay(7, 7)
    expect(state.moveCount).toBe(0)
    resumeGame()
    expect(phase.value).toBe('humanTurn')
    onHumanPlay(7, 7)
    expect(state.moveCount).toBe(1)
  })
  it('人机对战暂停后可代替 AI 落子，继续后恢复 AI 自动落子', async () => {
    mockFetch('{"color":2,"x":8,"y":9}')
    config.game.mode = 'human-ai'
    config.game.humanColor = 1
    newGame(15)
    expect(phase.value).toBe('humanTurn')
    pauseGame()
    expect(phase.value).toBe('paused')
    onHumanPlay(7, 7)
    expect(state.moveCount).toBe(1)
    expect(state.currentPlayer).toBe(WHITE)
    onHumanPlay(7, 8)
    expect(state.moveCount).toBe(2)
    expect(state.currentPlayer).toBe(BLACK)
    resumeGame()
    expect(phase.value).toBe('humanTurn')
    onHumanPlay(8, 8)
    await vi.waitFor(() => expect(state.moveCount).toBe(4))
    expect(state.moves[3].source).toBe('ai')
  })

  it('暂停时替 AI 落子后，在途 AI 请求不再落子', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(deferredMove('{"color":2,"x":7,"y":8}', 150)))
    config.game.mode = 'human-ai'
    config.game.humanColor = 1
    newGame(15)
    onHumanPlay(7, 7)
    await vi.waitFor(() => expect(phase.value).toBe('aiThinking'))
    pauseGame()
    onHumanPlay(7, 8)
    expect(state.moveCount).toBe(2)
    expect(state.currentPlayer).toBe(BLACK)
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(state.moveCount).toBe(2)
    expect(state.currentPlayer).toBe(BLACK)
    resumeGame()
    expect(phase.value).toBe('humanTurn')
  })

  it('暂停接管后继续，旧 AI 请求不与新一轮请求双重落子', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(deferredMove('{"color":2,"x":7,"y":8}', 150))
    fetchMock.mockResolvedValueOnce(deferredMove('{"color":2,"x":8,"y":9}', 30))
    vi.stubGlobal('fetch', fetchMock)
    config.game.mode = 'human-ai'
    config.game.humanColor = 1
    newGame(15)
    onHumanPlay(7, 7)
    await vi.waitFor(() => expect(phase.value).toBe('aiThinking'))
    pauseGame()
    onHumanPlay(7, 8)
    resumeGame()
    expect(phase.value).toBe('humanTurn')
    onHumanPlay(8, 8)
    await vi.waitFor(() => expect(state.moveCount).toBe(4))
    expect(state.moves[3]).toMatchObject({ source: 'ai', x: 8, y: 9 })
  })
})

describe('useGameController / 悔棋', () => {
  const { undoMove, resumeGame } = useGameController()

  afterEach(() => {
    config.game.mode = 'human-ai'
  })

  it('双人对战悔棋后回到人类回合', () => {
    config.game.mode = 'pvp'
    newGame(15)
    onHumanPlay(7, 7)
    onHumanPlay(8, 8)
    expect(state.moveCount).toBe(2)
    expect(state.currentPlayer).toBe(BLACK)

    expect(undoMove()).toBe(true)
    expect(state.moveCount).toBe(1)
    expect(state.board[8][8]).toBe(0)
    expect(state.currentPlayer).toBe(WHITE)
    expect(phase.value).toBe('humanTurn')
  })

  it('人机对战撤销 AI 最后一手后暂停，继续后 AI 重新落子', async () => {
    mockFetch('{"color":2,"x":7,"y":8}')
    newGame(15)
    onHumanPlay(7, 7)
    await vi.waitFor(() => expect(state.moveCount).toBe(2))
    expect(state.board[7][8]).toBe(WHITE)
    expect(state.currentPlayer).toBe(BLACK)

    expect(undoMove()).toBe(true)
    expect(state.moveCount).toBe(1)
    expect(state.board[7][8]).toBe(0)
    expect(state.currentPlayer).toBe(WHITE)
    expect(phase.value).toBe('paused')

    resumeGame()
    await vi.waitFor(() => expect(state.moveCount).toBe(2))
    expect(state.board[7][8]).toBe(WHITE)
    expect(phase.value).toBe('humanTurn')
  })

  it('终局后可悔棋：撤销制胜一手并继续对局', () => {
    config.game.mode = 'pvp'
    newGame(15)
    const sequence: Array<[number, number]> = [
      [0, 0], [1, 0],
      [0, 1], [1, 1],
      [0, 2], [1, 2],
      [0, 3], [1, 3],
      [0, 4],
    ]
    for (const [x, y] of sequence) {
      onHumanPlay(x, y)
    }
    expect(state.winner).toBe(BLACK)
    expect(phase.value).toBe('over')

    expect(undoMove()).toBe(true)
    expect(state.winner).toBeNull()
    expect(state.winLine).toBeNull()
    expect(state.moveCount).toBe(8)
    expect(phase.value).toBe('humanTurn')
    onHumanPlay(1, 4)
    expect(state.moveCount).toBe(9)
  })

  it('AI 对弈中悔棋后暂停，继续后由当前方重新落子', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":7,"y":7}' } }] }) })
      .mockResolvedValueOnce(deferredMove('{"color":2,"x":7,"y":8}', 200))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"color":1,"x":3,"y":3}' } }] }) })
    vi.stubGlobal('fetch', fetchMock)
    config.game.mode = 'ai-ai'
    config.game.aiBlack = { providerId: 'mock', model: 'm' }
    config.game.aiWhite = { providerId: 'mock', model: 'm' }
    newGame(15)
    await vi.waitFor(() => expect(state.moveCount).toBe(1))
    expect(state.board[7][7]).toBe(BLACK)

    expect(undoMove()).toBe(true)
    expect(state.moveCount).toBe(0)
    expect(state.currentPlayer).toBe(BLACK)
    expect(phase.value).toBe('paused')

    resumeGame()
    await vi.waitFor(() => expect(state.moveCount).toBe(1))
    expect(state.board[3][3]).toBe(BLACK)
    expect(state.currentPlayer).toBe(WHITE)
  })
})

describe('useGameController / 导入导出', () => {
  const { importGame, resumeGame } = useGameController()

  afterEach(() => {
    config.game.mode = 'human-ai'
  })

  it('导入未结束的对局：进入暂停等待配置，继续后由 AI 续走', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"color":2,"x":7,"y":8}' } }] }),
      })),
    )
    config.game.mode = 'human-ai'
    config.game.humanColor = 1
    const data = buildExport(
      {
        boardSize: 15,
        currentPlayer: 2,
        winner: null,
        isDraw: false,
        winLine: null,
        moveCount: 1,
        moves: [{ seq: 1, color: 1, x: 7, y: 7, source: 'human' }],
        lastMove: { seq: 1, color: 1, x: 7, y: 7, source: 'human' },
        savedAt: 0,
      },
      config.game,
    )

    expect(importGame(data)).toBe(true)
    expect(state.moveCount).toBe(1)
    expect(phase.value).toBe('paused')

    resumeGame()
    await vi.waitFor(() => expect(state.moveCount).toBe(2))
    expect(state.board[7][8]).toBe(WHITE)
  })

  it('导入已结束的对局：保持结束状态且不发起模型调用', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    config.game.mode = 'human-ai'
    const data = buildExport(
      {
        boardSize: 15,
        currentPlayer: 1,
        winner: 1,
        isDraw: false,
        winLine: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
        moveCount: 5,
        moves: [
          { seq: 1, color: 1, x: 0, y: 0 },
          { seq: 2, color: 2, x: 1, y: 0 },
          { seq: 3, color: 1, x: 0, y: 1 },
          { seq: 4, color: 2, x: 1, y: 1 },
          { seq: 5, color: 1, x: 0, y: 2 },
        ],
        lastMove: { seq: 5, color: 1, x: 0, y: 2 },
        savedAt: 0,
      },
      config.game,
    )

    expect(importGame(data)).toBe(true)
    expect(state.winner).toBe(BLACK)
    expect(phase.value).toBe('over')
    expect(fetchMock).not.toHaveBeenCalled()
    resumeGame()
    expect(phase.value).toBe('over')
  })

  it('导出文件经 parseExport 可还原，非法文件被拒绝', () => {
    const data = buildExport(
      {
        boardSize: 9,
        currentPlayer: 2,
        winner: null,
        isDraw: false,
        winLine: null,
        moveCount: 1,
        moves: [{ seq: 1, color: 1, x: 4, y: 4, source: 'ai', model: 'm', totalTokens: 42 }],
        lastMove: { seq: 1, color: 1, x: 4, y: 4, source: 'ai', model: 'm', totalTokens: 42 },
        savedAt: 123,
      },
      config.game,
    )
    const parsed = parseExport(JSON.stringify(data))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.snapshot.moves[0].totalTokens).toBe(42)
      expect(parsed.data.boardSize).toBe(9)
      expect(parsed.data.mode).toBe(config.game.mode)
    }
    const bad = parseExport('{"format":"gomoku-export","version":999}')
    expect(bad.ok).toBe(false)
  })
})
