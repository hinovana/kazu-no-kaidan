/**
 * 生成条件入力、Web Worker実行、問題・解答previewを統括する教材画面。
 *
 * 通常生成と原本参照コーパス確認の画面modeを同じSPA入口で切り替える。
 *
 * @packageDocumentation
 */

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import type { GeneratorModuleProps } from "../../../src/app/generator-module.ts";
import type {
  GenerationWorkerResponse,
} from "../application/generation-worker-contract.ts";
import type {
  AvailableDifficultyLevel,
  PuzzleCount,
} from "../domain/types/generation.ts";
import type { Worksheet } from "../domain/types/worksheet.ts";
import { AnswerPreview } from "./AnswerPreview.tsx";
import { DeveloperDiagnostics } from "./DeveloperDiagnostics.tsx";
import { ReferenceCorpusReviewPage } from "./ReferenceCorpusReviewPage.tsx";
import { WorksheetPreview } from "./WorksheetPreview.tsx";

interface FormState {
  readonly difficulty: AvailableDifficultyLevel;
  readonly puzzleCount: PuzzleCount;
  readonly seed: string;
}

type PageState =
  | { readonly status: "idle" }
  | { readonly status: "generating" }
  | { readonly status: "ready"; readonly worksheet: Worksheet }
  | { readonly status: "error"; readonly message: string };

const INITIAL_FORM: FormState = {
  difficulty: 1,
  puzzleCount: 2,
  seed: "onaji-start",
};

/**
 * 通常のWorksheet生成画面と原本参照画面をquery modeで切り替える教材page。
 *
 * 通常生成はWeb Workerで実行し、画面unmount時に処理中Workerを終了する。
 */
export function OnajiNoTsunagiPage({ onRequestPrint }: GeneratorModuleProps) {
  const [searchParams] = useSearchParams();
  if (searchParams.get("mode") === "reference-review") {
    return <ReferenceCorpusReviewPage />;
  }
  return <WorksheetGeneratorPage onRequestPrint={onRequestPrint} />;
}

