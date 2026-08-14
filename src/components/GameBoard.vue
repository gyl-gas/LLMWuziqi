<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BLACK } from '../core/board'
import type { Stone } from '../core/board'
import type { MoveEntry } from '../core/notation'

const props = defineProps<{
  board: Stone[][]
  boardSize: number
  currentPlayer: Stone
  lastMove: MoveEntry | null
  winLine: Array<[number, number]> | null
  disabled?: boolean
}>()

const emit = defineEmits<{ play: [x: number, y: number] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const BOARD_SIZE_PX = 650
const MARGIN = 42
const hover = ref<{ x: number; y: number } | null>(null)
let rafId = 0

function renderStone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: Stone,
  last = false,
  alpha = 1,
) {
  const cell = (BOARD_SIZE_PX - MARGIN * 2) / (props.boardSize - 1)
  const cx = MARGIN + y * cell
  const cy = MARGIN + x * cell
  const r = cell * 0.42
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = color === BLACK ? '#1a1a1a' : '#f7f7f7'
  ctx.fill()
  ctx.strokeStyle = color === BLACK ? '#000000' : '#9a9a9a'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.globalAlpha = 1
  if (last) {
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2)
    ctx.fillStyle = '#e53935'
    ctx.fill()
  }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const n = props.boardSize
  const cell = (BOARD_SIZE_PX - MARGIN * 2) / (n - 1)
  const cssSize = BOARD_SIZE_PX

  canvas.style.width = `${cssSize}px`
  canvas.style.height = `${cssSize}px`
  if (canvas.width !== Math.round(cssSize * dpr)) {
    canvas.width = Math.round(cssSize * dpr)
    canvas.height = Math.round(cssSize * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // 木色背景
  ctx.fillStyle = '#e6b768'
  ctx.fillRect(0, 0, cssSize, cssSize)

  // 网格线
  ctx.strokeStyle = '#6b4423'
  ctx.lineWidth = 1
  for (let i = 0; i < n; i++) {
    const p = MARGIN + i * cell
    ctx.beginPath()
    ctx.moveTo(MARGIN, p)
    ctx.lineTo(MARGIN + (n - 1) * cell, p)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(p, MARGIN)
    ctx.lineTo(p, MARGIN + (n - 1) * cell)
    ctx.stroke()
  }

  // 星位：仅四角星位 + 天元（不包含边线中点）
  const mid = Math.floor(n / 2)
  const cornerStars = n <= 7 ? [mid] : n === 9 ? [2, n - 3] : [3, n - 4]
  const starPoints: Array<[number, number]> = []
  for (const sx of cornerStars) {
    for (const sy of cornerStars) {
      starPoints.push([sx, sy])
    }
  }
  starPoints.push([mid, mid])
  ctx.fillStyle = '#6b4423'
  for (const [sx, sy] of starPoints) {
    ctx.beginPath()
    ctx.arc(MARGIN + sx * cell, MARGIN + sy * cell, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  // 侧边行列数字标记（0 起始，与坐标/棋谱一致）
  ctx.fillStyle = '#7a5a2e'
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < n; i++) {
    ctx.fillText(String(i), MARGIN - 15, MARGIN + i * cell)
    ctx.fillText(String(i), MARGIN + i * cell, MARGIN - 15)
  }

  // 棋子 + 最后一手标记
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const stone = props.board[x][y]
      if (stone === 0) continue
      const last = props.lastMove !== null && props.lastMove.x === x && props.lastMove.y === y
      renderStone(ctx, x, y, stone, last)
    }
  }

  // 胜利连线
  const winLine = props.winLine
  if (winLine !== null && winLine.length > 0) {
    const [x1, y1] = winLine[0]
    const [x2, y2] = winLine[winLine.length - 1]
    ctx.strokeStyle = '#e53935'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(MARGIN + y1 * cell, MARGIN + x1 * cell)
    ctx.lineTo(MARGIN + y2 * cell, MARGIN + x2 * cell)
    ctx.stroke()
  }

  // 悬停预览
  if (!props.disabled && hover.value !== null) {
    const { x, y } = hover.value
    if (x >= 0 && y >= 0 && x < n && y < n && props.board[x][y] === 0) {
      renderStone(ctx, x, y, props.currentPlayer, false, 0.45)
    }
  }
}

function toGrid(e: MouseEvent): { x: number; y: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const cell = (BOARD_SIZE_PX - MARGIN * 2) / (props.boardSize - 1)
  const col = Math.round((e.clientX - rect.left - MARGIN) / cell)
  const row = Math.round((e.clientY - rect.top - MARGIN) / cell)
  if (row < 0 || col < 0 || row >= props.boardSize || col >= props.boardSize) return null
  return { x: row, y: col }
}

function onMouseMove(e: MouseEvent) {
  hover.value = toGrid(e)
  if (rafId === 0) {
    rafId = requestAnimationFrame(() => {
      rafId = 0
      draw()
    })
  }
}

function onMouseLeave() {
  hover.value = null
  draw()
}

function onClick(e: MouseEvent) {
  if (props.disabled) return
  const pos = toGrid(e)
  if (pos !== null) emit('play', pos.x, pos.y)
}

watch(() => [props.board, props.boardSize, props.currentPlayer, props.lastMove, props.winLine, props.disabled], draw, {
  deep: true,
})
onMounted(draw)
onBeforeUnmount(() => {
  if (rafId !== 0) cancelAnimationFrame(rafId)
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="board"
    @click="onClick"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  />
</template>

<style scoped>
.board {
  display: block;
  margin: 0 auto;
  cursor: crosshair;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}
</style>