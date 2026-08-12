<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { MoveEntry } from '../core/notation'

const props = defineProps<{ moves: MoveEntry[] }>()
const emit = defineEmits<{ close: [] }>()

const MODEL_COLORS = ['#2e7d32', '#1565c0', '#c62828', '#6a4fa3', '#e65100', '#00695c', '#8d6e63', '#455a64']

interface ModelGroup {
  key: string
  label: string
  color: string
  moves: MoveEntry[]
}

/** 按「执色 + 模型」分组：AI 对弈双方即使使用同一模型也能分别统计 */
const modelGroups = computed<ModelGroup[]>(() => {
  const order: string[] = []
  const byKey = new Map<string, MoveEntry[]>()
  for (const m of props.moves) {
    if (m.source !== 'ai') continue
    const model = m.model ?? '未知模型'
    const key = model + '@' + m.color
    if (!byKey.has(key)) {
      byKey.set(key, [])
      order.push(key)
    }
    byKey.get(key)!.push(m)
  }
  return order.map((key, i) => {
    const moves = byKey.get(key)!
    const side = moves[0].color === 1 ? '黑方' : '白方'
    const model = moves[0].model ?? '未知模型'
    return { key, label: side + ' · ' + model, color: MODEL_COLORS[i % MODEL_COLORS.length], moves }
  })
})

interface Point {
  seq: number
  value: number
}

function pointsOf(moves: MoveEntry[], pick: (m: MoveEntry) => number | undefined): Point[] {
  return moves.filter((m) => typeof pick(m) === 'number').map((m) => ({ seq: m.seq, value: pick(m) as number }))
}

const CHART_W = 640
const CHART_H = 160
const PAD_L = 46
const PAD_R = 14
const PAD_T = 14
const PAD_B = 26

function niceCeil(v: number): number {
  if (v <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  const n = v / pow
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * pow
}

interface Series {
  group: ModelGroup
  points: Point[]
  linePoints: string
}

interface ChartMeta {
  series: Series[]
  grid: { y: number; label: string }[]
  xLabels: { x: number; label: string }[]
  pos: (p: Point) => { x: number; y: number }
  single: boolean
}

function chartMeta(series: Series[], fmt: (v: number) => string): ChartMeta {
  const innerW = CHART_W - PAD_L - PAD_R
  const innerH = CHART_H - PAD_T - PAD_B
  const allPoints = series.flatMap((s) => s.points)
  const xMin = allPoints.length > 0 ? Math.min(...allPoints.map((p) => p.seq)) : 0
  const xMax = allPoints.length > 0 ? Math.max(...allPoints.map((p) => p.seq)) : 1
  const span = Math.max(1, xMax - xMin)
  const yMax = niceCeil(allPoints.length > 0 ? Math.max(...allPoints.map((p) => p.value)) : 1)
  const single = allPoints.length <= 1
  const pos = (p: Point) => {
    const x = single ? PAD_L + innerW / 2 : PAD_L + ((p.seq - xMin) / span) * innerW
    const y = PAD_T + innerH - (p.value / yMax) * innerH
    return { x, y }
  }
  const withLines: Series[] = series.map((s) => ({
    ...s,
    linePoints: s.points
      .map((p) => {
        const posP = pos(p)
        return posP.x.toFixed(1) + ',' + posP.y.toFixed(1)
      })
      .join(' '),
  }))
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: PAD_T + innerH - f * innerH,
    label: fmt(f * yMax),
  }))
  const xLabels: { x: number; label: string }[] = []
  if (allPoints.length > 0) {
    xLabels.push({ x: PAD_L, label: '第 ' + xMin + ' 手' })
    if (!single) xLabels.push({ x: PAD_L + innerW, label: '第 ' + xMax + ' 手' })
  }
  return { series: withLines, grid, xLabels, pos, single }
}

const fmtDuration = (v: number) => (v / 1000).toFixed(1) + 's'
const fmtTokens = (v: number) => Math.round(v).toLocaleString('zh-CN')

const charts = computed(() => {
  const durationSeries: Series[] = modelGroups.value.map((g) => ({
    group: g,
    points: pointsOf(g.moves, (m) => m.durationMs),
    linePoints: '',
  }))
  const tokenSeries: Series[] = modelGroups.value.map((g) => ({
    group: g,
    points: pointsOf(g.moves, (m) => m.totalTokens),
    linePoints: '',
  }))
  return [
    {
      key: 'duration',
      title: 'AI 思考时长',
      series: durationSeries,
      meta: chartMeta(durationSeries, fmtDuration),
      format: fmtDuration,
      empty: durationSeries.every((s) => s.points.length === 0),
    },
    {
      key: 'tokens',
      title: 'AI Token 用量',
      series: tokenSeries,
      meta: chartMeta(tokenSeries, fmtTokens),
      format: fmtTokens,
      empty: tokenSeries.every((s) => s.points.length === 0),
    },
  ]
})

