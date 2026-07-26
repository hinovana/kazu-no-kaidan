import assert from "node:assert/strict";
import {
  buildUniquePathCover,
  getUniquePathCoverProfile,
} from "../domain/generation/build-unique-path-cover.ts";
import { createSeededRandom } from "../domain/generation/random.ts";
import { solvePuzzle } from "../domain/solver/solve-puzzle.ts";
import { analyzeSolutionCoverage } from "../domain/validation/analyze-solution-coverage.ts";
import { calculateSolutionCost } from "../domain/validation/analyze-solution-geometry.ts";
import { analyzeUniquePathCoverEntry } from "../domain/validation/analyze-unique-path-cover-entry.ts";
import { validateSolution } from "../domain/validation/validate-solution.ts";

const results = [];
for (const pattern of ["2-2-2", "4-2-2", "4-4-2"]) {
  const profileId = `5x5-${pattern}`;
  const profile = getUniquePathCoverProfile(profileId);
  const topologyHashes = new Set();
  let constructedPlanCount = 0;
  let exactUniqueQualityCount = 0;

  for (let seedIndex = 0; seedIndex < 3_000; seedIndex += 1) {
    const seed = `unique-five-${pattern}-layout-${seedIndex}`;
    const buildResult = buildUniquePathCover(
      seed,
      createSeededRandom(seed),
      profileId,
    );
    if (buildResult.status !== "built") {
      continue;
    }
    const { plan } = buildResult;
    constructedPlanCount += 1;
    assert.equal(plan.puzzle.width, 5);
    assert.equal(plan.puzzle.height, 5);
    assert.equal(plan.puzzle.terminals.length, profile.terminalCount);
    assert.equal(plan.plantedSolution.paths.length, profile.pathCount);
    assert.equal(
      validateSolution(plan.puzzle, plan.plantedSolution).valid,
      true,
    );
    assert.equal(
      analyzeSolutionCoverage(
        plan.puzzle,
        plan.plantedSolution,
      ).usedCellCount,
      25,
    );
    const entry = analyzeUniquePathCoverEntry(
      plan.puzzle,
      profile,
    );
    if (entry.status !== "candidate") {
      continue;
    }
    const result = solvePuzzle(plan.puzzle, {
      solutionLimit: 2,
      stateBudget: profile.maximumValidityStates,
    });
    if (
      result.status !== "solved"
      || result.solutionCount.kind !== "exact"
      || result.solutionCount.count !== 1
    ) {
      continue;
    }
    const cost = calculateSolutionCost(
      plan.puzzle,
      result.canonicalSolution,
    );
    if (
      cost.totalEdgeCount !== 25 - profile.pathCount
      || cost.unitBayCount !== 0
      || cost.totalTurnCount > profile.maximumTotalTurnCount
    ) {
      continue;
    }
    exactUniqueQualityCount += 1;
    topologyHashes.add(plan.topologyHash);
  }

  assert.ok(constructedPlanCount >= 500);
  assert.ok(
    exactUniqueQualityCount >= 3,
    JSON.stringify({
      pattern,
      constructedPlanCount,
      exactUniqueQualityCount,
    }),
  );
  assert.ok(topologyHashes.size >= 2);
  results.push({
    pattern,
    constructedPlanCount,
    exactUniqueQualityCount,
    topologyCount: topologyHashes.size,
  });
}

console.log(
  "onaji-no-tsunagi unique 5x5 path-cover tests passed",
  results,
);
