import assert from "node:assert/strict";

import {
  classifyDifficultySelection,
} from "../domain/generation/classify-difficulty-selection.ts";
import {
  createDifficultyRetryState,
  observeDifficultyRetryCandidate,
} from "../domain/generation/difficulty-retry-policy.ts";
import {
  getUniquePathCoverProfile,
} from "../domain/generation/build-unique-path-cover.ts";

const reference = {
  sourceProblemId: "reference",
  metrics: {
    entryHypothesisCount: 100,
    solverStateCount: 100,
    forcedExitCount: 2,
    totalTurnCount: 8,
  },
};

assert.equal(
  classifyDifficultySelection(reference.metrics, reference).classification,
  "reference_like",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    entryHypothesisCount: 40,
    forcedExitCount: 4,
  }, reference).classification,
  "clearly_easier",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    solverStateCount: 250,
    totalTurnCount: 11,
  }, reference).classification,
  "clearly_harder",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    entryHypothesisCount: 40,
    totalTurnCount: 11,
  }, reference).classification,
  "mixed",
);

const targetPolicy = getUniquePathCoverProfile(
  "6x6-4-4-2",
).puzzleSelectionPolicy;
assert.deepEqual(targetPolicy.filterRuleIds, [
  "central_terminal_count_range",
  "filled_two_by_two_terminal_block",
  "central_boundary_adjacency_pair_limit",
  "concentrated_orthogonal_outer_side_pairs",
]);
assert.equal(targetPolicy.maximumConsecutiveClearlyEasierCandidates, 10);
assert.notEqual(targetPolicy.difficultyReference, null);

for (const profileId of [
  "5x5-2-2-2",
  "5x5-4-2-2",
  "5x5-4-4-2",
  "6x6-4-4-4",
  "6x6-6-4-4",
]) {
  const policy = getUniquePathCoverProfile(profileId).puzzleSelectionPolicy;
  assert.deepEqual(policy.filterRuleIds, []);
  assert.equal(policy.difficultyReference, null);
  assert.equal(policy.maximumConsecutiveClearlyEasierCandidates, null);
}

const rejectedCandidate = {
  candidateIndex: 0,
  puzzleSeed: "seed",
  topologyHash: "1234abcd",
  puzzle: {},
  canonicalSolution: {},
  selection: {},
  terminalPlacementFilterResults: {},
};
let retryState = createDifficultyRetryState();
for (let index = 0; index < 9; index += 1) {
  retryState = observeDifficultyRetryCandidate(retryState, {
    classification: "clearly_easier",
    rejectedCandidate: {
      ...rejectedCandidate,
      candidateIndex: index,
    },
  });
}
assert.equal(retryState.consecutiveClearlyEasierCandidates.length, 9);
retryState = observeDifficultyRetryCandidate(retryState, {
  classification: "mixed",
});
assert.equal(retryState.consecutiveClearlyEasierCandidates.length, 0);
for (let index = 0; index < 10; index += 1) {
  retryState = observeDifficultyRetryCandidate(retryState, {
    classification: "clearly_easier",
    rejectedCandidate: {
      ...rejectedCandidate,
      candidateIndex: index,
    },
  });
}
assert.equal(retryState.consecutiveClearlyEasierCandidates.length, 10);
assert.deepEqual(
  retryState.consecutiveClearlyEasierCandidates.map(
    candidate => candidate.candidateIndex,
  ),
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
);

console.log("onaji-no-tsunagi puzzle selection policy tests passed");
