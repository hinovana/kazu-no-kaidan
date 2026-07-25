import { areOrthogonallyAdjacent, cellKey, isCellInBounds } from "../grid/coordinates.ts";
import type { Puzzle } from "../types/puzzle.ts";
import type { Solution } from "../types/solution.ts";
import type { ValidationIssue, ValidationResult } from "./validate-puzzle.ts";
import { validatePuzzle } from "./validate-puzzle.ts";

export function validateSolution(puzzle: Puzzle, solution: Solution): ValidationResult {
  const puzzleValidation = validatePuzzle(puzzle);
  if (!puzzleValidation.valid) {
    return puzzleValidation;
  }

  const issues: ValidationIssue[] = [];
  const terminalsByCell = new Map(puzzle.terminals.map((terminal) => [cellKey(terminal), terminal]));
  const usedTerminals = new Set<string>();
  const globallyUsedCells = new Set<string>();

  for (const [pathIndex, path] of solution.paths.entries()) {
    if (path.cells.length < 2) {
      issues.push({ code: "path_length", message: `線${pathIndex + 1}は2マス以上必要です。` });
      continue;
    }

    const pathCells = new Set<string>();
    for (const [cellPosition, cell] of path.cells.entries()) {
      const key = cellKey(cell);
      if (!isCellInBounds(cell, puzzle)) {
        issues.push({ code: "path_bounds", message: `線${pathIndex + 1}が盤面外を通っています。` });
      }
      if (pathCells.has(key)) {
        issues.push({ code: "path_self_overlap", message: `線${pathIndex + 1}が同じマスを2回通っています。` });
      }
      pathCells.add(key);
      if (globallyUsedCells.has(key)) {
        issues.push({ code: "path_overlap", message: `複数の線が${key}を共有しています。` });
      }
      globallyUsedCells.add(key);

      if (cellPosition > 0) {
        const previous = path.cells[cellPosition - 1];
        if (previous !== undefined && !areOrthogonallyAdjacent(previous, cell)) {
          issues.push({ code: "path_continuity", message: `線${pathIndex + 1}に斜め移動または飛び越しがあります。` });
        }
      }
    }

    const first = path.cells[0];
    const last = path.cells.at(-1);
    if (first === undefined || last === undefined) {
      continue;
    }
    const firstTerminal = terminalsByCell.get(cellKey(first));
    const lastTerminal = terminalsByCell.get(cellKey(last));
    if (firstTerminal === undefined || lastTerminal === undefined) {
      issues.push({ code: "path_endpoint", message: `線${pathIndex + 1}の両端がマークではありません。` });
    } else {
      if (firstTerminal.symbol !== lastTerminal.symbol || firstTerminal.symbol !== path.symbol) {
        issues.push({ code: "path_symbol", message: `線${pathIndex + 1}が異なる形を結んでいます。` });
      }
      if (usedTerminals.has(firstTerminal.terminalId) || usedTerminals.has(lastTerminal.terminalId)) {
        issues.push({ code: "terminal_reuse", message: `マークが複数の線で使われています。` });
      }
      usedTerminals.add(firstTerminal.terminalId);
      usedTerminals.add(lastTerminal.terminalId);
    }

    for (const interior of path.cells.slice(1, -1)) {
      if (terminalsByCell.has(cellKey(interior))) {
        issues.push({ code: "terminal_transit", message: `線${pathIndex + 1}が別のマークを途中で通過しています。` });
      }
    }
  }

  if (usedTerminals.size !== puzzle.terminals.length) {
    issues.push({
      code: "terminal_coverage",
      message: `全マークがちょうど1回使われていません: ${usedTerminals.size}/${puzzle.terminals.length}`,
    });
  }

  return issues.length === 0 ? { valid: true } : { valid: false, issues };
}
