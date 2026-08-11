import { ref, watch } from 'vue'
import { useGame } from '../store/game'
import { useConfig } from '../store/config'
import type { ProviderConfig } from '../store/config'
import { BLACK } from '../core/board'
import type { Stone } from '../core/board'
import { AiRequestError, chatCompletion } from '../ai/client'
import type { ChatMessage } from '../ai/client'
import { buildSystemPrompt, buildUserMessage } from '../ai/prompt'
import { parseAiMove } from '../ai/parser'
import type { AiTurnResult } from '../ai/types'
import type { ExportedGame } from '../store/export'

export type GamePhase = 'humanTurn' | 'aiThinking' | 'aiRetry' | 'paused' | 'over'

export interface RetryInfo {
  kind: string
  message: string
  raw?: string
  attempt: number
}

interface AiTarget {
  provider: ProviderConfig
  model: string
}

interface AiContext {
  target: AiTarget
  messages: ChatMessage[]
  attempt: number
}

const { state, start, play, forfeit, restoreSnapshot, importSnapshot } = useGame()
const { config } = useConfig()

const phase = ref<GamePhase>('humanTurn')
const aiError = ref<RetryInfo | null>(null)
const aiElapsed = ref(0)
/** 对局备注（如 AI 对弈中某方判负原因），终局时展示 */
const gameNotice = ref<string | null>(null)
/** 是否暂停：放行在途请求，但不再发起下一次落子 */
const paused = ref(false)
let aiTimer: ReturnType<typeof setInterval> | null = null
let aiTimerOwner = 0
let lastContext: AiContext | null = null
/** 对局代次：新开/恢复对局时递增，用于丢弃过期 AI 回合的异步结果 */
let gameVersion = 0

/** 启动思考计时，返回本次计时器归属号；AI 对弈后一手会开启新计时器 */
function startAiTimer(): number {
  aiTimerOwner += 1
  const owner = aiTimerOwner
  aiElapsed.value = 0
  if (aiTimer !== null) clearInterval(aiTimer)
  aiTimer = setInterval(() => {
    aiElapsed.value = Math.round((aiElapsed.value + 0.1) * 10) / 10
  }, 100)
  return owner
}

/** 停止计时；传 owner 时只停止归属本次调用的计时器（避免误停后一手已启动的新计时器） */
function stopAiTimer(owner?: number) {
  if (owner !== undefined && owner !== aiTimerOwner) return
  if (aiTimer !== null) {
    clearInterval(aiTimer)
    aiTimer = null
  }
}

/** 解析 providerId + model 为可用 AI 目标；不可用返回 null */
function resolveTarget(providerId: string | undefined, model: string | undefined): AiTarget | null {
  if (providerId === undefined || model === undefined) return null
  const provider = config.providers.find((p) => p.id === providerId)
  if (provider === undefined || !provider.enabled) return null
  if (!provider.models.includes(model)) return null
  return { provider, model }
}

/** 根据当前回合选择 AI 目标：ai-ai 按执色取双方模型，human-ai 用全局 active 模型 */
function targetForCurrentPlayer(): AiTarget | null {
  if (config.game.mode === 'ai-ai') {
    const side = state.currentPlayer === BLACK ? config.game.aiBlack : config.game.aiWhite
    if (side === null) return null
    return resolveTarget(side.providerId, side.model)
  }
  return resolveTarget(config.active?.providerId, config.active?.model)
}

function buildInitialMessages(): ChatMessage[] {
  const currentPlayer = state.currentPlayer
  return [
    {
      role: 'system',
      content: buildSystemPrompt({
        boardSize: state.boardSize,
        currentPlayer,
        notation: config.game.notation,
        extraPrompt: config.ai.extraPrompt,
      }),
    },
    {
      role: 'user',
      content: buildUserMessage(state.board, state.moves, {
        boardSize: state.boardSize,
        currentPlayer,
        notation: config.game.notation,
      }),
    },
  ]
}

async function attemptOnce(target: AiTarget, messages: ChatMessage[]): Promise<AiTurnResult> {
  try {
    const chat = await chatCompletion(target.provider, target.model, messages, {
      temperature: config.ai.temperature,
      maxTokens: config.ai.maxTokens,
      timeoutMs: config.ai.timeoutMs,
      useJsonMode: config.ai.useJsonMode,
      enableThinking: config.ai.enableThinking,
    })
    if (chat.content.trim() === '') {
      const hint =
        '模型返回内容为空。若是推理模型，通常是因为思考过程耗尽了 max_tokens 预算：请在「模型配置 → AI 参数」中关闭「允许思考」，或增大 max_tokens。'
      return { status: 'parse', message: hint, raw: chat.content, durationMs: chat.durationMs }
    }
    const parsed = parseAiMove(chat.content, state.boardSize, state.currentPlayer, state.board)
    if (!parsed.ok) {
      return { status: 'invalid', message: parsed.reason, raw: chat.content, durationMs: chat.durationMs }
    }
    return {
      status: 'ok',
      move: parsed.move,
      raw: chat.content,
      reasoning: chat.reasoning,
      durationMs: chat.durationMs,
      usage: chat.usage,
    }
  } catch (err) {
    if (err instanceof AiRequestError) {
      return { status: err.kind, message: err.message, durationMs: 0 }
    }
    return { status: 'network', message: `未知错误：${(err as Error).message}`, durationMs: 0 }
  }
}

