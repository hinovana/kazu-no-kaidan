/**
 * 原本参照JSONを読み込み、出典・転記状態・再描画盤面を開発者が確認する画面。
 *
 * 参照データは作問へ流用せず、原本照合専用として扱う。
 *
 * @packageDocumentation
 */

import {
  useState,
  type ChangeEvent,
} from "react";
import {
  decodeReferenceCorpusJson,
  referenceProblemToPuzzle,
  type ReferenceCorpusDecodeResult,
} from "../application/decode-reference-corpus.ts";
import type {
  ReferenceCorpus,
  ReferenceProblem,
} from "../domain/types/reference-corpus.ts";
import type { SymbolId } from "../domain/types/puzzle.ts";
import exampleCorpusText from "../reference/example-source-corpus.json?raw";
import { PuzzleBoard } from "./PuzzleBoard.tsx";
import { symbolLabel } from "./symbol-label.ts";

type ReviewState =
  | { readonly status: "empty" }
  | {
      readonly status: "invalid";
      readonly fileName: string;
      readonly errors: readonly string[];
    }
  | {
      readonly status: "ready";
      readonly fileName: string;
      readonly corpus: ReferenceCorpus;
    };

const MAX_FILE_SIZE = 2_000_000;
const MAX_PDF_FILE_SIZE = 100_000_000;

type PdfCheckState =
  | { readonly status: "empty" }
  | { readonly status: "checking"; readonly fileName: string }
  | {
      readonly status: "checked";
      readonly fileName: string;
      readonly actualSha256: string;
      readonly expectedSha256: string | null;
      readonly matches: boolean | null;
    }
  | {
      readonly status: "error";
      readonly fileName: string;
      readonly message: string;
    };

/**
 * ローカルの原本参照JSONを再描画し、選択PDFのSHA-256を照合する開発画面。
 *
 * ファイルはブラウザ内だけで読み込み、生成処理やサーバーへ渡さない。
 * デコード成功やSHA一致だけでは転記座標の正確性を証明しない。
 */
