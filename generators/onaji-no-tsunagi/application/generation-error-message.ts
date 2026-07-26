/**
 * applicationとdomainで発生した既知の生成失敗を、画面表示用の日本語へ変換する。
 *
 * @packageDocumentation
 */

import { GenerationFailure } from "../domain/generation/generate-worksheet.ts";
import { GenerationRequestParseError } from "./parse-generation-request.ts";

/**
 * application/domainの例外を、開発画面へ表示できる日本語メッセージへ変換する。
 *
 * 未知の値はthrowせず、必ずfallbackメッセージへ変換する。
 */
export function generationErrorMessage(error: unknown): string {
  if (error instanceof GenerationRequestParseError) {
    return error.issues.join(" ");
  }
  if (error instanceof GenerationFailure) {
    if (error.detail.code === "GENERATION_BUDGET_EXHAUSTED") {
      return [
        "この条件では品質検査を完了した候補を作れませんでした。",
        "seedを変えて試してください。",
      ].join("");
    }
    return `内部検査に失敗しました: ${error.detail.code}`;
  }
  return error instanceof Error ? error.message : "不明なエラーです。";
}