function WorksheetGeneratorPage({
  onRequestPrint,
}: GeneratorModuleProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [pageState, setPageState] = useState<PageState>({ status: "idle" });
  const [showAnswers, setShowAnswers] = useState(false);
  const activeWorker = useRef<Worker | null>(null);

  useEffect(() => () => {
    activeWorker.current?.terminate();
  }, []);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageState({ status: "generating" });
    setShowAnswers(false);
    try {
      const worksheet = await generateWorksheetInWorker(
        form,
        (worker) => {
          activeWorker.current = worker;
        },
      );
      setPageState({ status: "ready", worksheet });
    } catch (error: unknown) {
      setPageState({
        status: "error",
        message: error instanceof Error
          ? error.message
          : "不明なエラーです。",
      });
    } finally {
      activeWorker.current = null;
    }
  }

  function handlePrint() {
    if (showAnswers) {
      onRequestPrint();
      return;
    }
    setShowAnswers(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(onRequestPrint);
    });
  }

  return (
    <main className="onaji-page">
      <header className="ots-page-header screen-only">
        <a className="ots-back-link" href="#/">← 教材一覧へ</a>
        <a
          className="ots-reference-link"
          href="#/generators/onaji-no-tsunagi?mode=reference-review"
        >
          お手本JSONを盤面で確認
        </a>
        <p className="ots-page-kicker">形と道すじの算数パズル</p>
        <h1>おなじのつなぎ</h1>
        <p>
          5×5・6×6のマークを、同じ形どうし2こずつ線でつなぎます。
          同じ形が4こ以上あるときは、どの2こを組にするかも考えましょう。
        </p>
      </header>

      <aside className="ots-prototype-notice screen-only" role="note">
        <strong>開発確認用プロトタイプ</strong>
        <span>v3.4 draft: 5×5・6×6・6/8/10/12/14端点・唯一解を完全探索で証明済み</span>
        <span>6×6の機械gateは完了、人間レビュー・難易度校正は未完了</span>
        <span>レベル4の唯一解文法は準備中</span>
        <span>挑戦したくなるか／解いて面白いかは人間未確認</span>
        <span>難易度は未校正／児童利用・学力判定不可</span>
      </aside>

      <form className="ots-control-panel screen-only" onSubmit={(event) => void handleGenerate(event)}>
        <div className="ots-control-grid">
          <label>
            暫定難易度
            <select
              value={form.difficulty}
              onChange={(event) => setForm({
                ...form,
                difficulty: Number(
                  event.target.value,
                ) as AvailableDifficultyLevel,
              })}
            >
              <option value={1}>★☆☆☆ レベル1（5×5・6/8/10個・唯一解）</option>
              <option value={2}>★★☆☆ レベル2（6×6・10/12個・唯一解）</option>
              <option value={3}>★★★☆ レベル3（6×6・14個・唯一解）</option>
            </select>
          </label>
          <label>
            問題数
            <select
              value={form.puzzleCount}
              onChange={(event) => setForm({
                ...form,
                puzzleCount: Number(event.target.value) as PuzzleCount,
              })}
            >
              {[1, 2, 3, 4].map((count) => (
                <option value={count} key={count}>{count}問</option>
              ))}
            </select>
          </label>
          <label className="ots-seed-field">
            seed
            <input
              value={form.seed}
              maxLength={200}
              onChange={(event) => setForm({ ...form, seed: event.target.value })}
            />
          </label>
          <button
            className="ots-secondary-button"
            type="button"
            onClick={() => setForm({ ...form, seed: createRandomSeed() })}
          >
            ランダムseed
          </button>
        </div>
        <p className="ots-control-note">
          生成した問題は、同じ形が4個以上ある場合のペアリングも含め、
          答えが1通りだけであることを完全探索で確認します。
        </p>
        <div className="ots-action-row">
          <button className="ots-primary-button" type="submit" disabled={pageState.status === "generating"}>
            {pageState.status === "generating" ? "作っています…" : "この条件でつくる"}
          </button>
          {pageState.status === "ready" ? (
            <>
              <button
                className="ots-secondary-button"
                type="button"
                onClick={() => setShowAnswers((current) => !current)}
              >
                {showAnswers ? "答えを隠す" : "答えを表示"}
              </button>
              <button className="ots-secondary-button" type="button" onClick={handlePrint}>
                印刷
              </button>
            </>
          ) : null}
        </div>
      </form>

      {pageState.status === "idle" ? (
        <section className="ots-empty-state screen-only">
          <h2>生成条件を選んでください</h2>
          <p>「この条件でつくる」を押すまで生成しません。</p>
        </section>
      ) : null}
      {pageState.status === "generating" ? (
        <p className="ots-status screen-only" aria-live="polite">問題を検査しながら作っています…</p>
      ) : null}
      {pageState.status === "error" ? (
        <section className="ots-error screen-only" role="alert">
          <h2>問題を生成できませんでした</h2>
          <p>{pageState.message}</p>
        </section>
      ) : null}
      {pageState.status === "ready" ? (
        <div className="ots-preview-stack">
          <WorksheetPreview worksheet={pageState.worksheet} />
          <AnswerPreview worksheet={pageState.worksheet} hidden={!showAnswers} />
          <DeveloperDiagnostics worksheet={pageState.worksheet} />
        </div>
      ) : null}
    </main>
  );
}

function createRandomSeed(): string {
  const values = new Uint32Array(2);
  globalThis.crypto.getRandomValues(values);
  return `onaji-${[...values].map((value) => value.toString(36)).join("-")}`;
}

function generateWorksheetInWorker(
  input: unknown,
  onCreated: (worker: Worker) => void,
): Promise<Worksheet> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../application/generation-worker.ts", import.meta.url),
      { type: "module" },
    );
    onCreated(worker);
    worker.addEventListener("message", (
      event: MessageEvent<GenerationWorkerResponse>,
    ) => {
      worker.terminate();
      if (event.data.status === "ready") {
        resolve(event.data.worksheet);
      } else {
        reject(new Error(event.data.message));
      }
    }, { once: true });
    worker.addEventListener("error", () => {
      worker.terminate();
      reject(new Error(
        "生成処理を開始できませんでした。ページを再読み込みしてください。",
      ));
    }, { once: true });
    worker.postMessage(input);
  });
}
