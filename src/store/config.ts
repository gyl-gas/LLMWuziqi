import { reactive, watch } from 'vue'

export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  enabled: boolean
  note?: string
}

export interface GameConfig {
  boardSize: number
  humanColor: 1 | 2
  mode: 'pvp' | 'human-ai' | 'ai-ai'
  notation: 'plain' | 'numbered'
  autoRequestAi: boolean
  /** AI 对弈：黑方模型（黑棋先手） */
  aiBlack: AiSide | null
  /** AI 对弈：白方模型 */
  aiWhite: AiSide | null
}

/** AI 侧模型引用：providerId + 模型名 */
export interface AiSide {
  providerId: string
  model: string
}

export interface AiBehaviorConfig {
  temperature: number
  maxTokens: number
  timeoutMs: number
  maxAutoRetries: number
  extraPrompt: string
  useJsonMode: boolean
  /** 推理模型是否允许思考过程；false 时向 DeepSeek 等发送 thinking.disabled，避免思考耗尽 max_tokens */
  enableThinking: boolean
}

export interface AppConfig {
  version?: number
  providers: ProviderConfig[]
  active: { providerId: string; model: string } | null
  game: GameConfig
  ai: AiBehaviorConfig
}

const STORAGE_KEY = 'gomoku.config'

/** 配置结构版本，用于旧配置迁移 */
const CONFIG_VERSION = 5

/** 从本地 .env.local 读取的默认 apiKey（demo 便捷注入） */
const defaultApiKey = (import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined) ?? ''
/** 分享用固定预设：打包发布给朋友时，可在说明弹窗中一键配置 */
export interface SharedPreset {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
}

export const SHARED_PRESET: SharedPreset = {
  id: 'deepseek-shared',
  name: 'DeepSeek（分享）',
  // 生产环境直连 DeepSeek（已支持浏览器 CORS）；本地开发也可直连
  baseUrl: 'https://api.deepseek.com',
  apiKey: defaultApiKey,
  models: ['deepseek-v4-flash'],
}

/** 一键应用分享预设：写入/更新 provider 并选中对应模型 */
export function applySharedPreset(): void {
  const existing = config.providers.find((p) => p.id === SHARED_PRESET.id)
  if (existing !== undefined) {
    existing.name = SHARED_PRESET.name
    existing.baseUrl = SHARED_PRESET.baseUrl
    existing.apiKey = SHARED_PRESET.apiKey
    existing.models = [...SHARED_PRESET.models]
    existing.enabled = true
  } else {
    config.providers.unshift({ ...SHARED_PRESET, enabled: true })
  }
  config.active = { providerId: SHARED_PRESET.id, model: SHARED_PRESET.models[0] }
  config.game.aiBlack = { providerId: SHARED_PRESET.id, model: SHARED_PRESET.models[0] }
  config.game.aiWhite = { providerId: SHARED_PRESET.id, model: SHARED_PRESET.models[0] }
}
function defaults(): AppConfig {
  return {
    version: CONFIG_VERSION,
    providers: [
      {
        id: 'deepseek-default',
        name: 'DeepSeek',
        // 生产环境直接连 DeepSeek（已验证支持浏览器 CORS），不依赖本地代理
        baseUrl: 'https://api.deepseek.com',
        apiKey: defaultApiKey,
        models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        enabled: true,
        note: '示例 provider，填入 apiKey 后可用',
      },
    ],
    active: null,
    game: {
      boardSize: 9,
      humanColor: 1,
      mode: 'human-ai',
      notation: 'plain',
      autoRequestAi: true,
      aiBlack: null,
      aiWhite: null,
    },
    ai: {
      temperature: 0.7,
      maxTokens: 300000,
      timeoutMs: 3000000,
      maxAutoRetries: 2,
      extraPrompt: '',
      useJsonMode: true,
      enableThinking: true,
    },
  }
}

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/** 校验 AI 侧模型是否可用（provider 存在、已启用且包含该模型） */
export function isValidAiSide(cfg: AppConfig, side: AiSide | null): side is AiSide {
  if (side === null) return false
  const provider = cfg.providers.find((p) => p.id === side.providerId)
  return provider !== undefined && provider.enabled && provider.models.includes(side.model)
}

