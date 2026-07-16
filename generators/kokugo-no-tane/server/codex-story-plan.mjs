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
} from "../src/story-plan-schema.js";
import {
  STORY_PLAN_INSTRUCTIONS,
  buildStoryPlanGenerationInput,
  parseGeneratedStoryPlan,
} from "./openai-story-plan.mjs";

const STDERR_LIMIT = 64 * 1024;

export async function requestCodexStoryPlan({
  config,
  request,
  signal,
  execute = executeCodex,
  logger,
}) {
  const generationInput = buildStoryPlanGenerationInput(request);
  const promptHash = createHash("sha256")
    .update(`${STORY_PLAN_INSTRUCTIONS}\n${stableJson(generationInput.curriculum_context)}`)
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

function logProviderIo(logger, value) {
  if (typeof logger === "function") logger(value);
}

export function buildCodexExecArgs({
  model,
  reasoningEffort = "high",
  schemaPath,
  outputPath,
}) {
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
}) {
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
    if (error?.name === "AbortError") throw error;
    if (error?.code === "ENOENT") {
      const unavailable = new Error("Codex CLI was not found");
      unavailable.code = "AI_UNAVAILABLE";
      throw unavailable;
    }
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function runCodexProcess({ command, args, cwd, prompt, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      signal,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.resume();
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (stderr.length < STDERR_LIMIT) stderr += chunk.slice(0, STDERR_LIMIT - stderr.length);
    });
    child.stdin.once("error", reject);
    child.once("error", reject);
    child.once("close", (code, terminationSignal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(`Codex exec failed with ${terminationSignal ? `signal ${terminationSignal}` : `exit code ${code}`}: ${stderr.trim()}`);
      error.code = /auth|login|unauthorized|401/iu.test(stderr) ? "AI_AUTH_FAILED" : "AI_UNAVAILABLE";
      reject(error);
    });
    child.stdin.end(prompt);
  });
}
