import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '../../store/config'
import { AiRequestError, chatCompletion, fetchModels } from '../client'

const provider: ProviderConfig = {
  id: 'p',
  name: 'P',
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'sk-test',
  models: ['m'],
  enabled: true,
}

const options = { temperature: 0.7, maxTokens: 128, timeoutMs: 5000 }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chatCompletion', () => {
  it('成功请求：拼接 URL、带鉴权头、返回内容与耗时', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"color":1,"x":1,"y":1}' } }] }),
      })),
    )
    const result = await chatCompletion(provider, 'm', [{ role: 'user', content: 'hi' }], options)
    expect(result.content).toBe('{"color":1,"x":1,"y":1}')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('m')
    expect(body.max_tokens).toBe(128)
    expect(body.temperature).toBe(0.7)
  })

  it('推理内容被透传', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"color":1,"x":0,"y":0}', reasoning_content: '分析中' } }] }),
      })),
    )
    const result = await chatCompletion(provider, 'm', [], options)
    expect(result.reasoning).toBe('分析中')
  })

  it('相对 baseUrl（本地代理）直接拼接', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
      })),
    )
    const proxyProvider = { ...provider, baseUrl: '/deepseek' }
    await chatCompletion(proxyProvider, 'm', [], options)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/deepseek/chat/completions')
  })

  it('enableThinking=false 时发送 thinking.disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      })),
    )
    await chatCompletion(provider, 'm', [], { ...options, enableThinking: false })
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.thinking).toEqual({ type: 'disabled' })
  })

  it('未设置 enableThinking 时不发送 thinking 字段', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      })),
    )
    await chatCompletion(provider, 'm', [], options)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.thinking).toBeUndefined()
  })

  it('透传 usage token 用量', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      })),
    )
    const result = await chatCompletion(provider, 'm', [], options)
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 })
  })

  it('透传 finish_reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'x' }, finish_reason: 'length' }] }),
      })),
    )
    const result = await chatCompletion(provider, 'm', [], options)
    expect(result.finishReason).toBe('length')
  })

  it('HTTP 错误抛 http 类型错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })))
    const err = await chatCompletion(provider, 'm', [], options).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiRequestError)
    expect((err as AiRequestError).kind).toBe('http')
  })

  it('网络错误抛 network 类型错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const err = await chatCompletion(provider, 'm', [], options).catch((e: unknown) => e)
    expect((err as AiRequestError).kind).toBe('network')
  })

  it('超时抛 timeout 类型错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        })
      }),
    )
    const err = await chatCompletion(provider, 'm', [], { ...options, timeoutMs: 30 }).catch((e: unknown) => e)
    expect((err as AiRequestError).kind).toBe('timeout')
  })
})

describe('fetchModels', () => {
  it('解析 {data:[{id}]} 格式并请求 {baseUrl}/models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: 'm1' }, { id: 'm2' }] }),
      })),
    )
    const models = await fetchModels(provider)
    expect(models).toEqual(['m1', 'm2'])
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/v1/models')
    expect(fetchMock.mock.calls).toHaveLength(1)
  })

  it('解析 {models:[...]} 与裸数组等中转站格式并去重', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ models: ['m1', 'm1', 'm2'] }),
      })),
    )
    expect(await fetchModels({ ...provider, baseUrl: 'https://relay.example.com' })).toEqual(['m1', 'm2'])

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ['a', 'b', 'a'],
      })),
    )
    expect(await fetchModels(provider)).toEqual(['a', 'b'])
  })

  it('/models 404 且 baseUrl 未带 /v1 时自动重试 /v1/models', async () => {
    const notFound = { ok: false, status: 404, text: async () => 'not found' }
    const found = { ok: true, json: async () => ({ data: [{ id: 'relay-model' }] }) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(notFound).mockResolvedValueOnce(found))

    const baseProvider = { ...provider, baseUrl: 'https://relay.example.com' }
    const models = await fetchModels(baseProvider)
    expect(models).toEqual(['relay-model'])
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock.mock.calls[0][0]).toBe('https://relay.example.com/models')
    expect(fetchMock.mock.calls[1][0]).toBe('https://relay.example.com/v1/models')
  })

  it('baseUrl 已带 /v1 时 404 不重复补 /v1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, text: async () => 'not found' })),
    )
    const err = await fetchModels(provider).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiRequestError)
    expect((err as AiRequestError).kind).toBe('http')
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('空 baseUrl 直接抛 network 错误', async () => {
    const err = await fetchModels({ ...provider, baseUrl: '' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiRequestError)
    expect((err as AiRequestError).kind).toBe('network')
  })
})

describe('chatCompletion 中转站适配', () => {
  it('POST /chat/completions 404 且 baseUrl 未带 /v1 时自动重试 /v1/chat/completions', async () => {
    const notFound = { ok: false, status: 404, text: async () => 'not found' }
    const found = { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(notFound).mockResolvedValueOnce(found))

    const baseProvider = { ...provider, baseUrl: 'https://relay.example.com' }
    const result = await chatCompletion(baseProvider, 'm', [{ role: 'user', content: 'hi' }], options)
    expect(result.content).toBe('ok')
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock.mock.calls[0][0]).toBe('https://relay.example.com/chat/completions')
    expect(fetchMock.mock.calls[1][0]).toBe('https://relay.example.com/v1/chat/completions')
  })
})