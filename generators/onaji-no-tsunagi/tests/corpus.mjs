import assert from "node:assert/strict";
import {
  getUniquePathCoverProfile,
} from "../domain/generation/build-unique-path-cover.ts";
import { generateWorksheet } from "../domain/generation/generate-worksheet.ts";
import { validateSolution } from "../domain/validation/validate-solution.ts";

const seedCount = parsePositiveInteger(
  process.env.OTS_CORPUS_SEEDS_PER_LEVEL,
  1_000,
);
const corpusSeedFamily = "corpus-v33-variable-terminals";
const startedAt = performance.now();
const hashes = new Set();
const rejectionReasons = new Map();
const patternStats = new Map(
  ["2-2-2", "4-2-2", "4-4-2"].map((pattern) => [
    pattern,
    {
      acceptedCount: 0,
      hashes: new Set(),
      maximumCandidateIndex: 0,
      totalTurnCount: 0,
      forcedExitMinimum: Number.POSITIVE_INFINITY,
      forcedExitMaximum: 0,
      uniquenessStateMaximum: 0,
      uniquenessStateTotal: 0,
    },
  ]),
);
let maximumCandidateIndex = 0;
let uniquenessStateMaximum = 0;
let uniquenessStateTotal = 0;
let optimalityStateMaximum = 0;
let optimalityStateTotal = 0;
let totalTurnCount = 0;
let forcedExitMinimum = Number.POSITIVE_INFINITY;
let forcedExitMaximum = 0;
let maximumLineConcentration = 0;

for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
  const worksheet = generateWorksheet({
    difficulty: 1,
    puzzleCount: 1,
    seed: `${corpusSeedFamily}-seed-${seedIndex}`,
  });
  const generated = worksheet.puzzles[0];
  assert.ok(generated);
  const profile = getUniquePathCoverProfile(
    generated.provenance.profileId,
  );
  const stats = patternStats.get(profile.terminalPattern);
  assert.ok(stats);
  assert.equal(worksheet.machineChecks.allPassed, true);
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
  assert.equal(generated.answerCoverage.usedCellCount, 25);
  assert.equal(generated.answerCoverage.coverageRatio, 1);
  assert.equal(
    generated.solutionCost.totalEdgeCount,
    25 - profile.pathCount,
  );
  assert.equal(generated.solutionCost.unitBayCount, 0);
  assert.ok(
    generated.solutionCost.totalTurnCount
      <= profile.maximumTotalTurnCount,
  );
  assert.equal(generated.entry.pattern, "unique_path_cover");
  assert.equal(generated.entry.terminalPattern, profile.terminalPattern);
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
  assert.equal(
    generated.entry.pairingChoiceCount,
    profile.terminalPattern === "2-2-2"
      ? 1
      : profile.terminalPattern === "4-2-2"
        ? 3
        : 9,
  );
  assert.ok(generated.interactionWitnesses.some((witness) => (
    witness.kind === "unique_solution"
  )));
  assert.equal(
    generated.interactionWitnesses.some((witness) => (
      witness.kind === "pairing_choice"
    )),
    generated.entry.pairingChoiceCount > 1,
  );

  hashes.add(generated.provenance.topologyHash);
  stats.hashes.add(generated.provenance.topologyHash);
  stats.acceptedCount += 1;
  maximumCandidateIndex = Math.max(
    maximumCandidateIndex,
    generated.provenance.candidateIndex,
  );
  stats.maximumCandidateIndex = Math.max(
    stats.maximumCandidateIndex,
    generated.provenance.candidateIndex,
  );
  for (const rejection of generated.provenance.precedingRejections) {
    rejectionReasons.set(
      rejection.reason,
      (rejectionReasons.get(rejection.reason) ?? 0) + 1,
    );
  }
  uniquenessStateMaximum = Math.max(
    uniquenessStateMaximum,
    generated.uniquenessProof.exploredStateCount,
  );
  uniquenessStateTotal += generated.uniquenessProof.exploredStateCount;
  stats.uniquenessStateMaximum = Math.max(
    stats.uniquenessStateMaximum,
    generated.uniquenessProof.exploredStateCount,
  );
  stats.uniquenessStateTotal +=
    generated.uniquenessProof.exploredStateCount;
  optimalityStateMaximum = Math.max(
    optimalityStateMaximum,
    generated.qualityProof.exploredStateCount,
  );
  optimalityStateTotal += generated.qualityProof.exploredStateCount;
  totalTurnCount += generated.solutionCost.totalTurnCount;
  stats.totalTurnCount += generated.solutionCost.totalTurnCount;
  forcedExitMinimum = Math.min(
    forcedExitMinimum,
    generated.entry.forcedExitTerminalIds.length,
  );
  forcedExitMaximum = Math.max(
    forcedExitMaximum,
    generated.entry.forcedExitTerminalIds.length,
  );
  stats.forcedExitMinimum = Math.min(
    stats.forcedExitMinimum,
    generated.entry.forcedExitTerminalIds.length,
  );
  stats.forcedExitMaximum = Math.max(
    stats.forcedExitMaximum,
    generated.entry.forcedExitTerminalIds.length,
  );
  maximumLineConcentration = Math.max(
    maximumLineConcentration,
    generated.entry.maximumLineConcentration,
  );
}