/** 修正式重试：把错误响应作为 assistant 消息追加，并提示 AI 修正 */
function appendCorrection(messages: ChatMessage[], result: { message: string; raw?: string }): ChatMessage[] {
  const next = messages.slice()
  if (result.raw !== undefined && result.raw !== '') {
    next.push({ role: 'assistant', content: result.raw })
  }
  next.push({
    role: 'user',
    content: `你上一步返回的落子不合法：${result.message}。请重新输出一个符合要求的 JSON 落子，只输出 JSON。`,
  })
  return next
}

function applyAiMove(result: AiTurnResult & { status: 'ok' }, target: AiTarget, retries: number) {
  const applied = play(result.move.x, result.move.y, {
    source: 'ai',
    model: target.model,
    raw: result.raw,
    reasoning: result.reasoning,
    durationMs: result.durationMs,
    retries,
    promptTokens: result.usage?.promptTokens,
    completionTokens: result.usage?.completionTokens,
    totalTokens: result.usage?.totalTokens,
  })
  if (!applied) {
    aiError.value = { kind: 'internal', message: 'AI 落子未能应用', attempt: 0 }
    phase.value = 'aiRetry'
    return
  }
}

/** AI 对弈中某方判负：对方获胜并结束对局 */
function forfeitAiSide(color: Stone, reason: string) {
  if (state.winner !== null || state.isDraw) return
  forfeit(color)
  const sideName = color === BLACK ? '黑方' : '白方'
  const winnerName = color === BLACK ? '白方' : '黑方'
  gameNotice.value = `${sideName}${reason}，判${winnerName}获胜`
  phase.value = 'over'
  lastContext = null
  stopAiTimer()
}

function afterMove() {
  if (state.winner !== null || state.isDraw) {
    phase.value = 'over'
    return
  }
  if (paused.value) {
    // 暂停：允许最后一手落定，但不再发起下一次落子
    phase.value = 'paused'
    return
  }
  if (config.game.mode === 'ai-ai') {
    // 双 AI 自动对弈：落子后直接轮到另一方 AI
    void runAiTurn()
    return
  }
  phase.value = 'humanTurn'
}

async function attemptLoop(target: AiTarget, messages: ChatMessage[], startAttempt: number, autoRetries: number, version: number) {
  let msgs = messages
  let attempt = startAttempt
  let failCount = 0
  const stopAt = startAttempt + autoRetries

  for (;;) {
    // 分出胜负后停止一切模型调用（防御：新开对局时也会因代次变化而退出）
    if (state.winner !== null || state.isDraw) return
    const result = await attemptOnce(target, msgs)
    if (version !== gameVersion) return // 对局已重置，丢弃本次 AI 回合结果

    if (result.status === 'ok') {
      applyAiMove(result, target, failCount)
      afterMove()
      lastContext = null
      return
    }
    failCount += 1

    if (result.status === 'invalid') {
      msgs = appendCorrection(msgs, result)
    }

    if (attempt >= stopAt) {
      if (config.game.mode === 'ai-ai') {
        // AI 对弈无人值守：重试耗尽直接判该方负，避免对局卡死
        forfeitAiSide(state.currentPlayer, `连续重试 ${failCount} 次仍失败（${result.message}）`)
        return
      }
      aiError.value = { kind: result.status, message: result.message, raw: result.raw, attempt }
      lastContext = { target, messages: msgs, attempt }
      phase.value = paused.value ? 'paused' : 'aiRetry'
      return
    }
    attempt += 1
  }
}

/** 触发 AI 落子（初始/自动请求/双 AI 共用入口） */
async function runAiTurn() {
  if (state.winner !== null || state.isDraw) return
  if (paused.value) return
  const target = targetForCurrentPlayer()
  if (target === null) {
    if (config.game.mode === 'ai-ai') {
      forfeitAiSide(state.currentPlayer, '未配置可用的 AI 模型')
      return
    }
    aiError.value = { kind: 'no-model', message: '未配置可用的 AI 模型，请在开始界面选择模型', attempt: 1 }
    phase.value = 'aiRetry'
    return
  }
  phase.value = 'aiThinking'
  aiError.value = null
  const owner = startAiTimer()
  const version = gameVersion
  try {
    await attemptLoop(target, buildInitialMessages(), 1, config.ai.maxAutoRetries, version)
  } finally {
    stopAiTimer(owner)
  }
}

