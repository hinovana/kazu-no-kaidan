/**
 * Puzzleとsolver計測値から、問題構造に基づく難易度指標を集計する。
 *
 * ここで得るレベルは構造帯であり、児童データによる体感難易度の校正結果ではない。
 *
 * @packageDocumentation
 */

import {countPerfectMatchings} from '../solver/enumerate-pairings.ts';
import type {DifficultyAnalysis, DifficultyLevel} from '../types/difficulty.ts';
import type {Puzzle, SymbolId} from '../types/puzzle.ts';
import type {SolverMetrics} from '../types/solution.ts';

/**
 * 盤面profileの構造帯とsolver診断値を`DifficultyAnalysis`へまとめる。
 *
 * @remarks
 * `measuredBand`は5×5、6×6と端点数から決める暫定帯であり、児童データに
 * よる難易度校正ではない。
 */
export function analyzeDifficulty(
  requestedLevel: DifficultyLevel,
  puzzle: Puzzle,
  metrics: SolverMetrics,
): DifficultyAnalysis {
  return {
    analyzerVersion:
      puzzle.width === 5
        ? 'onaji-no-tsunagi-difficulty.v3.3'
        : 'onaji-no-tsunagi-difficulty.v3.4-draft',
    requestedLevel,
    measuredBand:
      puzzle.width === 5 ? 1 : puzzle.terminals.length === 14 ? 3 : 2,
    exploredStateCount: metrics.exploredStateCount,
    backtrackCount: metrics.backtrackCount,
    maximumDecisionDepth: metrics.maximumDecisionDepth,
    pairingChoiceCount: countPairingChoices(puzzle),
    residualReachabilityPruneCount: metrics.residualReachabilityPruneCount,
    componentParityPruneCount: metrics.componentParityPruneCount,
    memoizedFailurePruneCount: metrics.memoizedFailurePruneCount,
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
