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
export const MAX_REVIEW_SAMPLES_PER_GROUP = 30;

/**
 * 生成問題の機械指標を、同じprofileの原本基準点と比較して分類する。
 *
 * 同一方向の直線経路3本以上を簡単側として最優先する。相対4指標では、
 * 簡単側が複数指標で支持され難しい側より多い場合に単一の逆方向指標を
 * 許容する。難しい側は簡単側指標がない場合だけ採用する。返す分類は
 * 人間レビュー候補の優先度であり、問題の採否を保証しない。
 */
export function classifyCandidate(candidate, reference) {
  const selection = classifyDifficultySelection(
    candidate.metrics,
    {
      sourceProblemId: reference.sourceProblemId ?? "audit-reference",
      metrics: reference.metrics,
    },
    {
      horizontalStraightPathCount:
        candidate.metrics.horizontalStraightPathCount,
      verticalStraightPathCount:
        candidate.metrics.verticalStraightPathCount,
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
    structuralClearlyEasierReasons:
      selection.structuralClearlyEasierReasons,
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
      "horizontalStraightPathCount",
      "verticalStraightPathCount",
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
 * 各分類から、重複しない人間レビュー標本を選ぶ。
 *
 * 各分類の全候補を決定的な擬似ランダム順で抽出してから、画面上の比較に
 * 使う指標順へ並べる。原本距離や難易度方向で先に切り詰めない。
 *
 * `categoryLimit`は5分類それぞれから先に取る上限で、最大30問に丸める。
 * 合計目標は「分類ごとの上限×5」とし、不足する分類がある場合は
 * 未選択候補を同じ方法でランダム抽出して補完する。
 */
export function createReviewCandidateGroups(
  groups,
  allCandidates,
  categoryLimit,
) {
  const selectedIds = new Set();
  const perCategoryLimit = Math.min(
    MAX_REVIEW_SAMPLES_PER_GROUP,
    categoryLimit,
  );
  const targetCount = Math.min(
    perCategoryLimit * 5,
    allCandidates.length,
  );
  const selectUnique = (
    candidates,
    limit,
    sampleKey,
    displayCompare,
  ) => {
    const remainingTarget = Math.max(0, targetCount - selectedIds.size);
    const selected = sampleThenSortCandidates(
      candidates.filter(candidate => !selectedIds.has(candidate.id)),
      Math.min(limit, remainingTarget),
      sampleKey,
      displayCompare,
    );
    for (const candidate of selected) {
      selectedIds.add(candidate.id);
    }
    return selected;
  };
  const selected = {
    clearlyEasier: selectUnique(
      groups.clearly_easier ?? [],
      perCategoryLimit,
      "clearly-easier",
      (left, right) => left.directionScore - right.directionScore,
    ),
    referenceLike: selectUnique(
      groups.reference_like ?? [],
      perCategoryLimit,
      "reference-like",
      (left, right) => left.referenceDistance - right.referenceDistance,
    ),
    clearlyHarder: selectUnique(
      groups.clearly_harder ?? [],
      perCategoryLimit,
      "clearly-harder",
      (left, right) => right.directionScore - left.directionScore,
    ),
    mixedEasyEdge: selectUnique(
      groups.mixed ?? [],
      perCategoryLimit,
      "mixed-easier",
      (left, right) => left.directionScore - right.directionScore,
    ),
    mixedHardEdge: selectUnique(
      groups.mixed ?? [],
      perCategoryLimit,
      "mixed-harder",
      (left, right) => right.directionScore - left.directionScore,
    ),
  };
  const fillCount = Math.max(0, targetCount - selectedIds.size);
  selected.representativeFill = selectUnique(
    allCandidates,
    fillCount,
    "representative-fill",
    (left, right) => left.directionScore - right.directionScore,
  );
  return selected;
}

/**
 * 候補を入力順に依存しない擬似ランダム順で抽出し、抽出後だけ表示順に並べる。
 *
 * `sampleKey`と候補IDから作るhashを乱数順位として使うため、同じ母集団なら
 * 再実行しても同じ標本になる。
 */
export function sampleThenSortCandidates(
  candidates,
  requestedLimit,
  sampleKey,
  displayCompare,
) {
  const limit = Math.min(
    MAX_REVIEW_SAMPLES_PER_GROUP,
    Math.max(0, requestedLimit),
  );
  const uniqueCandidates = [
    ...new Map(candidates.map(candidate => [candidate.id, candidate])).values(),
  ];
  return uniqueCandidates
    .toSorted((left, right) =>
      deterministicSampleRank(sampleKey, left.id)
        - deterministicSampleRank(sampleKey, right.id)
      || left.id.localeCompare(right.id)
    )
    .slice(0, limit)
    .toSorted((left, right) =>
      displayCompare(left, right)
      || left.id.localeCompare(right.id)
    );
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

function deterministicSampleRank(sampleKey, candidateId) {
  let hash = 2_166_136_261;
  for (const character of `${sampleKey}\0${candidateId}`) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
