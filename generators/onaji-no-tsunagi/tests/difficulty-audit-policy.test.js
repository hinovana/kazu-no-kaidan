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
const reviewGroups = createReviewCandidateGroups(groups, classified, 5);
const selected = Object.values(reviewGroups).flat();
assert.equal(selected.length, 20);
assert.equal(new Set(selected.map(item => item.id)).size, 20);

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
