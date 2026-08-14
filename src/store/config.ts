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

export type ThinkingLevel = 'none' | 'low' | 'high' | 'max'

/** AI 侧模型引用：providerId + 模型名 */
export interface AiSide {
  providerId: string
  model: string
  /** 仅 AI 对弈使用；未设置时回退到全局默认值 */
  thinkingLevel?: ThinkingLevel
  /** 仅 AI 对弈使用；未设置时回退到全局默认值 */
  temperature?: number
}

export interface AiBehaviorConfig {
  temperature: number
  maxTokens: number
  timeoutMs: number
  maxAutoRetries: number
  extraPrompt: string
  /** 推理模型的默认思考强度 */
  thinkingLevel: ThinkingLevel
}

export interface AppConfig {
  providers: ProviderConfig[]
  active: { providerId: string; model: string } | null
  game: GameConfig
  ai: AiBehaviorConfig
}

const STORAGE_KEY = 'gomoku.config'

function defaults(): AppConfig {
  return {
    providers: [],
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
      thinkingLevel: 'high',
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
    const providers = Array.isArray(parsed.providers)
      ? parsed.providers
      : base.providers
    const cfg: AppConfig = {
      ...base,
      ...parsed,
      providers,
      active: parsed.active ?? base.active,
      game: { ...base.game, ...parsed.game },
      ai: { ...base.ai, ...parsed.ai },
    }
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
