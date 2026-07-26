import assert from "node:assert/strict";

import {
  generationErrorMessage,
  generationErrorReport,
} from "../application/generation-error-message.ts";
import {
  GenerationFailure,
} from "../domain/generation/generate-worksheet.ts";

const detail = {
  code: "DIFFICULTY_RETRY_EXHAUSTED",
  request: {
    difficulty: 2,
    puzzleCount: 1,
    seed: "retry-report",
  },
  profileId: "6x6-4-4-2",
  puzzleIndex: 0,
  retryCount: 10,
  rejectedCandidates: Array.from({ length: 10 }, (_, candidateIndex) => ({
    candidateIndex,
    puzzleSeed: `candidate-${candidateIndex}`,
    topologyHash: `${candidateIndex}`.padStart(8, "0"),
    puzzle: {},
    canonicalSolution: {},
    selection: {
      classification: "clearly_easier",
    },
    terminalPlacementFilterResults: {},
  })),
};
const failure = new GenerationFailure(detail);

assert.equal(generationErrorReport(failure), detail);
assert.match(generationErrorMessage(failure), /10問連続/u);
assert.match(generationErrorMessage(failure), /エラーレポート/u);
assert.equal(generationErrorReport(new Error("unknown")), undefined);

console.log("onaji-no-tsunagi generation error report tests passed");
