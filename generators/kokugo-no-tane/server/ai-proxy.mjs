import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createCandidateStore } from "./candidate-store.mjs";
import { requestCodexStoryPlan } from "./codex-story-plan.mjs";
import { loadAiProxyConfig } from "./config.mjs";
import { createJsonlFileLogger } from "./file-logger.mjs";
import { requestOpenAiStoryPlan } from "./openai-story-plan.mjs";
import {
  PROXY_PROTOCOL_VERSION,
  STORY_PLAN_CONTEXT_VERSION,
  STORY_PLAN_PROMPT_VERSION,
  STORY_PLAN_SCHEMA_VERSION,
  STORY_PLAN_VALIDATOR_VERSION,
  stableJson,
  validateStoryPlanRequest,
} from "../src/story-plan-schema.js";

const MAX_BODY_BYTES = 16 * 1024;

export function createAiProxyServer({
  config,
  generateStoryPlan,
  openaiClient,
  candidateStore = createCandidateStore(config.localDir),
  logger = defaultLogger,
  providerLogger = logger,
} = {}) {
  if (!config) throw new TypeError("config is required");
  const storyPlanGenerator = generateStoryPlan ?? (openaiClient
    ? ({ request, signal }) => requestOpenAiStoryPlan({
      client: openaiClient,
      config,
      request,
      signal,
      logger: config.logIo ? providerLogger : null,
    })
    : createStoryPlanGenerator(config, config.logIo ? providerLogger : null));
  if (!storyPlanGenerator) throw new TypeError("generateStoryPlan is required");

  const cache = new Map();
  const rateLimit = new Map();
  const server = http.createServer(async (request, response) => {
    const requestId = `proxy-${randomUUID()}`;
    const startedAt = Date.now();
    const origin = request.headers.origin ?? null;
    const cors = corsHeaders(config, origin);

    try {
      if (origin && !cors) throw proxyError("ORIGIN_NOT_ALLOWED", 403, "この画面からAIサーバーへ接続できません。", false);
      if (request.method === "OPTIONS") {
        response.writeHead(204, { ...cors, "Access-Control-Max-Age": "600" });
        response.end();
        return;
      }

      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          request_id: requestId,
          status: "ready",
          service: "kokugo-no-tane-ai-proxy",
          protocol_version: PROXY_PROTOCOL_VERSION,
          provider: config.provider ?? "openai",
          model: config.model,
          prompt_version: STORY_PLAN_PROMPT_VERSION,
          context_version: STORY_PLAN_CONTEXT_VERSION,
          schema_version: STORY_PLAN_SCHEMA_VERSION,
          api_key_configured: Boolean(config.apiKey),
        }, cors);
        return;
      }

      if (request.method !== "POST" || url.pathname !== "/api/story-plan") {
        throw proxyError("NOT_FOUND", 404, "指定されたAIサーバー機能はありません。", false);
      }
      enforceRateLimit(rateLimit, origin ?? request.socket.remoteAddress ?? "local", config.requestsPerMinute);
      const body = await readJsonBody(request);
      const requestIssues = validateStoryPlanRequest(body);
      if (requestIssues.length > 0) {
        const error = proxyError("INVALID_REQUEST", 400, "生成条件が正しくありません。", false);
        error.issues = requestIssues;
        throw error;
      }

      const cacheKey = sha256(stableJson({
        protocol_version: PROXY_PROTOCOL_VERSION,
        provider: config.provider ?? "openai",
        model: config.model,
        prompt_version: STORY_PLAN_PROMPT_VERSION,
        context_version: STORY_PLAN_CONTEXT_VERSION,
        schema_version: STORY_PLAN_SCHEMA_VERSION,
        validator_version: STORY_PLAN_VALIDATOR_VERSION,
        grade: body.grade,
        profile: body.profile,
        length: body.length,
        topic: body.topic,
        seed: body.seed,
      }));
      const cached = cache.get(cacheKey);
      if (cached) {
        const payload = {
          ...cached,
          request_id: requestId,
          client_request_id: body.client_request_id,
          cache: { hit: true },
        };
        sendJson(response, 200, payload, cors);
        logResult(logger, { requestId, body, status: 200, startedAt, cacheHit: true, candidateId: payload.candidate_id });
        return;
      }

      const result = await callWithRetry({ config, generateStoryPlan: storyPlanGenerator, request: body });
      const candidateId = `kt-candidate-${randomUUID()}`;
      const acquiredAt = new Date().toISOString();
      const rawResponse = serializableProviderResponse(result.response);
      const rawResponseHash = sha256(stableJson(rawResponse));
      const basePayload = {
        ok: true,
        protocol_version: PROXY_PROTOCOL_VERSION,
        request_id: requestId,
        client_request_id: body.client_request_id,
        candidate_id: candidateId,
        source: config.provider ?? "openai",
        model: config.model,
        prompt_version: result.promptVersion,
        prompt_hash: result.promptHash,
        context_version: result.contextVersion,
        schema_version: STORY_PLAN_SCHEMA_VERSION,
        validator_version: STORY_PLAN_VALIDATOR_VERSION,
        cache: { hit: false },
        story_plan: result.storyPlan,
        validation: {
          status: "passed",
          checks: ["schema", "allowed_content", "story_structure", "evidence_placeable"],
        },
      };

      if (config.saveCandidates) {
        await candidateStore.save({
          candidateId,
          rawRecord: {
            candidate_id: candidateId,
            provider: config.provider ?? "openai",
            model: config.model,
            prompt_version: result.promptVersion,
            prompt_hash: result.promptHash,
            context_version: result.contextVersion,
            schema_version: STORY_PLAN_SCHEMA_VERSION,
            input: body,
            provider_response_id: result.providerResponseId,
            acquired_at: acquiredAt,
            raw_response_sha256: rawResponseHash,
            response: rawResponse,
          },
          validatedRecord: {
            candidate_id: candidateId,
            provider: config.provider ?? "openai",
            model: config.model,
            prompt_version: result.promptVersion,
            prompt_hash: result.promptHash,
            context_version: result.contextVersion,
            schema_version: STORY_PLAN_SCHEMA_VERSION,
            validator_version: STORY_PLAN_VALIDATOR_VERSION,
            input: body,
            provider_response_id: result.providerResponseId,
            acquired_at: acquiredAt,
            raw_response_sha256: rawResponseHash,
            story_plan: result.storyPlan,
            validation: basePayload.validation,
          },
        });
      }

      cache.set(cacheKey, { ...basePayload, request_id: null, client_request_id: null });
      sendJson(response, 200, basePayload, cors);
      logResult(logger, {
        requestId,
        body,
        status: 200,
        startedAt,
        cacheHit: false,
        candidateId,
        providerResponseId: result.providerResponseId,
        usage: result.usage,
      });
    } catch (cause) {
      const error = normalizeError(cause);
      sendJson(response, error.status, {
        ok: false,
        request_id: requestId,
        error: { code: error.code, message: error.publicMessage },
        fallback_allowed: error.fallbackAllowed,
      }, cors ?? {});
      logResult(logger, {
        requestId,
        status: error.status,
        startedAt,
        errorCode: error.code,
        errorMessage: safeErrorMessage(cause),
      });
    }
  });

  return server;
}

