<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GameBoard from './components/GameBoard.vue'
import ModelConfig from './components/ModelConfig.vue'
import HelpModal from './components/HelpModal.vue'
import MoveLog from './components/MoveLog.vue'
import StartScreen from './components/StartScreen.vue'
import { BLACK, SUPPORTED_SIZES } from './core/board'
import { useGameController } from './engine/gameController'
import { useConfig } from './store/config'
import { buildExport, parseExport } from './store/export'
import type { ExportedGame } from './store/export'
import type { GameSnapshot } from './store/game'
import { replayViewAt } from './core/replay'

const {
  state,
  phase,
  aiError,
  aiElapsed,
  gameNotice,
  newGame,
  onHumanPlay,
  retryAi,
  restoreGame,
  importGame,
  pauseGame,
  resumeGame,
} = useGameController()
const { config } = useConfig()

const showModelConfig = ref(false)
const showHelp = ref(false)
const showStart = ref(false)
const editStartSettings = ref(false)
const HELP_SEEN_KEY = 'gomoku.helpSeen'
const restored = ref(restoreGame())

/** 导入/导出 */
const fileInput = ref<HTMLInputElement | null>(null)
const importError = ref('')
const importNotice = ref('')
const resumeData = ref<ExportedGame | null>(null)

const isPaused = computed(() => phase.value === 'paused')

/** 暂停/继续按钮文案：人机对战轮到 AI 时暂停即接管 */
const pauseLabel = computed(() => {
  if (phase.value === 'paused') return '继续对局'
  if (config.game.mode === 'human-ai' && state.currentPlayer !== config.game.humanColor) return '暂停 AI'
  return '暂停对局'
})
/** 首次进入页面时默认展示说明弹窗；无暂存对局时展示开始界面 */
onMounted(() => {
  if (!restored.value) showStart.value = true
  try {
    if (localStorage.getItem(HELP_SEEN_KEY) === null) showHelp.value = true
  } catch {
    showHelp.value = true
  }
})

function closeHelp() {
  showHelp.value = false
  try {
    localStorage.setItem(HELP_SEEN_KEY, '1')
  } catch {
    /* 忽略存储失败 */
  }
}

/** 落子（人类或 AI）后自动关闭暂存提示 */
watch(
  () => state.moveCount,
  (n) => {
    if (n > 0) restored.value = false
  },
)

/** 开始新对局：关闭暂存提示并重置对局 */
function onNewGame(size?: number) {
  restored.value = false
  newGame(size ?? config.game.boardSize)
}

function onSizeChange(e: Event) {
  const size = Number((e.target as HTMLSelectElement).value)
  config.game.boardSize = size
  onNewGame(size)
}

/** 打开开始界面，配置模式/模型后开始新对局 */
function openStartScreen() {
  resumeData.value = null
  editStartSettings.value = false
  showStart.value = true
}

function openMatchSettings() {
  if (state.winner !== null || state.isDraw) return
  resumeData.value = null
  editStartSettings.value = true
  showStart.value = true
}

/** 开始界面确认：按当前配置开始新对局 */
function onStartFromScreen() {
  showStart.value = false
  editStartSettings.value = false
  resumeData.value = null
  restored.value = false
  newGame(config.game.boardSize)
}

/** 暂停/继续切换 */
function onTogglePause() {
  if (isPaused.value) {
    resumeGame()
  } else {
    pauseGame()
  }
}

/** 导出当前对局为 JSON 文件 */
function onExport() {
  const snap: GameSnapshot = {
    boardSize: state.boardSize,
    currentPlayer: state.currentPlayer,
    winner: state.winner,
    isDraw: state.isDraw,
    winLine: state.winLine,
    moveCount: state.moveCount,
    moves: state.moves.map((m) => ({ ...m })),
    aiFailures: state.aiFailures.map((failure) => ({ ...failure })),
    lastMove: state.lastMove !== null ? { ...state.lastMove } : null,
    savedAt: Date.now(),
  }
  const data = buildExport(snap, config.game)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '五子棋对局-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 读取并导入对局文件 */
async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const text = await file.text()
  const parsed = parseExport(text)
  if (!parsed.ok) {
    importError.value = parsed.reason
    return
  }
  importError.value = ''
  if (!importGame(parsed.data)) {
    importError.value = '对局数据无法恢复（落子不合法或数据损坏）'
    return
  }
  restored.value = false
  replaySeq.value = null
  if (state.winner !== null || state.isDraw) {
    importNotice.value = '已导入已结束的对局，保持结束状态，可回看棋谱与复盘'
  } else {
    resumeData.value = parsed.data
    showStart.value = true
  }
}

/** 续局界面确认：按已配置的模型继续导入的对局 */
function onResumeFromImport() {
  const data = resumeData.value
  showStart.value = false
  editStartSettings.value = false
  resumeData.value = null
  if (data === null) return
  resumeGame()
}