/** 返回第一个可用的 provider 模型；无可用模型时返回 null */
export function firstAvailableAiSide(cfg: AppConfig): AiSide | null {
  const first = cfg.providers.find((p) => p.enabled && p.models.length > 0)
  return first === undefined ? null : { providerId: first.id, model: first.models[0] }
}

/** 保证 AI 对弈双方模型有效；无效时回退到第一个可用模型 */
function fillAiSides(cfg: AppConfig): void {
  if (!isValidAiSide(cfg, cfg.game.aiBlack)) cfg.game.aiBlack = firstAvailableAiSide(cfg)
  if (!isValidAiSide(cfg, cfg.game.aiWhite)) cfg.game.aiWhite = firstAvailableAiSide(cfg)
}

/** 未选择模型时自动激活第一个可用的 provider 模型 */
function autoActivate(cfg: AppConfig): void {
  if (cfg.active === null) {
    const first = cfg.providers.find((p) => p.enabled && p.models.length > 0)
    if (first !== undefined) cfg.active = { providerId: first.id, model: first.models[0] }
  }
}

function load(): AppConfig {
  const base = defaults()
  if (!hasStorage()) return base
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      autoActivate(base)
      fillAiSides(base)
      return base
    }
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    const storedVersion = (parsed as { version?: number }).version ?? 1
    const providers = Array.isArray(parsed.providers)
      ? parsed.providers.map((p) => ({ ...p, apiKey: p.apiKey || defaultApiKey }))
      : base.providers
    const cfg: AppConfig = {
      ...base,
      ...parsed,
      providers,
      active: parsed.active ?? base.active,
      game: { ...base.game, ...parsed.game },
      ai: { ...base.ai, ...parsed.ai },
    }
    // 迁移到当前版本：旧默认值升级为新默认（v2 默认 maxTokens 30000 / 超时 300s）
    if (storedVersion < CONFIG_VERSION) {
      if ((parsed.ai?.maxTokens ?? 1024) <= 30000) {
        cfg.ai.maxTokens = base.ai.maxTokens
      }
      if ((parsed.ai?.timeoutMs ?? 60000) <= 300000) {
        cfg.ai.timeoutMs = base.ai.timeoutMs
      }
      if (parsed.ai?.enableThinking === false) {
        cfg.ai.enableThinking = base.ai.enableThinking
      }
      if (parsed.ai?.useJsonMode === false) {
        cfg.ai.useJsonMode = base.ai.useJsonMode
      }
      if (parsed.game?.boardSize === 15) {
        cfg.game.boardSize = base.game.boardSize
      }
      // v5：默认自动重试次数由 1 调整为 2（仅迁移旧默认值）
      if ((parsed.ai?.maxAutoRetries ?? 1) === 1) {
        cfg.ai.maxAutoRetries = base.ai.maxAutoRetries
      }
    }
    cfg.version = CONFIG_VERSION
    autoActivate(cfg)
    fillAiSides(cfg)
    return cfg
  } catch {
    return base
  }
}

const config = reactive<AppConfig>(load())

if (hasStorage()) {
  watch(
    config,
    () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    },
    { deep: true },
  )
}

// providers/模型变化时保证当前模型始终有效；无效则自动切换到第一个可用模型
watch(
  () => config.providers.map((p) => `${p.id}|${p.enabled ? 1 : 0}|${p.models.join(',')}`).join(';'),
  () => {
    // 同步修复 AI 对弈双方模型
    fillAiSides(config)
    const active = config.active
    if (active === null) {
      const first = config.providers.find((p) => p.enabled && p.models.length > 0)
      if (first !== undefined) config.active = { providerId: first.id, model: first.models[0] }
      return
    }
    const provider = config.providers.find((p) => p.id === active.providerId)
    if (provider === undefined || !provider.enabled || !provider.models.includes(active.model)) {
      const first = config.providers.find((p) => p.enabled && p.models.length > 0)
      config.active = first !== undefined ? { providerId: first.id, model: first.models[0] } : null
    }
  },
)

export function useConfig() {
  return { config }
}

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}