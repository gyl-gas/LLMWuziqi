import { reactive } from 'vue'
import { BLACK, WHITE, createBoard, isValidMove, placeStone } from '../core/board'
import type { Stone } from '../core/board'
import { checkWinAt, isBoardFull } from '../core/rules'
import type { MoveEntry } from '../core/notation'

export interface GameState {
  boardSize: number
  board: Stone[][]
  currentPlayer: Stone
  winner: Stone | null
  isDraw: boolean
  winLine: Array<[number, number]> | null
  moveCount: number
  moves: MoveEntry[]
  lastMove: MoveEntry | null
}

function initialState(): GameState {
  return {
    boardSize: 15,
    board: createBoard(15),
    currentPlayer: BLACK,
    winner: null,
    isDraw: false,
    winLine: null,
    moveCount: 0,
    moves: [],
    lastMove: null,
  }
}

const SNAPSHOT_KEY = 'gomoku.game'

/** 对局快照：用于棋局暂存（刷新后恢复） */
export interface GameSnapshot {
  boardSize: number
  currentPlayer: Stone
  winner: Stone | null
  isDraw: boolean
  winLine: Array<[number, number]> | null
  moveCount: number
  moves: MoveEntry[]
  lastMove: MoveEntry | null
  savedAt: number
}

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/** 保存当前对局快照（落子后自动调用） */
function saveSnapshot(): void {
  if (!hasStorage()) return
  const snap: GameSnapshot = {
    boardSize: state.boardSize,
    currentPlayer: state.currentPlayer,
    winner: state.winner,
    isDraw: state.isDraw,
    winLine: state.winLine,
    moveCount: state.moveCount,
    moves: state.moves.map((m) => ({ ...m })),
    lastMove: state.lastMove !== null ? { ...state.lastMove } : null,
    savedAt: Date.now(),
  }
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap))
}

function loadSnapshot(): GameSnapshot | null {
  if (!hasStorage()) return null
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (raw === null) return null
    const snap = JSON.parse(raw) as GameSnapshot
    if (!Number.isInteger(snap.boardSize) || snap.boardSize < 7 || !Array.isArray(snap.moves)) {
      return null
    }
    return snap
  } catch {
    return null
  }
}

/** 应用快照到当前状态：以 moves 为事实源重建棋盘并校验每一步合法性 */
function applySnapshot(snap: GameSnapshot): boolean {
  const board = createBoard(snap.boardSize)
  for (const m of snap.moves) {
    if (m.color !== BLACK && m.color !== WHITE) return false
    if (!isValidMove(board, m.x, m.y)) return false
    placeStone(board, m.x, m.y, m.color)
  }
  if (snap.moves.length === 0 && (snap.winner !== null || snap.isDraw)) return false

  state.boardSize = snap.boardSize
  state.board = board
  state.currentPlayer = snap.currentPlayer
  state.winner = snap.winner
  state.isDraw = snap.isDraw
  state.winLine = snap.winLine
  state.moveCount = snap.moves.length
  state.moves = snap.moves.map((m) => ({ ...m }))
  state.lastMove = snap.lastMove !== null ? { ...snap.lastMove } : null
  return true
}

/** 从暂存恢复对局；成功返回 true */
function restoreSnapshot(): boolean {
  const snap = loadSnapshot()
  if (snap === null) return false
  return applySnapshot(snap)
}

/** 导入外部对局快照（导入/导出功能）；成功后写入暂存 */
function importSnapshot(snap: GameSnapshot): boolean {
  if (!Number.isInteger(snap.boardSize) || snap.boardSize < 7 || !Array.isArray(snap.moves)) {
    return false
  }
  if (snap.currentPlayer !== BLACK && snap.currentPlayer !== WHITE) return false
  const ok = applySnapshot(snap)
  if (ok) saveSnapshot()
  return ok
}

/** 清除暂存（新对局开始时调用） */
function clearSnapshot(): void {
  if (!hasStorage()) return
  localStorage.removeItem(SNAPSHOT_KEY)
}

const state = reactive<GameState>(initialState())

export function useGame() {
  /** 以指定尺寸开始新对局 */
  function start(size: number) {
    Object.assign(state, initialState())
    state.boardSize = size
    state.board = createBoard(size)
    clearSnapshot()
  }

  /** 在 (x, y) 落当前棋子；meta 携带来源/模型/耗时等元数据，随快照一并保存 */
  function play(
    x: number,
    y: number,
    meta?: Partial<Omit<MoveEntry, 'seq' | 'color' | 'x' | 'y'>>,
  ): boolean {
    if (state.winner !== null || state.isDraw) return false
    if (!isValidMove(state.board, x, y)) return false

    const color = state.currentPlayer
    placeStone(state.board, x, y, color)

    state.moveCount += 1
    const entry: MoveEntry = { seq: state.moveCount, color, x, y, ...meta }
    state.moves.push(entry)
    state.lastMove = entry

    const win = checkWinAt(state.board, x, y)
    if (win !== null) {
      state.winner = win.winner
      state.winLine = win.line
    } else if (isBoardFull(state.board)) {
      state.isDraw = true
    } else {
      state.currentPlayer = color === BLACK ? WHITE : BLACK
    }
    saveSnapshot()
    return true
  }

  /** 判负：color 一方认负/失败（AI 对弈中某方重试耗尽或无模型时），对方获胜 */
  function forfeit(color: Stone): void {
    if (state.winner !== null || state.isDraw) return
    if (color !== BLACK && color !== WHITE) return
    state.winner = color === BLACK ? WHITE : BLACK
    state.winLine = null
    saveSnapshot()
  }

  return { state, start, play, forfeit, restoreSnapshot, importSnapshot, clearSnapshot }
}