/** 是否有可用的 AI 模型（人机模式用） */
const hasAiModel = computed(() => {
  if (config.active === null) return false
  const provider = config.providers.find((p) => p.id === config.active?.providerId)
  return provider !== undefined && provider.enabled && provider.models.includes(config.active!.model)
})

/** 当前模式标签 */
const modeText = computed(() => {
  switch (config.game.mode) {
    case 'ai-ai':
      return 'AI 对弈'
    case 'human-ai':
      return '人机对战'
    default:
      return '双人对战'
  }
})

const modeTagClass = computed(() => {
  switch (config.game.mode) {
    case 'ai-ai':
      return 'ai'
    case 'human-ai':
      return 'human'
    default:
      return 'pvp'
  }
})

/** 手数显示：对局进行中显示即将落子的手数（从 1 开始），结束后显示总手数 */
const moveLabel = computed(() =>
  state.winner !== null || state.isDraw ? `第 ${state.moveCount} 手` : `第 ${state.moveCount + 1} 手`,
)

/** 复盘位置显示：0 表示初始局面，避免出现「第 0 手」 */
const replayLabel = computed(() =>
  replaySeq.value === null ? '' : replaySeq.value === 0 ? '初始局面' : `第 ${replaySeq.value} 手`,
)

const winnerText = computed(() => {
  const color = state.winner
  if (color === null) return ''
  if (config.game.mode === 'ai-ai') {
    const last = [...state.moves].reverse().find((m) => m.color === color)
    const side = color === BLACK ? '黑方' : '白方'
    return `${side} AI${last?.model !== undefined ? `（${last.model}）` : ''}胜`
  }
  return color === BLACK ? '黑棋胜' : '白棋胜'
})

const statusText = computed(() => {
  if (replaySeq.value !== null) return `复盘 · ${replayLabel.value}`
  if (state.isDraw) return '平局'
  if (state.winner !== null) return winnerText.value
  if (phase.value === 'aiThinking') {
    const side = state.currentPlayer === BLACK ? '黑方 AI' : '白方 AI'
    return `${side} 思考中… ${aiElapsed.value.toFixed(1)}s`
  }
  if (phase.value === 'aiRetry') return 'AI 出错了'
  if (phase.value === 'paused') {
    if (config.game.mode === 'human-ai' && state.currentPlayer !== config.game.humanColor) {
      return '已暂停 · 可点击棋盘代替 AI 落子'
    }
    return '已暂停'
  }
  if (config.game.mode === 'ai-ai') return state.currentPlayer === BLACK ? '轮到黑方 AI' : '轮到白方 AI'
  return state.currentPlayer === BLACK ? '轮到黑棋' : '轮到白棋'
})

const statusClass = computed(() => {
  if (replaySeq.value !== null) return 'replay'
  if (state.winner !== null || state.isDraw) return 'over'
  if (phase.value === 'aiThinking') return 'thinking'
  if (phase.value === 'aiRetry') return 'error'
  if (phase.value === 'paused') return 'paused'
  return state.currentPlayer === BLACK ? 'black' : 'white'
})

const boardDisabled = computed(() => {
  if (replaySeq.value !== null) return true
  if (config.game.mode === 'ai-ai') return true
  if (config.game.mode === 'human-ai' && phase.value === 'paused') return false
  return phase.value !== 'humanTurn'
})

// ---- 复盘 ----
const replaySeq = ref<number | null>(null)

/** 自动播放棋谱：按间隔逐手前进，到底自动停止 */
const replayAuto = ref(false)
const replayIntervalSec = ref(2)
let replayTimer: ReturnType<typeof setInterval> | null = null

function startReplayAuto() {
  if (replaySeq.value === null) return
  if (replaySeq.value >= state.moveCount) return
  replayAuto.value = true
  if (replayTimer !== null) clearInterval(replayTimer)
  replayTimer = setInterval(() => {
    if (replaySeq.value === null) {
      stopReplayAuto()
      return
    }
    if (replaySeq.value >= state.moveCount) {
      stopReplayAuto()
      return
    }
    replaySeq.value += 1
  }, replayIntervalSec.value * 1000)
}

function stopReplayAuto() {
  replayAuto.value = false
  if (replayTimer !== null) {
    clearInterval(replayTimer)
    replayTimer = null
  }
}

function toggleReplayAuto() {
  if (replayAuto.value) {
    stopReplayAuto()
  } else {
    startReplayAuto()
  }
}

watch(replayIntervalSec, () => {
  // 播放中修改间隔：立即按新间隔重启
  if (replayAuto.value) {
    stopReplayAuto()
    startReplayAuto()
  }
})

onBeforeUnmount(() => stopReplayAuto())

const replayView = computed(() => {
  if (replaySeq.value === null) return null
  const view = replayViewAt(state.boardSize, state.moves, replaySeq.value)
  if (replaySeq.value >= state.moveCount) {
    // 复盘到实时最后一手时，透传对局的真实终局状态
    view.winner = state.winner
  }
  return view
})