export async function startAiProxy(env = process.env) {
  const config = loadAiProxyConfig(env);
  const { filePath: logFile, logger } = createJsonlFileLogger(config.localDir);
  const {
    filePath: providerIoLogFile,
    logger: providerLogger,
  } = createJsonlFileLogger(config.localDir, "ai-provider-io.jsonl");
  const server = createAiProxyServer({ config, logger, providerLogger });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  logger({
    event: "ai_proxy_started",
    url: `http://${config.host}:${config.port}`,
    provider: config.provider,
    model: config.model,
    io_logging: config.logIo,
    protocol_version: PROXY_PROTOCOL_VERSION,
    candidates_saved: config.saveCandidates,
    log_file: logFile,
    provider_io_log_file: config.logIo ? providerIoLogFile : null,
  });
  process.stdout.write(`AI proxy ready: http://${config.host}:${config.port}\n`);
  process.stdout.write(`AI proxy log: ${logFile}\n`);
  if (config.logIo) process.stdout.write(`AI request/response log: ${providerIoLogFile}\n`);
  return {
    server,
    config,
    logFile,
    providerIoLogFile: config.logIo ? providerIoLogFile : null,
  };
}

function createStoryPlanGenerator(config, logger) {
  if (config.provider === "codex") {
    return ({ request, signal }) => requestCodexStoryPlan({
      config,
      request,
      signal,
      logger,
    });
  }
  const openaiClient = new OpenAI({ apiKey: config.apiKey });
  return ({ request, signal }) => requestOpenAiStoryPlan({
    client: openaiClient,
    config,
    request,
    signal,
    logger,
  });
}

