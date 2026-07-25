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
    seed: "not-ready",
  }),
  /レベル2から4は準備中/u,
);

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

console.log("onaji-no-tsunagi application boundary tests passed");
