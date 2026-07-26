import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getUniquePathCoverProfile,
} from "../domain/generation/build-unique-path-cover.ts";
import { generateWorksheet } from "../domain/generation/generate-worksheet.ts";
import { validateSolution } from "../domain/validation/validate-solution.ts";

const regressionBaseline = JSON.parse(await readFile(
  new URL("fixtures/v3.4-six-by-six-baseline.json", import.meta.url),
  "utf8",
));
const seedsPerProfile = parsePositiveInteger(
  process.env.OTS_SIX_BY_SIX_CORPUS_SEEDS_PER_PROFILE,
  1_000,
);
const profileIds = [
  "6x6-4-4-2",
  "6x6-4-4-4",
  "6x6-6-4-4",
];
const statsByProfile = new Map(profileIds.map((profileId) => [
  profileId,
  createStats(),
]));
const startedAt = performance.now();

let levelTwoSeedIndex = 0;
while (
  statsByProfile.get("6x6-4-4-2").acceptedCount < seedsPerProfile
  || statsByProfile.get("6x6-4-4-4").acceptedCount < seedsPerProfile
) {
  const worksheet = generateWorksheet({
    difficulty: 2,
    puzzleCount: 1,
    seed: `corpus-v34-six-by-six-level-2-${levelTwoSeedIndex}`,
  });
  levelTwoSeedIndex += 1;
  const generated = worksheet.puzzles[0];
  assert.ok(generated);
  const stats = statsByProfile.get(generated.provenance.profileId);
  assert.ok(stats);
  if (stats.acceptedCount < seedsPerProfile) {
    record(generated, worksheet.request.difficulty, stats);
  }
}

for (let seedIndex = 0; seedIndex < seedsPerProfile; seedIndex += 1) {
  const worksheet = generateWorksheet({
    difficulty: 3,
    puzzleCount: 1,
    seed: `corpus-v34-six-by-six-level-3-${seedIndex}`,
  });
  const generated = worksheet.puzzles[0];
  assert.ok(generated);
  assert.equal(generated.provenance.profileId, "6x6-6-4-4");
  record(
    generated,
    worksheet.request.difficulty,
    statsByProfile.get("6x6-6-4-4"),
  );
}

for (const [profileId, stats] of statsByProfile) {
  assert.equal(stats.acceptedCount, seedsPerProfile);
  assert.equal(stats.exactUniqueCount, seedsPerProfile);
  assert.ok(stats.topologyHashes.size >= Math.min(
    100,
    Math.floor(seedsPerProfile * 0.5),
  ));
  const profile = getUniquePathCoverProfile(profileId);
  assert.equal(
    stats.pathLengthProfiles.size,
    profile.pathLengthProfiles.length,
  );
  if (seedsPerProfile >= regressionBaseline.minimumRegressionSampleSize) {
    assertProfileWithinRegressionBaseline(
      profileId,
      summarize(stats),
      regressionBaseline,
    );
  }
}

const summariesByProfile = new Map(
  [...statsByProfile].map(([profileId, stats]) => [
    profileId,
    summarize(stats),
  ]),
);
const result = {
  generator: "onaji-no-tsunagi",
  corpusVersion: "onaji-no-tsunagi-corpus.v3.4-draft",
  contract: "exactly-one-normalized-solution-including-pairing",
  board: "6x6",
  seedsPerProfile,
  totalAccepted: seedsPerProfile * profileIds.length,
  elapsedMs: Math.round(performance.now() - startedAt),
  levelTwoRequests: levelTwoSeedIndex,
  regressionBaseline: regressionBaseline.schemaVersion,
  regressionGateApplied:
    seedsPerProfile >= regressionBaseline.minimumRegressionSampleSize,
  byProfile: Object.fromEntries(
    summariesByProfile,
  ),
};

console.log(JSON.stringify(result, null, 2));

function record(generated, difficulty, stats) {
  const profile = getUniquePathCoverProfile(
    generated.provenance.profileId,
  );
  assert.equal(generated.puzzle.width, 6);
  assert.equal(generated.puzzle.height, 6);
  assert.equal(generated.puzzle.terminals.length, profile.terminalCount);
  assert.equal(generated.canonicalSolution.paths.length, profile.pathCount);
  assert.deepEqual(generated.solutionCount, { kind: "exact", count: 1 });
  assert.equal(generated.uniquenessProof.status, "proven");
  assert.equal(generated.qualityProof.status, "optimal");
  assert.equal(
    validateSolution(
      generated.puzzle,
      generated.canonicalSolution,
    ).valid,
    true,
  );
  assert.equal(generated.answerCoverage.usedCellCount, 36);
  assert.equal(generated.answerCoverage.coverageRatio, 1);
  assert.equal(generated.solutionCost.totalEdgeCount, 36 - profile.pathCount);
  assert.equal(generated.solutionCost.unitBayCount, 0);
  assert.ok(
    generated.solutionCost.totalTurnCount <= profile.maximumTotalTurnCount,
  );
  assert.ok(generated.entry.forcedExitTerminalIds.length >= 1);
  assert.ok(
    generated.entry.forcedExitTerminalIds.length
      < generated.puzzle.terminals.length,
  );
  assert.equal(generated.entry.pairingChoiceCount, {
    "6x6-4-4-2": 9,
    "6x6-4-4-4": 27,
    "6x6-6-4-4": 135,
  }[profile.profileId]);
  assert.equal(generated.difficulty.measuredBand, difficulty);
  assert.ok(generated.interactionWitnesses.some((witness) => (
    witness.kind === "pairing_choice"
  )));
  assert.ok(generated.interactionWitnesses.some((witness) => (
    witness.kind === "unique_solution"
  )));

  stats.acceptedCount += 1;
  stats.exactUniqueCount += 1;
  stats.topologyHashes.add(generated.provenance.topologyHash);
  stats.maximumCandidateIndex = Math.max(
    stats.maximumCandidateIndex,
    generated.provenance.candidateIndex,
  );
  stats.constructionStates.push(
    generated.provenance.constructionStateCount,
  );
  stats.uniquenessStates.push(
    generated.uniquenessProof.exploredStateCount,
  );
  stats.optimalityStates.push(
    generated.qualityProof.exploredStateCount,
  );
  stats.turnCounts.push(generated.solutionCost.totalTurnCount);
  stats.forcedExitCounts.push(
    generated.entry.forcedExitTerminalIds.length,
  );
  stats.lineConcentrations.push(
    generated.entry.maximumLineConcentration,
  );
  stats.pathLengthProfiles.add(
    [...generated.provenance.pathLengthProfile]
      .toSorted((left, right) => right - left)
      .join("-"),
  );
  for (const rejection of generated.provenance.precedingRejections) {
    stats.rejectionReasons.set(
      rejection.reason,
      (stats.rejectionReasons.get(rejection.reason) ?? 0) + 1,
    );
  }
}

