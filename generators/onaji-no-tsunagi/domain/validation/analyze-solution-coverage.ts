/**
 * Solutionが使用するセル数と盤面被覆率を集計する。
 *
 * @packageDocumentation
 */

import { cellKey } from "../grid/coordinates.ts";
import type { Puzzle } from "../types/puzzle.ts";
import type { Solution, SolutionCoverage } from "../types/solution.ts";

/**
 * 解答経路が使用する一意なセル数と盤面比率を集計する。
 *
 * `coverageRatio`は小数第3位へ丸める。解の有効性は別途validatorで確認する。
 */
export function analyzeSolutionCoverage(
  puzzle: Pick<Puzzle, "width" | "height">,
  solution: Solution,
): SolutionCoverage {
  const usedCells = new Set(
    solution.paths.flatMap((path) => path.cells.map(cellKey)),
  );
  const totalCellCount = puzzle.width * puzzle.height;
  return {
    usedCellCount: usedCells.size,
    unusedCellCount: totalCellCount - usedCells.size,
    totalCellCount,
    coverageRatio: round(usedCells.size / totalCellCount),
  };
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
