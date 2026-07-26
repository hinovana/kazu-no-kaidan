/**
 * フォームやWorkerから届く未知の値を、domainのGenerationRequestへ厳格変換する。
 *
 * 許可されたseed、難易度、問題数だけを受け入れ、不正入力を明示的な例外にする。
 *
 * @packageDocumentation
 */

import type {
  AvailableDifficultyLevel,
  GenerationRequest,
  PuzzleCount,
} from "../domain/types/generation.ts";

/**
 * 生成条件のruntime検証で見つかった問題をまとめて保持する例外。
 */
export class GenerationRequestParseError extends TypeError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "GenerationRequestParseError";
    this.issues = issues;
  }
}

/**
 * UI、Worker、Nodeから渡される未検証値を`GenerationRequest`へ変換する。
 *
 * @remarks
 * 数値または10進数字列を受け入れ、seedの前後空白を除去する。値を範囲内へ
 * 暗黙補正せず、レベル4も未実装として拒否する。
 *
 * @throws `GenerationRequestParseError`
 * object形状、難易度、問題数、seed長のいずれかが契約外の場合。
 */
export function parseGenerationRequest(input: unknown): GenerationRequest {
  if (!isRecord(input)) {
    throw new GenerationRequestParseError(["生成条件はobjectで指定します。"]);
  }
  const issues: string[] = [];
  const difficulty = parseInteger(input.difficulty);
  const puzzleCount = parseInteger(input.puzzleCount);
  const seed = typeof input.seed === "string" ? input.seed.trim() : "";

  if (difficulty === 4) {
    issues.push(
      "レベル4の唯一解文法は準備中です。",
    );
  } else if (
    difficulty === null
    || ![1, 2, 3].includes(
      difficulty as AvailableDifficultyLevel,
    )
  ) {
    issues.push("レベルは1から3で指定します。");
  }
  if (puzzleCount === null || ![1, 2, 3, 4].includes(puzzleCount)) {
    issues.push("問題数は1から4で指定します。");
  }
  if (seed.length === 0 || seed.length > 200) {
    issues.push("seedは1文字以上200文字以下で指定します。");
  }
  if (issues.length > 0) {
    throw new GenerationRequestParseError(issues);
  }

  return {
    difficulty: difficulty as AvailableDifficultyLevel,
    puzzleCount: puzzleCount as PuzzleCount,
    seed,
  };
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/u.test(value)) {
    return Number(value);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
