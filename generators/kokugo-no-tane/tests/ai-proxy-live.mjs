import assert from "node:assert/strict";
import http from "node:http";
import OpenAI from "openai";
import { createAiProxyServer } from "../server/ai-proxy.ts";
import { requestCodexStoryPlan } from "../server/codex-story-plan.ts";
import { loadAiProxyConfig } from "../server/config.ts";
import { requestOpenAiStoryPlan } from "../server/openai-story-plan.ts";
import { generateWorksheet } from "../domain/generation/generate-worksheet.ts";

const baseConfig = loadAiProxyConfig(process.env);
const config = {
  ...baseConfig,
  port: 0,
  maxRetries: 0,
};
const generateStoryPlan = config.provider === "codex"
  ? ({ request, signal }) => requestCodexStoryPlan({ config, request, signal })
  : createOpenAiGenerator(config);
const logs = [];
const server = createAiProxyServer({
  config,
  generateStoryPlan,
  logger: (entry) => logs.push(entry),
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, config.host, resolve);
});

try {
  const requestInput = {
    protocol_version: "knt-ai-proxy.v1",
    client_request_id: "live-smoke-test",
    grade: 1,
    profile: 3,
    length: "standard",
    topic: "town",
    seed: "live-smoke-town-001",
  };
  const response = await postJson(server.address().port, requestInput, config.allowedOrigins[0]);
  assert.equal(response.status, 200, JSON.stringify({
    response: response.body?.error ?? response.body,
    proxy_log: logs.at(-1),
  }));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.source, config.provider);
  assert.equal(response.body.story_plan.category, "町");
  assert.match(response.body.candidate_id, /^kt-candidate-/u);

  const generated = generateWorksheet({
    grade: requestInput.grade,
    profile: requestInput.profile,
    length: requestInput.length,
    topic: requestInput.topic,
    seed: requestInput.seed,
    storyPlan: response.body.story_plan,
    sourceMetadata: {
      source: "ai_proxy",
      candidate_id: response.body.candidate_id,
      request_id: response.body.request_id,
      model: response.body.model,
      prompt_version: response.body.prompt_version,
    },
  });
  const failedChecks = generated.machine_checks.checks.filter((check) => !check.passed);
  assert.deepEqual(failedChecks, []);
  assert.equal(generated.generation_provenance.generation_source, "ai_proxy");
  assert.equal(generated.generation_provenance.candidate_id, response.body.candidate_id);
  assert.equal(generated.questions.length, 4);
  assert.ok(!config.apiKey || logs.every((entry) => !JSON.stringify(entry).includes(config.apiKey)));

  process.stdout.write(`${JSON.stringify({
    ok: true,
    model: response.body.model,
    candidate_id: response.body.candidate_id,
    prompt_version: response.body.prompt_version,
    schema_version: response.body.schema_version,
    question_count: generated.questions.length,
    candidate_directory: `${config.localDir}/model-candidates`,
  }, null, 2)}\n`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

function createOpenAiGenerator(config) {
  const openaiClient = new OpenAI({ apiKey: config.apiKey });
  return ({ request, signal }) => requestOpenAiStoryPlan({ client: openaiClient, config, request, signal });
}

function postJson(port, body, origin) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      method: "POST",
      path: "/api/story-plan",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null });
      });
    });
    request.once("error", reject);
    request.end(payload);
  });
}