interface GroupStats {
  group: ModelGroup
  count: number
  avgDuration: number | null
  maxDuration: number | null
  minDuration: number | null
  avgTokens: number | null
  maxTokens: number | null
  totalTokens: number | null
  retries: number
}

const groupStats = computed<GroupStats[]>(() =>
  modelGroups.value.map((g) => {
    const durations = pointsOf(g.moves, (m) => m.durationMs).map((p) => p.value)
    const tokens = pointsOf(g.moves, (m) => m.totalTokens).map((p) => p.value)
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
    return {
      group: g,
      count: g.moves.length,
      avgDuration: durations.length > 0 ? sum(durations) / durations.length : null,
      maxDuration: durations.length > 0 ? Math.max(...durations) : null,
      minDuration: durations.length > 0 ? Math.min(...durations) : null,
      avgTokens: tokens.length > 0 ? sum(tokens) / tokens.length : null,
      maxTokens: tokens.length > 0 ? Math.max(...tokens) : null,
      totalTokens: tokens.length > 0 ? sum(tokens) : null,
      retries: g.moves.reduce((s, m) => s + (m.retries ?? 0), 0),
    }
  }),
)

const hovered = ref<{ chartKey: string; groupIdx: number; pointIdx: number } | null>(null)

const hoveredInfo = computed(() => {
  if (hovered.value === null) return null
  const chart = charts.value.find((c) => c.key === hovered.value!.chartKey)
  if (chart === undefined) return null
  const series = chart.meta.series[hovered.value.groupIdx]
  const point = series?.points[hovered.value.pointIdx]
  if (series === undefined || point === undefined) return null
  return { chart, series, point }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="analysis-overlay" @click.self="emit('close')">
    <div class="analysis-modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>对局分析</h2>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </div>

      <div class="modal-body">
        <div v-if="modelGroups.length === 0" class="empty">暂无 AI 落子数据（本局无 AI 参与）。</div>

        <template v-else>
          <div class="chart-row">
            <div v-for="chart in charts" :key="chart.key" class="chart-block">
              <div class="chart-title">{{ chart.title }}</div>
              <div v-if="chart.empty" class="chart-empty">
                {{ chart.key === 'duration' ? '暂无思考时长数据' : '该对局未记录 token 用量（旧版对局或服务商未返回 usage）' }}
              </div>
              <template v-else>
                <div v-if="chart.meta.series.filter((s) => s.points.length > 0).length > 1" class="legend">
                  <span v-for="s in chart.meta.series" :key="s.group.key" v-show="s.points.length > 0" class="legend-item">
                    <span class="legend-dot" :style="{ background: s.group.color }"></span>{{ s.group.label }}
                  </span>
                </div>
                <svg class="chart" :viewBox="'0 0 ' + CHART_W + ' ' + CHART_H" preserveAspectRatio="xMidYMid meet">
                  <g v-for="g in chart.meta.grid" :key="g.y">
                    <line :x1="PAD_L" :x2="CHART_W - PAD_R" :y1="g.y" :y2="g.y" class="grid-line" />
                    <text :x="PAD_L - 6" :y="g.y + 3" class="axis-label" text-anchor="end">{{ g.label }}</text>
                  </g>
                  <g v-for="xl in chart.meta.xLabels" :key="xl.x">
                    <text :x="xl.x" :y="CHART_H - 6" class="axis-label" text-anchor="middle">{{ xl.label }}</text>
                  </g>
                  <polyline
                    v-for="s in chart.meta.series"
                    :key="s.group.key"
                    v-show="s.points.length > 0"
                    :points="s.linePoints"
                    :stroke="s.group.color"
                    fill="none"
                    class="line"
                  />
                  <g v-for="(s, gi) in chart.meta.series" :key="s.group.key">
                    <g v-for="(p, pi) in s.points" :key="p.seq">
                      <circle
                        :cx="chart.meta.pos(p).x"
                        :cy="chart.meta.pos(p).y"
                        r="3.5"
                        :fill="s.group.color"
                        class="dot"
                        @mouseenter="hovered = { chartKey: chart.key, groupIdx: gi, pointIdx: pi }"
                        @mouseleave="hovered = null"
                      />
                    </g>
                  </g>
                  <template v-if="hoveredInfo !== null">
                    <line
                      :x1="hoveredInfo.chart.meta.pos(hoveredInfo.point).x"
                      :x2="hoveredInfo.chart.meta.pos(hoveredInfo.point).x"
                      :y1="PAD_T"
                      :y2="CHART_H - PAD_B"
                      class="guide-line"
                    />
                    <text
                      :x="hoveredInfo.chart.meta.pos(hoveredInfo.point).x + 6"
                      :y="Math.max(PAD_T + 12, hoveredInfo.chart.meta.pos(hoveredInfo.point).y - 8)"
                      class="tooltip-text"
                    >
                      {{ hoveredInfo.series.group.label }} · 第 {{ hoveredInfo.point.seq }} 手 ·
                      {{ hoveredInfo.chart.format(hoveredInfo.point.value) }}
                    </text>
                  </template>
                </svg>
              </template>
            </div>
          </div>

          <div class="stats-section">
            <div class="section-title">分模型统计</div>
            <div class="stats-grid">
              <div v-for="st in groupStats" :key="st.group.key" class="stat-card">
                <div class="stat-head">
                  <span class="stat-dot" :style="{ background: st.group.color }"></span>
                  <b>{{ st.group.label }}</b>
                </div>
                <div class="stat-grid">
                  <div class="stat-cell">
                    <span>落子</span><b>{{ st.count }} 手</b>
                  </div>
                  <div class="stat-cell">
                    <span>平均思考时长</span><b>{{ st.avgDuration !== null ? fmtDuration(st.avgDuration) : '—' }}</b>
                  </div>
                  <div class="stat-cell">
                    <span>最长 / 最短思考</span>
                    <b>{{ st.maxDuration !== null ? fmtDuration(st.maxDuration) : '—' }} / {{ st.minDuration !== null ? fmtDuration(st.minDuration) : '—' }}</b>
                  </div>
                  <div class="stat-cell">
                    <span>平均 Token / 手</span><b>{{ st.avgTokens !== null ? fmtTokens(st.avgTokens) : '—' }}</b>
                  </div>
                  <div class="stat-cell">
                    <span>单步最高 Token</span><b>{{ st.maxTokens !== null ? fmtTokens(st.maxTokens) : '—' }}</b>
                  </div>
                  <div class="stat-cell">
                    <span>总 Token 用量</span><b>{{ st.totalTokens !== null ? fmtTokens(st.totalTokens) : '—' }}</b>
                  </div>
                  <div class="stat-cell">
                    <span>重试次数</span><b>{{ st.retries }} 次</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analysis-overlay {
  position: fixed;
  inset: 0;
  background: rgba(40, 28, 12, 0.45);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.analysis-modal {
  width: min(1240px, 100%);
  max-height: 96vh;
  overflow-y: auto;
  background: #fffaf0;
  border: 1px solid #d8c3a0;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(60, 40, 10, 0.35);
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px dashed #e5d7bd;
  position: sticky;
  top: 0;
  background: #fffaf0;
  z-index: 1;
}

.modal-head h2 {
  margin: 0;
  font-size: 16px;
  color: #4a2f14;
}

.close-btn {
  font-size: 12px;
  padding: 4px 14px;
}

.modal-body {
  padding: 14px 18px 18px;
}

.empty {
  color: #8a7357;
  font-size: 13px;
  padding: 12px 0;
  text-align: center;
}

.chart-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.chart-block {
  min-width: 0;
}

.chart-title {
  font-size: 13px;
  font-weight: 700;
  color: #4a2f14;
  margin-bottom: 6px;
}

.chart {
  width: 100%;
  aspect-ratio: 16 / 8;
  height: auto;
  background: #fffdf8;
  border: 1px solid #e8dcc2;
  border-radius: 8px;
}

.chart-empty {
  font-size: 12px;
  color: #8a7357;
  border: 1px dashed #e0d0ae;
  border-radius: 8px;
  padding: 24px 10px;
  text-align: center;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-bottom: 6px;
}

.legend-item {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-size: 12px;
  color: #6b5a41;
}

.legend-dot,
.stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.grid-line {
  stroke: #e4d7bd;
  stroke-width: 1;
}

.axis-label {
  font-size: 10px;
  fill: #8a7357;
}

.line {
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.dot {
  cursor: pointer;
  stroke: #fffdf8;
  stroke-width: 1.5;
}

.guide-line {
  stroke: #b89a6a;
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.tooltip-text {
  font-size: 11px;
  fill: #4a2f14;
  font-weight: 600;
}

.stats-section {
  margin-top: 18px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #4a2f14;
  margin-bottom: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.stat-card {
  border: 1px solid #e2d3b8;
  border-radius: 8px;
  background: #fffdf6;
  padding: 10px 12px;
}

.stat-head {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  color: #4a2f14;
  margin-bottom: 8px;
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
}

.stat-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #8a7357;
}

.stat-cell b {
  color: #4a2f14;
  font-weight: 600;
  font-family: Consolas, monospace;
}

@media (max-width: 760px) {
  .analysis-overlay {
    padding: 8px;
  }

  .chart-row {
    grid-template-columns: 1fr;
  }
}
</style>
