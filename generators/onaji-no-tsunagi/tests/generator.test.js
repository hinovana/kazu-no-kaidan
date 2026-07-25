import assert from "node:assert/strict";
import {
  getFiveByFiveTerminalProfile,
  selectFiveByFiveTerminalPattern,
} from "../domain/generation/build-unique-five-by-five.ts";
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
  const profile = getFiveByFiveTerminalProfile(
    generated.provenance.terminalPattern,
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
  assert.equal(generated.entry.terminalPattern, profile.pattern);
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
    selectFiveByFiveTerminalPattern(`pattern-seed-${index}`, 0, 1)
  )),
);
assert.deepEqual(
  [...selectedPatterns].toSorted(),
  ["2-2-2", "4-2-2", "4-4-2"],
);

console.log("onaji-no-tsunagi v3.3 unique 5x5 generator tests passed");
