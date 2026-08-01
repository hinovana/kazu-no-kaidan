/**
 * 原本参照コーパスの出典、盤面転記、照合状態を表す型を定義する。
 *
 * 生成問題のfixtureやtemplateではなく、原本確認専用のデータ境界である。
 *
 * @packageDocumentation
 */

import type {SymbolId, Terminal} from './puzzle.ts';

/** 原本上での問題の役割。 */
export type ReferenceProblemKind =
  'tutorial-example' | 'numbered-problem' | 'challenge';

/**
 * 原本転記の照合状態。
 *
 * `double-checked`は、登録SHA-256の原本を使った二重の目視照合まで完了した
 * 状態を表す。
 */
export type TranscriptionStatus = 'draft' | 'double-checked';

/** 転記元PDFを同定し、書籍ページとPDFページの対応範囲を保持する情報。 */
export interface ReferenceSourceDocument {
  readonly id: string;
  readonly sha256: string | null;
  readonly bookPageRange: readonly [number, number];
  readonly pdfPageCount: number;
}

/** 一問が原本のどこに掲載されているかを示す情報。 */
export interface ReferenceProblemSource {
  readonly bookPage: number;
  readonly pdfPage: number;
  readonly label: string;
  readonly kind: ReferenceProblemKind;
  readonly printedDifficulty: number | null;
}

/**
 * 原本から転記した一問分の端点データ。
 *
 * 解数やsolver分析値を混ぜず、原本事実と照合状態だけを保持する。
 */
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

/**
 * ローカルの原本確認画面だけで利用する参照corpus。
 *
 * @remarks
 * 生成fixture、seed、問題templateとして利用してはならない。
 */
export interface ReferenceCorpus {
  readonly schemaVersion: 'onaji-no-tsunagi.source-corpus.v1';
  readonly sourceDocument: ReferenceSourceDocument;
  readonly coordinateSystem: {
    readonly origin: 'top-left';
    readonly indexBase: 0;
  };
  readonly problems: readonly ReferenceProblem[];
}

/** 原本参照schemaで受け入れる記号の固定集合。 */
export const REFERENCE_SYMBOLS = [
  'circle',
  'triangle',
  'square',
] as const satisfies readonly SymbolId[];
