import type { ProviderConfig } from '../store/config'
import type { TokenUsage } from './types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  temperature: number
  maxTokens: number
  timeoutMs: number
  useJsonMode?: boolean
  /** 推理模型是否允许思考；false 时发送 thinking.disabled（DeepSeek 等支持） */
  enableThinking?: boolean
}

export interface ChatResult {
  content: string
  reasoning?: string
  finishReason?: string
  durationMs: number
  /** token 用量（服务商返回 usage 字段时提供） */
  usage?: TokenUsage
}

export type RequestFailKind = 'timeout' | 'network' | 'http'

export class AiRequestError extends Error {
  readonly kind: RequestFailKind

  constructor(kind: RequestFailKind, message: string) {
    super(message)
    this.name = 'AiRequestError'
    this.kind = kind
  }
}

/** 调用 OpenAI 兼容 /chat/completions，返回原始内容与推理内容 */
export async function chatCompletion(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<ChatResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  const startTime = Date.now()

  try {
    const baseUrl = provider.baseUrl.trim().replace(/\/+$/, '')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }
    if (options.useJsonMode === true) {
      body.response_format = { type: 'json_object' }
    }
    if (options.enableThinking === false) {
      // DeepSeek 推理模型扩展：关闭思考，直接输出最终内容
      body.thinking = { type: 'disabled' }
    }

    let response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    // 中转站适配：部分中转服务只在 /v1 下挂载 OpenAI 兼容接口，404 时补 /v1 重试一次
    if (response.status === 404 && !/\/v1$/.test(baseUrl)) {
      const v1Response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (v1Response.ok) response = v1Response
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new AiRequestError('http', `HTTP ${response.status}${text ? `：${text.slice(0, 300)}` : ''}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string; reasoning_content?: string; reasoning?: string }
        finish_reason?: string
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    const choice = data.choices?.[0]
    const content = choice?.message?.content ?? ''
    const reasoning = choice?.message?.reasoning_content ?? choice?.message?.reasoning
    const finishReason = choice?.finish_reason
    const rawUsage = data.usage
    const usage: TokenUsage | undefined =
      rawUsage === undefined ||
      (rawUsage.prompt_tokens === undefined &&
        rawUsage.completion_tokens === undefined &&
        rawUsage.total_tokens === undefined)
        ? undefined
        : {
            promptTokens: rawUsage.prompt_tokens,
            completionTokens: rawUsage.completion_tokens,
            totalTokens: rawUsage.total_tokens,
          }
    return { content, reasoning, finishReason, durationMs: Date.now() - startTime, usage }
  } catch (err) {
    if (err instanceof AiRequestError) throw err
    const isAbort = (err as Error)?.name === 'AbortError'
    throw new AiRequestError(
      isAbort ? 'timeout' : 'network',
      isAbort ? `请求超时（${options.timeoutMs}ms）` : `网络错误：${(err as Error)?.message ?? String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }
}

const MODELS_TIMEOUT_MS = 30000

/** 从返回载荷中提取模型 id 列表（兼容 {data:[{id}]} / {models:[...]} / 裸数组等中转站常见格式） */
function extractModelIds(payload: unknown): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (v: unknown) => {
    let id = ''
    if (typeof v === 'string') {
      id = v.trim()
    } else if (typeof v === 'object' && v !== null) {
      const candidate = (v as Record<string, unknown>).id
      if (typeof candidate === 'string') id = candidate.trim()
    }
    if (id !== '' && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  if (Array.isArray(payload)) {
    payload.forEach(push)
    return ids
  }
  if (typeof payload === 'object' && payload !== null) {
    const o = payload as Record<string, unknown>
    if (Array.isArray(o.data)) o.data.forEach(push)
    if (Array.isArray(o.models)) o.models.forEach(push)
  }
  return ids
}

/** 从 Base URL 拉取可用模型列表（OpenAI 兼容 GET /models，适配中转站路径与返回格式） */
export async function fetchModels(provider: ProviderConfig): Promise<string[]> {
  const baseUrl = provider.baseUrl.trim().replace(/\/+$/, '')
  if (baseUrl === '') throw new AiRequestError('network', '请先填写 Base URL')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (provider.apiKey.trim() !== '') {
    headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`
  }

  try {
    let response = await fetch(`${baseUrl}/models`, { headers, signal: controller.signal })
    // 中转站适配：Base URL 未带 /v1 时 /models 404，则尝试 /v1/models
    if (response.status === 404 && !/\/v1$/.test(baseUrl)) {
      const v1Response = await fetch(`${baseUrl}/v1/models`, { headers, signal: controller.signal })
      if (v1Response.ok) response = v1Response
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new AiRequestError('http', `HTTP ${response.status}${text ? `：${text.slice(0, 300)}` : ''}`)
    }
    const data = (await response.json()) as unknown
    return extractModelIds(data)
  } catch (err) {
    if (err instanceof AiRequestError) throw err
    const isAbort = (err as Error)?.name === 'AbortError'
    throw new AiRequestError(
      isAbort ? 'timeout' : 'network',
      isAbort ? `请求超时（${MODELS_TIMEOUT_MS}ms）` : `网络错误：${(err as Error)?.message ?? String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }
}