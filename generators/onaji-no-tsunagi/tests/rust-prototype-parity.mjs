import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateWorksheetForProfile,
} from "../domain/generation/generate-worksheet.ts";
import { solutionHash } from "../domain/solver/normalize-solution.ts";
import { solvePuzzle } from "../domain/solver/solve-puzzle.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const generatorDirectory = join(testDirectory, "..");
const prototypeDirectory = join(generatorDirectory, "rust-prototype");
const fixturePath = join(
  prototypeDirectory,
  "fixtures",
  "parity-puzzles.ndjson",
);
const binaryPath = join(
  prototypeDirectory,
  "target",
  "release",
  "onaji-no-tsunagi-rust-prototype",
);
const fixedPuzzles = readFileSync(fixturePath, "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const profileDifficulties = new Map([
  ["6x6-4-4-2", 2],
  ["6x6-4-4-4", 2],
  ["6x6-6-4-4", 3],
]);
const generatedPuzzles = [...profileDifficulties].flatMap(
  ([profileId, difficulty]) =>
    Array.from({ length: 3 }, (_, index) => {
      const worksheet = generateWorksheetForProfile(
        {
          difficulty,
          puzzleCount: 1,
          seed: `rust-prototype-parity-${profileId}-${index}`,
        },
        profileId,
      );
      return worksheet.puzzles[0].puzzle;
    }),
);
const puzzles = [...fixedPuzzles, ...generatedPuzzles];
const rustResults = execFileSync(
  binaryPath,
  [
    "--state-budget",
    "500000",
    "--solution-limit",
    "2",
    "--jobs",
    "3",
  ],
  {
    encoding: "utf8",
    input: puzzles.map((puzzle) => JSON.stringify(puzzle)).join("\n"),
    maxBuffer: 16 * 1024 * 1024,
  },
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

assert.equal(rustResults.length, puzzles.length);
for (const [index, puzzle] of puzzles.entries()) {
  const rustResult = rustResults[index];
  const typescriptResult = solvePuzzle(puzzle, {
    stateBudget: 500_000,
    solutionLimit: 2,
  });
  assert.equal(rustResult.puzzleId, puzzle.puzzleId);
  assert.equal(rustResult.status, typescriptResult.status, puzzle.puzzleId);
  assert.deepEqual(
    rustResult.metrics,
    typescriptResult.metrics,
    `${puzzle.puzzleId}: solver metrics`,
  );
  if (typescriptResult.status === "solved") {
    assert.deepEqual(
      rustResult.solutionCount,
      typescriptResult.solutionCount,
      `${puzzle.puzzleId}: solution count`,
    );
    assert.equal(
      rustResult.solutionHash,
      solutionHash(typescriptResult.canonicalSolution, puzzle.width),
      `${puzzle.puzzleId}: canonical solution hash`,
    );
  } else {
    assert.equal(rustResult.solutionHash, null);
  }
}

console.log(
  `Rust/TypeScript solver parity passed for ${puzzles.length} fixtures`,
);
