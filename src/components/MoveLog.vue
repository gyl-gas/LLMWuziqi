<script setup lang="ts">
import { computed, ref } from 'vue'
import { BLACK } from '../core/board'
import type { AiFailureEntry, MoveEntry } from '../core/notation'
import AnalysisPanel from './AnalysisPanel.vue'

const props = defineProps<{
  moves: MoveEntry[]
  failures: AiFailureEntry[]
  activeSeq?: number | null
}>()

const emit = defineEmits<{ select: [seq: number] }>()

const list = computed(() => props.moves.slice().reverse())
const failureList = computed(() => props.failures.slice().reverse())

function colorLabel(color: number): string {
  return color === BLACK ? '黑' : '白'
}

function coordText(m: MoveEntry): string {
  return `${m.x},${m.y}`
}

function sourceText(m: MoveEntry): string {
  return m.source === 'ai' ? `AI${m.model !== undefined ? ` · ${m.model}` : ''}` : '我'
}

function durationText(m: MoveEntry): string {
  return m.durationMs !== undefined ? `${(m.durationMs / 1000).toFixed(1)}s` : ''
}

function failureDurationText(failure: AiFailureEntry): string {
  return `${(failure.durationMs / 1000).toFixed(1)}s`
}

const expanded = ref<number | null>(null)
const expandedFailure = ref<number | null>(null)
const showAnalysis = ref(false)

const hasAiMoves = computed(() => props.moves.some((m) => m.source === 'ai'))

function toggle(m: MoveEntry) {
  expanded.value = expanded.value === m.seq ? null : m.seq
}

function hasDetail(m: MoveEntry): boolean {
  return m.source === 'ai' && (m.reasoning !== undefined || m.raw !== undefined)
}

function toggleFailure(failure: AiFailureEntry) {
  expandedFailure.value = expandedFailure.value === failure.seq ? null : failure.seq
}

</script>

<template>
  <div class="move-log">
    <div class="log-head">
      <h2>棋谱</h2>
      <button v-if="hasAiMoves" class="analysis-btn" @click="showAnalysis = true">对局分析</button>
    </div>
    <p v-if="moves.length === 0" class="empty">暂无落子记录</p>
    <ol v-else class="list">
      <template v-for="m in list" :key="m.seq">
        <li
          class="row"
          :class="{ ai: m.source === 'ai', active: activeSeq === m.seq, expanded: expanded === m.seq }"
          @click="emit('select', m.seq)"
        >
          <span class="seq">{{ m.seq }}</span>
          <span class="stone" :class="m.color === BLACK ? 'black' : 'white'">{{ colorLabel(m.color) }}</span>
          <span class="coord">{{ coordText(m) }}</span>
          <span class="src">{{ sourceText(m) }}</span>
          <span v-if="m.source === 'ai' && (m.retries ?? 0) > 0" class="retry-badge">重试 {{ m.retries }} 次</span>
          <span class="duration">{{ durationText(m) }}</span>
          <span
            v-if="hasDetail(m)"
            class="expand-hint"
            @click.stop="toggle(m)"
          >{{ expanded === m.seq ? '收起 ▲' : '详情 ▼' }}</span>
        </li>
        <li v-if="expanded === m.seq" class="detail">
          <div v-if="m.reasoning" class="detail-block">
            <div class="detail-label">AI 思考</div>
            <pre class="detail-body">{{ m.reasoning }}</pre>
          </div>
          <div v-if="m.raw" class="detail-block">
            <div class="detail-label">原始返回</div>
            <pre class="detail-body">{{ m.raw }}</pre>
          </div>
        </li>
      </template>
    </ol>

    <div v-if="failureList.length > 0" class="failure-section">
      <h3>AI 请求失败（{{ failureList.length }}）</h3>
      <ol class="list failure-list">
        <template v-for="failure in failureList" :key="failure.seq">
          <li class="row failure-row" :class="{ expanded: expandedFailure === failure.seq }">
            <span class="seq">#{{ failure.seq }}</span>
            <span class="stone" :class="failure.color === BLACK ? 'black' : 'white'">{{ colorLabel(failure.color) }}</span>
            <span class="failure-status">{{ failure.status }}</span>
            <span class="src">AI · {{ failure.model }}</span>
            <span class="duration">{{ failureDurationText(failure) }}</span>
            <button class="failure-detail-btn" @click="toggleFailure(failure)">
              {{ expandedFailure === failure.seq ? '收起详情' : '查看详情' }}
            </button>
          </li>
          <li v-if="expandedFailure === failure.seq" class="detail">
            <div class="detail-block">
              <div class="detail-label">失败原因</div>
              <pre class="detail-body">{{ failure.message }}</pre>
            </div>
            <div v-if="failure.reasoning" class="detail-block">
              <div class="detail-label">AI 思考</div>
              <pre class="detail-body">{{ failure.reasoning }}</pre>
            </div>
            <div v-if="failure.raw" class="detail-block">
              <div class="detail-label">原始返回</div>
              <pre class="detail-body">{{ failure.raw }}</pre>
            </div>
          </li>
        </template>
      </ol>
    </div>

    <AnalysisPanel v-if="showAnalysis" :moves="moves" @close="showAnalysis = false" />
  </div>
