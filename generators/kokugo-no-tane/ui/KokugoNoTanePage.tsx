import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { GeneratorModuleProps } from "../../../src/app/generator-module.js";
import { generateWorksheetFromRequest } from "../application/generate-worksheet-use-case.ts";
import {
  AiProxyError,
  checkAiProxy,
  requestStoryPlan,
  type AiProxyHealth,
} from "../infrastructure/ai/ai-proxy-client.ts";
import type {
  BaseGenerationOptions,
  GenerationProfile,
  Grade,
  StoryLength,
  TopicId,
} from "../domain/types/generation.js";
import type {
  ChoiceQuestion,
  Question,
  ReasonAndEmotionLayout,
} from "../domain/types/questions.js";
import type { RichText, RichTextSegment } from "../domain/types/text.js";
import type { MachineCheck, Worksheet } from "../domain/types/worksheet.js";

type GenerationMode = "local" | "ai_proxy";

interface GenerationFormState extends BaseGenerationOptions {
  readonly seed: string;
}

interface UiMessage {
  readonly text: string;
  readonly isError: boolean;
}

const DEFAULT_FORM: GenerationFormState = {
  grade: 1,
  profile: 3,
  length: "standard",
  topic: "auto",
  seed: "tanpopo-001",
};

export function KokugoNoTanePage({ onRequestPrint }: GeneratorModuleProps) {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<GenerationFormState>(() => formFromSearchParams(searchParams));
  const [generationMode, setGenerationMode] = useState<GenerationMode>("local");
  const [aiProxyUrl, setAiProxyUrl] = useState("http://127.0.0.1:8787");
  const [proxyConnection, setProxyConnection] = useState<AiProxyHealth | null>(null);
  const [proxyMessage, setProxyMessage] = useState<UiMessage | null>(null);
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [generationMessage, setGenerationMessage] = useState<UiMessage>({
    text: "生成の準備ができています。",
    isError: false,
  });
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const worksheetHeadingRef = useRef<HTMLHeadingElement>(null);
  const seedInputRef = useRef<HTMLInputElement>(null);
  const autoGenerationStarted = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.printLayout = "vertical";
    return () => { delete document.documentElement.dataset.printLayout; };
  }, []);

  useEffect(() => {
    if (searchParams.get("autogenerate") !== "1" || autoGenerationStarted.current) return;
    autoGenerationStarted.current = true;
    void generate(form);
  }, []);

  async function generate(config: GenerationFormState) {
    const seed = config.seed.trim();
    if (seed.length === 0) {
      seedInputRef.current?.focus();
      setGenerationMessage({ text: "seedを入力してください。", isError: true });
      return;
    }

    const normalizedConfig = { ...config, seed };
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationMessage({ text: "文章の構造と答えの根拠を確認しています…", isError: false });
    try {
      let generatedWorksheet: Worksheet;
      let completionMessage: string;
      if (generationMode === "ai_proxy") {
        try {
          if (proxyConnection === null) {
            const health = await checkAiProxy(aiProxyUrl);
            setProxyConnected(health);
          }
          const proxyResult = await requestStoryPlan(aiProxyUrl, normalizedConfig);
          generatedWorksheet = generateWorksheetFromRequest({
            source: "story-plan.v1",
            ...normalizedConfig,
            storyPlan: proxyResult.story_plan,
            sourceMetadata: {
              candidateId: requiredString(proxyResult.candidate_id, "AI候補ID"),
              requestId: nullableString(proxyResult.request_id),
              model: nullableString(proxyResult.model),
              promptVersion: nullableString(proxyResult.prompt_version),
              promptHash: nullableString(proxyResult.prompt_hash),
              contextVersion: nullableString(proxyResult.context_version),
            },
          });
          setProxyConnected(proxyResult);
          completionMessage = `seed「${seed}」で、AIの物語の種を使った問題を生成しました。`;
        } catch (error) {
          if (fallbackIsForbidden(error)) {
            setProxyDisconnected(error);
            throw error;
          }
          generatedWorksheet = generateWorksheetFromRequest({
            source: "local-fallback",
            ...normalizedConfig,
            errorCode: errorCode(error),
          });
          setProxyDisconnected(error);
          completionMessage = "AIサーバーから物語の種を取得できなかったため、今回はローカルアルゴリズムで生成しました。";
        }
      } else {
        generatedWorksheet = generateWorksheetFromRequest({ source: "local", ...normalizedConfig });
        completionMessage = `seed「${seed}」の問題をローカルアルゴリズムで生成しました。`;
      }

      setWorksheet(generatedWorksheet);
      setAnswerOpen(false);
      setEvidenceOpen(false);
      setGenerationMessage({ text: completionMessage, isError: false });
      requestAnimationFrame(() => {
        worksheetHeadingRef.current?.focus({ preventScroll: true });
        worksheetHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      setWorksheet(null);
      setGenerationError(errorMessage(error));
      setGenerationMessage({
        text: "生成できませんでした。条件または実装状態を確認してください。",
        isError: true,
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function checkProxyConnection() {
    setProxyMessage({ text: "確認中", isError: false });
    try {
      setProxyConnected(await checkAiProxy(aiProxyUrl));
    } catch (error) {
      setProxyDisconnected(error);
    }
  }

  function setProxyConnected(info: AiProxyHealth) {
    setProxyConnection(info);
    const provider = nullableString(info.provider) ?? "openai";
    const model = nullableString(info.model) ?? "unknown";
    const prompt = nullableString(info.prompt_version) ?? "unknown";
    setProxyMessage({ text: `接続済み｜provider: ${provider}／model: ${model}／prompt: ${prompt}`, isError: false });
  }

  function setProxyDisconnected(error: unknown) {
    setProxyConnection(null);
    setProxyMessage({ text: `切断中｜${errorMessage(error)}`, isError: true });
  }

  function updateProxyUrl(value: string) {
    setAiProxyUrl(value);
    setProxyConnection(null);
    setProxyMessage(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void generate(form);
  }

  function randomizeSeed() {
    const nextForm = { ...form, seed: createRandomSeed() };
    setForm(nextForm);

    if (generationMode === "local") {
      void generate(nextForm);
      return;
    }

    setGenerationMessage({
      text: "seedを変更しました。「この条件でつくる」を押すまで生成しません。",
      isError: false,
    });
  }

  const aiEnabled = generationMode === "ai_proxy";
  const generationModeHelp = aiEnabled
    ? "すべての条件をAIへ送り、AIは再挑戦型の物語の種を作ります。本文・問題セット・長さ・根拠距離・表記は既存アルゴリズムが確定します。"
    : "学年・プロファイル・長さ・カテゴリ・seedを、ブラウザ内の決定的アルゴリズムへ適用します。本文構造もseedから選びます。";
  const seedHelp = aiEnabled
    ? "AI生成では候補ID・キャッシュ・来歴に使います。同じseedだけでモデル出力の完全一致は保証しません。"
    : "アルゴリズムでは、本文構造を含め、同じ条件とseedから同じ問題を作ります。";

  return (
    <>
      <header className="app-header screen-only">
        <div className="brand-block">
          <Link className="back-link" to="/">教材ジェネレータ</Link>
          <p className="eyebrow">KOKUGO NO TANE · PROTOTYPE</p>
          <h1>こくごのたね</h1>
          <p className="subtitle">ものがたりを読んで、ことばの根っこを見つけよう。</p>
        </div>
        <button className="secondary-button" type="button" onClick={onRequestPrint}>問題用紙を印刷</button>
      </header>

      <aside className="prototype-notice" aria-label="この問題の利用上の注意">
        <span className="notice-mark" aria-hidden="true">!</span>
        <div>
          <strong>構造的自動検査通過・人間未確認</strong>
          <span>開発確認用プロトタイプ／児童利用・学力判定不可</span>
        </div>
      </aside>

      <main className="app-layout">
        <aside className="control-panel screen-only" aria-labelledby="conditionsHeading">
          <PanelHeading number="01" eyebrow="GENERATE" headingId="conditionsHeading">
            ものがたりの種をえらぶ
          </PanelHeading>

          <form onSubmit={submit}>
            <div className="field-grid">
              <fieldset className="generation-mode-field">
                <legend className="field-label">生成方式</legend>
                <div className="generation-tabs" role="radiogroup" aria-label="生成方式">
                  <GenerationModeOption
                    checked={!aiEnabled}
                    disabled={isGenerating}
                    label="アルゴリズム"
                    value="local"
                    onChange={setGenerationMode}
                  />
                  <GenerationModeOption
                    checked={aiEnabled}
                    disabled={isGenerating}
                    label="AI生成"
                    value="ai_proxy"
                    onChange={setGenerationMode}
                  />
                </div>
                <span className="field-help">{generationModeHelp}</span>
              </fieldset>

              {aiEnabled && (
                <div className="ai-proxy-fields">
                  <label className="field" htmlFor="aiProxyUrlInput">
                    <span className="field-label">AIサーバーURL</span>
                    <input
                      id="aiProxyUrlInput"
                      name="aiProxyUrl"
                      type="url"
                      value={aiProxyUrl}
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={isGenerating}
                      onChange={(event) => updateProxyUrl(event.currentTarget.value)}
                    />
                    <span className="field-help">APIキーはここへ入力しません。ローカルAIサーバーの環境変数だけで管理します。</span>
                  </label>
                  <button
                    className="proxy-check-button"
                    type="button"
                    disabled={isGenerating}
                    onClick={() => void checkProxyConnection()}
                  >
                    接続を確認
                  </button>
                  <p
                    className={`proxy-status${proxyMessage?.isError === true ? " is-error" : proxyConnection !== null ? " is-connected" : proxyMessage !== null ? " is-checking" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {proxyMessage?.text ?? "未確認"}
                  </p>
                </div>
              )}

              <p className="common-settings-label">以下の条件は、どちらの生成方式でも使います。</p>

              <SelectField
                label="学年"
                value={String(form.grade)}
                help="漢字・ふりがなの暫定基準。語彙・文法の学年適合性は未検証です。"
                disabled={isGenerating}
                onChange={(value) => setForm({ ...form, grade: toGrade(value) })}
                options={[["1", "小学1年生"], ["2", "小学2年生"], ["3", "小学3年生"]]}
              />
              <SelectField
                label="生成条件プロファイル"
                value={String(form.profile)}
                help={<> <strong>実測した難易度ではありません。</strong> 気持ちを考える問題で使う、根拠どうしの距離を指定します。</>}
                disabled={isGenerating}
                onChange={(value) => setForm({ ...form, profile: toProfile(value) })}
                options={[
                  ["1", "1 · 根拠はとなり合う"],
                  ["2", "2 · 同じ段落から探す"],
                  ["3", "3 · 複数の文をつなぐ"],
                  ["4", "4 · 複数の段落を読む"],
                  ["5", "5 · 離れた根拠を比べる"],
                ]}
              />
              <SelectField
                label="物語の長さ"
                value={form.length}
                help="生成条件プロファイルとは別に、本文の文量を選びます。"
                disabled={isGenerating}
                onChange={(value) => setForm({ ...form, length: toStoryLength(value) })}
                options={[["short", "短め"], ["standard", "ふつう（おすすめ）"], ["long", "長め"]]}
              />
              <SelectField
                label="題材カテゴリ"
                value={form.topic}
                help="物語の舞台や出来事の種類"
                disabled={isGenerating}
                onChange={(value) => setForm({ ...form, topic: toTopicId(value) })}
                options={[
                  ["auto", "おまかせ"], ["school", "学校"], ["home", "家"],
                  ["nature", "自然"], ["town", "町"], ["animal", "動物"],
                ]}
              />

              <div className="field">
                <label className="field-label" htmlFor="seedInput">seed（候補の識別・再現用）</label>
                <div className="seed-row">
                  <input
                    id="seedInput"
                    name="seed"
                    type="text"
                    value={form.seed}
                    ref={seedInputRef}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={80}
                    required
                    disabled={isGenerating}
                    onChange={(event) => setForm({ ...form, seed: event.currentTarget.value })}
                  />
                  <button
                    className="seed-random-button"
                    type="button"
                    disabled={isGenerating}
                    onClick={randomizeSeed}
                  >
                    ランダムseed
                  </button>
                </div>
                <span className="field-help">{seedHelp}</span>
              </div>
            </div>

            <button className="generate-button" type="submit" disabled={isGenerating}>
              <span>この条件でつくる</span><span aria-hidden="true">→</span>
            </button>
            <p className={`generation-status${generationMessage.isError ? " is-error" : ""}`} role="status" aria-live="polite">
              {generationMessage.text}
            </p>
          </form>
        </aside>

        <section className="output-panel" aria-labelledby="worksheetHeading">
          <div className="output-heading screen-only">
            <PanelHeading number="02" eyebrow="WORKSHEET" headingId="worksheetHeading" headingRef={worksheetHeadingRef}>
              できあがった問題
            </PanelHeading>
            <p>本文を見ながら答えてかまいません。</p>
          </div>

          <article className="worksheet" aria-busy={isGenerating}>
            {generationError !== null ? <GenerationError message={generationError} />
              : worksheet === null ? <EmptyState />
              : <WorksheetView worksheet={worksheet} grade={form.grade} />}
          </article>

          {worksheet !== null && (
            <div className="detail-controls screen-only">
              <DisclosureButton
                controls="answerPanel"
                isOpen={answerOpen}
                closedLabel="解答・解説を見る"
                openLabel="解答・解説を閉じる"
                onClick={() => setAnswerOpen(!answerOpen)}
              />
              {answerOpen && <AnswersPanel questions={worksheet.questions} />}
              <DisclosureButton
                controls="evidencePanel"
                isOpen={evidenceOpen}
                closedLabel="生成根拠・品質を見る"
                openLabel="生成根拠・品質を閉じる"
                onClick={() => setEvidenceOpen(!evidenceOpen)}
              />
              {evidenceOpen && <EvidencePanel worksheet={worksheet} />}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function PanelHeading({
  number,
  eyebrow,
  headingId,
  headingRef,
  children,
}: {
  readonly number: string;
  readonly eyebrow: string;
  readonly headingId: string;
  readonly headingRef?: React.RefObject<HTMLHeadingElement | null>;
  readonly children: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <span aria-hidden="true">{number}</span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId} ref={headingRef} tabIndex={headingRef === undefined ? undefined : -1}>{children}</h2>
      </div>
    </div>
  );
}

function GenerationModeOption({
  value,
  label,
  checked,
  disabled,
  onChange,
}: {
  readonly value: GenerationMode;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: GenerationMode) => void;
}) {
  return (
    <label className="generation-tab">
      <input
        type="radio"
        name="generationMode"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span>{label}</span>
    </label>
  );
}

function SelectField({ label, value, help, disabled, onChange, options }: {
  readonly label: string;
  readonly value: string;
  readonly help: ReactNode;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>)}
      </select>
      <span className="field-help">{help}</span>
    </label>
  );
}

function WorksheetView({ worksheet, grade }: { readonly worksheet: Worksheet; readonly grade: Grade }) {
  const printQuestionPages = paginateQuestions(worksheet.questions);
  return (
    <>
      <section className="worksheet-reading-page">
        <p className="reading-instruction">つぎの　<ruby>文<rt>ぶん</rt></ruby>しょうを　よんで　あとの　もんだいに　こたえましょう</p>
        <h3 className="worksheet-title"><RichTextView value={worksheet.title} /></h3>
        <section className="passage" aria-label="本文">
          {worksheet.passage.paragraphs.map((paragraph) => (
            <p key={paragraph.paragraph_id}><RichTextView value={paragraph} /></p>
          ))}
        </section>
      </section>
      <section className="questions screen-question-sheet">
        <QuestionSheetMeta grade={grade} pageNumber={2} showName />
        <QuestionList questions={worksheet.questions} />
      </section>
      <div className="print-question-pages" aria-hidden="true">
        {printQuestionPages.map((questions, pageIndex) => (
          <section className="questions print-question-sheet" key={questions[0]?.question_id ?? pageIndex}>
            <QuestionSheetMeta grade={grade} pageNumber={pageIndex + 2} showName={pageIndex === 0} />
            <QuestionList questions={questions} startIndex={pageIndex * 3} />
          </section>
        ))}
      </div>
    </>
  );
}

function paginateQuestions(questions: readonly Question[]): readonly (readonly Question[])[] {
  const questionsPerPage = questions.length <= 4 ? 4 : 3;
  return Array.from(
    { length: Math.ceil(questions.length / questionsPerPage) },
    (_, pageIndex) => questions.slice(pageIndex * questionsPerPage, (pageIndex + 1) * questionsPerPage),
  );
}

function QuestionSheetMeta({ grade, pageNumber, showName }: {
  readonly grade: Grade;
  readonly pageNumber: number;
  readonly showName: boolean;
}) {
  return (
    <header className="question-sheet-meta">
      <p className="question-sheet-subject">小学{grade}年・国語</p>
      {showName && <p className="question-sheet-name">なまえ</p>}
      <span className="question-sheet-number">{pageNumber}</span>
    </header>
  );
}

function QuestionList({ questions, startIndex = 0 }: {
  readonly questions: readonly Question[];
  readonly startIndex?: number;
}) {
  return (
    <ol
      className={`question-list question-list-${questions.length}`}
      style={startIndex === 0 ? undefined : { counterReset: `question ${startIndex}` }}
    >
      {questions.map((question) => <QuestionView question={question} key={question.question_id} />)}
    </ol>
  );
}

function QuestionView({ question }: { readonly question: Question }) {
  const layout = question.answer_layout;
  return (
    <li className={`question question-layout-${layout.kind}`}>
      <p className="question-prompt"><RichTextView value={question.prompt} /></p>
      {layout.kind === "choice-list" && isChoiceQuestion(question) ? (
        <ul className="choice-list">
          {question.choices.map((choice, index) => (
            <li key={choice.choice_id}>
              <span className="choice-mark">{index + 1}</span>
              <span><RichTextView value={choice} /></span>
            </li>
          ))}
        </ul>
      ) : layout.kind === "fixed-character-boxes" ? (
        <div className="character-grid" aria-label={`${layout.cells}文字の答えを書く欄`}>
          {Array.from({ length: layout.cells }, (_, index) => <span aria-hidden="true" key={index} />)}
        </div>
      ) : layout.kind === "single-extract" ? (
        <div className="answer-box" aria-label="本文から抜き出した答えを書く欄" />
      ) : layout.kind === "reason-and-emotion" ? (
        <ResponseZones zones={layout.zones} />
      ) : null}
    </li>
  );
}

function isChoiceQuestion(question: Question): question is ChoiceQuestion {
  return "choices" in question;
}

function ResponseZones({ zones }: { readonly zones: ReasonAndEmotionLayout["zones"] }) {
  return (
    <div className="response-zones" aria-label="理由と気持ちを書く欄">
      {zones.map((zone) => (
        <section className="response-zone" key={zone.label}>
          <h4 className="response-zone-label">{zone.label}</h4>
          <div className="response-columns">
            {Array.from({ length: zone.columns }, (_, index) => <span aria-hidden="true" key={index} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function RichTextView({ value }: { readonly value: RichText }) {
  return <>{value.segments.map((segment, index) => <RichTextSegmentView segment={segment} key={`${index}-${segmentKey(segment)}`} />)}</>;
}

function RichTextSegmentView({ segment }: { readonly segment: RichTextSegment }) {
  return segment.type === "ruby"
    ? <ruby>{segment.base}<rt>{segment.reading}</rt></ruby>
    : <>{segment.text}</>;
}

function segmentKey(segment: RichTextSegment): string {
  return segment.type === "ruby" ? `${segment.base}-${segment.reading}` : segment.text;
}

function AnswersPanel({ questions }: { readonly questions: readonly Question[] }) {
  return (
    <section id="answerPanel" className="detail-panel answer-panel" aria-labelledby="answerPanelHeading">
      <h3 id="answerPanelHeading">解答・解説</h3>
      {questions.map((question, index) => (
        <article className="answer-card" key={question.question_id}>
          <h4>問{index + 1}</h4>
          <p><span className="answer-label">答え　</span><RichTextView value={question.answer} /></p>
          {question.scoring_elements.length > 0 && (
            <p><span className="answer-label">採点のポイント　</span>{question.scoring_elements.map((element) => element.description).join("／")}</p>
          )}
          {question.evidence_ids.length > 0 && <p className="diagnostic-note">本文根拠: {question.evidence_ids.join(", ")}</p>}
        </article>
      ))}
    </section>
  );
}

function EvidencePanel({ worksheet }: { readonly worksheet: Worksheet }) {
  const provenance = worksheet.generation_provenance;
  const metadata: readonly (readonly [string, unknown])[] = [
    ["item ID", worksheet.item_id],
    ["seed", provenance.seed],
    ["DB release", provenance.database_release],
    ["lifecycle", worksheet.lifecycle_status],
    ["漢字・ふりがな基準", `小学${worksheet.grade}年暫定（語彙学年は未検証）`],
    ["生成条件", `profile ${worksheet.generation_profile}（実測難易度ではない）`],
    ["物語の長さ", `${lengthLabel(worksheet.story_length)}（${worksheet.passage.character_count}字）`],
    ["題材", worksheet.requested_topic ?? "auto"],
    ["blueprint", provenance.blueprint_id],
    ["本文構造", provenance.story_structure_id],
    ["人物構造", worksheet.story.character_structure === "late_arrival_three_person" ? "途中参加の3人" : "2人"],
    ["問題セット", provenance.question_set_blueprint_id],
    ["生成方式", provenance.generation_source],
    ["AI model", provenance.model ?? "未使用"],
    ["AI candidate", provenance.candidate_id ?? "未使用"],
  ];
  const rubyCount = worksheet.ruby_plan.filter((entry) => entry.render_ruby).length;
  const repeatCount = worksheet.ruby_plan.filter((entry) => entry.reason === "repeat_occurrence").length;

  return (
    <section id="evidencePanel" className="detail-panel evidence-panel" aria-labelledby="evidencePanelHeading">
      <h3 id="evidencePanelHeading">生成根拠・品質</h3>
      <p className="diagnostic-note">これは構造・来歴・表記・テンプレート契約の自動検査結果です。文章の自然さ、教育的妥当性、人間による校閲、児童にとっての難易度を保証しません。</p>
      <dl className="diagnostic-grid">
        {metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{printable(value)}</dd></div>)}
      </dl>
      <h4 className="checks-heading">自動検査</h4>
      <ul className="check-list">
        {worksheet.machine_checks.checks.map((check) => <MachineCheckView check={check} key={check.check_id} />)}
      </ul>
      <h4 className="checks-heading">品質評価の状態</h4>
      <p className="diagnostic-note">
        {worksheet.machine_checks.quality_assessment.status} — {worksheet.machine_checks.quality_assessment.reason}
      </p>
      <h4 className="checks-heading">ふりがな計画</h4>
      <p className="diagnostic-note">ふりがな表示 {rubyCount}件、再出省略 {repeatCount}件。本文内では初出に読みを示し、同じ語の再出では省略します。</p>
    </section>
  );
}

function MachineCheckView({ check }: { readonly check: MachineCheck }) {
  return (
    <li className={check.passed ? "check-pass" : "check-fail"}>
      <span className="check-symbol">{check.passed ? "✓ 合格" : "× 不合格"}</span>
      <span>{check.check_id}</span>
    </li>
  );
}

function DisclosureButton({ controls, isOpen, closedLabel, openLabel, onClick }: {
  readonly controls: string;
  readonly isOpen: boolean;
  readonly closedLabel: string;
  readonly openLabel: string;
  readonly onClick: () => void;
}) {
  return (
    <button className="detail-toggle" type="button" aria-expanded={isOpen} aria-controls={controls} onClick={onClick}>
      <span>{isOpen ? openLabel : closedLabel}</span><span aria-hidden="true">{isOpen ? "−" : "＋"}</span>
    </button>
  );
}

function EmptyState() {
  return <div className="empty-state"><span className="seed-illustration" aria-hidden="true">⌁</span><p>左の条件をえらんで、ものがたりの種をまいてください。</p></div>;
}

function GenerationError({ message }: { readonly message: string }) {
  return <div className="generation-error" role="alert"><strong>問題を生成できませんでした</strong><p>{message}</p></div>;
}

function formFromSearchParams(params: URLSearchParams): GenerationFormState {
  return {
    grade: isGrade(params.get("grade")) ? Number(params.get("grade")) as Grade : DEFAULT_FORM.grade,
    profile: isProfile(params.get("profile")) ? Number(params.get("profile")) as GenerationProfile : DEFAULT_FORM.profile,
    length: isStoryLength(params.get("length")) ? params.get("length") as StoryLength : DEFAULT_FORM.length,
    topic: isTopicId(params.get("topic")) ? params.get("topic") as TopicId : DEFAULT_FORM.topic,
    seed: (params.get("seed")?.slice(0, 80) || DEFAULT_FORM.seed),
  };
}

function isGrade(value: string | null): boolean { return value === "1" || value === "2" || value === "3"; }
function isProfile(value: string | null): boolean { return value !== null && ["1", "2", "3", "4", "5"].includes(value); }
function isStoryLength(value: string | null): value is StoryLength { return value === "short" || value === "standard" || value === "long"; }
function isTopicId(value: string | null): value is TopicId { return value !== null && ["auto", "school", "home", "nature", "town", "animal"].includes(value); }

function toGrade(value: string): Grade {
  if (isGrade(value)) return Number(value) as Grade;
  throw new TypeError(`unsupported grade: ${value}`);
}

function toProfile(value: string): GenerationProfile {
  if (isProfile(value)) return Number(value) as GenerationProfile;
  throw new TypeError(`unsupported profile: ${value}`);
}

function toStoryLength(value: string): StoryLength {
  if (isStoryLength(value)) return value;
  throw new TypeError(`unsupported story length: ${value}`);
}

function toTopicId(value: string): TopicId {
  if (isTopicId(value)) return value;
  throw new TypeError(`unsupported topic: ${value}`);
}

function createRandomSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `tane-${[...values].map((value) => value.toString(36).padStart(7, "0")).join("")}`;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requiredString(value: unknown, label: string): string {
  const parsed = nullableString(value);
  if (parsed === null) {
    throw new AiProxyError(`${label}がAIサーバーの応答にありません。`, { code: "INVALID_PROXY_RESPONSE" });
  }
  return parsed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string {
  return error instanceof AiProxyError ? error.code : "AI_PROXY_ERROR";
}

function fallbackIsForbidden(error: unknown): boolean {
  return error instanceof AiProxyError && !error.fallbackAllowed;
}

function lengthLabel(length: StoryLength): string {
  return { short: "短め", standard: "ふつう", long: "長め" }[length];
}

function printable(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
