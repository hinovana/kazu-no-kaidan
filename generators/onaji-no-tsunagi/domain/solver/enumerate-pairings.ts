import { manhattanDistance } from "../grid/coordinates.ts";
import type { Terminal } from "../types/puzzle.ts";

export function listSameSymbolPartners(
  terminal: Terminal,
  terminals: readonly Terminal[],
): readonly Terminal[] {
  return terminals
    .filter((candidate) => (
      candidate.symbol === terminal.symbol
      && candidate.terminalId !== terminal.terminalId
    ))
    .toSorted((left, right) => (
      manhattanDistance(terminal, left)
        - manhattanDistance(terminal, right)
      || left.terminalId.localeCompare(right.terminalId)
    ));
}

export function countPerfectMatchings(terminalCount: number): number {
  if (terminalCount < 2 || terminalCount % 2 !== 0) {
    return 0;
  }
  let result = 1;
  for (let value = terminalCount - 1; value >= 1; value -= 2) {
    result *= value;
  }
  return result;
}

export function orderedTerminalIds(
  first: string,
  second: string,
): readonly [string, string] {
  return first.localeCompare(second) <= 0
    ? [first, second]
    : [second, first];
}

export function terminalPairKey(
  first: string,
  second: string,
): string {
  return orderedTerminalIds(first, second).join("|");
}
