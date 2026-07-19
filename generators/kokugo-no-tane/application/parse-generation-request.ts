import { parseStoryPlan } from "../domain/schemas/story-plan-v1.ts";
import type {
  AiSourceMetadata,
  BaseGenerationOptions,
  GenerationRequest,
} from "../domain/types/generation.js";
import type { BlueprintId } from "../domain/types/ids.js";

const SOURCES = Object.freeze(["local", "local-fallback", "story-plan.v1"]);
const TOPICS = Object.freeze(["auto", "school", "home", "nature", "town", "animal"]);
const LENGTHS = Object.freeze(["short", "standard", "long"]);
const BASE_KEYS = Object.freeze(["source", "grade", "profile", "length", "seed", "topic"]);
const LOCAL_KEYS = Object.freeze([...BASE_KEYS, "blueprintId"]);
const FALLBACK_KEYS = Object.freeze([...LOCAL_KEYS, "errorCode"]);
const STORY_PLAN_KEYS = Object.freeze([...BASE_KEYS, "storyPlan", "sourceMetadata"]);
const METADATA_KEYS = Object.freeze([
  "candidateId",
  "requestId",
  "model",
  "promptVersion",
  "promptHash",
  "contextVersion",
]);

export function parseGenerationRequest(input: unknown): GenerationRequest {
  if (!isRecord(input)) throw invalid("generation request must be an object");
  const source = input.source;
  if (typeof source !== "string" || !SOURCES.includes(source)) {
    throw invalid("generation request source is not supported");
  }
  const base = parseBase(input);

  if (source === "local") {
    exactKeys(input, LOCAL_KEYS);
    const blueprintId = optionalBlueprintId(input.blueprintId);
    return blueprintId === undefined
      ? { source, ...base }
      : { source, ...base, blueprintId };
  }
  if (source === "local-fallback") {
    exactKeys(input, FALLBACK_KEYS);
    const errorCode = requiredString(input.errorCode, "errorCode");
    const blueprintId = optionalBlueprintId(input.blueprintId);
    return blueprintId === undefined
      ? { source, ...base, errorCode }
      : { source, ...base, errorCode, blueprintId };
  }

  exactKeys(input, STORY_PLAN_KEYS);
  return {
    source: "story-plan.v1",
    ...base,
    storyPlan: parseStoryPlan(input.storyPlan),
    sourceMetadata: parseSourceMetadata(input.sourceMetadata),
  };
}

function parseBase(input: Readonly<Record<string, unknown>>): BaseGenerationOptions {
  const grade = input.grade;
  const profile = input.profile;
  const length = input.length;
  const topic = input.topic;
  const seed = input.seed;
  if (grade !== 1 && grade !== 2 && grade !== 3) throw invalid("grade must be 1, 2, or 3");
  if (profile !== 1 && profile !== 2 && profile !== 3 && profile !== 4 && profile !== 5) {
    throw invalid("profile must be 1 through 5");
  }
  if (typeof length !== "string" || !LENGTHS.includes(length)) throw invalid("length is not supported");
  if (typeof topic !== "string" || !TOPICS.includes(topic)) throw invalid("topic is not supported");
  if (typeof seed !== "string" && typeof seed !== "number") throw invalid("seed must be a string or number");
  if (typeof seed === "string" && (seed.length === 0 || seed.length > 80 || /[\u0000-\u001f\u007f]/u.test(seed))) {
    throw invalid("seed must be 1 to 80 characters without control characters");
  }
  if (typeof seed === "number" && !Number.isFinite(seed)) throw invalid("seed must be finite");
  return {
    grade,
    profile,
    length: length as BaseGenerationOptions["length"],
    topic: topic as BaseGenerationOptions["topic"],
    seed,
  };
}

function parseSourceMetadata(input: unknown): AiSourceMetadata {
  if (!isRecord(input)) throw invalid("sourceMetadata must be an object");
  exactKeys(input, METADATA_KEYS);
  return {
    candidateId: requiredString(input.candidateId, "sourceMetadata.candidateId"),
    requestId: nullableString(input.requestId, "sourceMetadata.requestId"),
    model: nullableString(input.model, "sourceMetadata.model"),
    promptVersion: nullableString(input.promptVersion, "sourceMetadata.promptVersion"),
    promptHash: nullableString(input.promptHash, "sourceMetadata.promptHash"),
    contextVersion: nullableString(input.contextVersion, "sourceMetadata.contextVersion"),
  };
}

function optionalBlueprintId(value: unknown): BlueprintId | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, "blueprintId") as BlueprintId;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw invalid(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): void {
  const expected = new Set(expectedKeys);
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key) && !["blueprintId"].includes(key)) {
      throw invalid(`${key} is required`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw invalid(`${key} is not allowed`);
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(message: string): TypeError & { readonly code: "INVALID_INPUT" } {
  return Object.assign(
    new TypeError(`invalid generation request: ${message}`),
    { code: "INVALID_INPUT" as const },
  );
}
