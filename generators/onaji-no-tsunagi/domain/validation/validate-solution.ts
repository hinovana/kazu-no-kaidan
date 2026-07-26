/**
 * Puzzleに対する任意のSolutionが、接続・隣接・非共有のルールを満たすか検査する。
 *
 * 保存済みのcanonical solutionとの一致ではなく、ルールを満たす任意解を受理する。
 *
 * @packageDocumentation
 */

import {
  areOrthogonallyAdjacent,
  cellKey,
  isCellInBounds,
} from "../grid/coordinates.ts";
import type { Puzzle, Terminal } from "../types/puzzle.ts";
import type { Solution } from "../types/solution.ts";
import type { ValidationIssue, ValidationResult } from "./validate-puzzle.ts";
import { validatePuzzle } from "./validate-puzzle.ts";

type SolutionPath = Solution["paths"][number];

interface SolutionValidationContext {
  readonly puzzle: Puzzle;
  readonly terminalsByCell: ReadonlyMap<string, Terminal>;
  readonly usedTerminals: Set<string>;
  readonly globallyUsedCells: Set<string>;
  readonly issues: ValidationIssue[];
}

/**
 * 保存済み正解との一致ではなく、Puzzle規則を満たす任意の解を判定する。
 *
 * @remarks
 * 上下左右の連続性、自己再訪、経路間共有、端点記号、端点の一回使用、
 * 他端点の途中通過を検査する。全セル使用や唯一解は規則ではないため
 * このvalidatorでは要求しない。
 */
export function validateSolution(
  puzzle: Puzzle,
  solution: Solution,
): ValidationResult {
  const puzzleValidation = validatePuzzle(puzzle);
  if (!puzzleValidation.valid) {
    return puzzleValidation;
  }

  const context: SolutionValidationContext = {
    puzzle,
    terminalsByCell: new Map(puzzle.terminals.map((terminal) => (
      [cellKey(terminal), terminal]
    ))),
    usedTerminals: new Set<string>(),
    globallyUsedCells: new Set<string>(),
    issues: [],
  };

  for (const [pathIndex, path] of solution.paths.entries()) {
    if (path.cells.length < 2) {
      context.issues.push({
        code: "path_length",
        message: `線${pathIndex + 1}は2マス以上必要です。`,
      });
      continue;
    }
    validatePathCells(path, pathIndex, context);
    validatePathEndpoints(path, pathIndex, context);
    validateInteriorCells(path, pathIndex, context);
  }

  if (context.usedTerminals.size !== puzzle.terminals.length) {
    context.issues.push({
      code: "terminal_coverage",
      message: `全マークがちょうど1回使われていません: ${context.usedTerminals.size}/${puzzle.terminals.length}`,
    });
  }

  return context.issues.length === 0
    ? { valid: true }
    : { valid: false, issues: context.issues };
}

function validatePathCells(
  path: SolutionPath,
  pathIndex: number,
  context: SolutionValidationContext,
): void {
  const pathCells = new Set<string>();
  for (const [cellPosition, cell] of path.cells.entries()) {
    const key = cellKey(cell);
    if (!isCellInBounds(cell, context.puzzle)) {
      context.issues.push({
        code: "path_bounds",
        message: `線${pathIndex + 1}が盤面外を通っています。`,
      });
    }
    if (pathCells.has(key)) {
      context.issues.push({
        code: "path_self_overlap",
        message: `線${pathIndex + 1}が同じマスを2回通っています。`,
      });
    }
    pathCells.add(key);
    if (context.globallyUsedCells.has(key)) {
      context.issues.push({
        code: "path_overlap",
        message: `複数の線が${key}を共有しています。`,
      });
    }
    context.globallyUsedCells.add(key);

    const previous = path.cells[cellPosition - 1];
    if (
      previous !== undefined
      && !areOrthogonallyAdjacent(previous, cell)
    ) {
      context.issues.push({
        code: "path_continuity",
        message: `線${pathIndex + 1}に斜め移動または飛び越しがあります。`,
      });
    }
  }
}

function validatePathEndpoints(
  path: SolutionPath,
  pathIndex: number,
  context: SolutionValidationContext,
): void {
  const firstCell = path.cells[0];
  const lastCell = path.cells.at(-1);
  if (firstCell === undefined || lastCell === undefined) {
    return;
  }
  const firstTerminal = context.terminalsByCell.get(cellKey(firstCell));
  const lastTerminal = context.terminalsByCell.get(cellKey(lastCell));
  if (firstTerminal === undefined || lastTerminal === undefined) {
    context.issues.push({
      code: "path_endpoint",
      message: `線${pathIndex + 1}の両端がマークではありません。`,
    });
    return;
  }
  if (
    firstTerminal.symbol !== lastTerminal.symbol
    || firstTerminal.symbol !== path.symbol
  ) {
    context.issues.push({
      code: "path_symbol",
      message: `線${pathIndex + 1}が異なる形を結んでいます。`,
    });
  }
  if (
    context.usedTerminals.has(firstTerminal.terminalId)
    || context.usedTerminals.has(lastTerminal.terminalId)
  ) {
    context.issues.push({
      code: "terminal_reuse",
      message: "マークが複数の線で使われています。",
    });
  }
  context.usedTerminals.add(firstTerminal.terminalId);
  context.usedTerminals.add(lastTerminal.terminalId);
}

function validateInteriorCells(
  path: SolutionPath,
  pathIndex: number,
  context: SolutionValidationContext,
): void {
  for (const interior of path.cells.slice(1, -1)) {
    if (context.terminalsByCell.has(cellKey(interior))) {
      context.issues.push({
        code: "terminal_transit",
        message: `線${pathIndex + 1}が別のマークを途中で通過しています。`,
      });
    }
  }
}
