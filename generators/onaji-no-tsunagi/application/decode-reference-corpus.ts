/**
 * 未知のJSONを原本参照コーパスとして厳格にデコードする。
 *
 * source情報、盤面、端点、記号数、原本SHA-256の整合性をapplication境界で検査する。
 *
 * @packageDocumentation
 */

import type {
  ReferenceCorpus,
  ReferenceProblem,
  ReferenceProblemKind,
  ReferenceProblemSource,
  ReferenceSourceDocument,
  TranscriptionStatus,
} from "../domain/types/reference-corpus.ts";
import {
  REFERENCE_SYMBOLS,
} from "../domain/types/reference-corpus.ts";
import type { Puzzle, SymbolId, Terminal } from "../domain/types/puzzle.ts";
import { validatePuzzle } from "../domain/validation/validate-puzzle.ts";

/**
 * 原本参照JSONを厳格にデコードした結果。
 *
 * `ok: false`では、検出できた構造・整合性エラーを可能な限りまとめて返す。
 */
export type ReferenceCorpusDecodeResult =
  | { readonly ok: true; readonly corpus: ReferenceCorpus }
  | { readonly ok: false; readonly errors: readonly string[] };

const SCHEMA_VERSION = "onaji-no-tsunagi.source-corpus.v1";
const PROBLEM_KINDS = [
  "tutorial-example",
  "numbered-problem",
  "challenge",
] as const satisfies readonly ReferenceProblemKind[];
const TRANSCRIPTION_STATUSES = [
  "draft",
  "double-checked",
] as const satisfies readonly TranscriptionStatus[];

/**
 * 原本参照JSONを、未知fieldを許さないschemaと盤面規則で検証する。
 *
 * @remarks
 * デコード成功や原本PDFのSHA-256一致は、端点座標が原本どおりに転記された
 * ことを証明しない。`double-checked`への変更には別途目視照合が必要である。
 *
 * @param sourceText - JSONファイルから読み込んだ未検証の文字列。
 * @returns デコード済みcorpus、またはJSON path付きのエラー一覧。
 */
