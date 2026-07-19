import type { TopicId } from "../types/generation.js";
import type { StoryCategory, StoryPlanV1 } from "../types/story-plan.js";

export const STORY_PLAN_SCHEMA_VERSION = "story-plan.v1";
export const PROXY_PROTOCOL_VERSION = "knt-ai-proxy.v1";
export const STORY_PLAN_PROMPT_VERSION = "story-plan-prompt.v2";
export const STORY_PLAN_CONTEXT_VERSION = "story-plan-context.v1";
export const STORY_PLAN_VALIDATOR_VERSION = "story-plan-validator.v1";

export const TOPICS = Object.freeze(["auto", "school", "home", "nature", "town", "animal"]);
export const LENGTHS = Object.freeze(["short", "standard", "long"]);
export const STORY_CATEGORIES = Object.freeze(["学校", "家庭", "自然", "町", "動物"]);
export const SETTING_TYPES = Object.freeze(["school", "home", "park", "library", "public_space", "forest"]);

const shortString = Object.freeze({ type: "string", minLength: 1, maxLength: 80 });
const personSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    name: shortString,
    role: shortString,
  },
  required: ["name", "role"],
});

export const STORY_PLAN_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    schema_version: { type: "string", enum: [STORY_PLAN_SCHEMA_VERSION] },
    category: { type: "string", enum: STORY_CATEGORIES },
    title_concept: shortString,
    setting: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: SETTING_TYPES },
        name: shortString,
      },
      required: ["type", "name"],
    },
    protagonist: personSchema,
    supporting_character: personSchema,
    goal: shortString,
    event: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: shortString,
        problem: shortString,
        decision: shortString,
        resolution: shortString,
      },
      required: ["action", "problem", "decision", "resolution"],
    },
    emotion: {
      type: "object",
      additionalProperties: false,
      properties: {
        before: shortString,
        after: shortString,
      },
      required: ["before", "after"],
    },
    evidence_requirements: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 100 },
    },
  },
  required: [
    "schema_version",
    "category",
    "title_concept",
    "setting",
    "protagonist",
    "supporting_character",
    "goal",
    "event",
    "emotion",
    "evidence_requirements",
  ],
});

const REQUEST_KEYS = Object.freeze([
  "protocol_version",
  "client_request_id",
  "grade",
  "profile",
  "length",
  "topic",
  "seed",
]);
const PLAN_KEYS = Object.freeze(STORY_PLAN_JSON_SCHEMA.required);
const PERSON_KEYS = Object.freeze(["name", "role"]);
const SETTING_KEYS = Object.freeze(["type", "name"]);
const EVENT_KEYS = Object.freeze(["action", "problem", "decision", "resolution"]);
const EMOTION_KEYS = Object.freeze(["before", "after"]);
const READER_TEXT_PATTERN = /^[ぁ-んァ-ヶー・、　 ]+$/u;
const NAME_PATTERN = /^[ぁ-んァ-ヶー]+$/u;

export function validateStoryPlanRequest(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["request must be an object"];
  exactKeys(value, REQUEST_KEYS, "request", issues);
  if (value.protocol_version !== PROXY_PROTOCOL_VERSION) issues.push("protocol_version is not supported");
  if (typeof value.client_request_id !== "string" || value.client_request_id.length < 1 || value.client_request_id.length > 64) {
    issues.push("client_request_id must be a string from 1 to 64 characters");
  }
  if (typeof value.grade !== "number" || !Number.isInteger(value.grade) || value.grade < 1 || value.grade > 3) {
    issues.push("grade must be 1, 2, or 3");
  }
  if (typeof value.profile !== "number" || !Number.isInteger(value.profile) || value.profile < 1 || value.profile > 5) {
    issues.push("profile must be 1 through 5");
  }
  if (!includesValue(LENGTHS, value.length)) issues.push("length is not supported");
  if (!includesValue(TOPICS, value.topic)) issues.push("topic is not supported");
  if (typeof value.seed !== "string" || value.seed.length < 1 || value.seed.length > 80 || /[\u0000-\u001f\u007f]/u.test(value.seed)) {
    issues.push("seed must be 1 to 80 characters without control characters");
  }
  return issues;
}

