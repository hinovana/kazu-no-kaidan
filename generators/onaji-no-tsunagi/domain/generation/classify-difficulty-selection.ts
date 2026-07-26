/**
 * 生成問題を原本基準の4指標で分類する純粋なdomain処理。
 *
 * 分類は人間レビューで「明らかに簡単な候補」を除外するための機械指標であり、
 * 児童の体感難易度や良問であることを保証しない。
 *
 * @packageDocumentation
 */

import type {
  DifficultyIndicatorDirection,
  DifficultyReferenceMetrics,
  DifficultySelectionAnalysis,
} from '../types/generation.ts';

/** 監査レポートと生成器で共有する、版付き分類閾値と非保証範囲。 */
export const DIFFICULTY_SELECTION_CLASSIFICATION_POLICY = {
  schemaVersion: 'onaji-no-tsunagi.difficulty-review-policy.v1',
  comparableFactorRange: [0.5, 2],
  comparableForcedExitDifference: 1,
  comparableTurnDifference: 2,
  minimumComparableIndicatorCount: 3,
  clearlyDirectionalIndicatorCount: 2,
  indicators: [
    {
      id: 'entryHypotheses',
      explanation:
        '端点の局所出口数の積とpairing候補数。多い側を難しい候補とする。',
    },
    {
      id: 'solverStates',
      explanation:
        '同じsolverによる唯一性探索状態数。多い側を探索困難候補とする。',
    },
    {
      id: 'forcedExits',
      explanation: '局所出口が一方向の端点数。多い側を簡単候補とする。',
    },
    {
      id: 'solutionTurns',
      explanation:
        'canonical solutionの総曲がり数。多い側を形状複雑候補とする。',
    },
  ],
  disclaimer:
    '原本はprofileごとに1問だけであり、児童の正答率や所要時間もないため、' +
    'この分類は体感難易度の校正結果ではない。',
} as const;

/** 分類器へ渡す、profile固有の原本基準点。 */
export interface DifficultySelectionReference {
  readonly sourceProblemId: string;
  readonly metrics: DifficultyReferenceMetrics;
}

/**
 * 生成候補の4指標を原本基準点と比較し、レビュー区分へ分類する。
 *
 * 3指標以上が許容帯なら原本近傍、2指標以上が同方向かつ逆方向が0なら
 * 明らかに簡単／難しい側、それ以外は指標混合とする。
 */
export function classifyDifficultySelection(
  metrics: DifficultyReferenceMetrics,
  reference: DifficultySelectionReference,
): DifficultySelectionAnalysis {
  const indicatorDirections = {
    entryHypotheses: compareFactor(
      metrics.entryHypothesisCount,
      reference.metrics.entryHypothesisCount,
    ),
    solverStates: compareFactor(
      metrics.solverStateCount,
      reference.metrics.solverStateCount,
    ),
    forcedExits: compareForcedExits(
      metrics.forcedExitCount,
      reference.metrics.forcedExitCount,
    ),
    solutionTurns: compareTurns(
      metrics.totalTurnCount,
      reference.metrics.totalTurnCount,
    ),
  } as const;
  const directions = Object.values(indicatorDirections);
  const comparableCount = countDirection(directions, 'comparable');
  const easierCount = countDirection(directions, 'easier');
  const harderCount = countDirection(directions, 'harder');

  let classification: DifficultySelectionAnalysis['classification'] = 'mixed';
  if (
    comparableCount >=
    DIFFICULTY_SELECTION_CLASSIFICATION_POLICY.minimumComparableIndicatorCount
  ) {
    classification = 'reference_like';
  } else if (
    easierCount >=
      DIFFICULTY_SELECTION_CLASSIFICATION_POLICY.clearlyDirectionalIndicatorCount &&
    harderCount === 0
  ) {
    classification = 'clearly_easier';
  } else if (
    harderCount >=
      DIFFICULTY_SELECTION_CLASSIFICATION_POLICY.clearlyDirectionalIndicatorCount &&
    easierCount === 0
  ) {
    classification = 'clearly_harder';
  }

  return {
    policyId: 'onaji-no-tsunagi.difficulty-selection.v1',
    referenceSourceProblemId: reference.sourceProblemId,
    classification,
    metrics,
    referenceMetrics: reference.metrics,
    indicatorDirections,
  };
}

function compareFactor(
  actual: number,
  reference: number,
): DifficultyIndicatorDirection {
  const [minimum, maximum] =
    DIFFICULTY_SELECTION_CLASSIFICATION_POLICY.comparableFactorRange;
  if (actual < reference * minimum) {
    return 'easier';
  }
  if (actual > reference * maximum) {
    return 'harder';
  }
  return 'comparable';
}

function compareForcedExits(
  actual: number,
  reference: number,
): DifficultyIndicatorDirection {
  const tolerance =
    DIFFICULTY_SELECTION_CLASSIFICATION_POLICY.comparableForcedExitDifference;
  if (actual > reference + tolerance) {
    return 'easier';
  }
  if (actual < reference - tolerance) {
    return 'harder';
  }
  return 'comparable';
}

function compareTurns(
  actual: number,
  reference: number,
): DifficultyIndicatorDirection {
  const tolerance =
    DIFFICULTY_SELECTION_CLASSIFICATION_POLICY.comparableTurnDifference;
  if (actual < reference - tolerance) {
    return 'easier';
  }
  if (actual > reference + tolerance) {
    return 'harder';
  }
  return 'comparable';
}

function countDirection(
  directions: readonly DifficultyIndicatorDirection[],
  target: DifficultyIndicatorDirection,
): number {
  return directions.filter(direction => direction === target).length;
}
