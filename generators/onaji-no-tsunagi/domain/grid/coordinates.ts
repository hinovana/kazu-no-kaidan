/**
 * セル座標、一次元index、文字列keyの相互変換と基礎的な距離計算を提供する。
 *
 * @packageDocumentation
 */

import type { Cell, Puzzle } from "../types/puzzle.ts";

/** 0始まり座標をMap・Setで使う`"row,column"`形式へ変換する。 */
export function cellKey(cell: Cell): string {
  return `${cell.row},${cell.column}`;
}

/** 0始まり座標を、指定幅のrow-major indexへ変換する。 */
export function cellIndex(cell: Cell, width: number): number {
  return cell.row * width + cell.column;
}

/** 指定幅のrow-major indexを0始まり座標へ戻す。 */
export function indexToCell(index: number, width: number): Cell {
  return {
    row: Math.floor(index / width),
    column: index % width,
  };
}

/** 座標が整数であり、盤面の0始まり範囲内にあるかを判定する。 */
export function isCellInBounds(cell: Cell, puzzle: Pick<Puzzle, "width" | "height">): boolean {
  return Number.isInteger(cell.row)
    && Number.isInteger(cell.column)
    && cell.row >= 0
    && cell.row < puzzle.height
    && cell.column >= 0
    && cell.column < puzzle.width;
}

/** 上下左右の最短距離に相当するManhattan距離を返す。 */
export function manhattanDistance(left: Cell, right: Cell): number {
  return Math.abs(left.row - right.row) + Math.abs(left.column - right.column);
}

/** 二セルが辺を共有する上下左右の隣接関係かを判定する。 */
export function areOrthogonallyAdjacent(left: Cell, right: Cell): boolean {
  return manhattanDistance(left, right) === 1;
}
