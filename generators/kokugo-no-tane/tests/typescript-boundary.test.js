import assert from "node:assert/strict";
import { generateWorksheetFromRequest } from "../application/generate-worksheet-use-case.ts";
import { generateWorksheet as generateLegacyWorksheet } from "../domain/generation/generate-worksheet.ts";
import { STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID } from "../domain/blueprints/story-clue-discovery/blueprint.ts";
import { createStoryPlanFixture } from "./fixtures/story-plan-fixture.js";

const localRequest = {
  source: "local",
  grade: 1,
  profile: 3,
  length: "standard",
  seed: "typescript-boundary-local",
  topic: "school",
  blueprintId: STORY_CLUE_DISCOVERY_4Q_BLUEPRINT_ID,
};
assert.deepEqual(
  generateWorksheetFromRequest(localRequest),
  generateLegacyWorksheet({
    grade: localRequest.grade,
    profile: localRequest.profile,
    length: localRequest.length,
    seed: localRequest.seed,
    topic: localRequest.topic,
    blueprintId: localRequest.blueprintId,
  }),
);

const fallbackRequest = {
  source: "local-fallback",
  grade: 2,
  profile: 4,
  length: "short",
  seed: "typescript-boundary-fallback",
  topic: "home",
  errorCode: "AI_TIMEOUT",
};
assert.deepEqual(
  generateWorksheetFromRequest(fallbackRequest),
  generateLegacyWorksheet({
    grade: fallbackRequest.grade,
    profile: fallbackRequest.profile,
    length: fallbackRequest.length,
    seed: fallbackRequest.seed,
    topic: fallbackRequest.topic,
    sourceMetadata: { source: "local_fallback", error_code: fallbackRequest.errorCode },
  }),
);

const plan = createStoryPlanFixture();
const storyPlanRequest = {
  source: "story-plan.v1",
  grade: 1,
  profile: 3,
  length: "standard",
  seed: "typescript-boundary-story-plan",
  topic: "town",
  storyPlan: plan,
  sourceMetadata: {
    candidateId: "kt-candidate-typescript-boundary",
    requestId: "proxy-typescript-boundary",
    model: "test-model",
    promptVersion: "story-plan-prompt.v2",
    promptHash: null,
    contextVersion: "story-plan-context.v1",
  },
};
assert.deepEqual(
  generateWorksheetFromRequest(storyPlanRequest),
  generateLegacyWorksheet({
    grade: storyPlanRequest.grade,
    profile: storyPlanRequest.profile,
    length: storyPlanRequest.length,
    seed: storyPlanRequest.seed,
    topic: storyPlanRequest.topic,
    storyPlan: plan,
    sourceMetadata: {
      source: "ai_proxy",
      candidate_id: storyPlanRequest.sourceMetadata.candidateId,
      request_id: storyPlanRequest.sourceMetadata.requestId,
      model: storyPlanRequest.sourceMetadata.model,
      prompt_version: storyPlanRequest.sourceMetadata.promptVersion,
      prompt_hash: storyPlanRequest.sourceMetadata.promptHash,
      context_version: storyPlanRequest.sourceMetadata.contextVersion,
    },
  }),
);

assert.throws(
  () => generateWorksheetFromRequest({ ...localRequest, storyPlan: plan }),
  /storyPlan is not allowed/,
);
assert.throws(
  () => generateWorksheetFromRequest({ ...storyPlanRequest, sourceMetadata: undefined }),
  /sourceMetadata must be an object/,
);
assert.throws(
  () => generateWorksheetFromRequest({ ...localRequest, grade: 4 }),
  /grade must be 1, 2, or 3/,
);

console.log("kokugo-no-tane TypeScript boundary tests passed");
