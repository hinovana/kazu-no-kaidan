import type { GenerationRequest } from "../domain/types/generation.js";
import type { StoryPlanV1 } from "../domain/types/story-plan.js";

declare const storyPlan: StoryPlanV1;

const localRequest = {
  source: "local",
  grade: 1,
  profile: 3,
  length: "standard",
  seed: "typed-local",
  topic: "school",
} satisfies GenerationRequest;

const storyPlanRequest = {
  source: "story-plan.v1",
  grade: 2,
  profile: 4,
  length: "long",
  seed: "typed-story-plan",
  topic: "town",
  storyPlan,
  sourceMetadata: {
    candidateId: "candidate-fixture",
    requestId: null,
    model: "fixture-model",
    promptVersion: "story-plan-prompt.v2",
    promptHash: null,
    contextVersion: "story-plan-context.v1",
  },
} satisfies GenerationRequest;

function sourceLabel(request: GenerationRequest): string {
  switch (request.source) {
    case "local":
      return request.blueprintId ?? "automatic";
    case "local-fallback":
      return request.errorCode;
    case "story-plan.v1":
      return request.sourceMetadata.candidateId;
    default:
      return assertNever(request);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`unexpected request: ${String(value)}`);
}

sourceLabel(localRequest);
sourceLabel(storyPlanRequest);
