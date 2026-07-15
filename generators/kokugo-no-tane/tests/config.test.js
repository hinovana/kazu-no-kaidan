import assert from "node:assert/strict";
import { loadAiProxyConfig } from "../server/config.mjs";

assert.throws(() => loadAiProxyConfig({}), (error) => (
  error.code === "CONFIG_ERROR"
  && error.message === "OPENAI_API_KEY is required"
));

const defaults = loadAiProxyConfig({ OPENAI_API_KEY: "test-secret-value" });
assert.equal(defaults.model, "gpt-5.6");
assert.equal(defaults.host, "127.0.0.1");
assert.equal(defaults.port, 8787);
assert.deepEqual(defaults.allowedOrigins, ["http://127.0.0.1:8765"]);
assert.equal(defaults.apiKey, "test-secret-value");

assert.throws(() => loadAiProxyConfig({
  OPENAI_API_KEY: "test-secret-value",
  KNT_AI_HOST: "0.0.0.0",
}), /KNT_AI_HOST must be 127\.0\.0\.1/u);
assert.throws(() => loadAiProxyConfig({
  OPENAI_API_KEY: "test-secret-value",
  KNT_FRONTEND_ORIGINS: "http://localhost:8765",
}), /KNT_FRONTEND_ORIGINS/u);
assert.throws(() => loadAiProxyConfig({
  OPENAI_API_KEY: "test-secret-value",
  KNT_AI_PORT: "0",
}), /KNT_AI_PORT/u);

console.log("kokugo-no-tane AI proxy config tests passed");
