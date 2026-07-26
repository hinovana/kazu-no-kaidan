/**
 * domainの記号IDを、日本語表示とaccessibility用の名称へ変換する。
 *
 * @packageDocumentation
 */

import type { SymbolId } from "../domain/types/puzzle.ts";

/** domainの記号IDを画面・accessibility表示用の日本語名へ変換する。 */
export function symbolLabel(symbol: SymbolId): string {
  return {
    circle: "丸",
    triangle: "三角",
    square: "四角",
  }[symbol];
}
