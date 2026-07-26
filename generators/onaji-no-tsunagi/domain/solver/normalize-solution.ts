/**
 * 経路の向きと列挙順に依存しないSolutionの正規形と識別keyを作る。
 *
 * 見かけ上の順序だけが異なる解を、同じ意味の解として数えるために使用する。
 *
 * @packageDocumentation
 */

import { cellIndex } from "../grid/coordinates.ts";
import type { Solution } from "../types/solution.ts";

/**
 * 経路の向きと列挙順を正規化し、意味が同じ解を同じ表現へ揃える。
 *
 * 使用セル、経路形状、端点pairの違いは保持する。
 */
export function normalizeSolution(solution: Solution, width: number): Solution {
  const paths = solution.paths.map((path) => {
    const forward = path.cells.map((cell) => cellIndex(cell, width));
    const reverse = [...forward].reverse();
    const useReverse = compareNumberLists(reverse, forward) < 0;
    return {
      symbol: path.symbol,
      cells: useReverse ? [...path.cells].reverse() : [...path.cells],
    };
  }).toSorted((left, right) => {
    const symbolOrder = left.symbol.localeCompare(right.symbol);
    if (symbolOrder !== 0) {
      return symbolOrder;
    }
    return compareNumberLists(
      left.cells.map((cell) => cellIndex(cell, width)),
      right.cells.map((cell) => cellIndex(cell, width)),
    );
  });
  return { paths };
}

/**
 * 正規化解の同一性判定に使う決定的な文字列表現を返す。
 *
 * 暗号学的hashではなく、正規化した全セル列そのものを含む。
 */
export function solutionHash(solution: Solution, width: number): string {
  const normalized = normalizeSolution(solution, width);
  return normalized.paths.map((path) => (
    `${path.symbol}:${path.cells.map((cell) => cellIndex(cell, width)).join(".")}`
  )).join("|");
}

function compareNumberLists(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}
