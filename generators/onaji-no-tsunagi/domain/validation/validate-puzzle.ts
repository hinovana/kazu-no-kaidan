/**
 * Puzzle単体の寸法、端点ID、座標、記号個数などの不変条件を検査する。
 *
 * @packageDocumentation
 */

import { cellKey, isCellInBounds } from "../grid/coordinates.ts";
import type { Puzzle, SymbolId } from "../types/puzzle.ts";

/** validatorが返す、機械判定用codeと人間向け説明。 */
export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
}

/** 複数のvalidation issueをまとめて返せる判定結果。 */
export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly issues: readonly ValidationIssue[] };

const SYMBOLS: readonly SymbolId[] = ["circle", "triangle", "square"];

/**
 * Puzzleのschema、寸法、端点ID・座標・記号数を検査する。
 *
 * 解の存在、唯一性、難易度、profile別品質gateは検査しない。
 */
export function validatePuzzle(puzzle: Puzzle): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (puzzle.schemaVersion !== "onaji-no-tsunagi.puzzle.v1") {
    issues.push({ code: "schema_version", message: "未対応の盤面schemaです。" });
  }
  if (!Number.isInteger(puzzle.width) || puzzle.width < 2 || puzzle.width > 9) {
    issues.push({ code: "width", message: "盤面の幅は2から9の整数で指定します。" });
  }
  if (!Number.isInteger(puzzle.height) || puzzle.height < 2 || puzzle.height > 9) {
    issues.push({ code: "height", message: "盤面の高さは2から9の整数で指定します。" });
  }
  if (puzzle.puzzleId.length === 0) {
    issues.push({ code: "puzzle_id", message: "puzzleIdは空にできません。" });
  }

  const coordinateKeys = new Set<string>();
  const terminalIds = new Set<string>();
  const symbolCounts = new Map<SymbolId, number>();

  for (const terminal of puzzle.terminals) {
    if (!SYMBOLS.includes(terminal.symbol)) {
      issues.push({ code: "symbol", message: `未知の記号です: ${String(terminal.symbol)}` });
    } else {
      symbolCounts.set(terminal.symbol, (symbolCounts.get(terminal.symbol) ?? 0) + 1);
    }
    if (!isCellInBounds(terminal, puzzle)) {
      issues.push({
        code: "terminal_bounds",
        message: `盤面外のマークがあります: ${terminal.terminalId}`,
      });
    }
    const coordinate = cellKey(terminal);
    if (coordinateKeys.has(coordinate)) {
      issues.push({ code: "terminal_overlap", message: `同じマスに複数のマークがあります: ${coordinate}` });
    }
    coordinateKeys.add(coordinate);
    if (terminal.terminalId.length === 0 || terminalIds.has(terminal.terminalId)) {
      issues.push({ code: "terminal_id", message: `terminalIdが空または重複しています: ${terminal.terminalId}` });
    }
    terminalIds.add(terminal.terminalId);
  }

  for (const [symbol, count] of symbolCounts) {
    if (count < 2 || count % 2 !== 0) {
      issues.push({
        code: "terminal_evenness",
        message: `${symbol}のマーク数は2以上の偶数でなければなりません: ${count}`,
      });
    }
  }
  if (symbolCounts.size === 0) {
    issues.push({ code: "terminal_empty", message: "マークがありません。" });
  }

  return issues.length === 0 ? { valid: true } : { valid: false, issues };
}
