import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {
  materializePathPlan,
} from "../domain/generation/materialize-path-plan.ts";
import {
  evaluatePuzzleSelectionFilters,
} from "../domain/generation/puzzle-selection-policy.ts";
import {solutionHash} from "../domain/solver/normalize-solution.ts";
import {solvePuzzle} from "../domain/solver/solve-puzzle.ts";
import {
  analyzeSolutionCoverage,
} from "../domain/validation/analyze-solution-coverage.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const binaryPath = join(
  testDirectory,
  "..",
  "rust-prototype",
  "target",
  "release",
  "build_trimmed_batch",
);
const argumentsList = [
  "--seed-prefix",
  "rust-trimmed-parity",
  "--accepted-count",
  "20",
  "--maximum-base-count",
  "100",
  "--variants-per-base",
  "100",
  "--jobs",
  "4",
];
const firstOutput = execFileSync(binaryPath, argumentsList, {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
const secondOutput = execFileSync(binaryPath, argumentsList, {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
assert.equal(
  secondOutput,
  firstOutput,
  "trimmed batch output must remain deterministic and input ordered",
);

const candidates = firstOutput
  .trim()
  .split("\n")
  .map(line => JSON.parse(line));
assert.equal(candidates.length, 20);
assert.equal(
  new Set(candidates.map(candidate => candidate.topologyHash)).size,
  candidates.length,
);
for (const candidate of candidates) {
  assert.equal(candidate.trimCount, 5);
  assert.equal(
    analyzeSolutionCoverage(
      candidate.puzzle,
      candidate.canonicalSolution,
    ).usedCellCount,
    31,
    candidate.seed,
  );
  const solved = solvePuzzle(candidate.puzzle, {
    stateBudget: 500_000,
    solutionLimit: 2,
  });
  assert.equal(solved.status, "solved", candidate.seed);
  assert.deepEqual(
    solved.solutionCount,
    {kind: "exact", count: 1},
    candidate.seed,
  );
  assert.deepEqual(solved.metrics, candidate.solverMetrics, candidate.seed);
  assert.equal(
    solutionHash(solved.canonicalSolution, candidate.puzzle.width),
    candidate.canonicalSolutionHash,
    candidate.seed,
  );
  const rematerialized = materializePathPlan(
    solved.canonicalSolution.paths.map((path, index) => ({
      role: index === 0 ? "thread" : index === 1 ? "spine" : "scaffold",
      symbol: path.symbol,
      cells: path.cells,
    })),
    candidate.puzzle.width,
    candidate.puzzle.height,
    "rust-trimmed-topology-parity",
  );
  assert.equal(
    rematerialized.topologyHash,
    candidate.topologyHash,
    candidate.seed,
  );
  assert.equal(
    evaluatePuzzleSelectionFilters(
      candidate.puzzle,
      ["no_three_straight_paths_on_same_axis"],
      solved.canonicalSolution,
    ).allConfiguredFiltersPassed,
    true,
    candidate.seed,
  );
}

console.log(
  `Rust trimmed builder parity passed for ${candidates.length} candidates`,
);

