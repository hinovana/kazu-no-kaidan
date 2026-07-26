import { countPerfectMatchings } from "../solver/enumerate-pairings.ts";
import type { DifficultyAnalysis, DifficultyLevel } from "../types/difficulty.ts";
import type { Puzzle, SymbolId } from "../types/puzzle.ts";
import type {
  SolutionGeometryAnalysis,
  SolverMetrics,
} from "../types/solution.ts";
import type {
  EntryAnalysis,
  InteractionWitness,
} from "../types/worksheet.ts";

export function analyzeDifficulty(
  requestedLevel: DifficultyLevel,
  puzzle: Puzzle,
  geometry: SolutionGeometryAnalysis,
  entry: EntryAnalysis,
  witnesses: readonly InteractionWitness[],
  metrics: SolverMetrics,
): DifficultyAnalysis {
  const forcedTotal = metrics.forcedMoveCount + metrics.decisionPointCount;
  const gateCount = witnesses.filter((witness) => (
    witness.kind === "scaffold_gate"
  )).length;
  const requiredPairingRevision = witnesses.some((witness) => (
    witness.kind === "pairing_choice"
  ));
  const requiredShortestPathRevision = geometry.detourEdgeCount > 0;
  return {
    analyzerVersion: puzzle.width === 5
      ? "onaji-no-tsunagi-difficulty.v3.3"
      : "onaji-no-tsunagi-difficulty.v3.4-draft",
    requestedLevel,
    measuredBand: puzzle.width === 5
      ? 1
      : puzzle.terminals.length === 14
        ? 3
        : 2,
    exploredStateCount: metrics.exploredStateCount,
    backtrackCount: metrics.backtrackCount,
    maximumDecisionDepth: metrics.maximumDecisionDepth,
    forcedMoveRatio: forcedTotal === 0
      ? 1
      : round(metrics.forcedMoveCount / forcedTotal),
    pairingChoiceCount: countPairingChoices(puzzle),
    bottleneckInteractionCount: witnesses.length,
    nearestPairTrap: requiredPairingRevision,
    residualReachabilityPruneCount:
      metrics.residualReachabilityPruneCount,
    componentParityPruneCount: metrics.componentParityPruneCount,
    memoizedFailurePruneCount: metrics.memoizedFailurePruneCount,
    entryClarity: "clear",
    naturalHypothesisCount: entry.naturalHypothesisCount,
    interactionWitnessCount: witnesses.length,
    requiredPairingRevision,
    requiredShortestPathRevision,
    contradictionDepth: metrics.maximumDecisionDepth,
    revisionChainLength: gateCount,
  };
}

function countPairingChoices(puzzle: Puzzle): number {
  const counts = new Map<SymbolId, number>();
  for (const terminal of puzzle.terminals) {
    counts.set(terminal.symbol, (counts.get(terminal.symbol) ?? 0) + 1);
  }
  return [...counts.values()].reduce(
    (product, count) => product * countPerfectMatchings(count),
    1,
  );
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
