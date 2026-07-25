import { adjacentIndices } from "../grid/adjacency.ts";
import {
  cellKey,
  manhattanDistance,
} from "../grid/coordinates.ts";
import type { Puzzle, Terminal } from "../types/puzzle.ts";
import type {
  PathGeometryAnalysis,
  Solution,
  SolutionCost,
  SolutionGeometryAnalysis,
} from "../types/solution.ts";
import { solutionHash } from "../solver/normalize-solution.ts";

export interface RouteRoleTerminalIds {
  readonly spineTerminalIds: readonly [string, string];
  readonly threadTerminalIds: readonly [string, string];
  readonly scaffoldTerminalIdPairs: readonly (readonly [string, string])[];
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
  roles: RouteRoleTerminalIds,
  optimalPrimaryCostSolutionCount: number,
): SolutionGeometryAnalysis {
  const terminalByCell = new Map(
    puzzle.terminals.map((terminal) => [cellKey(terminal), terminal] as const),
  );
  const rolePairKeys = {
    thread: terminalPairKey(roles.threadTerminalIds),
    scaffold: new Set(roles.scaffoldTerminalIdPairs.map(terminalPairKey)),
  };
  const paths = solution.paths.map((path, pathIndex) => {
    const firstCell = path.cells[0];
    const lastCell = path.cells.at(-1);
    if (firstCell === undefined || lastCell === undefined) {
      throw new TypeError("solution path has no endpoints");
    }
    const first = terminalByCell.get(cellKey(firstCell));
    const last = terminalByCell.get(cellKey(lastCell));
    if (first === undefined || last === undefined) {
      throw new TypeError("solution path endpoint is not a terminal");
    }
    return analyzePath(puzzle, pathIndex, path.symbol, path.cells, first, last);
  });
  const totalEdgeCount = sum(paths.map((path) => path.edgeCount));
  const totalTurnCount = sum(paths.map((path) => path.turnCount));
  const unitBayCount = sum(paths.map((path) => path.unitBayCount));
  const detourEdgeCount = sum(paths.map((path) => path.detourEdgeCount));
  const maximumPathDetourRatio = paths.reduce(
    (maximum, path) => Math.max(
      maximum,
      path.manhattanDistance === 0
        ? 1
        : path.edgeCount / path.manhattanDistance,
    ),
    1,
  );
  const sortedLengths = paths.map((path) => path.edgeCount).toSorted((left, right) => left - right);
  const median = sortedLengths[Math.floor(sortedLengths.length / 2)] ?? 0;
  const pathLengthImbalance = (sortedLengths.at(-1) ?? 0) - median;
  const scaffoldPaths = paths.filter((path) => (
    rolePairKeys.scaffold.has(terminalPairKey(path.terminalIds))
  ));
  const supportShortestPathRatio = scaffoldPaths.length === 0
    ? 1
    : round(
        scaffoldPaths.filter((path) => path.detourEdgeCount === 0).length
          / scaffoldPaths.length,
      );
  const detouringPaths = paths
    .filter((path) => path.detourEdgeCount > 0)
    .toSorted((left, right) => right.detourEdgeCount - left.detourEdgeCount);
  const majorityThreshold = detourEdgeCount * 0.75;
  let carried = 0;
  let detourCarrierCount = 0;
  for (const path of detouringPaths) {
    carried += path.detourEdgeCount;
    detourCarrierCount += 1;
    if (carried >= majorityThreshold) {
      break;
    }
  }
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
  const thread = paths.find((path) => (
    terminalPairKey(path.terminalIds) === rolePairKeys.thread
  ));
  if (thread === undefined) {
    throw new TypeError("canonical solution does not preserve the thread role");
  }
  return {
    totalEdgeCount,
    totalTurnCount,
    unitBayCount,
    unexplainedUnitBayCount: unitBayCount,
    detourEdgeCount,
    maximumPathDetourRatio: round(maximumPathDetourRatio),
    pathLengthImbalance,
    supportShortestPathRatio,
    detourCarrierCount,
    unusedComponentCount: componentCount,
    isolatedUnusedCellCount: isolatedCellCount,
    optimalPrimaryCostSolutionCount,
    paths,
  };
}

function analyzePath(
  puzzle: Puzzle,
  pathIndex: number,
  symbol: PathGeometryAnalysis["symbol"],
  cells: Solution["paths"][number]["cells"],
  first: Terminal,
  last: Terminal,
): PathGeometryAnalysis {
  const edgeCount = Math.max(0, cells.length - 1);
  const distance = manhattanDistance(first, last);
  return {
    pathIndex,
    symbol,
    terminalIds: orderedTerminalIds(first.terminalId, last.terminalId),
    edgeCount,
    manhattanDistance: distance,
    detourEdgeCount: edgeCount - distance,
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

function orderedTerminalIds(
  first: string,
  second: string,
): readonly [string, string] {
  return first.localeCompare(second) <= 0
    ? [first, second]
    : [second, first];
}

function terminalPairKey(pair: readonly [string, string]): string {
  return [...pair].toSorted().join("|");
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