if (seedCount >= 30) {
  for (const [pattern, stats] of patternStats) {
    assert.ok(
      stats.acceptedCount > 0,
      `the corpus did not select terminal pattern ${pattern}`,
    );
  }
}
assert.ok(
  hashes.size >= Math.min(
    30,
    Math.max(1, Math.floor(seedCount * 0.2)),
  ),
  `the 5x5 grammar produced only ${hashes.size} normalized topologies`,
);

console.log(JSON.stringify({
  generator: "onaji-no-tsunagi",
  corpusVersion: "onaji-no-tsunagi-corpus.v3.3",
  contract: "exactly-one-normalized-solution-including-pairing",
  board: "5x5",
  terminalPatterns: ["2-2-2", "4-2-2", "4-4-2"],
  seeds: seedCount,
  elapsedMs: Math.round(performance.now() - startedAt),
  acceptedCount: seedCount,
  exactUniqueCount: seedCount,
  uniqueTopologyHashes: hashes.size,
  duplicateTopologyRate: round(1 - hashes.size / seedCount),
  maximumCandidateIndex,
  rejectionReasons: Object.fromEntries(rejectionReasons),
  uniquenessProof: {
    successRate: 1,
    maximumStates: uniquenessStateMaximum,
    averageStates: round(uniquenessStateTotal / seedCount),
  },
  optimalityProof: {
    successRate: 1,
    maximumStates: optimalityStateMaximum,
    averageStates: round(optimalityStateTotal / seedCount),
  },
  solutionGeometry: {
    usedCells: 25,
    totalCells: 25,
    edgeCounts: {
      "2-2-2": 22,
      "4-2-2": 21,
      "4-4-2": 20,
    },
    unitBayCount: 0,
    averageTurnCount: round(totalTurnCount / seedCount),
  },
  entryStructure: {
    minimumForcedExits: forcedExitMinimum,
    maximumForcedExits: forcedExitMaximum,
    maximumLineConcentration,
  },
  byTerminalPattern: Object.fromEntries(
    [...patternStats].map(([pattern, stats]) => [
      pattern,
      {
        acceptedCount: stats.acceptedCount,
        uniqueTopologyHashes: stats.hashes.size,
        maximumCandidateIndex: stats.maximumCandidateIndex,
        averageTurnCount: round(
          stats.totalTurnCount / stats.acceptedCount,
        ),
        forcedExitMinimum: stats.forcedExitMinimum,
        forcedExitMaximum: stats.forcedExitMaximum,
        uniquenessStateMaximum: stats.uniquenessStateMaximum,
        uniquenessStateAverage: round(
          stats.uniquenessStateTotal / stats.acceptedCount,
        ),
      },
    ]),
  ),
}, null, 2));

function parsePositiveInteger(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(
      "OTS_CORPUS_SEEDS_PER_LEVEL must be a positive integer",
    );
  }
  return parsed;
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
