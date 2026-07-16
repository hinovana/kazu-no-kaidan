import {
  PROXY_PROTOCOL_VERSION,
  STORY_PLAN_CONTEXT_VERSION,
  STORY_PLAN_PROMPT_VERSION,
  STORY_PLAN_SCHEMA_VERSION,
  parseStoryPlan,
} from "./story-plan-schema.js";

const REQUEST_TIMEOUT_MS = 135_000;

export class AiProxyError extends Error {
  constructor(message, { code = "AI_PROXY_ERROR", fallbackAllowed = true, cause } = {}) {
    super(message, { cause });
    this.name = "AiProxyError";
    this.code = code;
    this.fallbackAllowed = fallbackAllowed;
  }
}

export function normalizeAiProxyUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new AiProxyError("AIサーバーURLを確認してください。", { code: "INVALID_PROXY_URL", fallbackAllowed: false });
  }
  if (url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || !url.port
    || url.pathname !== "/"
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw new AiProxyError("AIサーバーURLには http://127.0.0.1:<port> を指定してください。", {
      code: "INVALID_PROXY_URL",
      fallbackAllowed: false,
    });
  }
  return url.origin;
}

export async function checkAiProxy(baseUrl, { fetchImpl = fetch } = {}) {
  const origin = normalizeAiProxyUrl(baseUrl);
  const response = await fetchWithTimeout(`${origin}/health`, { method: "GET" }, fetchImpl);
  const body = await readJson(response);
  if (!response.ok || body?.ok !== true || body?.protocol_version !== PROXY_PROTOCOL_VERSION) {
    throw responseError(response, body, "AIサーバーへ接続できませんでした。");
  }
  if (body.schema_version !== STORY_PLAN_SCHEMA_VERSION
    || body.prompt_version !== STORY_PLAN_PROMPT_VERSION
    || body.context_version !== STORY_PLAN_CONTEXT_VERSION) {
    throw new AiProxyError("AIサーバーと画面の仕様版が一致しません。", {
      code: "PROTOCOL_MISMATCH",
      fallbackAllowed: false,
    });
  }
  return body;
}

export async function requestStoryPlan(baseUrl, config, { fetchImpl = fetch } = {}) {
  const origin = normalizeAiProxyUrl(baseUrl);
  const clientRequestId = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : createFallbackRequestId();
  const response = await fetchWithTimeout(`${origin}/api/story-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      protocol_version: PROXY_PROTOCOL_VERSION,
      client_request_id: clientRequestId,
      grade: config.grade,
      profile: config.profile,
      length: config.length,
      topic: config.topic,
      seed: String(config.seed),
    }),
  }, fetchImpl);
  const body = await readJson(response);
  if (!response.ok || body?.ok !== true) {
    throw responseError(response, body, "AIから物語の種を取得できませんでした。");
  }
  if (body.protocol_version !== PROXY_PROTOCOL_VERSION
    || body.schema_version !== STORY_PLAN_SCHEMA_VERSION
    || body.prompt_version !== STORY_PLAN_PROMPT_VERSION
    || body.context_version !== STORY_PLAN_CONTEXT_VERSION) {
    throw new AiProxyError("AIサーバーと画面の仕様版が一致しません。", {
      code: "PROTOCOL_MISMATCH",
      fallbackAllowed: true,
    });
  }
  const storyPlan = parseStoryPlan(body.story_plan);
  return { ...body, story_plan: storyPlan };
}

async function fetchWithTimeout(url, options, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw new AiProxyError("AIサーバーからの応答が時間内に届きませんでした。", { code: "AI_TIMEOUT", cause: error });
    }
    throw new AiProxyError("AIサーバーへ接続できませんでした。", { code: "AI_PROXY_UNREACHABLE", cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    throw new AiProxyError("AIサーバーの応答を読み取れませんでした。", { code: "INVALID_PROXY_RESPONSE", cause: error });
  }
}

function responseError(response, body, fallbackMessage) {
  return new AiProxyError(body?.error?.message || fallbackMessage, {
    code: body?.error?.code || `HTTP_${response.status}`,
    fallbackAllowed: body?.fallback_allowed !== false,
  });
}

function createFallbackRequestId() {
  const values = new Uint32Array(4);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * 0x1_0000_0000);
    }
  }
  return `browser-${[...values].map((value) => value.toString(16).padStart(8, "0")).join("")}`;
}
