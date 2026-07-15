import assert from "node:assert/strict";
import { generateWorksheet } from "../src/generator.js";
import {
  PROXY_PROTOCOL_VERSION,
  parseStoryPlan,
  validateStoryPlan,
  validateStoryPlanRequest,
} from "../src/story-plan-schema.js";
import { createStoryPlanFixture } from "./fixtures/story-plan-fixture.js";

const plan = createStoryPlanFixture();
assert.deepEqual(validateStoryPlan(plan), []);
assert.deepEqual(parseStoryPlan(plan), plan);
assert.ok(validateStoryPlan({ ...plan, unexpected: true }).some((issue) => issue.includes("unexpected")));
assert.ok(validateStoryPlan(createStoryPlanFixture({ protagonist: { name: "太郎" } })).length > 0);
assert.ok(validateStoryPlan(createStoryPlanFixture({ event: { decision: "かきなおす" } })).length > 0);

const request = {
  protocol_version: PROXY_PROTOCOL_VERSION,
  client_request_id: "7abdd9b0-7a45-4e13-9f19-6ca97e845abc",
  grade: 1,
  profile: 3,
  length: "standard",
  topic: "town",
  seed: "ai-story-plan",
};
assert.deepEqual(validateStoryPlanRequest(request), []);
assert.ok(validateStoryPlanRequest({ ...request, topic: "remote" }).length > 0);
assert.ok(validateStoryPlanRequest({ ...request, extra: true }).length > 0);

const options = {
  grade: 1,
  profile: 3,
  length: "standard",
  topic: "town",
  seed: "ai-story-plan",
  storyPlan: plan,
  sourceMetadata: {
    source: "ai_proxy",
    candidate_id: "kt-candidate-fixture",
    request_id: "proxy-fixture",
    model: "test-model",
    prompt_version: "story-plan-prompt.v2",
  },
};
const first = generateWorksheet(options);
const second = generateWorksheet(options);
assert.deepEqual(second, first);
assert.equal(first.story.category, "町");
assert.equal(first.story.protagonist.name, "あお");
assert.equal(first.story.supporting_character, "ゆう");
assert.match(first.passage.plainText, /まちたんけんのちず/);
assert.match(first.passage.plainText, /めじるしをちがうばしょにかいてしまいました/);
assert.equal(first.generation_provenance.generation_source, "ai_proxy");
assert.equal(first.generation_provenance.candidate_id, "kt-candidate-fixture");
assert.equal(first.generation_provenance.model, "test-model");
assert.equal(first.machine_checks.checks.find((check) => check.check_id === "story_plan_contract").passed, true);

assert.throws(() => generateWorksheet({ ...options, topic: "school" }), /category must be 学校/);

const fallback = generateWorksheet({
  grade: 1,
  profile: 3,
  length: "standard",
  topic: "town",
  seed: "fallback",
  sourceMetadata: { source: "local_fallback", error_code: "AI_TIMEOUT" },
});
assert.equal(fallback.generation_provenance.generation_source, "local_fallback");
assert.equal(fallback.generation_provenance.fallback_reason, "AI_TIMEOUT");
assert.equal(fallback.story_plan, null);

console.log("kokugo-no-tane story plan tests passed");
