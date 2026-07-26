/**
 * フォームやWorkerから届く未知の値を、domainのGenerationRequestへ厳格変換する。
 *
 * 許可されたseed、難易度、問題数だけを受け入れ、不正入力を明示的な例外にする。
 *
 * @packageDocumentation
 */

import type {
  AcceptedDifficultyClassification,
  AvailableDifficultyLevel,
  GenerationRequest,
  PuzzleCount,
} from '../domain/types/generation.ts';
import {ACCEPTABLE_DIFFICULTY_CLASSIFICATIONS} from '../domain/types/generation.ts';

/**
 * 生成条件のruntime検証で見つかった問題をまとめて保持する例外。
 */
export class GenerationRequestParseError extends TypeError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues.join('\n'));
    this.name = 'GenerationRequestParseError';
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
    throw new GenerationRequestParseError(['生成条件はobjectで指定します。']);
  }
  const issues: string[] = [];
  const difficulty = parseInteger(input.difficulty);
  const puzzleCount = parseInteger(input.puzzleCount);
  const availableDifficulty = isAvailableDifficultyLevel(difficulty)
    ? difficulty
    : null;
  const availablePuzzleCount = isPuzzleCount(puzzleCount) ? puzzleCount : null;
  const seed = typeof input.seed === 'string' ? input.seed.trim() : '';
  const acceptedDifficultyClassifications =
    parseAcceptedDifficultyClassifications(
      input.acceptedDifficultyClassifications,
      issues,
    );

  if (difficulty === 4) {
    issues.push('レベル4の唯一解文法は準備中です。');
  } else if (availableDifficulty === null) {
    issues.push('レベルは1から3で指定します。');
  }
  if (availablePuzzleCount === null) {
    issues.push('問題数は1から4で指定します。');
  }
  if (seed.length === 0 || seed.length > 200) {
    issues.push('seedは1文字以上200文字以下で指定します。');
  }
  if (
    issues.length > 0 ||
    availableDifficulty === null ||
    availablePuzzleCount === null
  ) {
    throw new GenerationRequestParseError(issues);
  }

  return {
    difficulty: availableDifficulty,
    puzzleCount: availablePuzzleCount,
    seed,
    ...(acceptedDifficultyClassifications === undefined
      ? {}
      : {acceptedDifficultyClassifications}),
  };
}

function parseAcceptedDifficultyClassifications(
  value: unknown,
  issues: string[],
): readonly AcceptedDifficultyClassification[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    issues.push('採用基準は配列で指定します。');
    return undefined;
  }
  const selected = new Set<AcceptedDifficultyClassification>();
  for (const classification of value) {
    if (!isAcceptedDifficultyClassification(classification)) {
      issues.push('採用基準に未対応の分類が含まれています。');
      return undefined;
    }
    selected.add(classification);
  }
  if (selected.size !== value.length) {
    issues.push('採用基準に同じ分類を重複指定できません。');
    return undefined;
  }
  if (selected.size === 0) {
    issues.push('採用基準を1つ以上選んでください。');
    return undefined;
  }
  return ACCEPTABLE_DIFFICULTY_CLASSIFICATIONS.filter(classification =>
    selected.has(classification),
  );
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^[0-9]+$/u.test(value)) {
    return Number(value);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAvailableDifficultyLevel(
  value: number | null,
): value is AvailableDifficultyLevel {
  return value === 1 || value === 2 || value === 3;
}

function isPuzzleCount(value: number | null): value is PuzzleCount {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isAcceptedDifficultyClassification(
  value: unknown,
): value is AcceptedDifficultyClassification {
  return ACCEPTABLE_DIFFICULTY_CLASSIFICATIONS.some(
    classification => classification === value,
  );
}
