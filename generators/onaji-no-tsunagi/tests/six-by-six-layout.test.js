import assert from "node:assert/strict";
import {
  buildUniquePathCover,
  getUniquePathCoverProfile,
} from "../domain/generation/build-unique-path-cover.ts";
import { createSeededRandom } from "../domain/generation/random.ts";
import { analyzeSolutionCoverage } from "../domain/validation/analyze-solution-coverage.ts";
import { calculateSolutionCost } from "../domain/validation/analyze-solution-geometry.ts";
import { validateSolution } from "../domain/validation/validate-solution.ts";

const profileIds = [
  "6x6-4-4-2",
  "6x6-4-4-4",
  "6x6-6-4-4",
];
const resultByProfile = {};

for (const profileId of profileIds) {
  const profile = getUniquePathCoverProfile(profileId);
  let builtCount = 0;
  let budgetExhaustedCount = 0;
  let maximumConstructionStateCount = 0;
  const pathLengthProfiles = new Set();
  const topologyHashes = new Set();

  for (let seedIndex = 0; seedIndex < 3_000; seedIndex += 1) {
    const seed = `six-by-six-layout-${profileId}-${seedIndex}`;
    const result = buildUniquePathCover(
      seed,
      createSeededRandom(seed),
      profileId,
    );
    maximumConstructionStateCount = Math.max(
      maximumConstructionStateCount,
      result.constructionStateCount,
    );
    if (result.status === "budget_exhausted") {
      budgetExhaustedCount += 1;
      continue;
    }
    if (result.status === "not_constructed") {
      continue;
    }
    builtCount += 1;
    const { plan } = result;
    assert.equal(plan.puzzle.width, 6);
    assert.equal(plan.puzzle.height, 6);
    assert.equal(plan.puzzle.terminals.length, profile.terminalCount);
    assert.equal(plan.plantedSolution.paths.length, profile.pathCount);
    assert.equal(validateSolution(
      plan.puzzle,
      plan.plantedSolution,
    ).valid, true);
    assert.equal(
      analyzeSolutionCoverage(
        plan.puzzle,
        plan.plantedSolution,
      ).usedCellCount,
      36,
    );
    const cost = calculateSolutionCost(
      plan.puzzle,
      plan.plantedSolution,
    );
    assert.equal(cost.totalEdgeCount, 36 - profile.pathCount);
    assert.equal(cost.unitBayCount, 0);
    assert.deepEqual(
      plan.plantedSolution.paths
        .map((path) => path.cells.length)
        .toSorted((left, right) => right - left),
      [...result.pathLengthProfile].toSorted((left, right) => right - left),
    );
    const terminalCounts = Object.values(Object.groupBy(
      plan.puzzle.terminals,
      (terminal) => terminal.symbol,
    )).map((terminals) => terminals?.length ?? 0);
    assert.deepEqual(
      terminalCounts.toSorted((left, right) => left - right),
      profile.symbolPathCounts
        .map((pathCount) => pathCount * 2)
        .toSorted((left, right) => left - right),
    );
    pathLengthProfiles.add(result.pathLengthProfile.join("-"));
    topologyHashes.add(plan.topologyHash);
  }

  assert.ok(builtCount >= 500, JSON.stringify({
    profileId,
    builtCount,
    budgetExhaustedCount,
  }));
  assert.equal(pathLengthProfiles.size, profile.pathLengthProfiles.length);
  assert.ok(topologyHashes.size >= 500);
  resultByProfile[profileId] = {
    builtCount,
    budgetExhaustedCount,
    maximumConstructionStateCount,
    pathLengthProfileCount: pathLengthProfiles.size,
    topologyCount: topologyHashes.size,
  };
}

console.log(
  "onaji-no-tsunagi 6x6 path-cover layout tests passed",
  resultByProfile,
);
