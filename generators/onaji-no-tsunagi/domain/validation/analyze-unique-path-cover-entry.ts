import { adjacentIndices } from "../grid/adjacency.ts";
import { cellIndex } from "../grid/coordinates.ts";
import { countPerfectMatchings } from "../solver/enumerate-pairings.ts";
import type {
  Puzzle,
  SymbolId,
  Terminal,
  TerminalMultiplicityPattern,
} from "../types/puzzle.ts";
import type { UniquePathCoverEntryAnalysis } from "../types/worksheet.ts";

interface UniquePathCoverEntryCriteria {
  readonly terminalPattern: TerminalMultiplicityPattern;
  readonly terminalCount: number;
  readonly symbolPathCounts: readonly [number, number, number];
  readonly minimumForcedExitCount: number;
  readonly maximumForcedExitCount: number;
  readonly maximumLineConcentration: number;
}

type UniquePathCoverEntryResult =
  | {
      readonly status: "candidate";
      readonly analysis: UniquePathCoverEntryAnalysis;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "anchor_count"
        | "terminal_without_exit"
        | "forced_exit_count"
        | "line_concentration";
    };

export function analyzeUniquePathCoverEntry(
  puzzle: Puzzle,
  criteria: UniquePathCoverEntryCriteria,
): UniquePathCoverEntryResult {
  const terminalsBySymbol = groupTerminalsBySymbol(puzzle.terminals);
  const symbolGroups = [...terminalsBySymbol.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right));
  const actualTerminalCounts = symbolGroups
    .map(([, terminals]) => terminals.length)
    .toSorted((left, right) => left - right);
  const expectedTerminalCounts = criteria.symbolPathCounts
    .map((pathCount) => pathCount * 2)
    .toSorted((left, right) => left - right);
  if (
    puzzle.terminals.length !== criteria.terminalCount
    || symbolGroups.length !== 3
    || actualTerminalCounts.some((count, index) => (
      count !== expectedTerminalCounts[index]
    ))
  ) {
    return { status: "rejected", reason: "anchor_count" };
  }
  const terminalIndices = new Set(
    puzzle.terminals.map((terminal) => cellIndex(terminal, puzzle.width)),
  );
  const openExitCountByTerminalId = Object.fromEntries(
    puzzle.terminals.map((terminal) => {
      const index = cellIndex(terminal, puzzle.width);
      const openExitCount = adjacentIndices(
        index,
        puzzle.width,
        puzzle.height,
      ).filter((candidate) => !terminalIndices.has(candidate)).length;
      return [terminal.terminalId, openExitCount];
    }),
  );
  if (Object.values(openExitCountByTerminalId).some((count) => count === 0)) {
    return { status: "rejected", reason: "terminal_without_exit" };
  }
  const forcedExitTerminalIds = Object.entries(openExitCountByTerminalId)
    .filter(([, count]) => count === 1)
    .map(([terminalId]) => terminalId)
    .toSorted();
  if (
    forcedExitTerminalIds.length < criteria.minimumForcedExitCount
    || forcedExitTerminalIds.length > criteria.maximumForcedExitCount
  ) {
    return { status: "rejected", reason: "forced_exit_count" };
  }
  const maximumLineConcentration = Math.max(
    ...Array.from({ length: puzzle.width }, (_, column) => (
      puzzle.terminals.filter((terminal) => (
        terminal.column === column
      )).length
    )),
    ...Array.from({ length: puzzle.height }, (_, row) => (
      puzzle.terminals.filter((terminal) => terminal.row === row).length
    )),
  );
  if (maximumLineConcentration > criteria.maximumLineConcentration) {
    return { status: "rejected", reason: "line_concentration" };
  }
  const pairingChoiceCount = symbolGroups.reduce(
    (product, [, terminals]) => (
      product * countPerfectMatchings(terminals.length)
    ),
    1,
  );
  const localExitHypothesisCount = Object.values(
    openExitCountByTerminalId,
  ).reduce((product, count) => product * count, 1);
  return {
    status: "candidate",
    analysis: {
      analysisVersion: puzzle.width === 5
        ? "onaji-no-tsunagi-entry.v3.3"
        : "onaji-no-tsunagi-entry.v3.4-draft",
      pattern: "unique_path_cover",
      terminalPattern: criteria.terminalPattern,
      symbolGroups: symbolGroups.map(([, terminals]) => ({
        terminalIds: terminals
          .map((terminal) => terminal.terminalId)
          .toSorted(),
        pairingChoiceCount: countPerfectMatchings(terminals.length),
      })),
      pairingChoiceCount,
      forcedExitTerminalIds,
      maximumLineConcentration,
      naturalHypothesisCount:
        pairingChoiceCount * localExitHypothesisCount,
      machineStatus: "entry_candidate",
    },
  };
}

function groupTerminalsBySymbol(
  terminals: readonly Terminal[],
): ReadonlyMap<SymbolId, readonly Terminal[]> {
  const groups = new Map<SymbolId, Terminal[]>();
  for (const terminal of terminals) {
    const entries = groups.get(terminal.symbol) ?? [];
    entries.push(terminal);
    groups.set(terminal.symbol, entries);
  }
  return groups;
}
