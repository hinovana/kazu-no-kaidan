import assert from "node:assert/strict";
import {
  getUniquePathCoverProfile,
  selectUniquePathCoverProfileId,
} from "../domain/generation/build-unique-path-cover.ts";
import { generateWorksheet } from "../domain/generation/generate-worksheet.ts";
import { countPerfectMatchings } from "../domain/solver/enumerate-pairings.ts";
import { validateSolution } from "../domain/validation/validate-solution.ts";

const request = {
  difficulty: 1,
  puzzleCount: 4,
  seed: "v33-four",
};
const first = generateWorksheet(request);
const second = generateWorksheet(request);
assert.deepEqual(second, first, "5x5 generation must be reproducible");
assert.equal(first.schemaVersion, "onaji-no-tsunagi.worksheet.v3.3");
assert.equal(
  first.provenance.generatorVersion,
  "onaji-no-tsunagi-generator.v3.3",
);
assert.equal(first.childUsePermitted, false);
assert.equal(first.machineChecks.allPassed, true);
assert.equal(first.puzzles.length, 4);
assert.deepEqual(
  first.puzzles.map((generated) => generated.provenance.terminalPattern),
  ["2-2-2", "4-2-2", "4-2-2", "4-4-2"],
);

for (const generated of first.puzzles) {
  const profile = getUniquePathCoverProfile(
    generated.provenance.profileId,
  );
  assert.equal(generated.puzzle.width, 5);
  assert.equal(generated.puzzle.height, 5);
  assert.equal(generated.puzzle.terminals.length, profile.terminalCount);
  assert.equal(generated.canonicalSolution.paths.length, profile.pathCount);
  assert.deepEqual(generated.solutionCount, { kind: "exact", count: 1 });
  assert.equal(generated.uniquenessProof.status, "proven");
  assert.ok(generated.uniquenessProof.exploredStateCount > 0);
  assert.equal(
    validateSolution(
      generated.puzzle,
      generated.canonicalSolution,
    ).valid,
    true,
  );
  assert.equal(generated.qualityProof.status, "optimal");
  assert.equal(generated.generationWitness.plantedInflationEdgeCount, 0);
  assert.equal(generated.generationWitness.rolePreservationStatus, "proven");
  assert.equal(generated.answerCoverage.usedCellCount, 25);
  assert.equal(generated.answerCoverage.coverageRatio, 1);
  assert.equal(generated.solutionCost.totalEdgeCount, 25 - profile.pathCount);
  assert.equal(generated.solutionCost.unitBayCount, 0);
  assert.ok(
    generated.solutionCost.totalTurnCount
      <= profile.maximumTotalTurnCount,
  );
  assert.equal(generated.entry.pattern, "unique_path_cover");
  assert.equal(generated.entry.machineStatus, "entry_candidate");
  assert.equal(generated.entry.terminalPattern, profile.terminalPattern);
  assert.equal(generated.entry.symbolGroups.length, 3);
  assert.ok(
    generated.entry.forcedExitTerminalIds.length
      >= profile.minimumForcedExitCount,
  );
  assert.ok(
    generated.entry.forcedExitTerminalIds.length
      <= profile.maximumForcedExitCount,
  );
  assert.ok(
    generated.entry.maximumLineConcentration
      <= profile.maximumLineConcentration,
  );
  assert.ok(generated.interactionWitnesses.some((witness) => (
    witness.kind === "forced_exit"
  )));
  assert.ok(generated.interactionWitnesses.some((witness) => (
    witness.kind === "unique_solution"
    && witness.exploredStateCount > 0
  )));
  assert.equal(generated.difficulty.requestedLevel, 1);
  assert.equal(generated.difficulty.measuredBand, 1);

  const counts = new Map();
  for (const terminal of generated.puzzle.terminals) {
    counts.set(
      terminal.symbol,
      (counts.get(terminal.symbol) ?? 0) + 1,
    );
  }
  assert.deepEqual(
    [...counts.values()].toSorted((left, right) => left - right),
    profile.symbolPathCounts
      .map((pathCount) => pathCount * 2)
      .toSorted((left, right) => left - right),
  );
  const expectedPairingChoiceCount = [...counts.values()].reduce(
    (product, count) => product * countPerfectMatchings(count),
    1,
  );
  assert.equal(
    generated.entry.pairingChoiceCount,
    expectedPairingChoiceCount,
  );
  assert.equal(
    generated.difficulty.pairingChoiceCount,
    expectedPairingChoiceCount,
  );
  assert.equal(
    generated.interactionWitnesses.some((witness) => (
      witness.kind === "pairing_choice"
    )),
    expectedPairingChoiceCount > 1,
  );
}

