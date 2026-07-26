import assert from "node:assert/strict";
import { generateWorksheetUseCase } from "../application/generate-worksheet-use-case.ts";
import {
  GenerationRequestParseError,
  parseGenerationRequest,
} from "../application/parse-generation-request.ts";

assert.deepEqual(parseGenerationRequest({
  difficulty: "1",
  puzzleCount: "1",
  seed: " boundary-seed ",
}), {
  difficulty: 1,
  puzzleCount: 1,
  seed: "boundary-seed",
});

assert.deepEqual(parseGenerationRequest({
  difficulty: "2",
  puzzleCount: "1",
  seed: " classified ",
  acceptedDifficultyClassifications: [
    "mixed",
    "reference_like",
  ],
}), {
  difficulty: 2,
  puzzleCount: 1,
  seed: "classified",
  acceptedDifficultyClassifications: [
    "reference_like",
    "mixed",
  ],
});

assert.throws(
  () => parseGenerationRequest({
    difficulty: 0,
    puzzleCount: 5,
    seed: "",
  }),
  GenerationRequestParseError,
);

assert.throws(
  () => parseGenerationRequest({
    difficulty: 2,
    puzzleCount: 1,
    seed: "no-criteria",
    acceptedDifficultyClassifications: [],
  }),
  /採用基準を1つ以上/u,
);

assert.throws(
  () => parseGenerationRequest({
    difficulty: 2,
    puzzleCount: 1,
    seed: "easy-is-not-selectable",
    acceptedDifficultyClassifications: ["clearly_easier"],
  }),
  /未対応の分類/u,
);

assert.throws(
  () => parseGenerationRequest({
    difficulty: 4,
    puzzleCount: 1,
    seed: "not-ready",
  }),
  /レベル4の唯一解文法は準備中/u,
);

for (const difficulty of [2, 3]) {
  assert.deepEqual(parseGenerationRequest({
    difficulty: String(difficulty),
    puzzleCount: "1",
    seed: `level-${difficulty}`,
  }), {
    difficulty,
    puzzleCount: 1,
    seed: `level-${difficulty}`,
  });
}

const worksheet = generateWorksheetUseCase({
  difficulty: "1",
  puzzleCount: "1",
  seed: "use-case",
});
assert.equal(worksheet.request.difficulty, 1);
assert.equal(worksheet.machineChecks.allPassed, true);
assert.deepEqual(
  worksheet.puzzles[0].solutionCount,
  { kind: "exact", count: 1 },
);

const sixBySixWorksheet = generateWorksheetUseCase({
  difficulty: "2",
  puzzleCount: "1",
  seed: "six-by-six-use-case",
});
assert.equal(sixBySixWorksheet.request.difficulty, 2);
assert.equal(sixBySixWorksheet.puzzles[0].puzzle.width, 6);
assert.deepEqual(
  sixBySixWorksheet.puzzles[0].solutionCount,
  { kind: "exact", count: 1 },
);

console.log("onaji-no-tsunagi application boundary tests passed");