async function callWithRetry({ config, generateStoryPlan, request }) {
  let lastError;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      return await generateStoryPlan({ request, signal: controller.signal });
    } catch (error) {
      lastError = error;
      if (controller.signal.aborted) {
        const timeoutError = new Error("AI provider request timed out");
        timeoutError.code = "AI_TIMEOUT";
        throw timeoutError;
      }
      if (attempt >= config.maxRetries || !isRetryable(error)) throw error;
      await delay(250 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw proxyError("INVALID_REQUEST", 400, "JSON形式で送信してください。", false);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw proxyError("INVALID_REQUEST", 400, "生成条件が大きすぎます。", false);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw proxyError("INVALID_REQUEST", 400, "JSONを読み取れませんでした。", false);
  }
}

function corsHeaders(config, origin) {
  if (!origin) return {};
  if (!config.allowedOrigins.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function enforceRateLimit(state, key, maximum) {
  const now = Date.now();
  const minimum = now - 60_000;
  const recent = (state.get(key) ?? []).filter((timestamp) => timestamp > minimum);
  if (recent.length >= maximum) throw proxyError("AI_RATE_LIMITED", 429, "AIサーバーの呼び出し上限に達しました。", true);
  recent.push(now);
  state.set(key, recent);
}

function normalizeError(cause) {
  if (cause?.status && cause?.publicMessage) return cause;
  if (cause?.code === "AI_REFUSAL") return proxyError("AI_REFUSAL", 502, "物語設計図を作成できませんでした。", true);
  if (cause?.code === "SCHEMA_INVALID") return proxyError("SCHEMA_INVALID", 502, "AIの物語設計図を検証できませんでした。", true);
  if (cause?.code === "CONTENT_REJECTED") return proxyError("CONTENT_REJECTED", 502, "AIの物語設計図が教材条件を満たしませんでした。", true);
  if (cause?.code === "AI_TIMEOUT" || cause?.name === "AbortError") return proxyError("AI_TIMEOUT", 504, "物語設計図の取得が時間内に終わりませんでした。", true);
  if (cause?.code === "AI_AUTH_FAILED") return proxyError("AI_AUTH_FAILED", 502, "AIサーバーの認証を確認してください。", true);
  if (cause?.code === "AI_UNAVAILABLE") return proxyError("AI_UNAVAILABLE", 503, "AIサービスを利用できません。", true);
  if (cause?.status === 401 || cause?.status === 403) return proxyError("AI_AUTH_FAILED", 502, "AIサーバーの認証を確認してください。", true);
  if (cause?.code === "insufficient_quota") {
    return proxyError("AI_QUOTA_EXCEEDED", 429, "OpenAI APIの利用枠または請求設定を確認してください。", true);
  }
  if (cause?.status === 429) return proxyError("AI_RATE_LIMITED", 429, "AIサービスの呼び出し上限に達しました。", true);
  if (Number(cause?.status) >= 500) return proxyError("AI_UNAVAILABLE", 503, "AIサービスを利用できません。", true);
  return proxyError("INTERNAL_ERROR", 500, "AIサーバーで処理できませんでした。", true);
}

function proxyError(code, status, publicMessage, fallbackAllowed) {
  const error = new Error(publicMessage);
  error.code = code;
  error.status = status;
  error.publicMessage = publicMessage;
  error.fallbackAllowed = fallbackAllowed;
  return error;
}

function isRetryable(error) {
  return error?.status === 429
    || Number(error?.status) >= 500
    || ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT"].includes(error?.code);
}

function sendJson(response, status, payload, headers = {}) {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

function serializableProviderResponse(response) {
  return {
    id: response?.id ?? null,
    object: response?.object ?? null,
    created_at: response?.created_at ?? null,
    status: response?.status ?? null,
    error: response?.error ?? null,
    incomplete_details: response?.incomplete_details ?? null,
    model: response?.model ?? null,
    output: response?.output ?? null,
    usage: response?.usage ?? null,
  };
}

function logResult(logger, value) {
  logger({
    event: "ai_proxy_request",
    request_id: value.requestId,
    client_request_id: value.body?.client_request_id,
    endpoint: value.body ? "/api/story-plan" : undefined,
    status: value.status,
    duration_ms: Date.now() - value.startedAt,
    cache_hit: value.cacheHit,
    candidate_id: value.candidateId,
    provider_response_id: value.providerResponseId,
    usage: value.usage,
    error_code: value.errorCode,
    error_message: value.errorMessage,
  });
}

function defaultLogger(value) {
  process.stdout.write(`${JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)))}\n`);
}

function safeErrorMessage(error) {
  return String(error?.message ?? error ?? "unknown error").slice(0, 240);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  startAiProxy().then(({ server }) => {
    const shutdown = () => server.close(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }).catch((error) => {
    process.stderr.write(`error: ${safeErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
