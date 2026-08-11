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

describe('config load migration', () => {
  it('旧配置（无版本号）迁移到 v3 默认：maxTokens 300000、超时 3000s、思考/JSON 开启', async () => {
    store['gomoku.config'] = JSON.stringify({
      providers: [{ id: 'p1', name: 'x', baseUrl: '/deepseek', apiKey: '', models: ['m'], enabled: true }],
      active: null,
      ai: { maxTokens: 256, timeoutMs: 60000, enableThinking: false, useJsonMode: false },
    })
    const { useConfig } = await import('../../store/config')
    const { config } = useConfig()
    expect(config.ai.maxTokens).toBe(300000)
    expect(config.ai.timeoutMs).toBe(3000000)
    expect(config.ai.enableThinking).toBe(true)
    expect(config.ai.useJsonMode).toBe(true)
    expect(config.game.boardSize).toBe(9)
  })

  it('v2 配置（30000 / 300s）迁移到 v3 默认', async () => {
    store['gomoku.config'] = JSON.stringify({
      version: 2,
      providers: [{ id: 'p1', name: 'x', baseUrl: '/deepseek', apiKey: '', models: ['m'], enabled: true }],
      active: null,
      ai: { maxTokens: 30000, timeoutMs: 300000, enableThinking: true, useJsonMode: true },
      game: { boardSize: 15 },
    })
    const { useConfig } = await import('../../store/config')
    const { config } = useConfig()
    expect(config.ai.maxTokens).toBe(300000)
    expect(config.ai.timeoutMs).toBe(3000000)
    expect(config.game.boardSize).toBe(9)
  })

  it('v5 配置保持不变', async () => {
    store['gomoku.config'] = JSON.stringify({
      version: 5,
      providers: [{ id: 'p1', name: 'x', baseUrl: '/deepseek', apiKey: '', models: ['m'], enabled: true }],
      active: null,
      ai: { maxTokens: 300000, timeoutMs: 3000000, enableThinking: true, useJsonMode: true },
      game: { boardSize: 9 },
    })
    const { useConfig } = await import('../../store/config')
    const { config } = useConfig()
    expect(config.ai.maxTokens).toBe(300000)
    expect(config.ai.timeoutMs).toBe(3000000)
    expect(config.game.boardSize).toBe(9)
  })

  it('v4 配置迁移到 v5：自动重试次数 1 → 2，并补齐 AI 对弈双方模型', async () => {
    store['gomoku.config'] = JSON.stringify({
      version: 4,
      providers: [{ id: 'p1', name: 'x', baseUrl: '/deepseek', apiKey: '', models: ['m'], enabled: true }],
      active: null,
      ai: { maxTokens: 300000, timeoutMs: 3000000, enableThinking: true, useJsonMode: true, maxAutoRetries: 1 },
      game: { boardSize: 9 },
    })
    const { useConfig } = await import('../../store/config')
    const { config } = useConfig()
    expect(config.ai.maxAutoRetries).toBe(2)
    expect(config.game.aiBlack).toEqual({ providerId: 'p1', model: 'm' })
    expect(config.game.aiWhite).toEqual({ providerId: 'p1', model: 'm' })
  })

  it('v5 配置中用户手动设回 1 的重试次数不被覆盖', async () => {
    store['gomoku.config'] = JSON.stringify({
      version: 5,
      providers: [{ id: 'p1', name: 'x', baseUrl: '/deepseek', apiKey: '', models: ['m'], enabled: true }],
      active: null,
      ai: { maxTokens: 300000, timeoutMs: 3000000, enableThinking: true, useJsonMode: true, maxAutoRetries: 1 },
      game: { boardSize: 9 },
    })
    const { useConfig } = await import('../../store/config')
    const { config } = useConfig()
    expect(config.ai.maxAutoRetries).toBe(1)
  })

  it('用户手动改大的超时不被覆盖', async () => {
    store['gomoku.config'] = JSON.stringify({
      version: 4,
      providers: [{ id: 'p1', name: 'x', baseUrl: '/deepseek', apiKey: '', models: ['m'], enabled: true }],
      active: null,
      ai: { maxTokens: 300000, timeoutMs: 600000 },
    })
    const { useConfig } = await import('../../store/config')
    expect(useConfig().config.ai.timeoutMs).toBe(600000)
  })
})