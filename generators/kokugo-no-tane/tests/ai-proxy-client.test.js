import assert from "node:assert/strict";
import {
  checkAiProxy,
  normalizeAiProxyUrl,
  requestStoryPlan,
} from "../src/ai-proxy-client.js";
import { createStoryPlanFixture } from "./fixtures/story-plan-fixture.js";

assert.equal(normalizeAiProxyUrl("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
for (const invalid of [
  "https://127.0.0.1:8787",
  "http://localhost:8787",
  "http://192.168.1.2:8787",
  "http://127.0.0.1:8787/path",
  "not-a-url",
]) {
  assert.throws(() => normalizeAiProxyUrl(invalid));
}

const health = await checkAiProxy("http://127.0.0.1:8787", {
  fetchImpl: async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8787/health");
    assert.equal(options.method, "GET");
    return jsonResponse(200, {
      ok: true,
      protocol_version: "knt-ai-proxy.v1",
      schema_version: "story-plan.v1",
      prompt_version: "story-plan-prompt.v2",
      context_version: "story-plan-context.v1",
      model: "test-model",
    });
  },
});
assert.equal(health.model, "test-model");

const storyResult = await requestStoryPlan("http://127.0.0.1:8787", {
  grade: 1,
  profile: 3,
  length: "standard",
  topic: "town",
  seed: "client-test",
}, {
  fetchImpl: async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8787/api/story-plan");
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    assert.equal(body.protocol_version, "knt-ai-proxy.v1");
    assert.equal(body.topic, "town");
    assert.ok(body.client_request_id);
    return jsonResponse(200, {
      ok: true,
      protocol_version: "knt-ai-proxy.v1",
      candidate_id: "kt-candidate-client",
      request_id: "proxy-client",
      source: "openai",
      model: "test-model",
      prompt_version: "story-plan-prompt.v2",
      context_version: "story-plan-context.v1",
      schema_version: "story-plan.v1",
      story_plan: createStoryPlanFixture(),
    });
  },
});
assert.equal(storyResult.candidate_id, "kt-candidate-client");
assert.equal(storyResult.story_plan.category, "町");

await assert.rejects(() => requestStoryPlan("http://127.0.0.1:8787", {
  grade: 1,
  profile: 3,
  length: "standard",
  topic: "town",
  seed: "client-error",
}, {
  fetchImpl: async () => jsonResponse(504, {
    ok: false,
    error: { code: "AI_TIMEOUT", message: "timeout" },
    fallback_allowed: true,
  }),
}), (error) => error.code === "AI_TIMEOUT" && error.fallbackAllowed === true);

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

console.log("kokugo-no-tane AI proxy client tests passed");