assert.equal(
  new Set(first.puzzles.map((entry) => (
    entry.provenance.topologyHash
  ))).size,
  4,
);

const selectedPatterns = new Set(
  Array.from({ length: 100 }, (_, index) => (
    getUniquePathCoverProfile(selectUniquePathCoverProfileId(
      1,
      `pattern-seed-${index}`,
      0,
      1,
    )).terminalPattern
  )),
);
assert.deepEqual(
  [...selectedPatterns].toSorted(),
  ["2-2-2", "4-2-2", "4-4-2"],
);

const levelTwoRequest = {
  difficulty: 2,
  puzzleCount: 4,
  seed: "v34-level-two-four",
};
const levelTwo = generateWorksheet(levelTwoRequest);
assert.deepEqual(generateWorksheet(levelTwoRequest), levelTwo);
assert.deepEqual(
  levelTwo.puzzles.map((generated) => generated.provenance.profileId),
  [
    "6x6-4-4-2",
    "6x6-4-4-4",
    "6x6-4-4-2",
    "6x6-4-4-4",
  ],
);

const levelThreeRequest = {
  difficulty: 3,
  puzzleCount: 2,
  seed: "v34-level-three-two",
};
const levelThree = generateWorksheet(levelThreeRequest);
assert.deepEqual(generateWorksheet(levelThreeRequest), levelThree);
assert.deepEqual(
  levelThree.puzzles.map((generated) => generated.provenance.profileId),
  ["6x6-6-4-4", "6x6-6-4-4"],
);

for (const worksheet of [levelTwo, levelThree]) {
  for (const generated of worksheet.puzzles) {
    const profile = getUniquePathCoverProfile(
      generated.provenance.profileId,
    );
    assert.equal(generated.puzzle.width, 6);
    assert.equal(generated.puzzle.height, 6);
    assert.equal(generated.puzzle.terminals.length, profile.terminalCount);
    assert.equal(generated.canonicalSolution.paths.length, profile.pathCount);
    assert.deepEqual(generated.solutionCount, { kind: "exact", count: 1 });
    assert.equal(generated.answerCoverage.usedCellCount, 36);
    assert.equal(generated.answerCoverage.coverageRatio, 1);
    assert.equal(
      generated.solutionCost.totalEdgeCount,
      36 - profile.pathCount,
    );
    assert.equal(generated.solutionCost.unitBayCount, 0);
    assert.equal(generated.entry.pairingChoiceCount, {
      "6x6-4-4-2": 9,
      "6x6-4-4-4": 27,
      "6x6-6-4-4": 135,
    }[profile.profileId]);
    assert.ok(generated.provenance.constructionStateCount >= 0);
    assert.equal(
      generated.provenance.pathLengthProfile.reduce(
        (sum, length) => sum + length,
        0,
      ),
      36,
    );
    assert.equal(generated.difficulty.measuredBand, worksheet.request.difficulty);
    assert.equal(
      validateSolution(
        generated.puzzle,
        generated.canonicalSolution,
      ).valid,
      true,
    );
  }
}

assert.deepEqual(
  levelThree.puzzles.map((generated) => (
    Object.values(Object.groupBy(
      generated.puzzle.terminals,
      (terminal) => terminal.symbol,
    )).map((terminals) => terminals?.length ?? 0)
      .toSorted((left, right) => left - right)
  )),
  [[4, 4, 6], [4, 4, 6]],
);

console.log("onaji-no-tsunagi v3.4 5x5/6x6 generator tests passed");
