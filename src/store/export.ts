import { SUPPORTED_SIZES } from '../core/board'
import type { AiSide, GameConfig } from './config'
import type { GameSnapshot } from './game'

export const EXPORT_FORMAT = 'gomoku-export'
export const EXPORT_VERSION = 1

/** 对局导出文件：棋局快照 + 对局配置（未终局对局可据此继续） */
export interface ExportedGame {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  savedAt: number
  boardSize: number
  mode: GameConfig['mode']
  humanColor: GameConfig['humanColor']
  notation: GameConfig['notation']
  autoRequestAi: boolean
  aiBlack: AiSide | null
  aiWhite: AiSide | null
  snapshot: GameSnapshot
}

/** 由当前棋局快照与对局配置生成导出文件对象 */
export function buildExport(snapshot: GameSnapshot, game: GameConfig): ExportedGame {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    savedAt: Date.now(),
    boardSize: game.boardSize,
    mode: game.mode,
    humanColor: game.humanColor,
    notation: game.notation,
    autoRequestAi: game.autoRequestAi,
    aiBlack: game.aiBlack !== null ? { ...game.aiBlack } : null,
    aiWhite: game.aiWhite !== null ? { ...game.aiWhite } : null,
    snapshot: {
      boardSize: snapshot.boardSize,
      currentPlayer: snapshot.currentPlayer,
      winner: snapshot.winner,
      isDraw: snapshot.isDraw,
      winLine: snapshot.winLine,
      moveCount: snapshot.moveCount,
      moves: snapshot.moves.map((m) => ({ ...m })),
      lastMove: snapshot.lastMove !== null ? { ...snapshot.lastMove } : null,
      savedAt: snapshot.savedAt,
    },
  }
}

export type ParseExportResult = { ok: true; data: ExportedGame } | { ok: false; reason: string }

function isAiSide(v: unknown): v is AiSide {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.providerId === 'string' && typeof o.model === 'string'
}

/** 解析并校验导入的对局文件文本 */
export function parseExport(text: string): ParseExportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: '文件不是有效的 JSON' }
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: '文件内容不是对象' }
  const o = raw as Record<string, unknown>
  if (o.format !== EXPORT_FORMAT) return { ok: false, reason: '不是本应用导出的对局文件' }
  if (o.version !== EXPORT_VERSION) return { ok: false, reason: '对局文件版本不受支持' }
  const mode = o.mode
  if (mode !== 'pvp' && mode !== 'human-ai' && mode !== 'ai-ai') {
    return { ok: false, reason: '对局模式字段无效' }
  }
  const boardSize = o.boardSize
  if (typeof boardSize !== 'number' || !Number.isInteger(boardSize)) {
    return { ok: false, reason: '棋盘尺寸无效' }
  }
  if (!(SUPPORTED_SIZES as readonly number[]).includes(boardSize)) {
    return { ok: false, reason: '棋盘尺寸不在支持范围（7/9/11/13/15）' }
  }
  const humanColor = o.humanColor
  if (humanColor !== 1 && humanColor !== 2) return { ok: false, reason: '人类执子颜色无效' }
  const notation = o.notation
  if (notation !== 'plain' && notation !== 'numbered') return { ok: false, reason: '棋盘表示模式无效' }
  const aiBlack = o.aiBlack === null || o.aiBlack === undefined ? null : isAiSide(o.aiBlack) ? o.aiBlack : null
  const aiWhite = o.aiWhite === null || o.aiWhite === undefined ? null : isAiSide(o.aiWhite) ? o.aiWhite : null
  const snap = o.snapshot
  if (typeof snap !== 'object' || snap === null) {
    return { ok: false, reason: '棋局快照缺失或无效' }
  }
  const s = snap as Record<string, unknown>
  if (!Array.isArray(s.moves)) {
    return { ok: false, reason: '棋局快照缺失或无效' }
  }
  const snapshot: GameSnapshot = {
    boardSize: s.boardSize as number,
    currentPlayer: s.currentPlayer as GameSnapshot['currentPlayer'],
    winner: s.winner === null ? null : (s.winner as GameSnapshot['winner']),
    isDraw: s.isDraw === true,
    winLine: s.winLine === null ? null : (s.winLine as GameSnapshot['winLine']),
    moveCount: s.moveCount as number,
    moves: s.moves as GameSnapshot['moves'],
    lastMove: s.lastMove === null || s.lastMove === undefined ? null : (s.lastMove as GameSnapshot['lastMove']),
    savedAt: typeof s.savedAt === 'number' ? s.savedAt : Date.now(),
  }
  return {
    ok: true,
    data: {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      savedAt: typeof o.savedAt === 'number' ? o.savedAt : Date.now(),
      boardSize,
      mode,
      humanColor,
      notation,
      autoRequestAi: o.autoRequestAi === true,
      aiBlack,
      aiWhite,
      snapshot,
    },
  }
}
