import assert from "node:assert/strict";
import { buildCodexExecArgs, requestCodexStoryPlan } from "../server/codex-story-plan.ts";
import { STORY_PLAN_JSON_SCHEMA } from "../domain/schemas/story-plan-v1.ts";
import { createStoryPlanFixture } from "./fixtures/story-plan-fixture.js";

const config = {
  codexCommand: "codex-custom",
  codexModel: "test-codex-model",
  codexReasoningEffort: "high",
  model: "test-codex-model",
};
const request = {
  grade: 1,
  profile: 3,
  length: "standard",
  topic: "town",
  seed: "codex-contract-test",
  client_request_id: "client-codex-contract-test",
};
let invocation;
const ioLogs = [];
const result = await requestCodexStoryPlan({
  config,
  request,
  execute: async (value) => {
    invocation = value;
    return JSON.stringify(createStoryPlanFixture());
  },
  logger: (entry) => ioLogs.push(entry),
});

assert.equal(invocation.command, "codex-custom");
assert.equal(invocation.model, "test-codex-model");
assert.equal(invocation.reasoningEffort, "high");
assert.deepEqual(invocation.schema, STORY_PLAN_JSON_SCHEMA);
assert.match(invocation.prompt, /codex-contract-test/u);
assert.match(invocation.prompt, /外部情報の検索、ファイルの読み書き、コマンド実行は行わず/u);
assert.equal(result.storyPlan.category, "町");
assert.equal(result.response.object, "codex.exec");
assert.equal(result.response.model, "test-codex-model");
assert.equal(result.providerResponseId, null);
assert.match(result.promptHash, /^[a-f0-9]{64}$/u);
assert.equal(ioLogs[0].event, "ai_provider_request");
assert.equal(ioLogs[0].provider, "codex");
assert.equal(ioLogs[0].client_request_id, "client-codex-contract-test");
assert.match(ioLogs[0].request.prompt, /codex-contract-test/u);
assert.deepEqual(ioLogs[0].request.output_schema, STORY_PLAN_JSON_SCHEMA);
assert.equal(ioLogs[1].event, "ai_provider_response");
assert.equal(JSON.parse(ioLogs[1].response.output_text).category, "町");

const args = buildCodexExecArgs({
  model: "test-codex-model",
  reasoningEffort: "high",
  schemaPath: "/tmp/schema.json",
  outputPath: "/tmp/output.json",
});
assert.deepEqual(args.slice(0, 5), ["exec", "--ephemeral", "--ignore-user-config", "--sandbox", "read-only"]);
assert.ok(args.includes("--output-schema"));
assert.ok(args.includes("--output-last-message"));
assert.ok(args.includes('model_reasoning_effort="high"'));
assert.deepEqual(args.slice(-3), ["--model", "test-codex-model", "-"]);

await assert.rejects(() => requestCodexStoryPlan({
  config,
  request: { ...request, topic: "school" },
  execute: async () => JSON.stringify(createStoryPlanFixture()),
}), (error) => error.code === "CONTENT_REJECTED");

await assert.rejects(() => requestCodexStoryPlan({
  config: { ...config, codexCommand: "codex-command-that-does-not-exist" },
  request,
}), (error) => error.code === "AI_UNAVAILABLE");

console.log("kokugo-no-tane Codex story plan tests passed");
