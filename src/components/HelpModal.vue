<script setup lang="ts">
import { computed, ref } from 'vue'
import { applySharedPreset, SHARED_PRESET, useConfig } from '../store/config'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { config } = useConfig()
const applied = ref(false)

const isActive = computed(
  () =>
    config.active !== null &&
    config.active.providerId === SHARED_PRESET.id &&
    config.active.model === SHARED_PRESET.models[0],
)

function apply() {
  applySharedPreset()
  applied.value = true
}

function close() {
  applied.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="help-mask" @click.self="close">
      <div class="help-modal">
        <div class="help-head">
          <h2>使用说明</h2>
          <button class="close-btn" title="关闭" @click="close">×</button>
        </div>

        <div class="help-body">
          <section class="preset">
            <h3>快速开始（DeepSeek 预置配置）</h3>
            <p class="hint">已内置 baseUrl、API Key 与模型，点击下方按钮一键配置：</p>
            <div class="kv">
              <div><span class="k">Base URL</span><code>{{ SHARED_PRESET.baseUrl }}</code></div>
              <div><span class="k">模型</span><code>{{ SHARED_PRESET.models[0] }}</code></div>
              <div><span class="k">API Key</span><code class="key">{{ SHARED_PRESET.apiKey }}</code></div>
            </div>
            <button class="apply-btn" :disabled="applied && isActive" @click="apply">
              {{ applied && isActive ? '✓ 已应用' : '一键配置模型' }}
            </button>
            <p v-if="applied && isActive" class="applied-hint">已应用，可在顶部「模型」下拉框中看到该模型。</p>
          </section>

          <section>
            <h3>小贴士</h3>
            <ul>
              <li>点「开始新对局」可选择双人对战、人机对战或 AI 对弈，并配置双方模型与执子颜色。</li>
              <li>关闭「请求 AI」后，可以手动落子（包括代替 AI 落子）。</li>
              <li>AI 对弈会自动进行直到分出胜负；某方连续失败（默认重试 2 次）或无可用模型时判负并停止对局。</li>
              <li>优先使用 9×9 棋盘开始游戏，否则模型思考时间可能超过十分钟。</li>
              <li>点击棋谱中的某一手，可以回看该手时的棋局（复盘）。</li>
            </ul>
          </section>
        </div>

        <div class="help-foot">
          <button @click="close">知道了</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help-mask {
  position: fixed;
  inset: 0;
  background: rgba(40, 28, 12, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.help-modal {
  background: #fffaf0;
  border: 1px solid #d8c3a0;
  border-radius: 12px;
  max-width: 560px;
  width: 100%;
  max-height: 86vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.help-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px 10px;
  border-bottom: 1px solid #e7d9bf;
}

.help-head h2 {
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

.help-body {
  padding: 14px 18px;
  text-align: left;
}

.help-body section {
  margin-bottom: 16px;
}

.help-body h3 {
  margin: 0 0 8px;
  font-size: 15px;
  color: #4a2f14;
}

.hint {
  font-size: 12px;
  color: #8a7357;
  margin: 0 0 10px;
}

.kv {
  background: #f5edda;
  border: 1px solid #e2d3b8;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv > div {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.kv .k {
  flex: 0 0 68px;
  color: #7a5a2e;
  font-weight: 600;
}

.kv code {
  background: #fff;
  border: 1px solid #e0d0ae;
  border-radius: 5px;
  padding: 3px 8px;
  font-family: Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
  color: #4a3a22;
}

.kv code.key {
  color: #7a4a1d;
}

.apply-btn {
  background: #2e7d32;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 14px;
  cursor: pointer;
}

.apply-btn:hover {
  background: #256b29;
}

.apply-btn:disabled {
  background: #9ccc9f;
  cursor: default;
}

.applied-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #2e7d32;
}

.help-body ul {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  color: #4a3a22;
}

.help-foot {
  padding: 10px 18px 16px;
  text-align: right;
  border-top: 1px solid #e7d9bf;
}

.help-foot button {
  background: #fffdf8;
  border: 1px solid #b89a6a;
  border-radius: 8px;
  padding: 6px 20px;
  font-size: 14px;
  cursor: pointer;
}

.help-foot button:hover {
  background: #fdf0da;
}
</style>
