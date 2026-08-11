/** 棋子颜色：0=空位，1=黑棋，2=白棋 */
export type Stone = 0 | 1 | 2

export const EMPTY = 0 as Stone
export const BLACK = 1 as Stone
export const WHITE = 2 as Stone

/** 支持的棋盘尺寸 */
export const SUPPORTED_SIZES = [7, 9, 11, 13, 15] as const
export type BoardSize = (typeof SUPPORTED_SIZES)[number]

/** 连成几子获胜 */
export const WIN_LENGTH = 5

/** 创建 size x size 的空棋盘 */
export function createBoard(size: number): Stone[][] {
  return Array.from({ length: size }, () => Array<Stone>(size).fill(EMPTY))
}

/** 深拷贝棋盘 */
export function cloneBoard(board: Stone[][]): Stone[][] {
  return board.map((row) => row.slice())
}

/** 判断 (x, y) 是否为合法落子点：在界内且为空 */
export function isValidMove(board: Stone[][], x: number, y: number): boolean {
  return (
    x >= 0 &&
    y >= 0 &&
    x < board.length &&
    y < board[x].length &&
    board[x][y] === EMPTY
  )
}

/** 落子，非法位置抛错 */
export function placeStone(board: Stone[][], x: number, y: number, color: Stone): void {
  if (color !== BLACK && color !== WHITE) {
    throw new Error(`落子颜色必须为 1 或 2，收到：${color}`)
  }
  if (!isValidMove(board, x, y)) {
    throw new Error(`非法落子：(${x}, ${y})`)
  }
  board[x][y] = color
}

/** 判断坐标是否在棋盘内 */
export function inBounds(board: Stone[][], x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < board.length && y < board[x].length
}