/** 手动重试：沿用上一次的对话上下文，只重试一次 */
function retryAi() {
  if (phase.value !== 'aiRetry' || lastContext === null) return
  const ctx = lastContext
  phase.value = 'aiThinking'
  const owner = startAiTimer()
  void attemptLoop(ctx.target, ctx.messages, ctx.attempt + 1, 0, gameVersion).finally(() => stopAiTimer(owner))
}

/** 暂停对局：放行在途 AI 请求（最后一手仍会落子），但不再发起下一次落子 */
function pauseGame() {
  if (phase.value === 'over' || phase.value === 'paused') return
  if (state.winner !== null || state.isDraw) return
  paused.value = true
  phase.value = 'paused'
}

/** 继续对局：恢复暂停，轮到 AI 时立即续走；无可用模型时保持暂停并提示 */
function resumeGame() {
  if (phase.value !== 'paused') return
  if (state.winner !== null || state.isDraw) {
    paused.value = false
    phase.value = 'over'
    return
  }
  const needsAi =
    config.game.mode === 'ai-ai' ||
    (config.game.mode === 'human-ai' && config.game.autoRequestAi && state.currentPlayer !== config.game.humanColor)
  if (needsAi && targetForCurrentPlayer() === null) {
    aiError.value = {
      kind: 'no-model',
      message: '当前一方没有可用的 AI 模型，请点「开始新对局」配置模型后继续',
      attempt: 1,
    }
    return
  }
  paused.value = false
  if (needsAi) {
    void runAiTurn()
  } else {
    phase.value = 'humanTurn'
  }
}

/** 导入外部对局：恢复棋局与配置；未终局进入暂停等待配置模型，已终局保持结束状态 */
function importGame(data: ExportedGame): boolean {
  gameVersion += 1
  if (!importSnapshot(data.snapshot)) return false
  config.game.mode = data.mode
  config.game.boardSize = data.boardSize
  config.game.humanColor = data.humanColor
  config.game.notation = data.notation
  config.game.autoRequestAi = data.autoRequestAi
  config.game.aiBlack = data.aiBlack
  config.game.aiWhite = data.aiWhite
  aiError.value = null
  lastContext = null
  gameNotice.value = null
  if (state.winner !== null || state.isDraw) {
    paused.value = false
    phase.value = 'over'
  } else {
    paused.value = true
    phase.value = 'paused'
  }
  return true
}

/** 从暂存恢复对局；成功返回 true（未终局默认进入暂停，等待手动恢复） */
function restoreGame(): boolean {
  gameVersion += 1
  if (!restoreSnapshot()) return false
  aiError.value = null
  lastContext = null
  gameNotice.value = null
  if (state.winner !== null || state.isDraw) {
    paused.value = false
    phase.value = 'over'
  } else {
    paused.value = true
    phase.value = 'paused'
  }
  return true
}

/** 开始新对局；若 AI 执先手则直接进入 AI 回合 */
function newGame(size?: number) {
  gameVersion += 1
  start(size ?? config.game.boardSize)
  aiError.value = null
  lastContext = null
  gameNotice.value = null
  paused.value = false
  if (config.game.mode === 'ai-ai') {
    void runAiTurn()
  } else if (
    config.game.mode === 'human-ai' &&
    config.game.autoRequestAi &&
    state.currentPlayer !== config.game.humanColor
  ) {
    void runAiTurn()
  } else {
    phase.value = 'humanTurn'
  }
}

/** 人类落子：成功且未结束时按配置决定是否自动请求 AI */
function onHumanPlay(x: number, y: number) {
  if (phase.value !== 'humanTurn') return
  if (paused.value) return
  if (config.game.mode === 'ai-ai') return
  if (!play(x, y, { source: 'human' })) return
  if (state.winner !== null || state.isDraw) {
    phase.value = 'over'
    return
  }
  if (config.game.mode === 'human-ai' && config.game.autoRequestAi) {
    void runAiTurn()
  }
}

// 打开「请求 AI」开关时：仅当轮到 AI 才立即接管；轮到玩家则等待其落子后再由 onHumanPlay 触发，
// 避免 AI 去操作玩家的棋子（例如关闭开关时玩家曾代替 AI 落子）
watch(
  () => config.game.autoRequestAi,
  (enabled) => {
    if (!enabled) return
    if (state.winner !== null || state.isDraw) return
    if (paused.value) return
    if (phase.value === 'aiThinking' || phase.value === 'aiRetry') return
    if (config.game.mode === 'human-ai' && state.currentPlayer !== config.game.humanColor) {
      void runAiTurn()
    }
  },
)

export function useGameController() {
  return {
    state,
    phase,
    aiError,
    aiElapsed,
    gameNotice,
    paused,
    newGame,
    onHumanPlay,
    retryAi,
    restoreGame,
    importGame,
    pauseGame,
    resumeGame,
  }
}
