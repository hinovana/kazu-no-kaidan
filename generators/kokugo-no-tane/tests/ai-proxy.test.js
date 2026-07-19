import assert from "node:assert/strict";
import http from "node:http";
import { createAiProxyServer } from "../server/ai-proxy.ts";
import { createMemoryCandidateStore } from "../server/candidate-store.ts";
import { createStoryPlanFixture } from "./fixtures/story-plan-fixture.js";

const allowedOrigin = "http://127.0.0.1:8765";
const config = {
  provider: "openai",
  apiKey: "test-only-key",
  model: "test-model",
  host: "127.0.0.1",
  port: 0,
  allowedOrigins: [allowedOrigin],
  timeoutMs: 1_000,
  maxRetries: 0,
  saveCandidates: true,
  logIo: true,
  localDir: "/tmp/kokugo-no-tane-ai-proxy-test",
  requestsPerMinute: 20,
};
const providerCalls = [];
const openaiClient = {
  responses: {
    async create(parameters) {
      providerCalls.push(parameters);
      if (JSON.parse(parameters.input).candidate_seed === "quota-test") {
        const error = new Error("quota exhausted");
        error.status = 429;
        error.code = "insufficient_quota";
        throw error;
      }
      return {
        id: `resp-test-${providerCalls.length}`,
        object: "response",
        status: "completed",
        model: config.model,
        output_text: JSON.stringify(createStoryPlanFixture()),
        output: [],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      };
    },
  },
};
const candidateStore = createMemoryCandidateStore();
const logs = [];
const providerIoLogs = [];
const server = createAiProxyServer({
  config,
  openaiClient,
  candidateStore,
  logger: (entry) => logs.push(entry),
  providerLogger: (entry) => providerIoLogs.push(entry),
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, config.host, resolve);
});

try {
  const port = server.address().port;

  const health = await requestJson({ port, method: "GET", path: "/health", origin: allowedOrigin });
  assert.equal(health.status, 200);
  assert.equal(health.headers["access-control-allow-origin"], allowedOrigin);
  assert.equal(health.body.protocol_version, "knt-ai-proxy.v1");
  assert.match(health.body.request_id, /^proxy-/u);
  assert.equal(health.body.model, config.model);
  assert.equal(health.body.provider, "openai");
  assert.equal(health.body.api_key_configured, true);

  const preflight = await requestJson({ port, method: "OPTIONS", path: "/api/story-plan", origin: allowedOrigin });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], allowedOrigin);

  const denied = await requestJson({ port, method: "GET", path: "/health", origin: "http://evil.example" });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, "ORIGIN_NOT_ALLOWED");
  assert.equal(denied.headers["access-control-allow-origin"], undefined);

  const invalid = await requestJson({
    port,
    method: "POST",
    path: "/api/story-plan",
    origin: allowedOrigin,
    body: { grade: 1 },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_REQUEST");

  const requestBody = {
    protocol_version: "knt-ai-proxy.v1",
    client_request_id: "client-contract-test",
    grade: 1,
    profile: 3,
    length: "standard",
    topic: "town",
    seed: "proxy-contract-test",
  };
  const generated = await requestJson({
    port,
    method: "POST",
    path: "/api/story-plan",
    origin: allowedOrigin,
    body: requestBody,
  });
  assert.equal(generated.status, 200);
  assert.equal(generated.body.ok, true);
  assert.equal(generated.body.cache.hit, false);
  assert.equal(generated.body.story_plan.category, "町");
  assert.match(generated.body.candidate_id, /^kt-candidate-/u);
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].store, false);
  assert.equal(providerCalls[0].reasoning.effort, "high");
  assert.equal(providerCalls[0].text.format.type, "json_schema");
  assert.equal(providerCalls[0].text.format.strict, true);
  assert.equal(providerCalls[0].model, config.model);
  const providerInput = JSON.parse(providerCalls[0].input);
  assert.equal(providerInput.curriculum_context.context_version, "story-plan-context.v1");
  assert.equal(providerInput.curriculum_context.language_database.allocated_kanji_count, 80);
  assert.equal(
    providerInput.curriculum_context.vocabulary_database.status,
    "candidate_unreviewed_audit_projection_only",
  );
  assert.equal(
    providerInput.curriculum_context.vocabulary_database.candidate_record_count,
    15485,
  );
  assert.equal(
    providerInput.curriculum_context.vocabulary_database.generation_eligible,
    false,
  );
  assert.equal(
    providerInput.curriculum_context.vocabulary_database.audit_projection_scope,
    "prototype_lexicon_occurrences_only",
  );
  assert.ok(providerInput.curriculum_context.vocabulary_database.prototype_lexicon.length > 0);
  assert.equal(candidateStore.records.length, 1);
  assert.equal(candidateStore.records[0].candidateId, generated.body.candidate_id);
  assert.equal(candidateStore.records[0].validatedRecord.story_plan.category, "町");

  const cached = await requestJson({
    port,
    method: "POST",
    path: "/api/story-plan",
    origin: allowedOrigin,
    body: { ...requestBody, client_request_id: "client-contract-test-cached" },
  });
  assert.equal(cached.status, 200);
  assert.equal(cached.body.cache.hit, true);
  assert.equal(cached.body.candidate_id, generated.body.candidate_id);
  assert.equal(cached.body.client_request_id, "client-contract-test-cached");
  assert.equal(providerCalls.length, 1);

  const quota = await requestJson({
    port,
    method: "POST",
    path: "/api/story-plan",
    origin: allowedOrigin,
    body: { ...requestBody, client_request_id: "client-quota-test", seed: "quota-test" },
  });
  assert.equal(quota.status, 429);
  assert.equal(quota.body.error.code, "AI_QUOTA_EXCEEDED");
  assert.equal(quota.body.fallback_allowed, true);

  assert.ok(logs.some((entry) => entry.status === 200 && entry.candidate_id === generated.body.candidate_id));
  const providerQueryLog = providerIoLogs.find((entry) => entry.event === "ai_provider_request");
  const providerResponseLog = providerIoLogs.find((entry) => entry.event === "ai_provider_response");
  assert.equal(providerQueryLog.provider, "openai");
  assert.equal(providerQueryLog.client_request_id, requestBody.client_request_id);
  assert.equal(JSON.parse(providerQueryLog.request.input).candidate_seed, requestBody.seed);
  assert.equal(providerResponseLog.client_request_id, requestBody.client_request_id);
  assert.equal(JSON.parse(providerResponseLog.response.output_text).category, "町");
  assert.ok(logs.every((entry) => !JSON.stringify(entry).includes(config.apiKey)));
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("kokugo-no-tane AI proxy server tests passed");

function requestJson({ port, method, path, origin, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = { Origin: origin };
    if (payload !== null) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      method,
      path,
      headers,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: text ? JSON.parse(text) : null,
        });
      });
    });
    request.once("error", reject);
    if (payload !== null) request.write(payload);
    request.end();
  });
}
