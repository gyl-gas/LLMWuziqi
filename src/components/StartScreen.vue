<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BLACK, SUPPORTED_SIZES, WHITE } from '../core/board'
import { firstAvailableAiSide, isValidAiSide, useConfig } from '../store/config'
import type { AiSide } from '../store/config'
import type { ExportedGame } from '../store/export'

/** resume 传入时表示「继续导入的对局」：模式/棋盘/执子锁定，仅可配置模型 */
const props = withDefaults(defineProps<{ open: boolean; resume?: ExportedGame | null }>(), {
  resume: null,
})
const emit = defineEmits<{ start: []; close: []; resume: [] }>()

const { config } = useConfig()
const errorMsg = ref('')

const MODES = [
  { value: 'pvp', label: '双人对战', desc: '两位玩家在本机轮流落子' },
  { value: 'human-ai', label: '人机对战', desc: '你与 AI 模型轮流落子' },
  { value: 'ai-ai', label: 'AI 对弈', desc: '两个 AI 模型自动对局，直到分出胜负' },
] as const

type ModeValue = (typeof MODES)[number]['value']

const isResume = computed(() => props.resume !== null && props.resume !== undefined)

const mode = computed({
  get: () => (isResume.value ? (props.resume!.mode as ModeValue) : (config.game.mode as ModeValue)),
  set: (v: ModeValue) => {
    if (isResume.value) return
    config.game.mode = v
    errorMsg.value = ''
    if (v === 'ai-ai') ensureAiSides()
  },
})

const enabledProviders = computed(() => config.providers.filter((p) => p.enabled))

interface ModelOption {
  key: string
  providerId: string
  model: string
  label: string
}

const modelOptions = computed<ModelOption[]>(() =>
  enabledProviders.value.flatMap((p) =>
    p.models.map((m) => ({ key: p.id + '::' + m, providerId: p.id, model: m, label: p.name + ' · ' + m })),
  ),
)

function keyOf(side: AiSide | null): string {
  return side === null ? '' : side.providerId + '::' + side.model
}

function sideFromKey(key: string): AiSide | null {
  if (key === '') return null
  const idx = key.indexOf('::')
  if (idx === -1) return null
  return { providerId: key.slice(0, idx), model: key.slice(idx + 2) }
}

function ensureAiSides() {
  if (!isValidAiSide(config, config.game.aiBlack)) config.game.aiBlack = firstAvailableAiSide(config)
  if (!isValidAiSide(config, config.game.aiWhite)) config.game.aiWhite = firstAvailableAiSide(config)
}

const activeKey = computed({
  get: () => keyOf(config.active),
  set: (key: string) => {
    config.active = sideFromKey(key)
  },
})

const blackKey = computed({
  get: () => keyOf(config.game.aiBlack),
  set: (key: string) => {
    config.game.aiBlack = sideFromKey(key)
  },
})

const whiteKey = computed({
  get: () => keyOf(config.game.aiWhite),
  set: (key: string) => {
    config.game.aiWhite = sideFromKey(key)
  },
})

function swapSides() {
  const black = config.game.aiBlack
  config.game.aiBlack = config.game.aiWhite
  config.game.aiWhite = black
}

function onSizeChange(e: Event) {
  config.game.boardSize = Number((e.target as HTMLSelectElement).value)
}

function onHumanColorChange(e: Event) {
  config.game.humanColor = Number((e.target as HTMLSelectElement).value) as 1 | 2
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    errorMsg.value = ''
    if (config.game.mode === 'ai-ai') {
      ensureAiSides()
    } else if (config.game.mode === 'human-ai' && !isValidAiSide(config, config.active)) {
      const first = firstAvailableAiSide(config)
      config.active = first === null ? null : { providerId: first.providerId, model: first.model }
    }
  },
)

