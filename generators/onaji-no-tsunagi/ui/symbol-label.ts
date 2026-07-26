import type { SymbolId } from "../domain/types/puzzle.ts";

export function symbolLabel(symbol: SymbolId): string {
  return {
    circle: "丸",
    triangle: "三角",
    square: "四角",
  }[symbol];
}
