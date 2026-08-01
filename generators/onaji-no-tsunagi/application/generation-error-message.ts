/**
 * applicationとdomainで発生した既知の生成失敗を、画面表示用の日本語へ変換する。
 *
 * @packageDocumentation
 */

import {GenerationFailure} from '../domain/generation/generate-worksheet.ts';
import type {GenerationError} from '../domain/types/generation.ts';
import {GenerationRequestParseError} from './parse-generation-request.ts';

/**
 * application/domainの例外を、開発画面へ表示できる日本語メッセージへ変換する。
 *
 * 未知の値はthrowせず、必ずfallbackメッセージへ変換する。
 */
export function generationErrorMessage(error: unknown): string {
  if (error instanceof GenerationRequestParseError) {
    return error.issues.join(' ');
  }
  if (error instanceof GenerationFailure) {
    if (error.detail.code === 'GENERATION_BUDGET_EXHAUSTED') {
      return [
        'この条件では品質検査を完了した候補を作れませんでした。',
        'seedを変えて試してください。',
      ].join('');
    }
    if (error.detail.code === 'DIFFICULTY_RETRY_EXHAUSTED') {
      return [
        '明らかに簡単側の候補が10問連続したため、',
        'Worksheet全体の生成を中止しました。',
        'エラーレポートを保存してレビューしてください。',
      ].join('');
    }
    return `内部検査に失敗しました: ${error.detail.code}`;
  }
  return error instanceof Error ? error.message : '不明なエラーです。';
}

/** 既知のdomain生成失敗から、Worker境界を越せる構造化レポートを取り出す。 */
export function generationErrorReport(
  error: unknown,
): GenerationError | undefined {
  return error instanceof GenerationFailure ? error.detail : undefined;
}
