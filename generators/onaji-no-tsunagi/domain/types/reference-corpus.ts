import type { SymbolId, Terminal } from "./puzzle.ts";

export type ReferenceProblemKind =
  | "tutorial-example"
  | "numbered-problem"
  | "challenge";

export type TranscriptionStatus = "draft" | "double-checked";

export interface ReferenceSourceDocument {
  readonly id: string;
  readonly sha256: string | null;
  readonly bookPageRange: readonly [number, number];
  readonly pdfPageCount: number;
}

export interface ReferenceProblemSource {
  readonly bookPage: number;
  readonly pdfPage: number;
  readonly label: string;
  readonly kind: ReferenceProblemKind;
  readonly printedDifficulty: number | null;
}

export interface ReferenceProblem {
  readonly id: string;
  readonly source: ReferenceProblemSource;
  readonly board: {
    readonly width: number;
    readonly height: number;
  };
  readonly terminals: readonly Terminal[];
  readonly transcription: {
    readonly status: TranscriptionStatus;
    readonly checkedAgainstSourceSha256: string | null;
  };
}

export interface ReferenceCorpus {
  readonly schemaVersion: "onaji-no-tsunagi.source-corpus.v1";
  readonly sourceDocument: ReferenceSourceDocument;
  readonly coordinateSystem: {
    readonly origin: "top-left";
    readonly indexBase: 0;
  };
  readonly problems: readonly ReferenceProblem[];
}

export const REFERENCE_SYMBOLS = [
  "circle",
  "triangle",
  "square",
] as const satisfies readonly SymbolId[];
