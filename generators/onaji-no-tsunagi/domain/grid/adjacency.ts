import { indexToCell } from "./coordinates.ts";
import type { Cell } from "../types/puzzle.ts";

const DIRECTIONS = [
  { row: -1, column: 0 },
  { row: 0, column: 1 },
  { row: 1, column: 0 },
  { row: 0, column: -1 },
] as const;

export function adjacentCells(cell: Cell, width: number, height: number): readonly Cell[] {
  const result: Cell[] = [];
  for (const direction of DIRECTIONS) {
    const next = {
      row: cell.row + direction.row,
      column: cell.column + direction.column,
    };
    if (
      next.row >= 0
      && next.row < height
      && next.column >= 0
      && next.column < width
    ) {
      result.push(next);
    }
  }
  return result;
}

export function adjacentIndices(index: number, width: number, height: number): readonly number[] {
  return adjacentCells(indexToCell(index, width), width, height)
    .map((cell) => cell.row * width + cell.column);
}
