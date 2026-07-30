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
import {
  evaluatePuzzleSelectionFilters,
} from "../domain/generation/puzzle-selection-policy.ts";

const reference = {
  sourceProblemId: "reference",
  metrics: {
    entryHypothesisCount: 100,
    solverStateCount: 100,
    forcedExitCount: 2,
    totalTurnCount: 8,
  },
};
const noStraightPaths = {
  horizontalStraightPathCount: 0,
  verticalStraightPathCount: 0,
};
const sixBySixTwelveTerminalReference = {
  sourceProblemId: "book-p43-problem-4",
  metrics: {
    entryHypothesisCount: 26_873_856,
    forcedExitCount: 0,
    solverStateCount: 126,
    totalTurnCount: 4,
  },
};

assert.equal(
  classifyDifficultySelection(
    reference.metrics,
    reference,
    noStraightPaths,
  ).classification,
  "reference_like",
);
assert.equal(
  classifyDifficultySelection(
    reference.metrics,
    reference,
    noStraightPaths,
  ).policyId,
  "onaji-no-tsunagi.difficulty-selection.v3",
);
assert.equal(
  classifyDifficultySelection(
    reference.metrics,
    reference,
    {
      horizontalStraightPathCount: 3,
      verticalStraightPathCount: 0,
    },
  ).classification,
  "clearly_easier",
  "three horizontal straight paths must override reference-like indicators",
);
assert.equal(
  classifyDifficultySelection(
    reference.metrics,
    reference,
    {
      horizontalStraightPathCount: 0,
      verticalStraightPathCount: 3,
    },
  ).classification,
  "clearly_easier",
  "three vertical straight paths must override reference-like indicators",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    entryHypothesisCount: 40,
    forcedExitCount: 4,
  }, reference, noStraightPaths).classification,
  "clearly_easier",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    solverStateCount: 250,
    totalTurnCount: 11,
  }, reference, noStraightPaths).classification,
  "clearly_harder",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    entryHypothesisCount: 40,
    totalTurnCount: 11,
  }, reference, noStraightPaths).classification,
  "mixed",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    entryHypothesisCount: 40,
    solverStateCount: 250,
    totalTurnCount: 11,
  }, reference, noStraightPaths).classification,
  "mixed",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    entryHypothesisCount: 124_416,
    forcedExitCount: 4,
    solverStateCount: 1_181,
    totalTurnCount: 1,
  }, sixBySixTwelveTerminalReference, noStraightPaths).classification,
  "clearly_easier",
  "base-413::trim-59 must not remain mixed because only solver cost is harder",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    entryHypothesisCount: 124_416,
    forcedExitCount: 3,
    solverStateCount: 267,
    totalTurnCount: 0,
  }, sixBySixTwelveTerminalReference, noStraightPaths).classification,
  "clearly_easier",
  "base-146::trim-116 must be rejected as clearly easier",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    entryHypothesisCount: 40,
    forcedExitCount: 4,
    solverStateCount: 250,
  }, reference, noStraightPaths).classification,
  "clearly_easier",
);
assert.equal(
  classifyDifficultySelection({
    ...reference.metrics,
    entryHypothesisCount: 40,
    forcedExitCount: 4,
    solverStateCount: 250,
    totalTurnCount: 11,
  }, reference, noStraightPaths).classification,
  "mixed",
);

for (const fixture of [
  {
    id: "base-146::trim-112",
    metrics: {
      entryHypothesisCount: 497_664,
      forcedExitCount: 0,
      solverStateCount: 296,
      totalTurnCount: 2,
    },
    shape: {
      horizontalStraightPathCount: 4,
      verticalStraightPathCount: 0,
    },
  },
  {
    id: "base-283::trim-93",
    metrics: {
      entryHypothesisCount: 746_496,
      forcedExitCount: 1,
      solverStateCount: 269,
      totalTurnCount: 3,
    },
    shape: {
      horizontalStraightPathCount: 4,
      verticalStraightPathCount: 0,
    },
  },
  {
    id: "base-177::trim-145",
    metrics: {
      entryHypothesisCount: 419_904,
      forcedExitCount: 1,
      solverStateCount: 707,
      totalTurnCount: 2,
    },
    shape: {
      horizontalStraightPathCount: 0,
      verticalStraightPathCount: 4,
    },
  },
  {
    id: "base-146::trim-54",
    metrics: {
      entryHypothesisCount: 279_936,
      forcedExitCount: 1,
      solverStateCount: 747,
      totalTurnCount: 2,
    },
    shape: {
      horizontalStraightPathCount: 4,
      verticalStraightPathCount: 0,
    },
  },
]) {
  const result = classifyDifficultySelection(
    fixture.metrics,
    sixBySixTwelveTerminalReference,
    fixture.shape,
  );
  assert.equal(
    result.classification,
    "clearly_easier",
    `${fixture.id} must be rejected by the same-axis straight-path gate`,
  );
  assert.ok(
    result.structuralClearlyEasierReasons.length > 0,
    `${fixture.id} must retain its structural rejection reason`,
  );
}

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

const twelveTerminalPolicy = getUniquePathCoverProfile(
  "6x6-4-4-4",
).puzzleSelectionPolicy;
assert.deepEqual(twelveTerminalPolicy.filterRuleIds, [
  "no_three_straight_paths_on_same_axis",
]);
assert.equal(twelveTerminalPolicy.difficultyReference, null);
assert.equal(twelveTerminalPolicy.maximumConsecutiveClearlyEasierCandidates, null);

const threeHorizontalStraightPaths = {
  paths: [
    {cells: [{row: 0, column: 0}, {row: 0, column: 1}]},
    {cells: [{row: 1, column: 0}, {row: 1, column: 1}]},
    {cells: [{row: 2, column: 0}, {row: 2, column: 1}]},
  ],
};
assert.equal(
  evaluatePuzzleSelectionFilters(
    {width: 6, height: 6, terminals: []},
    twelveTerminalPolicy.filterRuleIds,
    threeHorizontalStraightPaths,
  ).allConfiguredFiltersPassed,
  false,
  "three horizontal straight paths must be excluded for 6x6-4-4-4",
);
assert.throws(
  () => evaluatePuzzleSelectionFilters(
    {width: 6, height: 6, terminals: []},
    twelveTerminalPolicy.filterRuleIds,
  ),
  /canonicalSolution/u,
);

for (const profileId of [
  "5x5-2-2-2",
  "5x5-4-2-2",
  "5x5-4-4-2",
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