export function decodeReferenceCorpusJson(
  sourceText: string,
): ReferenceCorpusDecodeResult {
  let source: unknown;
  try {
    source = JSON.parse(sourceText) as unknown;
  } catch (error: unknown) {
    return {
      ok: false,
      errors: [
        `JSONとして読み込めません: ${
          error instanceof Error ? error.message : "構文エラー"
        }`,
      ],
    };
  }

  const errors: string[] = [];
  const root = readRecord(source, "$", errors);
  checkKeys(
    root,
    ["schemaVersion", "sourceDocument", "coordinateSystem", "problems"],
    "$",
    errors,
  );

  const schemaVersion = readLiteral(
    root.schemaVersion,
    SCHEMA_VERSION,
    "$.schemaVersion",
    errors,
  );
  const sourceDocument = decodeSourceDocument(
    root.sourceDocument,
    "$.sourceDocument",
    errors,
  );
  const coordinateSystem = decodeCoordinateSystem(
    root.coordinateSystem,
    "$.coordinateSystem",
    errors,
  );
  const problemValues = readArray(root.problems, "$.problems", errors);
  const problems = problemValues.map((problem, index) => decodeProblem(
    problem,
    `$.problems[${index}]`,
    errors,
  ));

  if (problems.length === 0) {
    errors.push("$.problems: 1問以上必要です。");
  }

  const problemIds = new Set<string>();
  const sourceLocations = new Set<string>();
  for (const [index, problem] of problems.entries()) {
    const path = `$.problems[${index}]`;
    if (problemIds.has(problem.id)) {
      errors.push(`${path}.id: 問題IDが重複しています: ${problem.id}`);
    }
    problemIds.add(problem.id);

    const sourceLocation = [
      problem.source.bookPage,
      problem.source.label,
      problem.source.kind,
    ].join(":");
    if (sourceLocations.has(sourceLocation)) {
      errors.push(`${path}.source: 同じ出典位置が重複しています。`);
    }
    sourceLocations.add(sourceLocation);

    if (
      problem.source.bookPage < sourceDocument.bookPageRange[0]
      || problem.source.bookPage > sourceDocument.bookPageRange[1]
    ) {
      errors.push(`${path}.source.bookPage: 原本ページ範囲外です。`);
    }
    if (problem.source.pdfPage > sourceDocument.pdfPageCount) {
      errors.push(`${path}.source.pdfPage: PDFページ数を超えています。`);
    }
    if (problem.transcription.status === "double-checked") {
      if (sourceDocument.sha256 === null) {
        errors.push(
          `${path}.transcription: 二重確認には原本PDFのSHA-256が必要です。`,
        );
      } else if (
        problem.transcription.checkedAgainstSourceSha256
        !== sourceDocument.sha256
      ) {
        errors.push(
          `${path}.transcription.checkedAgainstSourceSha256: 原本PDFのSHA-256と一致しません。`,
        );
      }
    } else if (
      problem.transcription.checkedAgainstSourceSha256 !== null
    ) {
      errors.push(
        `${path}.transcription.checkedAgainstSourceSha256: draftではnullにします。`,
      );
    }

    const validation = validatePuzzle(referenceProblemToPuzzle(problem));
    if (!validation.valid) {
      for (const issue of validation.issues) {
        errors.push(`${path}: ${issue.message}`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    corpus: {
      schemaVersion,
      sourceDocument,
      coordinateSystem,
      problems,
    },
  };
}

/**
 * 原本参照問題から、出典情報を含まない端点だけの`Puzzle`を作る。
 *
 * @remarks
 * solver入力へ変換するだけで、解数や転記の正確性は保証しない。
 */
export function referenceProblemToPuzzle(
  problem: ReferenceProblem,
): Puzzle {
  return {
    schemaVersion: "onaji-no-tsunagi.puzzle.v1",
    puzzleId: problem.id,
    width: problem.board.width,
    height: problem.board.height,
    terminals: problem.terminals,
  };
}

function decodeSourceDocument(
  source: unknown,
  path: string,
  errors: string[],
): ReferenceSourceDocument {
  const record = readRecord(source, path, errors);
  checkKeys(
    record,
    ["id", "sha256", "bookPageRange", "pdfPageCount"],
    path,
    errors,
  );
  const pageRange = readArray(
    record.bookPageRange,
    `${path}.bookPageRange`,
    errors,
  );
  if (pageRange.length !== 2) {
    errors.push(`${path}.bookPageRange: 開始・終了の2要素が必要です。`);
  }
  const start = readInteger(
    pageRange[0],
    `${path}.bookPageRange[0]`,
    errors,
    1,
  );
  const end = readInteger(
    pageRange[1],
    `${path}.bookPageRange[1]`,
    errors,
    1,
  );
  if (start > end) {
    errors.push(`${path}.bookPageRange: 開始ページは終了ページ以下にします。`);
  }

  return {
    id: readNonEmptyString(record.id, `${path}.id`, errors),
    sha256: readNullableSha256(record.sha256, `${path}.sha256`, errors),
    bookPageRange: [start, end],
    pdfPageCount: readInteger(
      record.pdfPageCount,
      `${path}.pdfPageCount`,
      errors,
      1,
    ),
  };
}

function decodeCoordinateSystem(
  source: unknown,
  path: string,
  errors: string[],
): ReferenceCorpus["coordinateSystem"] {
  const record = readRecord(source, path, errors);
  checkKeys(record, ["origin", "indexBase"], path, errors);
  return {
    origin: readLiteral(record.origin, "top-left", `${path}.origin`, errors),
    indexBase: readLiteral(record.indexBase, 0, `${path}.indexBase`, errors),
  };
}

function decodeProblem(
  source: unknown,
  path: string,
  errors: string[],
): ReferenceProblem {
  const record = readRecord(source, path, errors);
  checkKeys(
    record,
    ["id", "source", "board", "terminals", "transcription"],
    path,
    errors,
  );
  const id = readNonEmptyString(record.id, `${path}.id`, errors);
  const sourceLocation = decodeProblemSource(
    record.source,
    `${path}.source`,
    errors,
  );
  const board = decodeBoard(record.board, `${path}.board`, errors);
  const terminalValues = readArray(
    record.terminals,
    `${path}.terminals`,
    errors,
  );
  const terminals = terminalValues.map((terminal, index) => decodeTerminal(
    terminal,
    `${path}.terminals[${index}]`,
    errors,
  ));
  const transcription = decodeTranscription(
    record.transcription,
    `${path}.transcription`,
    errors,
  );

  return {
    id,
    source: sourceLocation,
    board,
    terminals,
    transcription,
  };
}

function decodeProblemSource(
  source: unknown,
  path: string,
  errors: string[],
): ReferenceProblemSource {
  const record = readRecord(source, path, errors);
  checkKeys(
    record,
    ["bookPage", "pdfPage", "label", "kind", "printedDifficulty"],
    path,
    errors,
  );
  return {
    bookPage: readInteger(record.bookPage, `${path}.bookPage`, errors, 1),
    pdfPage: readInteger(record.pdfPage, `${path}.pdfPage`, errors, 1),
    label: readNonEmptyString(record.label, `${path}.label`, errors),
    kind: readEnum(
      record.kind,
      PROBLEM_KINDS,
      `${path}.kind`,
      errors,
    ),
    printedDifficulty: readNullableInteger(
      record.printedDifficulty,
      `${path}.printedDifficulty`,
      errors,
      1,
      5,
    ),
  };
}

function decodeBoard(
  source: unknown,
  path: string,
  errors: string[],
): ReferenceProblem["board"] {
  const record = readRecord(source, path, errors);
  checkKeys(record, ["width", "height"], path, errors);
  return {
    width: readInteger(record.width, `${path}.width`, errors, 2, 9),
    height: readInteger(record.height, `${path}.height`, errors, 2, 9),
  };
}

function decodeTerminal(
  source: unknown,
  path: string,
  errors: string[],
): Terminal {
  const record = readRecord(source, path, errors);
  checkKeys(
    record,
    ["terminalId", "symbol", "row", "column"],
    path,
    errors,
  );
  return {
    terminalId: readNonEmptyString(
      record.terminalId,
      `${path}.terminalId`,
      errors,
    ),
    symbol: readEnum(
      record.symbol,
      REFERENCE_SYMBOLS,
      `${path}.symbol`,
      errors,
    ) as SymbolId,
    row: readInteger(record.row, `${path}.row`, errors, 0),
    column: readInteger(record.column, `${path}.column`, errors, 0),
  };
}

function decodeTranscription(
  source: unknown,
  path: string,
  errors: string[],
): ReferenceProblem["transcription"] {
  const record = readRecord(source, path, errors);
  checkKeys(
    record,
    ["status", "checkedAgainstSourceSha256"],
    path,
    errors,
  );
  return {
    status: readEnum(
      record.status,
      TRANSCRIPTION_STATUSES,
      `${path}.status`,
      errors,
    ),
    checkedAgainstSourceSha256: readNullableSha256(
      record.checkedAgainstSourceSha256,
      `${path}.checkedAgainstSourceSha256`,
      errors,
    ),
  };
}

function readRecord(
  source: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> {
  if (
    typeof source !== "object"
    || source === null
    || Array.isArray(source)
  ) {
    errors.push(`${path}: オブジェクトでなければなりません。`);
    return {};
  }
  return source as Record<string, unknown>;
}

function readArray(
  source: unknown,
  path: string,
  errors: string[],
): readonly unknown[] {
  if (!Array.isArray(source)) {
    errors.push(`${path}: 配列でなければなりません。`);
    return [];
  }
  return source;
}

function readNonEmptyString(
  source: unknown,
  path: string,
  errors: string[],
): string {
  if (typeof source !== "string" || source.trim().length === 0) {
    errors.push(`${path}: 空でない文字列でなければなりません。`);
    return "";
  }
  return source;
}

function readNullableSha256(
  source: unknown,
  path: string,
  errors: string[],
): string | null {
  if (source === null) {
    return null;
  }
  if (typeof source !== "string" || !/^[a-f0-9]{64}$/u.test(source)) {
    errors.push(`${path}: nullまたは64文字の小文字SHA-256が必要です。`);
    return null;
  }
  return source;
}

function readInteger(
  source: unknown,
  path: string,
  errors: string[],
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isInteger(source)
    || typeof source !== "number"
    || source < minimum
    || source > maximum
  ) {
    errors.push(
      `${path}: ${minimum}以上${maximum === Number.MAX_SAFE_INTEGER ? "" : `${maximum}以下`}の整数が必要です。`,
    );
    return minimum;
  }
  return source;
}

function readNullableInteger(
  source: unknown,
  path: string,
  errors: string[],
  minimum: number,
  maximum: number,
): number | null {
  if (source === null) {
    return null;
  }
  return readInteger(source, path, errors, minimum, maximum);
}

function readEnum<const Value extends string>(
  source: unknown,
  values: readonly Value[],
  path: string,
  errors: string[],
): Value {
  if (
    typeof source !== "string"
    || !values.includes(source as Value)
  ) {
    errors.push(`${path}: ${values.join(" / ")}のいずれかが必要です。`);
    return values[0] as Value;
  }
  return source as Value;
}

function readLiteral<const Value extends string | number>(
  source: unknown,
  expected: Value,
  path: string,
  errors: string[],
): Value {
  if (source !== expected) {
    errors.push(`${path}: ${JSON.stringify(expected)}でなければなりません。`);
  }
  return expected;
}

function checkKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
  errors: string[],
) {
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(record)) {
    if (!expected.has(key)) {
      errors.push(`${path}.${key}: 未定義の項目です。入力ミスを確認してください。`);
    }
  }
  for (const key of expectedKeys) {
    if (!(key in record)) {
      errors.push(`${path}.${key}: 必須項目です。`);
    }
  }
}