function onSelectMove(seq: number) {
  stopReplayAuto()
  if (replaySeq.value === seq && seq === state.moveCount) {
    replaySeq.value = null
  } else {
    replaySeq.value = seq
  }
}

function replayStep(dir: 1 | -1) {
  stopReplayAuto()
  if (replaySeq.value === null) return
  replaySeq.value = Math.min(state.moveCount, Math.max(0, replaySeq.value + dir))
}

function exitReplay() {
  stopReplayAuto()
  replaySeq.value = null
}
</script>

<template>
  <div class="page">
    <h1>五子棋 · AI 对弈</h1>

    <div class="panel">
      <label>
        棋盘
        <select :value="state.boardSize" @change="onSizeChange">
          <option v-for="s in SUPPORTED_SIZES" :key="s" :value="s">{{ s }} × {{ s }}</option>
        </select>
      </label>
      <button class="primary" @click="openStartScreen">开始新对局</button>
      <button :disabled="state.winner !== null || state.isDraw" @click="openMatchSettings">对局设置</button>
      <button :disabled="state.winner !== null || state.isDraw" @click="onTogglePause">
        {{ pauseLabel }}
      </button>
      <button @click="onExport">导出对局</button>
      <button @click="fileInput?.click()">导入对局</button>
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden-file" @change="onImportFile" />
      <button @click="showModelConfig = !showModelConfig">
        {{ showModelConfig ? '收起配置' : '模型配置' }}
      </button>
      <button @click="showHelp = true">说明</button>
    </div>

    <ModelConfig v-if="showModelConfig" />

    <div class="status" :class="statusClass">
      <span class="mode-tag" :class="modeTagClass">{{ modeText }}</span>
      {{ statusText }}<template v-if="replaySeq === null"> · {{ moveLabel }}</template>
    </div>

    <div v-if="restored" class="restore-box">
      <span>已恢复上次对局（第 {{ state.moveCount }} 手）并已暂停，点「继续对局」手动恢复；「开始新对局」可放弃暂存。</span>
      <button class="restore-close" @click="restored = false">知道了</button>
    </div>

    <div v-if="config.game.mode === 'human-ai' && !hasAiModel" class="guide-box">
      <span>
        人机对战需要选择一个可用的 AI 模型。请在「模型配置」中添加并启用 provider，
        或在「开始新对局」中选择模型。
      </span>
      <button @click="openStartScreen">打开开始界面</button>
    </div>

    <div v-if="replaySeq !== null" class="replay-bar">
      <span class="replay-info">复盘 · {{ replayLabel }} / 共 {{ state.moveCount }} 手</span>
      <button :disabled="replaySeq === 0" @click="replayStep(-1)">上一步</button>
      <button :disabled="replaySeq >= state.moveCount" @click="replayStep(1)">下一步</button>
      <button :disabled="replaySeq >= state.moveCount" @click="toggleReplayAuto">
        {{ replayAuto ? '暂停播放' : '自动播放' }}
      </button>
      <label class="replay-interval">
        间隔
        <input v-model.number="replayIntervalSec" class="replay-interval-input" type="number" min="0.5" step="0.5" />
        秒
      </label>
      <button @click="exitReplay">退出复盘</button>
    </div>

    <div v-if="phase === 'aiRetry'" class="retry-box">
      <span class="retry-message">{{ aiError?.message }}</span>
      <button @click="retryAi">手动重试</button>
    </div>

    <div v-else-if="aiError !== null && phase === 'paused'" class="notice-box">
      <span>{{ aiError.message }}</span>
    </div>

    <div v-if="importError" class="notice-box">
      <span>导入失败：{{ importError }}</span>
      <button class="restore-close" @click="importError = ''">知道了</button>
    </div>

    <div v-if="importNotice" class="notice-box info">
      <span>{{ importNotice }}</span>
      <button class="restore-close" @click="importNotice = ''">知道了</button>
    </div>

    <div v-if="gameNotice" class="notice-box">
      <span>{{ gameNotice }}</span>
      <button class="restore-close" @click="gameNotice = null">知道了</button>
    </div>

    <div class="game-area">
    <GameBoard
      :board="replayView !== null ? replayView.board : state.board"
      :board-size="state.boardSize"
      :current-player="state.currentPlayer"
      :last-move="replayView !== null ? replayView.lastMove : state.lastMove"
      :win-line="replayView !== null ? replayView.winLine : state.winLine"
      :disabled="boardDisabled"
      @play="onHumanPlay"
    />

    <aside class="move-log-panel">
      <MoveLog :moves="state.moves" :failures="state.aiFailures" :active-seq="replaySeq" @select="onSelectMove" />
    </aside>
    </div>

    <StartScreen
      :open="showStart"
      :resume="resumeData"
      :editing="editStartSettings"
      @start="onStartFromScreen"
      @resume="onResumeFromImport"
      @save="showStart = false"
      @close="showStart = false"
    />

    <HelpModal :open="showHelp" @close="closeHelp" />
  </div>
</template>
