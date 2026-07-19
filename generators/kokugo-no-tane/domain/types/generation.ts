import type { BlueprintId } from "./ids.js";
import type { StoryPlanV1 } from "./story-plan.js";

export type Grade = 1 | 2 | 3;
export type GenerationProfile = 1 | 2 | 3 | 4 | 5;
export type StoryLength = "short" | "standard" | "long";
export type TopicId = "auto" | "school" | "home" | "nature" | "town" | "animal";

export interface BaseGenerationOptions {
  readonly grade: Grade;
  readonly profile: GenerationProfile;
  readonly length: StoryLength;
  readonly seed: string | number;
  readonly topic: TopicId;
}

export interface LocalGenerationRequest extends BaseGenerationOptions {
  readonly source: "local";
  readonly blueprintId?: BlueprintId;
}

export interface LocalFallbackGenerationRequest extends BaseGenerationOptions {
  readonly source: "local-fallback";
  readonly errorCode: string;
  readonly blueprintId?: BlueprintId;
}

export interface AiSourceMetadata {
  readonly candidateId: string;
  readonly requestId: string | null;
  readonly model: string | null;
  readonly promptVersion: string | null;
  readonly promptHash: string | null;
  readonly contextVersion: string | null;
}

export interface StoryPlanGenerationRequest extends BaseGenerationOptions {
  readonly source: "story-plan.v1";
  readonly storyPlan: StoryPlanV1;
  readonly sourceMetadata: AiSourceMetadata;
}

export type GenerationRequest =
  | LocalGenerationRequest
  | LocalFallbackGenerationRequest
  | StoryPlanGenerationRequest;
