import { cellKey } from "../grid/coordinates.ts";
import type { Puzzle } from "../types/puzzle.ts";
import type { Solution, SolutionCoverage } from "../types/solution.ts";

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
