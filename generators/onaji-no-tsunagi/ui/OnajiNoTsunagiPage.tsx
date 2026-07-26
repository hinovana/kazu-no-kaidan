/**
 * 生成条件入力、Web Worker実行、問題・解答previewを統括する教材画面。
 *
 * 通常生成と原本参照コーパス確認の画面modeを同じSPA入口で切り替える。
 *
 * @packageDocumentation
 */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { GeneratorModuleProps } from "../../../src/app/generator-module.ts";
import {
  useWorksheetGeneration,
  type WorksheetGenerationState,
} from "./use-worksheet-generation.ts";
import { AnswerPreview } from "./AnswerPreview.tsx";
import { DeveloperDiagnostics } from "./DeveloperDiagnostics.tsx";
import { ReferenceCorpusReviewPage } from "./ReferenceCorpusReviewPage.tsx";
import {
  WorksheetGenerationControls,
  type WorksheetGenerationForm,
} from "./WorksheetGenerationControls.tsx";
import { WorksheetPreview } from "./WorksheetPreview.tsx";

const INITIAL_FORM: WorksheetGenerationForm = {
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
  const [form, setForm] = useState<WorksheetGenerationForm>(INITIAL_FORM);
  const [showAnswers, setShowAnswers] = useState(false);
  const generation = useWorksheetGeneration();

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

      <WorksheetGenerationControls
        form={form}
        generating={generation.state.status === "generating"}
        hasWorksheet={generation.state.status === "ready"}
        showAnswers={showAnswers}
        onChange={setForm}
        onGenerate={async () => {
          setShowAnswers(false);
          await generation.generate(form);
        }}
        onToggleAnswers={() => setShowAnswers((current) => !current)}
        onPrint={handlePrint}
      />

      <GenerationResult
        state={generation.state}
        showAnswers={showAnswers}
      />
    </main>
  );
}

function GenerationResult({
  state,
  showAnswers,
}: {
  readonly state: WorksheetGenerationState;
  readonly showAnswers: boolean;
}) {
  if (state.status === "idle") {
    return (
      <section className="ots-empty-state screen-only">
        <h2>生成条件を選んでください</h2>
        <p>「この条件でつくる」を押すまで生成しません。</p>
      </section>
    );
  }
  if (state.status === "generating") {
    return (
      <p className="ots-status screen-only" aria-live="polite">
        問題を検査しながら作っています…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <section className="ots-error screen-only" role="alert">
        <h2>問題を生成できませんでした</h2>
        <p>{state.message}</p>
      </section>
    );
  }
  return (
    <div className="ots-preview-stack">
      <WorksheetPreview worksheet={state.worksheet} />
      <AnswerPreview worksheet={state.worksheet} hidden={!showAnswers} />
      <DeveloperDiagnostics worksheet={state.worksheet} />
    </div>
  );
}
