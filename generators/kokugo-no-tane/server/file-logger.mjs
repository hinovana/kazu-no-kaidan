import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
} from "node:fs";
import path from "node:path";

export function createJsonlFileLogger(localDir, filename = "ai-proxy.jsonl") {
  const filePath = path.resolve(localDir, "logs", filename);
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  closeSync(openSync(filePath, "a", 0o600));
  let warned = false;

  return {
    filePath,
    logger(value) {
      const record = Object.fromEntries(Object.entries({
        timestamp: new Date().toISOString(),
        ...value,
      }).filter(([, item]) => item !== undefined));
      try {
        appendFileSync(filePath, `${JSON.stringify(record)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
      } catch (error) {
        if (warned) return;
        warned = true;
        process.stderr.write(`warning: AI log could not be written: ${safeMessage(error)}\n`);
      }
    },
  };
}

function safeMessage(error) {
  return String(error?.message ?? error ?? "unknown error").slice(0, 240);
}
