export type SymbolId = "circle" | "triangle" | "square";
export type TerminalMultiplicityPattern =
  | "2-2-2"
  | "4-2-2"
  | "4-4-2"
  | "4-4-4"
  | "6-4-4";

export type UniquePathCoverProfileId =
  | "5x5-2-2-2"
  | "5x5-4-2-2"
  | "5x5-4-4-2"
  | "6x6-4-4-2"
  | "6x6-4-4-4"
  | "6x6-6-4-4";

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