function start() {
  if (config.game.mode === 'human-ai' && !isValidAiSide(config, config.active)) {
    errorMsg.value = '人机对战需要选择一个可用的 AI 模型'
    return
  }
  if (config.game.mode === 'ai-ai') {
    ensureAiSides()
    if (!isValidAiSide(config, config.game.aiBlack) || !isValidAiSide(config, config.game.aiWhite)) {
      errorMsg.value = 'AI 对弈需要为黑、白双方各配置一个可用模型'
      return
    }
  }
  if (isResume.value) {
    emit('resume')
  } else {
    emit('start')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="start-mask" @click.self="emit('close')">
      <div class="start-modal">
        <div class="start-head">
          <h2>{{ isResume ? '继续导入的对局' : '开始新对局' }}</h2>
          <button class="close-btn" title="关闭" @click="emit('close')">×</button>
        </div>

        <div class="start-body">
          <div class="mode-grid">
            <button
              v-for="m in MODES"
              :key="m.value"
              class="mode-card"
              :class="{ active: mode === m.value }"
              :disabled="isResume"
              @click="mode = m.value"
            >
              <span class="mode-label">{{ m.label }}</span>
              <span class="mode-desc">{{ m.desc }}</span>
            </button>
          </div>

          <div class="row">
            <label>
              棋盘尺寸
              <select :value="config.game.boardSize" :disabled="isResume" @change="onSizeChange">
                <option v-for="s in SUPPORTED_SIZES" :key="s" :value="s">{{ s }} × {{ s }}</option>
              </select>
            </label>
          </div>

          <template v-if="mode === 'human-ai'">
            <div class="row">
              <label>
                我方执子
                <select :value="config.game.humanColor" :disabled="isResume" @change="onHumanColorChange">
                  <option :value="BLACK">黑棋（先手）</option>
                  <option :value="WHITE">白棋（后手）</option>
                </select>
              </label>
              <label>
                AI 模型
                <select v-model="activeKey">
                  <option value="">（未选择）</option>
                  <option v-for="o in modelOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
                </select>
              </label>
            </div>
          </template>

          <template v-else-if="mode === 'ai-ai'">
            <div class="row">
              <label>
                黑方 AI（先手）
                <select v-model="blackKey">
                  <option v-for="o in modelOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
                </select>
              </label>
              <label>
                白方 AI（后手）
                <select v-model="whiteKey">
                  <option v-for="o in modelOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
                </select>
              </label>
              <button class="small" @click="swapSides">交换双方</button>
            </div>
            <p class="hint">
              黑方先手，双方自动轮流落子直到分出胜负；某方连续失败（默认重试 2 次）或无可用模型时判负并停止对局。
            </p>
          </template>

          <p v-if="mode === 'pvp'" class="hint">两位玩家在本机轮流落子，无 AI 参与。</p>

          <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
        </div>

        <div class="start-foot">
          <p v-if="isResume" class="hint resume-hint">已导入未结束的对局，确认模型配置后点击「继续对局」。</p>
          <button class="primary" @click="start">{{ isResume ? '继续对局' : '开始对局' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.start-mask {
  position: fixed;
  inset: 0;
  background: rgba(40, 28, 12, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
  padding: 16px;
}

.start-modal {
  background: #fffaf0;
  border: 1px solid #d8c3a0;
  border-radius: 12px;
  max-width: 640px;
  width: 100%;
  max-height: 88vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}

.start-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px 10px;
  border-bottom: 1px solid #e7d9bf;
}

.start-head h2 {
  margin: 0;
  font-size: 18px;
  color: #4a2f14;
}

.close-btn {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: #8a7357;
  cursor: pointer;
  padding: 0 4px;
}

.start-body {
  padding: 14px 18px;
  text-align: left;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.mode-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 10px;
  border-radius: 10px;
  border: 1.5px solid #d8c3a0;
  background: #fffdf6;
  cursor: pointer;
  text-align: left;
}

.mode-card:hover {
  background: #f6f1e4;
}

.mode-card.active {
  border-color: #2e7d32;
  background: #eef4e4;
}

.mode-label {
  font-weight: 700;
  font-size: 14px;
  color: #4a2f14;
}

.mode-desc {
  font-size: 12px;
  color: #8a7357;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.row label {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}

.hint {
  font-size: 12px;
  color: #8a7357;
  margin: 0 0 12px;
}

.resume-hint {
  margin: 0 0 10px;
  text-align: left;
}

.mode-card:disabled {
  opacity: 0.75;
  cursor: not-allowed;
}

.error {
  color: #c62828;
  font-size: 13px;
  margin: 0 0 12px;
}

.start-foot {
  padding: 10px 18px 16px;
  text-align: right;
  border-top: 1px solid #e7d9bf;
}

button.primary {
  background: #2e7d32;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 24px;
  font-size: 14px;
  cursor: pointer;
}

button.primary:hover {
  background: #256b29;
}

button.small {
  font-size: 12px;
  padding: 4px 10px;
}
</style>
