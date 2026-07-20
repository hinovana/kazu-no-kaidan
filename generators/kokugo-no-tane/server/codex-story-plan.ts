import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  STORY_PLAN_CONTEXT_VERSION,
  STORY_PLAN_JSON_SCHEMA,
  STORY_PLAN_PROMPT_VERSION,
  stableJson,
} from "../domain/schemas/story-plan-v1.ts";
import {
  STORY_PLAN_INSTRUCTIONS,
  buildStoryPlanGenerationInput,
  parseGeneratedStoryPlan,
  type ProviderLogger,
  type StoryPlanProviderRequest,
  type StoryPlanProviderResult,
} from "./openai-story-plan.ts";
import type { ReasoningEffort } from "./config.js";

const STDERR_LIMIT = 64 * 1024;

export interface CodexExecutionOptions {
  readonly command: string;
  readonly model: string | undefined;
  readonly prompt: string;
  readonly schema: unknown;
  readonly reasoningEffort: ReasoningEffort;
  readonly signal: AbortSignal | undefined;
}

export type CodexExecutor = (options: CodexExecutionOptions) => Promise<string>;

export async function requestCodexStoryPlan({
  config,
  request,
  signal,
  execute = executeCodex,
  logger,
}: {
  readonly config: {
    readonly codexCommand: string;
    readonly codexModel: string | undefined;
    readonly codexReasoningEffort: ReasoningEffort;
    readonly model: string;
  };
  readonly request: StoryPlanProviderRequest;
  readonly signal?: AbortSignal;
  readonly execute?: CodexExecutor;
  readonly logger?: ProviderLogger;
}): Promise<StoryPlanProviderResult> {
  const generationInput = buildStoryPlanGenerationInput(request);
  const promptHash = createHash("sha256")
    .update(`${STORY_PLAN_INSTRUCTIONS}\n${stableJson(generationInput.curriculum_context) ?? ""}`)
    .digest("hex");
  const prompt = [
    STORY_PLAN_INSTRUCTIONS,
    "",
    "## 今回の生成条件",
    JSON.stringify(generationInput),
    "",
    "外部情報の検索、ファイルの読み書き、コマンド実行は行わず、指定されたJSONだけを最終回答として返してください。",
  ].join("\n");
  logProviderIo(logger, {
    event: "ai_provider_request",
    provider: "codex",
    model: config.model,
    client_request_id: request.client_request_id,
    request: {
      prompt,
      output_schema: STORY_PLAN_JSON_SCHEMA,
      execution: {
        ephemeral: true,
        ignore_user_config: true,
        sandbox: "read-only",
        approval_policy: "never",
        reasoning_effort: config.codexReasoningEffort,
      },
    },
  });
  const outputText = await execute({
    command: config.codexCommand,
    model: config.codexModel,
    prompt,
    schema: STORY_PLAN_JSON_SCHEMA,
    reasoningEffort: config.codexReasoningEffort,
    signal,
  });
  logProviderIo(logger, {
    event: "ai_provider_response",
    provider: "codex",
    model: config.model,
    client_request_id: request.client_request_id,
    response: { output_text: outputText },
  });
  const storyPlan = parseGeneratedStoryPlan(outputText, request);

  return {
    storyPlan,
    response: {
      id: null,
      object: "codex.exec",
      status: "completed",
      model: config.model,
      output: [{ type: "message", content: [{ type: "output_text", text: outputText }] }],
      usage: null,
    },
    providerResponseId: null,
    usage: null,
    promptVersion: STORY_PLAN_PROMPT_VERSION,
    promptHash,
    contextVersion: STORY_PLAN_CONTEXT_VERSION,
  };
}

function logProviderIo(logger: ProviderLogger, value: Readonly<Record<string, unknown>>): void {
  if (typeof logger === "function") logger(value);
}

export function buildCodexExecArgs({
  model,
  reasoningEffort = "high",
  schemaPath,
  outputPath,
}: {
  readonly model?: string | undefined;
  readonly reasoningEffort?: ReasoningEffort;
  readonly schemaPath: string;
  readonly outputPath: string;
}): string[] {
  const args = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "--color", "never",
    "--output-schema", schemaPath,
    "--output-last-message", outputPath,
    "-c", 'approval_policy="never"',
    "-c", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
  ];
  if (model) args.push("--model", model);
  args.push("-");
  return args;
}

async function executeCodex({
  command,
  model,
  prompt,
  schema,
  reasoningEffort,
  signal,
}: CodexExecutionOptions): Promise<string> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "kokugo-no-tane-codex-"));
  const schemaPath = path.join(temporaryDirectory, "story-plan.schema.json");
  const outputPath = path.join(temporaryDirectory, "story-plan.json");
  try {
    await writeFile(schemaPath, `${JSON.stringify(schema)}\n`, { encoding: "utf8", mode: 0o600 });
    await runCodexProcess({
      command,
      args: buildCodexExecArgs({
        model,
        reasoningEffort,
        schemaPath,
        outputPath,
      }),
      cwd: temporaryDirectory,
      prompt,
      signal,
    });
    return await readFile(outputPath, "utf8");
  } catch (error) {
    if (errorProperty(error, "name") === "AbortError") throw error;
    if (errorProperty(error, "code") === "ENOENT") {
      throw codedError("Codex CLI was not found", "AI_UNAVAILABLE");
    }
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function runCodexProcess({
  command,
  args,
  cwd,
  prompt,
  signal,
}: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly prompt: string;
  readonly signal: AbortSignal | undefined;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      ...(signal === undefined ? {} : { signal }),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.resume();
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: unknown) => {
      const text = String(chunk);
      if (stderr.length < STDERR_LIMIT) stderr += text.slice(0, STDERR_LIMIT - stderr.length);
    });
    child.stdin.once("error", reject);
    child.once("error", reject);
    child.once("close", (code, terminationSignal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(codedError(
        `Codex exec failed with ${terminationSignal ? `signal ${terminationSignal}` : `exit code ${code}`}: ${stderr.trim()}`,
        /auth|login|unauthorized|401/iu.test(stderr) ? "AI_AUTH_FAILED" : "AI_UNAVAILABLE",
      ));
    });
    child.stdin.end(prompt);
  });
}

function errorProperty(error: unknown, key: "name" | "code"): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Readonly<Record<string, unknown>>;
  return record[key];
}

function codedError(message: string, code: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}
