import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createJsonlFileLogger } from "../server/file-logger.ts";

const localDir = await mkdtemp(path.join(tmpdir(), "kokugo-no-tane-file-logger-"));
const { filePath, logger } = createJsonlFileLogger(localDir);
logger({
  event: "ai_provider_request",
  provider: "codex",
  request: { prompt: "test prompt" },
});
logger({
  event: "ai_provider_response",
  provider: "codex",
  response: { output_text: "{\"ok\":true}" },
});

const records = (await readFile(filePath, "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
assert.equal(filePath, path.join(localDir, "logs", "ai-proxy.jsonl"));
assert.equal(records.length, 2);
assert.equal(records[0].event, "ai_provider_request");
assert.equal(records[0].request.prompt, "test prompt");
assert.equal(records[1].event, "ai_provider_response");
assert.match(records[0].timestamp, /^\d{4}-\d{2}-\d{2}T/u);
assert.equal((await stat(filePath)).mode & 0o777, 0o600);

const {
  filePath: providerIoFilePath,
  logger: providerIoLogger,
} = createJsonlFileLogger(localDir, "ai-provider-io.jsonl");
providerIoLogger({ event: "ai_provider_request", client_request_id: "client-1" });
assert.equal(
  JSON.parse((await readFile(providerIoFilePath, "utf8")).trim()).client_request_id,
  "client-1",
);

console.log("kokugo-no-tane file logger tests passed");