export function validateStoryPlan(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["story_plan must be an object"];
  exactKeys(value, PLAN_KEYS, "story_plan", issues);
  if (value.schema_version !== STORY_PLAN_SCHEMA_VERSION) issues.push("schema_version is not supported");
  if (!includesValue(STORY_CATEGORIES, value.category)) issues.push("category is not supported");
  readerText(value.title_concept, "title_concept", issues);
  objectWithKeys(value.setting, SETTING_KEYS, "setting", issues);
  if (isRecord(value.setting)) {
    if (!includesValue(SETTING_TYPES, value.setting.type)) issues.push("setting.type is not supported");
    readerText(value.setting.name, "setting.name", issues);
  }
  person(value.protagonist, "protagonist", issues);
  person(value.supporting_character, "supporting_character", issues);
  readerText(value.goal, "goal", issues);
  objectWithKeys(value.event, EVENT_KEYS, "event", issues);
  if (isRecord(value.event)) {
    for (const key of EVENT_KEYS) readerText(value.event[key], `event.${key}`, issues);
    if (typeof value.event.decision === "string" && !value.event.decision.endsWith("こと")) {
      issues.push("event.decision must end with こと");
    }
    for (const key of ["problem", "resolution"]) {
      if (typeof value.event[key] === "string" && !/(ました|でした)$/u.test(value.event[key])) {
        issues.push(`event.${key} must end with ました or でした`);
      }
    }
  }
  objectWithKeys(value.emotion, EMOTION_KEYS, "emotion", issues);
  if (isRecord(value.emotion)) {
    for (const key of EMOTION_KEYS) readerText(value.emotion[key], `emotion.${key}`, issues);
  }
  if (!Array.isArray(value.evidence_requirements)
    || value.evidence_requirements.length < 2
    || value.evidence_requirements.length > 3
    || value.evidence_requirements.some((item) => typeof item !== "string" || item.length < 1 || item.length > 100)) {
    issues.push("evidence_requirements must contain 2 or 3 short strings");
  } else {
    value.evidence_requirements.forEach((item, index) => readerText(item, `evidence_requirements.${index}`, issues));
  }
  return issues;
}

export function parseStoryPlan(value: unknown): StoryPlanV1 {
  const issues = validateStoryPlan(value);
  if (issues.length > 0) {
    throw Object.assign(
      new TypeError(`invalid story plan: ${issues.join("; ")}`),
      { code: "SCHEMA_INVALID" as const, issues },
    );
  }
  return structuredCloneSafe(value as StoryPlanV1);
}

export function expectedCategoryForTopic(topic: string | undefined): StoryCategory | null {
  const categories: Partial<Record<TopicId, StoryCategory>> = {
    school: "学校",
    home: "家庭",
    nature: "自然",
    town: "町",
    animal: "動物",
  };
  return categories[topic as TopicId] ?? null;
}

export function stableJson(value: unknown): string | undefined {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function person(value: unknown, label: string, issues: string[]): void {
  objectWithKeys(value, PERSON_KEYS, label, issues);
  if (!isRecord(value)) return;
  if (typeof value.name !== "string" || value.name.length < 1 || value.name.length > 12 || !NAME_PATTERN.test(value.name)) {
    issues.push(`${label}.name must be 1 to 12 hiragana or katakana characters`);
  }
  readerText(value.role, `${label}.role`, issues);
}

function readerText(value: unknown, label: string, issues: string[]): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 80 || !READER_TEXT_PATTERN.test(value)) {
    issues.push(`${label} must contain only age-appropriate hiragana or katakana text`);
  }
}

function objectWithKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`${label} must be an object`);
    return;
  }
  exactKeys(value, keys, label, issues);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
  issues: string[],
): void {
  const expected = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) issues.push(`${label}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) issues.push(`${label}.${key} is not allowed`);
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structuredCloneSafe<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function includesValue(values: readonly unknown[], value: unknown): boolean {
  return values.includes(value);
}
