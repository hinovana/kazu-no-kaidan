/**
 * 原本基準の難易度監査で使う分類、分布集計、レビュー標本選定を定義する。
 *
 * このmoduleの分類は人間の体感難易度を断定せず、複数の機械指標が同じ
 * 方向を示す問題だけを、目視レビューの優先候補として抽出する。
 */

import {
  classifyDifficultySelection,
  DIFFICULTY_SELECTION_CLASSIFICATION_POLICY,
} from "../domain/generation/classify-difficulty-selection.ts";

/**
 * 原本基準の候補分類に使う閾値と、分類の非保証範囲を表す。
 *
 * この値は人間レビュー対象を再現可能に選ぶための監査方針であり、児童の
 * 体感難易度を合否判定する品質gateではない。
 */
export const CLASSIFICATION_POLICY =
  DIFFICULTY_SELECTION_CLASSIFICATION_POLICY;

/**
 * 生成問題の機械指標を、同じprofileの原本基準点と比較して分類する。
 *
 * 複数指標が同じ方向を示し、反対方向の指標がない場合だけ
 * `clearly_easier`または`clearly_harder`とする。返す分類は人間レビュー候補の
 * 優先度であり、問題の採否を保証しない。
 */
export function classifyCandidate(candidate, reference) {
  const selection = classifyDifficultySelection(
    candidate.metrics,
    {
      sourceProblemId: reference.sourceProblemId ?? "audit-reference",
      metrics: reference.metrics,
    },
  );
  const directionComponents = createDirectionComponents(
    candidate.metrics,
    reference.metrics,
  );
  return {
    ...candidate,
    classification: selection.classification,
    indicatorDirections: selection.indicatorDirections,
    directionScore: round(
      Object.values(directionComponents).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ),
    referenceDistance: round(
      Object.values(directionComponents).reduce(
        (sum, value) => sum + Math.abs(value),
        0,
      ),
    ),
  };
}

/**
 * 各指標について、原本値以下の生成問題が占める割合を計算する。
 *
 * 強制出口は値が大きいほど簡単側なので、返すpercentile自体には難易度方向を
 * 組み込まない。
 */
export function calculateReferencePercentiles(reference, candidates) {
  return {
    entryHypothesisCount: percentileRank(
      candidates.map(candidate => candidate.metrics.entryHypothesisCount),
      reference.metrics.entryHypothesisCount,
    ),
    forcedExitCount: percentileRank(
      candidates.map(candidate => candidate.metrics.forcedExitCount),
      reference.metrics.forcedExitCount,
    ),
    solverStateCount: percentileRank(
      candidates.map(candidate => candidate.metrics.solverStateCount),
      reference.metrics.solverStateCount,
    ),
    solverBacktrackCount: percentileRank(
      candidates.map(candidate => candidate.metrics.solverBacktrackCount),
      reference.metrics.solverBacktrackCount,
    ),
    totalTurnCount: percentileRank(
      candidates.map(candidate => candidate.metrics.totalTurnCount),
      reference.metrics.totalTurnCount,
    ),
    usedCellCount: percentileRank(
      candidates.map(candidate => candidate.metrics.usedCellCount),
      reference.metrics.usedCellCount,
    ),
  };
}

/**
 * HTMLとJSONで共有する生成指標の要約統計量を作る。
 */
export function summarizeCandidateMetrics(candidates) {
  return Object.fromEntries(
    [
      "entryHypothesisCount",
      "forcedExitCount",
      "solverStateCount",
      "solverBacktrackCount",
      "totalTurnCount",
      "usedCellCount",
      "maximumLineConcentration",
    ].map(metric => [
      metric,
      summarizeNumbers(
        candidates.map(candidate => candidate.metrics[metric]),
      ),
    ]),
  );
}

/**
 * 一つのprofileの候補群を分類し、分布と人間レビュー標本をまとめる。
 */