</template>

<style scoped>
.move-log {
  text-align: left;
  border: 1px solid #d8c3a0;
  border-radius: 10px;
  background: #fffaf0;
  padding: 14px 18px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.move-log h2 {
  margin: 0;
  font-size: 16px;
  color: #4a2f14;
}

.log-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.analysis-btn {
  font-size: 12px;
  padding: 4px 12px;
}

.empty {
  color: #8a7357;
  font-size: 13px;
  margin: 0;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 5px 8px;
  font-size: 13px;
  border-bottom: 1px dashed #e5d7bd;
}

.row:last-child {
  border-bottom: none;
}

.row.ai {
  background: #f3f8f2;
}

.seq {
  width: 32px;
  color: #8a7357;
  font-weight: 600;
}

.stone {
  width: 24px;
  text-align: center;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.stone.black {
  background: #1a1a1a;
  color: #fff;
}

.stone.white {
  background: #f7f7f7;
  color: #111;
  border: 1px solid #bbb;
}

.coord {
  width: 52px;
  font-family: Consolas, monospace;
}

.src {
  flex: 1;
  color: #6b5a41;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duration {
  width: 56px;
  text-align: right;
  color: #8a7357;
  font-family: Consolas, monospace;
}

.retry-badge {
  font-size: 11px;
  color: #c62828;
  background: #ffe9e9;
  border: 1px solid #f0c4c4;
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
}

.expand-hint {
  font-size: 11px;
  color: #7a8c5a;
  cursor: pointer;
}

.row {
  cursor: pointer;
}

.row:hover {
  background: #f6f1e4;
}

.row.expanded {
  background: #eef4e4;
}

.row.active {
  outline: 1.5px solid #d9a441;
  background: #fdf3dd;
}

.detail {
  background: #faf8f2;
  padding: 10px 12px;
  border-bottom: 1px dashed #e5d7bd;
  font-size: 12px;
}

.detail-block {
  margin-bottom: 8px;
}

.detail-block:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-weight: 700;
  color: #6b5a41;
  margin-bottom: 4px;
}

.detail-body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow-y: auto;
  background: #f3eee2;
  border-radius: 6px;
  padding: 8px 10px;
  color: #4a3a22;
  font-family: Consolas, monospace;
  font-size: 12px;
}

.failure-section {
  margin-top: 16px;
  border-top: 1px solid #eadbc5;
  padding-top: 12px;
}

.failure-section h3 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #8c3d2f;
}

.failure-list {
  max-height: 220px;
}

.failure-row {
  cursor: default;
  background: #fff4f1;
}

.failure-row:hover {
  background: #fff4f1;
}

.failure-status {
  width: 58px;
  color: #a33b2b;
  font-family: Consolas, monospace;
  font-size: 12px;
}

.failure-detail-btn {
  font-size: 11px;
  padding: 3px 8px;
}
</style>
