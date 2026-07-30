import assert from "node:assert/strict";

import {
  classifyCandidate,
  createReviewCandidateGroups,
} from "./difficulty-audit-policy.mjs";

const reference = {
  metrics: {
    entryHypothesisCount: 100,
    forcedExitCount: 2,
    solverStateCount: 100,
    solverBacktrackCount: 100,
    totalTurnCount: 8,
    horizontalStraightPathCount: 0,
    verticalStraightPathCount: 0,
    usedCellCount: 33,
    maximumLineConcentration: 3,
    pairingChoiceCount: 9,
  },
};

assert.equal(
  classifyCandidate(candidate("same", {}), reference).classification,
  "reference_like",
);
assert.equal(
  classifyCandidate(candidate("one-easy", {
    entryHypothesisCount: 40,
  }), reference).classification,
  "reference_like",
);
assert.equal(
  classifyCandidate(candidate("easy", {
    entryHypothesisCount: 40,
    forcedExitCount: 4,
  }), reference).classification,
  "clearly_easier",
);
assert.equal(
  classifyCandidate(candidate("hard", {
    solverStateCount: 250,
    totalTurnCount: 11,
  }), reference).classification,
  "clearly_harder",
);
assert.equal(
  classifyCandidate(candidate("mixed", {
    entryHypothesisCount: 40,
    totalTurnCount: 11,
  }), reference).classification,
  "mixed",
);
assert.equal(
  classifyCandidate(candidate("straight-horizontal", {
    horizontalStraightPathCount: 3,
  }), reference).classification,
  "clearly_easier",
);

const classified = Array.from({ length: 30 }, (_, index) => {
  const result = classifyCandidate(candidate(`candidate-${index}`, {
    entryHypothesisCount: 10 + index * 10,
    forcedExitCount: 1 + index % 5,
    solverStateCount: 20 + index * 20,
    totalTurnCount: 4 + index % 10,
  }), reference);
  return result;
});
const groups = Object.groupBy(
  classified,
  item => item.classification,
);
const reviewGroups = createReviewCandidateGroups(groups, classified, 4);
const selected = Object.values(reviewGroups).flat();
assert.equal(selected.length, 20);
assert.equal(new Set(selected.map(item => item.id)).size, 20);

const categoryCandidates = {
  clearly_easier: reviewCandidates("easy", 50, -4),
  reference_like: reviewCandidates("reference", 50, 0),
  clearly_harder: reviewCandidates("hard", 5, 4),
  mixed: reviewCandidates("mixed", 100, -2),
};
const expandedReviewGroups = createReviewCandidateGroups(
  categoryCandidates,
  Object.values(categoryCandidates).flat(),
  30,
);
assert.deepEqual(
  Object.fromEntries(
    Object.entries(expandedReviewGroups).map(([key, candidates]) => [
      key,
      candidates.length,
    ]),
  ),
  {
    clearlyEasier: 30,
    referenceLike: 30,
    clearlyHarder: 5,
    mixedEasyEdge: 30,
    mixedHardEdge: 30,
    representativeFill: 25,
  },
);
assert.equal(
  new Set(Object.values(expandedReviewGroups).flat().map(item => item.id)).size,
  150,
);
assert.ok(
  expandedReviewGroups.referenceLike.some(
    item => Number.parseInt(item.id.split("-").at(-1), 10) >= 30,
  ),
  "原本距離順で先頭30件を切り出しており、ランダム抽出になっていません。",
);
assertSorted(
  expandedReviewGroups.clearlyEasier,
  (left, right) => left.directionScore - right.directionScore,
);
assertSorted(
  expandedReviewGroups.referenceLike,
  (left, right) => left.referenceDistance - right.referenceDistance,
);
assertSorted(
  expandedReviewGroups.clearlyHarder,
  (left, right) => right.directionScore - left.directionScore,
);
assertSorted(
  expandedReviewGroups.mixedEasyEdge,
  (left, right) => left.directionScore - right.directionScore,
);
assertSorted(
  expandedReviewGroups.mixedHardEdge,
  (left, right) => right.directionScore - left.directionScore,
);

const reversedCategoryCandidates = Object.fromEntries(
  Object.entries(categoryCandidates).map(([key, candidates]) => [
    key,
    [...candidates].reverse(),
  ]),
);
const repeatedReviewGroups = createReviewCandidateGroups(
  reversedCategoryCandidates,
  Object.values(reversedCategoryCandidates).flat().reverse(),
  30,
);
assert.deepEqual(
  reviewGroupIds(repeatedReviewGroups),
  reviewGroupIds(expandedReviewGroups),
  "同じ母集団のランダム標本が入力順で変化しました。",
);

const cappedReviewGroups = createReviewCandidateGroups(
  categoryCandidates,
  Object.values(categoryCandidates).flat(),
  100,
);
assert.deepEqual(
  reviewGroupIds(cappedReviewGroups),
  reviewGroupIds(expandedReviewGroups),
  "1分類30問の上限が適用されていません。",
);

console.log("onaji-no-tsunagi difficulty audit policy tests passed");

function candidate(id, metricOverrides) {
  return {
    id,
    seed: id,
    profileId: "6x6-4-4-2",
    puzzle: {},
    canonicalSolution: {},
    provenance: {},
    metrics: {
      ...reference.metrics,
      ...metricOverrides,
    },
  };
}

function reviewCandidates(prefix, count, directionScore) {
  return Array.from({length: count}, (_, index) => ({
    ...candidate(`${prefix}-${index}`, {}),
    directionScore: directionScore + index / 100,
    referenceDistance: Math.abs(directionScore) + index / 100,
  }));
}

function assertSorted(candidates, compare) {
  assert.deepEqual(candidates, [...candidates].toSorted(compare));
}

function reviewGroupIds(groups) {
  return Object.fromEntries(
    Object.entries(groups).map(([key, candidates]) => [
      key,
      candidates.map(candidate => candidate.id),
    ]),
  );
}
