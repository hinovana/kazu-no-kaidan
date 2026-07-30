/**
 * profile別の後段採用フィルターと原本基準分類policyを定義する。
 *
 * 選別機構は全profileで共通だが、実測と人間レビューが済んだ
 * `6x6-4-4-2`だけを有効化する。
 *
 * @packageDocumentation
 */

import type {PuzzleSelectionFilterRuleId} from '../types/generation.ts';
import type {Puzzle} from '../types/puzzle.ts';
import type {Solution} from '../types/solution.ts';
import {countStraightPathsByAxis} from '../validation/analyze-solution-geometry.ts';
import {analyzeTerminalPlacement} from '../validation/analyze-terminal-placement.ts';
import type {DifficultySelectionReference} from './classify-difficulty-selection.ts';

/** 一つのprofileで採用候補へ適用する、版付き選別設定。 */
export interface PuzzleSelectionPolicy {
  readonly policyId:
    | 'onaji-no-tsunagi.puzzle-selection.unfiltered.v1'
    | 'onaji-no-tsunagi.puzzle-selection.6x6-4-4-2.v1'
    | 'onaji-no-tsunagi.puzzle-selection.6x6-4-4-4.v1';
  readonly filterRuleIds: readonly PuzzleSelectionFilterRuleId[];
  readonly difficultyReference: DifficultySelectionReference | null;
  readonly maximumConsecutiveClearlyEasierCandidates: 10 | null;
}

/** 後段選別を未校正profileで無効にする明示的な空設定。 */
export const UNFILTERED_PUZZLE_SELECTION_POLICY = {
  policyId: 'onaji-no-tsunagi.puzzle-selection.unfiltered.v1',
  filterRuleIds: [],
  difficultyReference: null,
  maximumConsecutiveClearlyEasierCandidates: null,
} as const satisfies PuzzleSelectionPolicy;

/**
 * 2026-07-26の人間レビューと1,000問監査で固定した10端点用設定。
 *
 * 原本座標は保持せず、同一solverで計測した集約指標だけを基準値とする。
 */
export const SIX_BY_SIX_TEN_TERMINAL_SELECTION_POLICY = {
  policyId: 'onaji-no-tsunagi.puzzle-selection.6x6-4-4-2.v1',
  filterRuleIds: [
    'central_terminal_count_range',
    'filled_two_by_two_terminal_block',
    'central_boundary_adjacency_pair_limit',
    'concentrated_orthogonal_outer_side_pairs',
  ],
  difficultyReference: {
    sourceProblemId: 'book-p43-problem-3',
    metrics: {
      entryHypothesisCount: 124_416,
      solverStateCount: 1_628,
      forcedExitCount: 1,
      totalTurnCount: 8,
    },
  },
  maximumConsecutiveClearlyEasierCandidates: 10,
} as const satisfies PuzzleSelectionPolicy;

/**
 * 12端点profileで、同一軸に直線経路が3本以上ある解答形状を後段で除外する。
 *
 * 31マス固定1,000問の比較でこの形状の133/133問が機械分類上
 * `clearly_easier`だったため、端点配置ではなくcanonical solutionを判定する
 * 採用gateとして固定する。難易度の校正や児童の正答率を保証するものではない。
 */
export const SIX_BY_SIX_TWELVE_TERMINAL_SELECTION_POLICY = {
  policyId: 'onaji-no-tsunagi.puzzle-selection.6x6-4-4-4.v1',
  filterRuleIds: ['no_three_straight_paths_on_same_axis'],
  difficultyReference: null,
  maximumConsecutiveClearlyEasierCandidates: null,
} as const satisfies PuzzleSelectionPolicy;

/** 一候補に対する全filter結果と、設定された条件の集約合否。 */
export interface PuzzleSelectionFilterEvaluation {
  readonly allConfiguredFiltersPassed: boolean;
  readonly results: Readonly<Record<PuzzleSelectionFilterRuleId, boolean>>;
}

/**
 * Puzzleの端点配置を一度分析し、後段採用フィルターの全結果を返す。
 *
 * 空の`filterRuleIds`は無条件合格となり、未校正profileの生成を変更しない。
 */
export function evaluatePuzzleSelectionFilters(
  puzzle: Puzzle,
  filterRuleIds: readonly PuzzleSelectionFilterRuleId[],
  canonicalSolution?: Solution,
): PuzzleSelectionFilterEvaluation {
  const requiresSolutionShape = filterRuleIds.includes(
    'no_three_straight_paths_on_same_axis',
  );
  if (requiresSolutionShape && canonicalSolution === undefined) {
    throw new TypeError(
      'canonicalSolution is required for no_three_straight_paths_on_same_axis',
    );
  }
  const placement = analyzeTerminalPlacement(puzzle);
  const straightPathCounts =
    canonicalSolution === undefined
      ? null
      : countStraightPathsByAxis(canonicalSolution);
  const results = {
    central_terminal_count_range: placement.satisfiesCentralTerminalCountRange,
    filled_two_by_two_terminal_block:
      placement.satisfiesNoFilledTwoByTwoTerminalBlock,
    central_boundary_adjacency_pair_limit:
      placement.satisfiesLimitedCentralBoundaryAdjacency,
    concentrated_orthogonal_outer_side_pairs:
      placement.satisfiesNoConcentratedOrthogonalEdgePairs,
    no_three_straight_paths_on_same_axis:
      straightPathCounts === null
        ? true
        : straightPathCounts.horizontalStraightPathCount < 3 &&
          straightPathCounts.verticalStraightPathCount < 3,
  } as const satisfies Readonly<Record<PuzzleSelectionFilterRuleId, boolean>>;
  return {
    allConfiguredFiltersPassed: filterRuleIds.every(ruleId => results[ruleId]),
    results,
  };
}
