import { fileURLToPath } from "node:url";

const DEFAULT_LOCAL_DIR = fileURLToPath(new URL("../.local/", import.meta.url));

export function loadAiProxyConfig(env = process.env) {
  const config = {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || "gpt-5.6",
    host: env.KNT_AI_HOST || "127.0.0.1",
    port: integer(env.KNT_AI_PORT, 8787, "KNT_AI_PORT", 1, 65535),
    allowedOrigins: splitOrigins(env.KNT_FRONTEND_ORIGINS || "http://127.0.0.1:8765"),
    timeoutMs: integer(env.KNT_AI_TIMEOUT_MS, 45000, "KNT_AI_TIMEOUT_MS", 1000, 120000),
    maxRetries: integer(env.KNT_AI_MAX_RETRIES, 1, "KNT_AI_MAX_RETRIES", 0, 2),
    saveCandidates: boolean(env.KNT_AI_SAVE_CANDIDATES, true),
    localDir: env.KNT_AI_LOCAL_DIR || DEFAULT_LOCAL_DIR,
    requestsPerMinute: integer(env.KNT_AI_REQUESTS_PER_MINUTE, 20, "KNT_AI_REQUESTS_PER_MINUTE", 1, 120),
  };

  if (!config.apiKey) throw configError("OPENAI_API_KEY is required");
  if (!config.model) throw configError("OPENAI_MODEL must not be empty");
  if (config.host !== "127.0.0.1") throw configError("KNT_AI_HOST must be 127.0.0.1 in the initial implementation");
  if (config.allowedOrigins.some((origin) => !isAllowedFrontendOrigin(origin))) {
    throw configError("KNT_FRONTEND_ORIGINS must contain only http://127.0.0.1:<port> origins");
  }
  return Object.freeze(config);
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

function boolean(raw, fallback) {
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true"].includes(String(raw).toLowerCase())) return true;
  if (["0", "false"].includes(String(raw).toLowerCase())) return false;
  throw configError("KNT_AI_SAVE_CANDIDATES must be 0, 1, true, or false");
}

function configError(message) {
  const error = new Error(message);
  error.code = "CONFIG_ERROR";
  return error;
}
