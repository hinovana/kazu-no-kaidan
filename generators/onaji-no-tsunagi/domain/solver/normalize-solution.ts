import { cellIndex } from "../grid/coordinates.ts";
import type { Solution } from "../types/solution.ts";

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
