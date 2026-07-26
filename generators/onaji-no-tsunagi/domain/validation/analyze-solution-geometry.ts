import { adjacentIndices } from "../grid/adjacency.ts";
import {
  cellKey,
  manhattanDistance,
} from "../grid/coordinates.ts";
import type { Puzzle } from "../types/puzzle.ts";
import type {
  PathGeometryAnalysis,
  Solution,
  SolutionCost,
  SolutionGeometryAnalysis,
} from "../types/solution.ts";
import { solutionHash } from "../solver/normalize-solution.ts";

interface AnalyzedPath extends PathGeometryAnalysis {
  readonly turnCount: number;
  readonly unitBayCount: number;
}

export function calculateSolutionCost(
  puzzle: Puzzle,
  solution: Solution,
): SolutionCost {
  let totalEdgeCount = 0;
  let unitBayCount = 0;
  let totalTurnCount = 0;
  for (const path of solution.paths) {
    totalEdgeCount += Math.max(0, path.cells.length - 1);
    unitBayCount += countUnitBays(path.cells, puzzle.width);
    totalTurnCount += countTurns(path.cells);
  }
  return {
    totalEdgeCount,
    unitBayCount,
    totalTurnCount,
    normalizedSolutionHash: solutionHash(solution, puzzle.width),
  };
}

export function compareSolutionCost(
  left: SolutionCost,
  right: SolutionCost,
): number {
  return left.totalEdgeCount - right.totalEdgeCount
    || left.unitBayCount - right.unitBayCount
    || left.totalTurnCount - right.totalTurnCount
    || left.normalizedSolutionHash.localeCompare(right.normalizedSolutionHash);
}

export function analyzeSolutionGeometry(
  puzzle: Puzzle,
  solution: Solution,
): SolutionGeometryAnalysis {
  const paths = solution.paths.map((path) => (
    analyzePath(puzzle, path.cells)
  ));
  const totalEdgeCount = sum(paths.map((path) => path.edgeCount));
  const totalTurnCount = sum(paths.map((path) => path.turnCount));
  const unitBayCount = sum(paths.map((path) => path.unitBayCount));
  const occupied = new Set(
    solution.paths.flatMap((path) => path.cells.map(cellKey)),
  );
  const unused = new Set<string>();
  for (let row = 0; row < puzzle.height; row += 1) {
    for (let column = 0; column < puzzle.width; column += 1) {
      const key = `${row},${column}`;
      if (!occupied.has(key)) {
        unused.add(key);
      }
    }
  }
  const { componentCount, isolatedCellCount } = analyzeUnusedCells(
    puzzle,
    unused,
  );
  return {
    totalEdgeCount,
    totalTurnCount,
    unexplainedUnitBayCount: unitBayCount,
    unusedComponentCount: componentCount,
    isolatedUnusedCellCount: isolatedCellCount,
    paths: paths.map(({ edgeCount }) => ({ edgeCount })),
  };
}

function analyzePath(
  puzzle: Puzzle,
  cells: Solution["paths"][number]["cells"],
): AnalyzedPath {
  return {
    edgeCount: Math.max(0, cells.length - 1),
    turnCount: countTurns(cells),
    unitBayCount: countUnitBays(cells, puzzle.width),
  };
}

function countTurns(cells: Solution["paths"][number]["cells"]): number {
  let count = 0;
  for (let index = 2; index < cells.length; index += 1) {
    const before = cells[index - 2];
    const middle = cells[index - 1];
    const after = cells[index];
    if (before === undefined || middle === undefined || after === undefined) {
      continue;
    }
    const firstDirection = {
      row: middle.row - before.row,
      column: middle.column - before.column,
    };
    const secondDirection = {
      row: after.row - middle.row,
      column: after.column - middle.column,
    };
    if (
      firstDirection.row !== secondDirection.row
      || firstDirection.column !== secondDirection.column
    ) {
      count += 1;
    }
  }
  return count;
}

function countUnitBays(
  cells: Solution["paths"][number]["cells"],
  _width: number,
): number {
  let count = 0;
  for (let index = 3; index < cells.length; index += 1) {
    const first = cells[index - 3];
    const last = cells[index];
    if (first === undefined || last === undefined) {
      continue;
    }
    if (manhattanDistance(first, last) === 1) {
      count += 1;
    }
  }
  return count;
}

function analyzeUnusedCells(
  puzzle: Puzzle,
  unused: ReadonlySet<string>,
): { readonly componentCount: number; readonly isolatedCellCount: number } {
  const remaining = new Set(unused);
  let componentCount = 0;
  let isolatedCellCount = 0;
  while (remaining.size > 0) {
    const start = remaining.values().next().value as string | undefined;
    if (start === undefined) {
      break;
    }
    componentCount += 1;
    const queue = [start];
    remaining.delete(start);
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const key = queue[cursor];
      if (key === undefined) {
        continue;
      }
      size += 1;
      const [rowText, columnText] = key.split(",");
      const row = Number(rowText);
      const column = Number(columnText);
      const index = row * puzzle.width + column;
      for (const neighbor of adjacentIndices(index, puzzle.width, puzzle.height)) {
        const nextRow = Math.floor(neighbor / puzzle.width);
        const nextColumn = neighbor % puzzle.width;
        const nextKey = `${nextRow},${nextColumn}`;
        if (remaining.delete(nextKey)) {
          queue.push(nextKey);
        }
      }
    }
    if (size === 1) {
      isolatedCellCount += 1;
    }
  }
  return { componentCount, isolatedCellCount };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
