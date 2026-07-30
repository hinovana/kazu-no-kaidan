import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluatePuzzleSelectionFilters,
} from "../domain/generation/puzzle-selection-policy.ts";
import {
  materializePathPlan,
} from "../domain/generation/materialize-path-plan.ts";
import { solutionHash } from "../domain/solver/normalize-solution.ts";
import { solvePuzzle } from "../domain/solver/solve-puzzle.ts";
import {
  analyzeSolutionGeometry,
} from "../domain/validation/analyze-solution-geometry.ts";
import { validateSolution } from "../domain/validation/validate-solution.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const binaryPath = join(
  testDirectory,
  "..",
  "rust-prototype",
  "target",
  "release",
  "build_batch",
);
const argumentsList = [
  "--seed-prefix",
  "rust-builder-parity",
  "--count",
  "50",
  "--jobs",
  "4",
];
const firstOutput = execFileSync(binaryPath, argumentsList, {
  encoding: "utf8",
});
const secondOutput = execFileSync(binaryPath, argumentsList, {
  encoding: "utf8",
});
assert.equal(
  secondOutput,
  firstOutput,
  "parallel batch output must remain deterministic and input ordered",
);

const attempts = firstOutput
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const accepted = attempts.filter((attempt) => attempt.status === "accepted");
assert.ok(accepted.length > 0, "fixed seed range must contain accepted puzzles");
for (const attempt of accepted) {
  assert.match(attempt.topologyHash, /^[0-9a-f]{8}$/u, attempt.seed);
  const typescriptResult = solvePuzzle(attempt.puzzle, {
    stateBudget: 30_000,
    solutionLimit: 2,
  });
  assert.equal(typescriptResult.status, "solved", attempt.seed);
  assert.deepEqual(
    typescriptResult.solutionCount,
    { kind: "exact", count: 1 },
    attempt.seed,
  );
  assert.equal(
    solutionHash(
      typescriptResult.canonicalSolution,
      attempt.puzzle.width,
    ),
    attempt.canonicalSolutionHash,
    attempt.seed,
  );
  const rematerialized = materializePathPlan(
    typescriptResult.canonicalSolution.paths.map((path, index) => ({
      role: index === 0 ? "thread" : index === 1 ? "spine" : "scaffold",
      symbol: path.symbol,
      cells: path.cells,
    })),
    attempt.puzzle.width,
    attempt.puzzle.height,
    "rust-topology-parity",
  );
  assert.equal(rematerialized.topologyHash, attempt.topologyHash, attempt.seed);
  assert.ok(
    validateSolution(
      attempt.puzzle,
      typescriptResult.canonicalSolution,
    ).valid,
    attempt.seed,
  );
  assert.ok(
    analyzeSolutionGeometry(
      attempt.puzzle,
      typescriptResult.canonicalSolution,
    ).totalTurnCount <= 15,
    attempt.seed,
  );
  assert.ok(
    evaluatePuzzleSelectionFilters(
      attempt.puzzle,
      ["no_three_straight_paths_on_same_axis"],
      typescriptResult.canonicalSolution,
    ).allConfiguredFiltersPassed,
    attempt.seed,
  );
}

console.log(
  `Rust builder parity passed: ${accepted.length}/${attempts.length} accepted candidates`,
);
