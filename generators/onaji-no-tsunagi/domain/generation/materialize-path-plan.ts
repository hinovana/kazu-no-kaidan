import { cellIndex, cellKey } from "../grid/coordinates.ts";
import { orderedTerminalIds } from "../solver/enumerate-pairings.ts";
import type { Cell, Puzzle, SymbolId, Terminal } from "../types/puzzle.ts";
import type { PathSolution, Solution } from "../types/solution.ts";
import type { RouteRoles } from "../types/worksheet.ts";
import { stableHash } from "./random.ts";

export type RouteRole = "spine" | "thread" | "scaffold";

export interface PlannedPath {
  readonly role: RouteRole;
  readonly symbol: SymbolId;
  readonly cells: readonly Cell[];
}

export interface MaterializedPathPlan {
  readonly puzzle: Puzzle;
  readonly plantedSolution: Solution;
  readonly routeRoles: RouteRoles;
  readonly topologyHash: string;
}

export function materializePathPlan(
  paths: readonly PlannedPath[],
  width: number,
  height: number,
  puzzleSeed: string,
): MaterializedPathPlan {
  const rawTerminals = paths.flatMap((path) => {
    const first = path.cells[0];
    const second = path.cells.at(-1);
    if (first === undefined || second === undefined) {
      throw new TypeError("planned route has no endpoints");
    }
    return [
      { ...first, symbol: path.symbol },
      { ...second, symbol: path.symbol },
    ];
  });
  const terminals: Terminal[] = rawTerminals
    .toSorted((left, right) => (
      cellIndex(left, width) - cellIndex(right, width)
      || left.symbol.localeCompare(right.symbol)
    ))
    .map((terminal, index) => ({
      terminalId: `terminal-${index + 1}`,
      symbol: terminal.symbol,
      row: terminal.row,
      column: terminal.column,
    }));
  const terminalByCell = new Map(
    terminals.map((terminal) => [cellKey(terminal), terminal] as const),
  );
  const terminalIdsByPath = paths.map((path) => {
    const firstCell = path.cells[0];
    const secondCell = path.cells.at(-1);
    if (firstCell === undefined || secondCell === undefined) {
      throw new TypeError("planned route has no endpoints");
    }
    const first = terminalByCell.get(cellKey(firstCell));
    const second = terminalByCell.get(cellKey(secondCell));
    if (first === undefined || second === undefined) {
      throw new TypeError("planned endpoint was not materialized");
    }
    return orderedTerminalIds(first.terminalId, second.terminalId);
  });
  const topologyHash = stableHash(
    canonicalTopologySignature(terminals, width, height),
  );
  const puzzle: Puzzle = {
    schemaVersion: "onaji-no-tsunagi.puzzle.v1",
    puzzleId: `ots-${stableHash(`${puzzleSeed}|${topologyHash}`)}`,
    width,
    height,
    terminals,
  };
  const plantedSolution: Solution = {
    paths: paths.map((path): PathSolution => ({
      symbol: path.symbol,
      cells: path.cells,
    })),
  };
  const spineIndex = paths.findIndex((path) => path.role === "spine");
  const threadIndex = paths.findIndex((path) => path.role === "thread");
  if (spineIndex < 0 || threadIndex < 0) {
    throw new TypeError("route roles are incomplete");
  }
  const spineTerminalIds = terminalIdsByPath[spineIndex];
  const threadTerminalIds = terminalIdsByPath[threadIndex];
  if (spineTerminalIds === undefined || threadTerminalIds === undefined) {
    throw new TypeError("route role terminals are incomplete");
  }
  return {
    puzzle,
    plantedSolution,
    routeRoles: {
      spineTerminalIds,
      threadTerminalIds,
      scaffoldTerminalIdPairs: paths.flatMap((path, index) => (
        path.role === "scaffold"
          ? [terminalIdsByPath[index] ?? failMissingPair()]
          : []
      )),
    },
    topologyHash,
  };
}

function failMissingPair(): never {
  throw new TypeError("scaffold terminal pair is missing");
}

function canonicalTopologySignature(
  terminals: readonly Terminal[],
  width: number,
  height: number,
): string {
  const variants: string[] = [];
  for (let quarterTurns = 0; quarterTurns < 4; quarterTurns += 1) {
    for (const reflect of [false, true]) {
      const transformed = terminals.map((terminal) => {
        let cell: Cell = terminal;
        let transformedWidth = width;
        let transformedHeight = height;
        for (let turn = 0; turn < quarterTurns; turn += 1) {
          cell = {
            row: cell.column,
            column: transformedHeight - 1 - cell.row,
          };
          [transformedWidth, transformedHeight] = [
            transformedHeight,
            transformedWidth,
          ];
        }
        return {
          symbol: terminal.symbol,
          row: cell.row,
          column: reflect
            ? transformedWidth - 1 - cell.column
            : cell.column,
        };
      });
      const groups = new Map<SymbolId, string[]>();
      for (const terminal of transformed) {
        const coordinates = groups.get(terminal.symbol) ?? [];
        coordinates.push(`${terminal.row},${terminal.column}`);
        groups.set(terminal.symbol, coordinates);
      }
      const normalizedGroups = [...groups.values()]
        .map((coordinates) => coordinates.toSorted().join(";"))
        .toSorted()
        .join("|");
      const transformedWidth = quarterTurns % 2 === 0 ? width : height;
      const transformedHeight = quarterTurns % 2 === 0 ? height : width;
      variants.push(
        `${transformedWidth}x${transformedHeight}|${normalizedGroups}`,
      );
    }
  }
  return variants.toSorted()[0] ?? `${width}x${height}|`;
}
