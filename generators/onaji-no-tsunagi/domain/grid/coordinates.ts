import type { Cell, Puzzle } from "../types/puzzle.ts";

export function cellKey(cell: Cell): string {
  return `${cell.row},${cell.column}`;
}

export function cellIndex(cell: Cell, width: number): number {
  return cell.row * width + cell.column;
}

export function indexToCell(index: number, width: number): Cell {
  return {
    row: Math.floor(index / width),
    column: index % width,
  };
}

export function isCellInBounds(cell: Cell, puzzle: Pick<Puzzle, "width" | "height">): boolean {
  return Number.isInteger(cell.row)
    && Number.isInteger(cell.column)
    && cell.row >= 0
    && cell.row < puzzle.height
    && cell.column >= 0
    && cell.column < puzzle.width;
}

export function manhattanDistance(left: Cell, right: Cell): number {
  return Math.abs(left.row - right.row) + Math.abs(left.column - right.column);
}

export function areOrthogonallyAdjacent(left: Cell, right: Cell): boolean {
  return manhattanDistance(left, right) === 1;
}
