import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
} from "node:fs";
import path from "node:path";

export interface JsonlFileLogger {
  readonly filePath: string;
  readonly logger: (value: Readonly<Record<string, unknown>>) => void;
}

export function createJsonlFileLogger(
  localDir: string,
  filename = "ai-proxy.jsonl",
): JsonlFileLogger {
  const filePath = path.resolve(localDir, "logs", filename);
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  closeSync(openSync(filePath, "a", 0o600));
  let warned = false;

  return {
    filePath,
    logger(value: Readonly<Record<string, unknown>>) {
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

function safeMessage(error: unknown): string {
  const value = typeof error === "object" && error !== null && "message" in error
    ? error.message
    : error;
  return String(value ?? "unknown error").slice(0, 240);
}
