import { adjacentIndices } from "../grid/adjacency.ts";
import { cellIndex } from "../grid/coordinates.ts";
import type { Puzzle, Terminal } from "../types/puzzle.ts";
import {
  isBitSet,
  isReachable,
} from "./residual-reachability.ts";

export function createTerminalIndexSet(
  puzzle: Puzzle,
): ReadonlySet<number> {
  return new Set(
    puzzle.terminals.map((terminal) => (
      cellIndex(terminal, puzzle.width)
    )),
  );
}

export function sortTerminals(
  terminals: readonly Terminal[],
  width: number,
): readonly Terminal[] {
  return terminals.toSorted((left, right) => (
    cellIndex(left, width) - cellIndex(right, width)
    || left.terminalId.localeCompare(right.terminalId)
  ));
}

export function terminalSearchStateKey(
  occupied: bigint,
  remainingTerminals: readonly Terminal[],
): string {
  return `${occupied.toString(16)}|${remainingTerminals
    .map((terminal) => terminal.terminalId)
    .toSorted()
    .join(",")}`;
}

export function canEnterPathCell(
  terminalIndices: ReadonlySet<number>,
  index: number,
  targetIndex: number,
  occupied: bigint,
  visited: bigint,
): boolean {
  if (isBitSet(occupied, index) || isBitSet(visited, index)) {
    return false;
  }
  return index === targetIndex || !terminalIndices.has(index);
}

export function hasEvenSymbolParityInEveryComponent(
  puzzle: Puzzle,
  terminals: readonly Terminal[],
  occupied: bigint,
): boolean {
  const componentByIndex = new Int16Array(
    puzzle.width * puzzle.height,
  );
  componentByIndex.fill(-1);
  let component = 0;
  for (let index = 0; index < componentByIndex.length; index += 1) {
    if (componentByIndex[index] !== -1 || isBitSet(occupied, index)) {
      continue;
    }
    const queue = [index];
    componentByIndex[index] = component;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === undefined) {
        continue;
      }
      for (const neighbor of adjacentIndices(
        current,
        puzzle.width,
        puzzle.height,
      )) {
        if (
          componentByIndex[neighbor] === -1
          && !isBitSet(occupied, neighbor)
        ) {
          componentByIndex[neighbor] = component;
          queue.push(neighbor);
        }
      }
    }
    component += 1;
  }
  const counts = new Map<string, number>();
  for (const terminal of terminals) {
    const componentId = componentByIndex[cellIndex(
      terminal,
      puzzle.width,
    )];
    const key = `${componentId}:${terminal.symbol}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].every((count) => count % 2 === 0);
}

export function allTerminalsHaveReachablePartners(
  puzzle: Puzzle,
  terminalIndices: ReadonlySet<number>,
  terminals: readonly Terminal[],
  occupied: bigint,
  requiredPartnerByTerminalId?: ReadonlyMap<string, string>,
): boolean {
  const grid = {
    width: puzzle.width,
    height: puzzle.height,
    occupied,
    terminalIndices,
  };
  return terminals.every((terminal) => {
    const requiredPartnerId = requiredPartnerByTerminalId?.get(
      terminal.terminalId,
    );
    return terminals.some((candidate) => (
      candidate.terminalId !== terminal.terminalId
      && candidate.symbol === terminal.symbol
      && (
        requiredPartnerId === undefined
        || candidate.terminalId === requiredPartnerId
      )
      && isReachable(
        grid,
        cellIndex(terminal, puzzle.width),
        cellIndex(candidate, puzzle.width),
      )
    ));
  });
}
