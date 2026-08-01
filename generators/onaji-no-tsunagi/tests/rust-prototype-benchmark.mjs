import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { solutionHash } from "../domain/solver/normalize-solution.ts";
import { solvePuzzle } from "../domain/solver/solve-puzzle.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const generatorDirectory = join(testDirectory, "..");
const prototypeDirectory = join(generatorDirectory, "rust-prototype");
const fixturePath = join(
  prototypeDirectory,
  "fixtures",
  "6x6-4-4-4.json",
);
const binaryPath = join(
  prototypeDirectory,
  "target",
  "release",
  "onaji-no-tsunagi-rust-prototype",
);
const iterations = positiveInteger(
  process.env.OTS_RUST_BENCHMARK_ITERATIONS ?? "51",
);
const puzzle = JSON.parse(readFileSync(fixturePath, "utf8"));

const typescriptMicros = [];
let expectedHash = null;
for (let index = 0; index < iterations; index += 1) {
  const started = performance.now();
  const result = solvePuzzle(puzzle, {
    stateBudget: 500_000,
    solutionLimit: 2,
  });
  const elapsedMicros = (performance.now() - started) * 1000;
  assert.equal(result.status, "solved");
  assert.deepEqual(result.solutionCount, { kind: "exact", count: 1 });
  const hash = solutionHash(result.canonicalSolution, puzzle.width);
  expectedHash ??= hash;
  assert.equal(hash, expectedHash);
  if (index > 0) {
    typescriptMicros.push(elapsedMicros);
  }
}

const rustRows = execFileSync(
  binaryPath,
  [
    "--input",
    fixturePath,
    "--state-budget",
    "500000",
    "--solution-limit",
    "2",
    "--iterations",
    String(iterations),
  ],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const rustMicros = rustRows.slice(1).map((row) => {
  assert.equal(row.status, "solved");
  assert.deepEqual(row.solutionCount, { kind: "exact", count: 1 });
  assert.equal(row.solutionHash, expectedHash);
  return row.elapsedMicros;
});

const typescriptMedian = median(typescriptMicros);
const rustMedian = median(rustMicros);
const speedup = typescriptMedian / rustMedian;

console.log(
  JSON.stringify(
    {
      fixture: puzzle.puzzleId,
      measuredIterations: iterations - 1,
      typescriptMedianMicros: round(typescriptMedian),
      rustMedianMicros: round(rustMedian),
      solverSpeedup: round(speedup),
      note: "Release build, warm run discarded; parsing and process startup excluded.",
    },
    null,
    2,
  ),
);

function positiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 2) {
    throw new TypeError("OTS_RUST_BENCHMARK_ITERATIONS must be at least 2");
  }
  return parsed;
}

function median(values) {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function round(value) {
  return Math.round(value * 100) / 100;
}