export function ReferenceCorpusReviewPage() {
  const [reviewState, setReviewState] = useState<ReviewState>({
    status: "empty",
  });
  const [pdfCheck, setPdfCheck] = useState<PdfCheckState>({
    status: "empty",
  });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setReviewState({
        status: "invalid",
        fileName: file.name,
        errors: ["JSONは2MB以下にしてください。"],
      });
      return;
    }
    loadText(file.name, await file.text());
  }

  function loadText(fileName: string, sourceText: string) {
    const result = decodeReferenceCorpusJson(sourceText);
    setReviewState(resultToState(fileName, result));
    setPdfCheck({ status: "empty" });
  }

  async function handlePdfChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined || reviewState.status !== "ready") {
      return;
    }
    if (file.size > MAX_PDF_FILE_SIZE) {
      setPdfCheck({
        status: "error",
        fileName: file.name,
        message: "PDFは100MB以下にしてください。",
      });
      return;
    }
    setPdfCheck({ status: "checking", fileName: file.name });
    try {
      const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      const actualSha256 = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const expectedSha256 = reviewState.corpus.sourceDocument.sha256;
      setPdfCheck({
        status: "checked",
        fileName: file.name,
        actualSha256,
        expectedSha256,
        matches: expectedSha256 === null
          ? null
          : expectedSha256 === actualSha256,
      });
    } catch {
      setPdfCheck({
        status: "error",
        fileName: file.name,
        message: "PDFのSHA-256を計算できませんでした。",
      });
    }
  }

  return (
    <main className="onaji-page ots-reference-review">
      <header className="ots-page-header screen-only">
        <a
          className="ots-back-link"
          href="#/generators/onaji-no-tsunagi"
        >
          ← おなじのつなぎへ戻る
        </a>
        <p className="ots-page-kicker">原本転記の人間確認</p>
        <h1>お手本JSON 盤面確認</h1>
        <p>
          JSONを厳格にデコードし、マークを盤面へ戻して表示します。
          原本PDFと見比べ、盤面サイズ・記号・座標が同じかを確認してください。
        </p>
      </header>

      <aside className="ots-prototype-notice screen-only" role="note">
        <strong>この画面が確認すること</strong>
        <span>未知の項目・欠落・重複ID・盤面外座標を拒否</span>
        <span>同じマスの重複と記号数の不整合を拒否</span>
        <span>原本との一致そのものは人間が目視確認</span>
      </aside>

      <section className="ots-reference-loader screen-only">
        <div>
          <h2>ローカルJSONを読み込む</h2>
          <p>
            選択したファイルはブラウザ内だけで読み込み、サーバーへ送信しません。
            左上を <code>row=0, column=0</code> として表示します。
          </p>
        </div>
        <label className="ots-file-picker">
          お手本JSONを選ぶ
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => void handleFileChange(event)}
          />
        </label>
        <button
          className="ots-secondary-button"
          type="button"
          onClick={() => loadText(
            "example-source-corpus.json（架空例）",
            exampleCorpusText,
          )}
        >
          架空の形式見本を表示
        </button>
        <p className="ots-control-note">
          形式見本は原本問題ではありません。画面とJSON形式の動作確認だけに使用します。
        </p>
      </section>

      {reviewState.status === "ready" ? (
        <SourcePdfCheck
          corpus={reviewState.corpus}
          pdfCheck={pdfCheck}
          onPdfChange={handlePdfChange}
        />
      ) : null}

      {reviewState.status === "empty" ? (
        <section className="ots-empty-state" aria-live="polite">
          <h2>JSONはまだ読み込まれていません</h2>
          <p>ファイルを選ぶと、全問題を盤面として一覧表示します。</p>
        </section>
      ) : null}

      {reviewState.status === "invalid" ? (
        <section className="ots-error" role="alert">
          <h2>{reviewState.fileName} を読み込めません</h2>
          <p>{reviewState.errors.length}件の問題があります。</p>
          <ol className="ots-decode-errors">
            {reviewState.errors.map((error, index) => (
              <li key={`${index}-${error}`}>{error}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {reviewState.status === "ready" ? (
        <ReferenceCorpusView
          fileName={reviewState.fileName}
          corpus={reviewState.corpus}
        />
      ) : null}
    </main>
  );
}

function SourcePdfCheck({
  corpus,
  pdfCheck,
  onPdfChange,
}: {
  readonly corpus: ReferenceCorpus;
  readonly pdfCheck: PdfCheckState;
  readonly onPdfChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}) {
  return (
    <section className="ots-source-pdf-check screen-only">
      <div>
        <h2>原本PDFが同じファイルか確認</h2>
        <p>
          PDFを選ぶとSHA-256を計算し、JSONの
          <code>sourceDocument.sha256</code> と照合します。
          ファイルはブラウザ外へ送信しません。
        </p>
      </div>
      <label className="ots-file-picker">
        原本PDFを選ぶ
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => void onPdfChange(event)}
        />
      </label>
      <PdfCheckResult
        expectedSha256={corpus.sourceDocument.sha256}
        pdfCheck={pdfCheck}
      />
    </section>
  );
}

function PdfCheckResult({
  expectedSha256,
  pdfCheck,
}: {
  readonly expectedSha256: string | null;
  readonly pdfCheck: PdfCheckState;
}) {
  if (pdfCheck.status === "empty") {
    return (
      <p className="ots-pdf-check-result ots-pdf-check-result--waiting">
        JSON登録値: <code>{expectedSha256 ?? "未登録"}</code>
      </p>
    );
  }
  if (pdfCheck.status === "checking") {
    return (
      <p className="ots-pdf-check-result ots-pdf-check-result--waiting" aria-live="polite">
        {pdfCheck.fileName} のSHA-256を計算しています…
      </p>
    );
  }
  if (pdfCheck.status === "error") {
    return (
      <p className="ots-pdf-check-result ots-pdf-check-result--mismatch" role="alert">
        {pdfCheck.fileName}: {pdfCheck.message}
      </p>
    );
  }
  if (pdfCheck.matches === null) {
    return (
      <div className="ots-pdf-check-result ots-pdf-check-result--waiting">
        <strong>JSONにSHA-256が未登録です</strong>
        <span>{pdfCheck.fileName}</span>
        <code>{pdfCheck.actualSha256}</code>
      </div>
    );
  }
  return (
    <div
      className={`ots-pdf-check-result ots-pdf-check-result--${pdfCheck.matches ? "match" : "mismatch"}`}
      role={pdfCheck.matches ? "status" : "alert"}
    >
      <strong>
        {pdfCheck.matches
          ? "JSONと同じ原本PDFです"
          : "JSONが指す原本PDFと一致しません"}
      </strong>
      <span>{pdfCheck.fileName}</span>
      <code>{pdfCheck.actualSha256}</code>
    </div>
  );
}

function ReferenceCorpusView({
  fileName,
  corpus,
}: {
  readonly fileName: string;
  readonly corpus: ReferenceCorpus;
}) {
  const doubleCheckedCount = corpus.problems.filter(
    (problem) => problem.transcription.status === "double-checked",
  ).length;
  return (
    <div className="ots-reference-results">
      <section className="ots-reference-summary" aria-live="polite">
        <div>
          <span>ファイル</span>
          <strong>{fileName}</strong>
        </div>
        <div>
          <span>原本ID</span>
          <strong>{corpus.sourceDocument.id}</strong>
        </div>
        <div>
          <span>原本SHA-256</span>
          <strong className="ots-reference-hash">
            {corpus.sourceDocument.sha256 ?? "未登録"}
          </strong>
        </div>
        <div>
          <span>問題数</span>
          <strong>{corpus.problems.length}問</strong>
        </div>
        <div>
          <span>二重確認済み</span>
          <strong>{doubleCheckedCount}/{corpus.problems.length}問</strong>
        </div>
      </section>
      <p className="ots-reference-warning">
        デコード成功は原本との一致を意味しません。各カードを原本PDFの指定ページと目視照合してください。
      </p>
      <div className="ots-reference-grid">
        {corpus.problems.map((problem) => (
          <ReferenceProblemCard problem={problem} key={problem.id} />
        ))}
      </div>
    </div>
  );
}

function ReferenceProblemCard({
  problem,
}: {
  readonly problem: ReferenceProblem;
}) {
  const counts = symbolCounts(problem);
  const sourceKind = {
    "tutorial-example": "例題",
    "numbered-problem": "問題",
    challenge: "難問",
  }[problem.source.kind];
  return (
    <article
      className="ots-reference-card"
      data-reference-problem-id={problem.id}
    >
      <header>
        <div>
          <p className="ots-reference-source">
            書籍p.{problem.source.bookPage}／PDF {problem.source.pdfPage}ページ目
          </p>
          <h2>{sourceKind} {problem.source.label}</h2>
        </div>
        <span
          className={`ots-transcription-status ots-transcription-status--${problem.transcription.status}`}
        >
          {problem.transcription.status === "double-checked"
            ? "二重確認済み"
            : "転記確認前"}
        </span>
      </header>
      <dl className="ots-reference-facts">
        <div>
          <dt>盤面</dt>
          <dd>{problem.board.width}×{problem.board.height}</dd>
        </div>
        <div>
          <dt>記号</dt>
          <dd>{problem.terminals.length}個</dd>
        </div>
        <div>
          <dt>内訳</dt>
          <dd>
            ○{counts.circle}／△{counts.triangle}／□{counts.square}
          </dd>
        </div>
        <div>
          <dt>原本レベル</dt>
          <dd>{problem.source.printedDifficulty ?? "記載なし"}</dd>
        </div>
      </dl>
      <PuzzleBoard
        puzzle={referenceProblemToPuzzle(problem)}
        solution={null}
        mode="problem"
        showCoordinates
      />
      <details className="ots-coordinate-details">
        <summary>JSON座標を表で確認</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">記号</th>
              <th scope="col">row</th>
              <th scope="col">column</th>
              <th scope="col">人の数え方</th>
            </tr>
          </thead>
          <tbody>
            {problem.terminals.map((terminal) => (
              <tr key={terminal.terminalId}>
                <td>{terminal.terminalId}</td>
                <td>{symbolLabel(terminal.symbol)}</td>
                <td>{terminal.row}</td>
                <td>{terminal.column}</td>
                <td>{terminal.row + 1}行{terminal.column + 1}列</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="ots-puzzle-id">{problem.id}</p>
    </article>
  );
}

function symbolCounts(problem: ReferenceProblem): Record<SymbolId, number> {
  const counts: Record<SymbolId, number> = {
    circle: 0,
    triangle: 0,
    square: 0,
  };
  for (const terminal of problem.terminals) {
    counts[terminal.symbol] += 1;
  }
  return counts;
}

function resultToState(
  fileName: string,
  result: ReferenceCorpusDecodeResult,
): ReviewState {
  return result.ok
    ? { status: "ready", fileName, corpus: result.corpus }
    : { status: "invalid", fileName, errors: result.errors };
}
