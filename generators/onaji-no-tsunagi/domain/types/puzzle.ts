/**
 * 盤面、セル、端点、記号、端点profileというPuzzleの中心的なdomain型を定義する。
 *
 * @packageDocumentation
 */

/** 盤面へ描画できる三種類の記号ID。 */
export type SymbolId = "circle" | "triangle" | "square";

/** 三記号それぞれの端点数構成を表すprofile上のmultiplicity。 */
export type TerminalMultiplicityPattern =
  | "2-2-2"
  | "4-2-2"
  | "4-4-2"
  | "4-4-4"
  | "6-4-4";

/** 盤面寸法と端点multiplicityを特定する、版管理対象のprofile ID。 */
export type UniquePathCoverProfileId =
  | "5x5-2-2-2"
  | "5x5-4-2-2"
  | "5x5-4-4-2"
  | "6x6-4-4-2"
  | "6x6-4-4-4"
  | "6x6-6-4-4";

/**
 * 左上を`row=0, column=0`とする0始まりの盤面座標。
 */
export interface Cell {
  readonly row: number;
  readonly column: number;
}

/** 解でちょうど一度だけ経路端として使う、記号付きの盤面セル。 */
export interface Terminal extends Cell {
  readonly terminalId: string;
  readonly symbol: SymbolId;
}

/**
 * solverとvalidatorへ渡す問題盤面。
 *
 * @remarks
 * 端点だけを保持し、植え込んだ経路、正解pair、解答線を含めない。
 */
export interface Puzzle {
  readonly schemaVersion: "onaji-no-tsunagi.puzzle.v1";
  readonly puzzleId: string;
  readonly width: number;
  readonly height: number;
  readonly terminals: readonly Terminal[];
}
