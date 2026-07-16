import { fileURLToPath } from "node:url";

const DEFAULT_LOCAL_DIR = fileURLToPath(new URL("../.local/", import.meta.url));

export function loadAiProxyConfig(env = process.env) {
  const provider = providerName(env.KNT_AI_PROVIDER || "codex");
  const codexModel = optionalString(env.KNT_CODEX_MODEL, "KNT_CODEX_MODEL");
  const codexReasoningEffort = reasoningEffort(env.KNT_CODEX_REASONING_EFFORT || "high");
  const config = {
    provider,
    apiKey: optionalString(env.OPENAI_API_KEY, "OPENAI_API_KEY"),
    codexCommand: optionalString(env.KNT_CODEX_COMMAND, "KNT_CODEX_COMMAND") || "codex",
    codexModel,
    codexReasoningEffort,
    model: provider === "codex" ? (codexModel || "codex-default") : (env.OPENAI_MODEL || "gpt-5.6"),
    host: env.KNT_AI_HOST || "127.0.0.1",
    port: integer(env.KNT_AI_PORT, 8787, "KNT_AI_PORT", 1, 65535),
    allowedOrigins: splitOrigins(env.KNT_FRONTEND_ORIGINS || "http://127.0.0.1:8765"),
    timeoutMs: integer(env.KNT_AI_TIMEOUT_MS, provider === "codex" ? 120000 : 45000, "KNT_AI_TIMEOUT_MS", 1000, 300000),
    maxRetries: integer(env.KNT_AI_MAX_RETRIES, 1, "KNT_AI_MAX_RETRIES", 0, 2),
    saveCandidates: boolean(env.KNT_AI_SAVE_CANDIDATES, true),
    logIo: boolean(env.KNT_AI_LOG_IO, false, "KNT_AI_LOG_IO"),
    localDir: env.KNT_AI_LOCAL_DIR || DEFAULT_LOCAL_DIR,
    requestsPerMinute: integer(env.KNT_AI_REQUESTS_PER_MINUTE, 20, "KNT_AI_REQUESTS_PER_MINUTE", 1, 120),
  };

  if (config.provider === "openai" && !config.apiKey) throw configError("OPENAI_API_KEY is required when KNT_AI_PROVIDER=openai");
  if (!config.model) throw configError("OPENAI_MODEL must not be empty");
  if (config.host !== "127.0.0.1") throw configError("KNT_AI_HOST must be 127.0.0.1 in the initial implementation");
  if (config.allowedOrigins.some((origin) => !isAllowedFrontendOrigin(origin))) {
    throw configError("KNT_FRONTEND_ORIGINS must contain only http://127.0.0.1:<port> origins");
  }
  return Object.freeze(config);
}

function reasoningEffort(value) {
  const normalized = String(value).trim().toLowerCase();
  if (["minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(normalized)) {
    return normalized;
  }
  throw configError("KNT_CODEX_REASONING_EFFORT must be minimal, low, medium, high, xhigh, max, or ultra");
}

function providerName(value) {
  const normalized = String(value).trim().toLowerCase();
  if (["codex", "openai"].includes(normalized)) return normalized;
  throw configError("KNT_AI_PROVIDER must be codex or openai");
}

function optionalString(value, name) {
  if (value === undefined || value === "") return undefined;
  const normalized = String(value).trim();
  if (!normalized) throw configError(`${name} must not be empty`);
  return normalized;
}

function splitOrigins(value) {
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function isAllowedFrontendOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:"
      && url.hostname === "127.0.0.1"
      && Boolean(url.port)
      && url.pathname === "/"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function integer(raw, fallback, name, minimum, maximum) {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw configError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function boolean(raw, fallback, name = "boolean value") {
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true"].includes(String(raw).toLowerCase())) return true;
  if (["0", "false"].includes(String(raw).toLowerCase())) return false;
  throw configError(`${name} must be 0, 1, true, or false`);
}

function configError(message) {
  const error = new Error(message);
  error.code = "CONFIG_ERROR";
  return error;
}
