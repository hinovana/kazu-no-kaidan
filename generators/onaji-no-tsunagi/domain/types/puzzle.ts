export type SymbolId = "circle" | "triangle" | "square";
export type FiveByFiveTerminalPattern =
  | "2-2-2"
  | "4-2-2"
  | "4-4-2";

export interface Cell {
  readonly row: number;
  readonly column: number;
}

export interface Terminal extends Cell {
  readonly terminalId: string;
  readonly symbol: SymbolId;
}

export interface Puzzle {
  readonly schemaVersion: "onaji-no-tsunagi.puzzle.v1";
  readonly puzzleId: string;
  readonly width: number;
  readonly height: number;
  readonly terminals: readonly Terminal[];
}
