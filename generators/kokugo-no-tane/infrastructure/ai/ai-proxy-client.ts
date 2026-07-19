import {
  PROXY_PROTOCOL_VERSION,
  STORY_PLAN_CONTEXT_VERSION,
  STORY_PLAN_PROMPT_VERSION,
  STORY_PLAN_SCHEMA_VERSION,
  parseStoryPlan,
} from "../../domain/schemas/story-plan-v1.ts";
import type {
  BaseGenerationOptions,
} from "../../domain/types/generation.js";
import type { StoryPlanV1 } from "../../domain/types/story-plan.js";

const REQUEST_TIMEOUT_MS = 135_000;

interface AiProxyErrorOptions {
  readonly code?: string;
  readonly fallbackAllowed?: boolean;
  readonly cause?: unknown;
}

export interface AiProxyHealth {
  readonly ok?: unknown;
  readonly protocol_version?: unknown;
  readonly schema_version?: unknown;
  readonly prompt_version?: unknown;
  readonly context_version?: unknown;
  readonly model?: unknown;
  readonly provider?: unknown;
  readonly [key: string]: unknown;
}

export interface StoryPlanProxyResult extends AiProxyHealth {
  readonly story_plan: StoryPlanV1;
  readonly candidate_id?: unknown;
  readonly request_id?: unknown;
  readonly prompt_hash?: unknown;
}

interface ProxyErrorBody extends AiProxyHealth {
  readonly error?: {
    readonly message?: unknown;
    readonly code?: unknown;
  };
  readonly fallback_allowed?: unknown;
  readonly story_plan?: unknown;
}

export class AiProxyError extends Error {
  readonly code: string;
  readonly fallbackAllowed: boolean;

  constructor(
    message: string,
    { code = "AI_PROXY_ERROR", fallbackAllowed = true, cause }: AiProxyErrorOptions = {},
  ) {
    super(message, { cause });
    this.name = "AiProxyError";
    this.code = code;
    this.fallbackAllowed = fallbackAllowed;
  }
}

export function normalizeAiProxyUrl(value: unknown): string {
  let url: URL;
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

export async function checkAiProxy(
  baseUrl: unknown,
  { fetchImpl = fetch }: { readonly fetchImpl?: typeof fetch } = {},
): Promise<AiProxyHealth> {
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

export async function requestStoryPlan(
  baseUrl: unknown,
  config: BaseGenerationOptions,
  { fetchImpl = fetch }: { readonly fetchImpl?: typeof fetch } = {},
): Promise<StoryPlanProxyResult> {
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

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || (isRecord(error) && error.name === "AbortError")) {
      throw new AiProxyError("AIサーバーからの応答が時間内に届きませんでした。", { code: "AI_TIMEOUT", cause: error });
    }
    throw new AiProxyError("AIサーバーへ接続できませんでした。", { code: "AI_PROXY_UNREACHABLE", cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response: Response): Promise<ProxyErrorBody> {
  try {
    return await response.json() as ProxyErrorBody;
  } catch (error) {
    throw new AiProxyError("AIサーバーの応答を読み取れませんでした。", { code: "INVALID_PROXY_RESPONSE", cause: error });
  }
}

function responseError(
  response: Response,
  body: ProxyErrorBody,
  fallbackMessage: string,
): AiProxyError {
  return new AiProxyError(asNonEmptyString(body.error?.message) ?? fallbackMessage, {
    code: asNonEmptyString(body.error?.code) ?? `HTTP_${response.status}`,
    fallbackAllowed: body?.fallback_allowed !== false,
  });
}

function createFallbackRequestId(): string {
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

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