function createStats() {
  return {
    acceptedCount: 0,
    exactUniqueCount: 0,
    topologyHashes: new Set(),
    maximumCandidateIndex: 0,
    constructionStates: [],
    uniquenessStates: [],
    optimalityStates: [],
    turnCounts: [],
    forcedExitCounts: [],
    lineConcentrations: [],
    pathLengthProfiles: new Set(),
    rejectionReasons: new Map(),
  };
}

function summarize(stats) {
  const totalRejectionCount = [...stats.rejectionReasons.values()]
    .reduce((sum, count) => sum + count, 0);
  return {
    acceptedCount: stats.acceptedCount,
    exactUniqueCount: stats.exactUniqueCount,
    uniqueTopologyHashes: stats.topologyHashes.size,
    duplicateTopologyRate: round(
      1 - stats.topologyHashes.size / stats.acceptedCount,
    ),
    maximumCandidateIndex: stats.maximumCandidateIndex,
    totalRejectionCount,
    rejectionsPerAccepted: round(
      totalRejectionCount / stats.acceptedCount,
    ),
    rejectionReasons: Object.fromEntries(stats.rejectionReasons),
    constructionStates: summarizeNumbers(stats.constructionStates),
    uniquenessStates: summarizeNumbers(stats.uniquenessStates),
    optimalityStates: summarizeNumbers(stats.optimalityStates),
    totalTurns: summarizeNumbers(stats.turnCounts),
    forcedExits: summarizeNumbers(stats.forcedExitCounts),
    maximumLineConcentration: Math.max(...stats.lineConcentrations),
    pathLengthProfiles: [...stats.pathLengthProfiles].toSorted(),
  };
}

function assertProfileWithinRegressionBaseline(
  profileId,
  actual,
  baselineDocument,
) {
  const expected = baselineDocument.profiles[profileId];
  assert.ok(expected, `${profileId}: regression baseline is missing`);
  const tolerances = baselineDocument.tolerances;
  const baselineTopologyRatio = (
    expected.uniqueTopologyCount
    / baselineDocument.sampleSizePerProfile
  );
  assert.ok(
    actual.uniqueTopologyHashes / actual.acceptedCount
      >= baselineTopologyRatio * tolerances.minimumTopologyRatioFactor,
    `${profileId}: topology diversity regressed below the allowed ratio`,
  );
  assert.ok(
    actual.maximumCandidateIndex
      <= expected.maximumCandidateIndex
        * tolerances.maximumCandidateIndexFactor,
    `${profileId}: candidate search maximum exceeded the allowed width`,
  );
  assert.ok(
    actual.rejectionsPerAccepted
      <= expected.rejectionsPerAccepted
        * tolerances.maximumRejectionsPerAcceptedFactor,
    `${profileId}: candidate rejection rate exceeded the allowed width`,
  );
  for (const metric of [
    "constructionStates",
    "uniquenessStates",
    "optimalityStates",
  ]) {
    assert.ok(
      actual[metric].maximum
        <= expected[metric].maximum * tolerances.maximumStateCountFactor,
      `${profileId}: ${metric} maximum exceeded the allowed width`,
    );
    assert.ok(
      actual[metric].p95
        <= expected[metric].p95 * tolerances.p95StateCountFactor,
      `${profileId}: ${metric} p95 exceeded the allowed width`,
    );
  }
}

function summarizeNumbers(values) {
  const sorted = [...values].toSorted((left, right) => left - right);
  return {
    minimum: sorted[0] ?? 0,
    maximum: sorted.at(-1) ?? 0,
    average: round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ),
    p95: percentile(sorted, 0.95),
  };
}

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * percentileValue) - 1,
  );
  return sorted[index] ?? 0;
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(
      "OTS_SIX_BY_SIX_CORPUS_SEEDS_PER_PROFILE must be a positive integer",
    );
  }
  return parsed;
}
