import assert from "node:assert/strict";
import { loadAiProxyConfig } from "../server/config.ts";

const defaults = loadAiProxyConfig({});
assert.equal(defaults.provider, "codex");
assert.equal(defaults.model, "codex-default");
assert.equal(defaults.codexCommand, "codex");
assert.equal(defaults.codexModel, undefined);
assert.equal(defaults.codexReasoningEffort, "high");
assert.equal(defaults.apiKey, undefined);
assert.equal(defaults.timeoutMs, 120_000);
assert.equal(defaults.logIo, false);
assert.equal(defaults.host, "127.0.0.1");
assert.equal(defaults.port, 8787);
assert.deepEqual(defaults.allowedOrigins, ["http://127.0.0.1:5173", "http://127.0.0.1:8765"]);

assert.throws(() => loadAiProxyConfig({ KNT_AI_PROVIDER: "openai" }), (error) => (
  error.code === "CONFIG_ERROR"
  && error.message === "OPENAI_API_KEY is required when KNT_AI_PROVIDER=openai"
));

const openai = loadAiProxyConfig({ KNT_AI_PROVIDER: "openai", OPENAI_API_KEY: "test-secret-value" });
assert.equal(openai.provider, "openai");
assert.equal(openai.model, "gpt-5.6");
assert.equal(openai.apiKey, "test-secret-value");
assert.equal(openai.timeoutMs, 45_000);

const codexModel = loadAiProxyConfig({ KNT_CODEX_MODEL: "gpt-5.4" });
assert.equal(codexModel.model, "gpt-5.4");
assert.equal(codexModel.codexModel, "gpt-5.4");

const terraHigh = loadAiProxyConfig({
  KNT_CODEX_MODEL: "gpt-5.6-terra",
  KNT_CODEX_REASONING_EFFORT: "high",
});
assert.equal(terraHigh.codexModel, "gpt-5.6-terra");
assert.equal(terraHigh.codexReasoningEffort, "high");
assert.throws(() => loadAiProxyConfig({
  KNT_CODEX_REASONING_EFFORT: "very-high",
}), /KNT_CODEX_REASONING_EFFORT/u);

assert.equal(loadAiProxyConfig({ KNT_AI_LOG_IO: "1" }).logIo, true);
assert.throws(() => loadAiProxyConfig({ KNT_AI_LOG_IO: "yes" }), /KNT_AI_LOG_IO/u);

assert.throws(() => loadAiProxyConfig({ KNT_AI_PROVIDER: "other" }), /KNT_AI_PROVIDER/u);
assert.throws(() => loadAiProxyConfig({
  KNT_AI_PROVIDER: "openai",
  OPENAI_API_KEY: "test-secret-value",
  KNT_AI_HOST: "0.0.0.0",
}), /KNT_AI_HOST must be 127\.0\.0\.1/u);
assert.throws(() => loadAiProxyConfig({
  KNT_AI_PROVIDER: "openai",
  OPENAI_API_KEY: "test-secret-value",
  KNT_FRONTEND_ORIGINS: "http://localhost:8765",
}), /KNT_FRONTEND_ORIGINS/u);
assert.throws(() => loadAiProxyConfig({
  KNT_AI_PROVIDER: "openai",
  OPENAI_API_KEY: "test-secret-value",
  KNT_AI_PORT: "0",
}), /KNT_AI_PORT/u);

console.log("kokugo-no-tane AI proxy config tests passed");