export function summarizeDifficultyCohort(
  candidates,
  reference,
  reviewSamplesPerCategory,
) {
  const classified = candidates.map(candidate => classifyCandidate(
    candidate,
    reference,
  ));
  const groups = Object.groupBy(
    classified,
    candidate => candidate.classification,
  );
  const reviewCandidates = createReviewCandidateGroups(
    groups,
    classified,
    reviewSamplesPerCategory,
  );
  return {
    referencePercentiles: calculateReferencePercentiles(
      reference,
      classified,
    ),
    generatedDistributions: summarizeCandidateMetrics(classified),
    classificationCounts: Object.fromEntries(
      [
        "reference_like",
        "clearly_easier",
        "clearly_harder",
        "mixed",
      ].map(classification => {
        const count = groups[classification]?.length ?? 0;
        return [classification, {
          count,
          ratio: round(count / classified.length),
        }];
      }),
    ),
    reviewCandidateCount: Object.values(reviewCandidates).reduce(
      (sum, group) => sum + group.length,
      0,
    ),
    reviewCandidates,
  };
}

/**
 * 分類の端と分布全体から、重複しない人間レビュー標本を最大20問選ぶ。
 *
 * `categoryLimit`は各分類から先に取る上限であり、最終的に不足する場合は
 * direction scoreの分布全体から補完する。
 */
export function createReviewCandidateGroups(
  groups,
  allCandidates,
  categoryLimit,
) {
  const selectedIds = new Set();
  const targetCount = Math.min(20, allCandidates.length);
  const selectUnique = (candidates, limit, compare) => {
    const selected = [];
    for (const candidate of [...candidates].toSorted(compare)) {
      if (selectedIds.size >= targetCount) {
        break;
      }
      if (selectedIds.has(candidate.id)) {
        continue;
      }
      selected.push(candidate);
      selectedIds.add(candidate.id);
      if (selected.length >= limit) {
        break;
      }
    }
    return selected;
  };
  const selected = {
    clearlyEasier: selectUnique(
      groups.clearly_easier ?? [],
      categoryLimit,
      (left, right) => left.directionScore - right.directionScore,
    ),
    referenceLike: selectUnique(
      groups.reference_like ?? [],
      categoryLimit,
      (left, right) => left.referenceDistance - right.referenceDistance,
    ),
    clearlyHarder: selectUnique(
      groups.clearly_harder ?? [],
      categoryLimit,
      (left, right) => right.directionScore - left.directionScore,
    ),
    mixedEasyEdge: selectUnique(
      groups.mixed ?? [],
      categoryLimit,
      (left, right) => left.directionScore - right.directionScore,
    ),
    mixedHardEdge: selectUnique(
      groups.mixed ?? [],
      categoryLimit,
      (left, right) => right.directionScore - left.directionScore,
    ),
  };
  const fillCount = Math.max(0, targetCount - selectedIds.size);
  selected.representativeFill = selectUnique(
    selectEvenlySpaced(
      allCandidates.filter(candidate => !selectedIds.has(candidate.id)),
      fillCount,
    ),
    fillCount,
    () => 0,
  );
  return selected;
}

function createDirectionComponents(actual, reference) {
  return {
    entryHypotheses: Math.log2(
      (actual.entryHypothesisCount + 1)
      / (reference.entryHypothesisCount + 1),
    ),
    solverStates: Math.log2(
      (actual.solverStateCount + 1)
      / (reference.solverStateCount + 1),
    ),
    forcedExits:
      reference.forcedExitCount - actual.forcedExitCount,
    solutionTurns:
      (actual.totalTurnCount - reference.totalTurnCount)
      / CLASSIFICATION_POLICY.comparableTurnDifference,
  };
}

function percentileRank(values, reference) {
  return round(
    values.filter(value => value <= reference).length / values.length,
  );
}

function summarizeNumbers(values) {
  const sorted = [...values].toSorted((left, right) => left - right);
  return {
    minimum: sorted[0],
    p05: percentile(sorted, 0.05),
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    maximum: sorted.at(-1),
    average: round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ),
  };
}

function percentile(sorted, ratio) {
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * ratio) - 1,
  );
  return sorted[Math.max(0, index)];
}

function selectEvenlySpaced(candidates, count) {
  if (count === 0 || candidates.length === 0) {
    return [];
  }
  const sorted = [...candidates].toSorted(
    (left, right) => left.directionScore - right.directionScore,
  );
  if (count >= sorted.length) {
    return sorted;
  }
  return Array.from({ length: count }, (_, index) => {
    const position = count === 1
      ? Math.floor((sorted.length - 1) / 2)
      : Math.round(index * (sorted.length - 1) / (count - 1));
    return sorted[position];
  });
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
