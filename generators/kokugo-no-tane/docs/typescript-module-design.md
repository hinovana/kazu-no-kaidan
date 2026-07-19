# こくごのたね TypeScriptモジュール化・最適化設計書

| 項目 | 値 |
| --- | --- |
| 文書状態 | 設計草案 |
| 文書版 | `kokugo-no-tane-typescript-module.v0.3-draft` |
| 最終更新日 | 2026-07-18 |
| 対象 | `generators/kokugo-no-tane/` |
| 上位設計 | [教材ジェネレータ SPAフレームワーク設計書](../../../docs/spa-framework-design.md) |
| 実装状態 | ブラウザ・作問domain・blueprint・AI client・NodeプロキシをTypeScript化し、React UIをルートSPAへ登録。旧runtime JavaScript入口は互換転送へ置換済み |
| 移行原則 | 作問結果と印刷契約を保った段階移行 |

## 1. 目的

本書は、「こくごのたね」を教材ジェネレータSPAの最初のモジュールとして登録し、現行JavaScript実装をTypeScriptへ移行する際の責務分割、型契約、runtime validation、データ構造、UI、AIプロキシ、テスト、移行順を定める。

TypeScript化の目的は、ファイル拡張子を変えることではない。次の問題を型と依存方向で解消する。

- 共通生成エンジンが `story-plan.v1` と性格語を前提にしている。
- 題材データと生成ロジックが同じblueprintファイルへ混在している。
- AI設計図に必須だが本文へ反映されない項目がある。
- 本文長、補助文数、段落化、根拠距離の責務が分散している。
- UIが現在の設問typeを直接分岐している。
- 漢字・語彙データが直接importへ固定されている。
- 外部JSONにTypeScript型だけでは保証できないruntime境界がある。

## 2. 現行機能の前提

移行開始時点の現行実装は、少なくとも次を持つ。

- 小学1〜3年生
- 生成難度プロファイル1〜5
- 本文長3段階
- seedによる決定的生成
- `story-standard-4q.v1`／`story-retry-craft.v1`
- `story-clue-discovery-4q.v1`／`story-clue-discovery.v1`
- ローカル生成時の2構造からの決定的選択
- AI `story-plan.v1` は再挑戦型だけに対応
- 標準4問、正答、根拠ID、採点要素
- 漢字候補版、限定語彙、初出ふりがな
- A4横・縦書き・2ページ印刷
- ローカルAIプロキシ、候補保存、フォールバック
- 1,350件コーパステスト

TypeScript化だけを理由に、これらの意味、既定値、seed選択、問題文、正答、根拠配置、印刷ページ数を変更しない。

### 2.1 2026年7月18日時点の実装境界

TypeScript `5.9.3` を固定し、`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` を有効にした。次を実装済みとする。

- `domain/types/` に `GenerationRequest`、`Worksheet`、`Question`、`StoryPlanV1` と識別子型を定義した。
- ブラウザまたは外部コードからの生成入力を `unknown` として受け、`application/parse-generation-request.ts` でruntime検証する。
- `domain/generation/`、`domain/blueprints/`、`domain/language/` と `infrastructure/language/` をTypeScriptへ移し、作問結果を既存回帰テストと1,350件コーパスで保護する。
- `infrastructure/ai/ai-proxy-client.ts` と `server/*.ts` をブラウザ・Node別のtsconfigで検査する。
- `ui/KokugoNoTanePage.tsx` を `module.tsx` から公開し、ルートの型付きregistryへdynamic importで登録する。
- ルートをVite・React・React RouterのHash Routerへ移し、未移行2教材はlegacy entryとして維持する。
- 旧 `/generators/kokugo-no-tane/` はSPA Hash URLへ転送し、旧 `src/app.js` は削除した。

TypeScript化では作問結果を変えないことを優先したため、`pickTrait` の責務再配置、`responseLayout` のdomain追加、reducer分割、content packの物理ファイル分割は最適化候補として残す。これらはruntime JavaScriptの残存ではない。

## 3. 設計原則

### 3.1 データと振る舞いを分ける

- scenario、trait、補助文は純粋なreadonlyデータとして表現する。
- データ配列へ関数を埋め込まない。
- blueprintはデータを受け取り、本文・設問・検査へ変換する振る舞いを持つ。
- 外部入力はadapterで構造固有contextへ正規化する。

### 3.2 継承よりcompositionを使う

- 入力データにclassを要求しない。
- blueprintはTypeScript `interface` で契約する。
- 共通の標準4問検査など、実際に共有される関数をcompositionする。
- `abstract class` は共通状態・ライフサイクル実装が必要と確認された場合だけ追加する。

### 3.3 compile-timeとruntimeを分けない

- TypeScript型は開発時の契約である。
- AIレスポンス、JSON、URL、フォーム値は `unknown` として受ける。
- runtime parserを通過した値だけをdomainへ渡す。
- Structured Outputs用JSON Schemaとブラウザ・サーバーのruntime parserを同じ契約から供給する。

### 3.4 domainをUIとinfrastructureから独立させる

```text
ui ------> application ------> domain
 |               ^               ^
 |               |               |
 +------ infrastructure ---------+

server ------> shared runtime schema + server infrastructure
```

domainはReact、DOM、CSS、`fetch`、OpenAI SDK、Node.js `fs` をimportしない。

## 4. 目標ディレクトリ構成

```text
generators/kokugo-no-tane/
├── module.tsx
├── manifest.ts
├── docs/
├── domain/
│   ├── types/
│   │   ├── ids.ts
│   │   ├── generation.ts
│   │   ├── worksheet.ts
│   │   ├── questions.ts
│   │   └── text.ts
│   ├── generation/
│   │   ├── generate-worksheet.ts
│   │   ├── random.ts
│   │   ├── paragraph-layout.ts
│   │   └── common-checks.ts
│   ├── blueprints/
│   │   ├── blueprint.ts
│   │   ├── registry.ts
│   │   ├── selection.ts
│   │   ├── standard-four-question-checks.ts
│   │   ├── story-retry-craft/
│   │   │   ├── blueprint.ts
│   │   │   ├── context.ts
│   │   │   ├── content-pack.ts
│   │   │   ├── content-validator.ts
│   │   │   ├── local-input-adapter.ts
│   │   │   ├── story-plan-v1-adapter.ts
│   │   │   └── checks.ts
│   │   └── story-clue-discovery/
│   │       ├── blueprint.ts
│   │       ├── context.ts
│   │       ├── content-pack.ts
│   │       ├── content-validator.ts
│   │       ├── local-input-adapter.ts
│   │       └── checks.ts
│   ├── language/
│   │   ├── language-data-provider.ts
│   │   ├── orthography.ts
│   │   ├── ruby-planner.ts
│   │   └── template-renderer.ts
│   └── schemas/
│       ├── story-plan-v1.ts
│       └── generation-request.ts
├── application/
│   ├── generate-worksheet-use-case.ts
│   ├── generation-controller.ts
│   └── ports.ts
├── infrastructure/
│   ├── language/
│   │   └── prototype-language-data-provider.ts
│   └── ai/
│       ├── ai-proxy-client.ts
│       └── ai-proxy-contract.ts
├── ui/
│   ├── KokugoNoTanePage.tsx
│   ├── state/
│   │   └── generation-reducer.ts
│   ├── components/
│   ├── worksheet/
│   ├── answers/
│   ├── diagnostics/
│   ├── kokugo-no-tane.css
│   └── print.css
├── server/
│   ├── ai-proxy.ts
│   ├── openai-story-plan.ts
│   ├── story-plan-context.ts
│   ├── candidate-store.ts
│   └── config.ts
└── tests/
```

移行の途中で、最初からこの全ファイルを空で作らない。既存ファイルを責務単位で移すときに必要なファイルだけ追加する。小さすぎるファイル分割によって処理順が追えなくなる場合は、同じ層のファイルを統合してよい。

## 5. SPAモジュール境界

`module.tsx` はホストからimport可能な唯一の公開入口とする。

```ts
import type { LoadedGeneratorModule } from "../../src/app/generator-module";
import { KokugoNoTanePage } from "./ui/KokugoNoTanePage";

const generatorModule = {
  Page: KokugoNoTanePage,
} satisfies LoadedGeneratorModule;

export default generatorModule;
```

ただし、教材モジュールからホスト型を深い相対パスで参照し続ける構成は避ける。実装時はホストが公開する最小の型入口を用意するか、`import type` 専用aliasを設定する。

ホストへ公開しないもの：

- `Worksheet`
- `StoryPlanV1`
- `Blueprint`
- `Question`
- `LanguageDataProvider`
- AI候補・プロキシ内部型

これらは国語モジュール内部で完結させる。

## 6. 基本型

### 6.1 値域を型にする

```ts
export type Grade = 1 | 2 | 3;
export type GenerationProfile = 1 | 2 | 3 | 4 | 5;
export type StoryLength = "short" | "standard" | "long";

declare const blueprintIdBrand: unique symbol;
declare const storyStructureIdBrand: unique symbol;
declare const lexemeIdBrand: unique symbol;

export type BlueprintId = string & {
  readonly [blueprintIdBrand]: true;
};

export type StoryStructureId = string & {
  readonly [storyStructureIdBrand]: true;
};

export type LexemeId = string & {
  readonly [lexemeIdBrand]: true;
};
```

外部文字列を `as BlueprintId` で直接変換しない。registry parserまたはID生成関数を通す。brandを使うことで、blueprint IDと本文構造IDの取り違えを防ぐ。

### 6.2 入力を判別可能なunionにする

```ts
export interface BaseGenerationOptions {
  readonly grade: Grade;
  readonly profile: GenerationProfile;
  readonly length: StoryLength;
  readonly seed: string | number;
}

export interface LocalGenerationRequest extends BaseGenerationOptions {
  readonly source: "local";
  readonly topic: TopicId | "auto";
  readonly blueprintId?: BlueprintId;
}

export interface StoryPlanGenerationRequest extends BaseGenerationOptions {
  readonly source: "story-plan.v1";
  readonly topic: TopicId | "auto";
  readonly storyPlan: StoryPlanV1;
  readonly sourceMetadata: AiSourceMetadata;
}

export type GenerationRequest =
  | LocalGenerationRequest
  | StoryPlanGenerationRequest;
```

`storyPlan?: object` と `sourceMetadata?: object` を独立したoptional値にしない。AI設計図があるのにcandidate IDがない、ローカル生成なのにmodel名だけある、といった不正な組合せを型で表現不能にする。

## 7. Blueprint interface

共通エンジンから構造固有の `pickTrait()` と `parseStoryPlan()` を除外する。各blueprintは、対応入力を自分のcontextへ変換する。

```ts
export interface BlueprintCapabilities<TInputKind extends string> {
  readonly inputKinds: readonly TInputKind[];
  readonly grades: readonly Grade[];
  readonly lengths: readonly StoryLength[];
  readonly topics: readonly TopicId[];
}

export interface BlueprintBuildServices {
  readonly random: RandomSource;
  readonly language: LanguageDataProvider;
}

export interface StoryBuildResult<TContext> {
  readonly context: TContext;
  readonly title: TextTemplate;
  readonly sentences: readonly StorySentenceDraft[];
}

export interface Blueprint<TRequest extends GenerationRequest, TContext> {
  readonly id: BlueprintId;
  readonly storyStructureId: StoryStructureId;
  readonly textType: "narrative";
  readonly genre: "物語文";
  readonly anchorIds: readonly AnchorId[];
  readonly capabilities: BlueprintCapabilities<TRequest["source"]>;

  supports(request: GenerationRequest): request is TRequest;

  normalizeInput(
    request: TRequest,
    services: BlueprintBuildServices,
  ): TContext;

  buildStory(
    context: TContext,
    options: StoryBuildOptions,
    services: BlueprintBuildServices,
  ): StoryBuildResult<TContext>;

  buildQuestions(
    context: TContext,
    evidence: EvidenceMap,
    services: BlueprintBuildServices,
  ): readonly QuestionDraft[];

  buildStoryMetadata(context: TContext): StoryMetadata;

  runMachineChecks(worksheet: Worksheet): readonly MachineCheck[];
}
```

共通エンジンは `TContext` の内容を読まない。性格語、手がかり、失敗、期待、発見は各contextに閉じる。

### 7.1 入力互換性

| blueprint | `local` | `story-plan.v1` |
| --- | --- | --- |
| `story-standard-4q.v1` | 対応 | 対応 |
| `story-clue-discovery-4q.v1` | 対応 | 非対応 |

registryは入力kindとblueprint capabilitiesを生成前に照合する。AI生成時に非対応blueprintを選んでからfallbackするのではなく、選択段階で候補から除外する。

## 8. Blueprint選択と共通エンジン

処理順は次とする。

```text
フォーム・AI client
   ↓ runtime parse
GenerationRequest
   ↓
resolveBlueprint(request)
   ↓ capabilities確認
blueprint.normalizeInput(request)
   ↓
blueprint.buildStory(context)
   ↓
共通表記・ふりがな・段落処理
   ↓
blueprint.buildQuestions(context, evidence)
   ↓
共通検査 + blueprint固有検査
   ↓
Worksheet
```

共通エンジンが知ってよいもの：

- seedと乱数
- grade、profile、lengthの基本値域
- 表記・ふりがなprovider
- sentence ID、paragraph ID、evidence IDの組立て
- provenance、ライフサイクル
- 共通のschema・参照・文字数検査

共通エンジンが知ってはならないもの：

- 性格語の選択
- `story-plan.v1` のparse
- 「失敗」「やり直し」「手がかり」などの意味
- Q2、Q4の固定文言
- 構造ごとの補助文カテゴリ

## 9. Content Pack

### 9.1 純粋データ契約

```ts
export interface RetryCraftScenarioRecord {
  readonly id: string;
  readonly category: TopicCategory;
  readonly topicWords: readonly string[];
  readonly locationLexemeId: LexemeId;
  readonly protagonist: CharacterRecord;
  readonly supportingCharacter: CharacterRecord;
  readonly object: TemplateSource;
  readonly action: TemplateSource;
  readonly problem: TemplateSource;
  readonly decision: TemplateSource;
  readonly resolution: TemplateSource;
}

export interface TraitRecord {
  readonly id: string;
  readonly term: string;
  readonly sentence: TemplateSource;
  readonly expectationTemplateId: string;
}

export interface ContentPack<TScenario> {
  readonly id: string;
  readonly version: string;
  readonly scenarios: readonly TScenario[];
  readonly traits: readonly TraitRecord[];
  readonly detailsByStage: Readonly<
    Record<string, readonly TemplateSource[]>
  >;
}
```

`TraitRecord` へ関数を埋め込まず、`expectationTemplateId` をblueprint内の生成戦略へ解決する。データ更新だけで実行コードが混入しないようにする。

### 9.2 登録時検証

```ts
export function defineContentPack<TScenario>(
  value: ContentPack<TScenario>,
  validate: (value: unknown) => readonly string[],
): Readonly<ContentPack<TScenario>> {
  const issues = validate(value);
  if (issues.length > 0) {
    throw new TypeError(`invalid content pack: ${issues.join("; ")}`);
  }
  return deepFreeze(value);
}
```

少なくとも次を起動時またはテスト時に検証する。

- ID重複がない。
- 参照するlexeme IDがlanguage providerに存在する。
- stage名がblueprintの挿入点と一致する。
- 必須slotが存在する。
- 禁止された漢字や未解析placeholderがない。
- 問題・決定・解決の文末契約が成立する。

### 9.3 テンプレート表現

現行の `|` と `{{lexeme}}` を一度に全廃すると出力差分が大きくなるため、移行初期は次の境界を作る。

```ts
declare const templateSourceBrand: unique symbol;

export type TemplateSource = string & {
  readonly [templateSourceBrand]: true;
};

export function parseTemplateSource(input: string): TemplateSource;
```

content pack登録時にparserを通し、未定義lexeme、壊れたplaceholder、連続phrase markerを拒否する。出力同値性を確保した後、必要ならtoken配列またはASTへ移行する。AST化をTypeScript移行の必須条件にはしない。

## 10. 言語データprovider

```ts
export interface Lexeme {
  readonly id: LexemeId;
  readonly surface: string;
  readonly reading: string;
  readonly vocabularyGrade: Grade;
}

export interface LanguageDataProvider {
  readonly releaseId: string;
  readonly vocabularySource: string;

  getKnownKanji(grade: Grade): ReadonlySet<string>;
  resolveLexeme(id: LexemeId): Lexeme | undefined;
  requireLexeme(id: LexemeId): Lexeme;
  isKnownOrthography(surface: string, grade: Grade): boolean;
}
```

`generateWorksheet()` は `PROTOTYPE_LEXICON` や漢字配列を直接importしない。application層が `PrototypeLanguageDataProvider` を構築し、domainへ注入する。

ブラウザ用漢字projectionとNode側JSONのrelease IDが一致することを契約テストで保証する。正式DBへ移行するときはprovider実装を差し替え、domainの生成処理を変更しない。

## 11. 外部入力とruntime schema

### 11.1 StoryPlanV1

JSON Schemaを外部契約の正本とする。同じschema objectを次で共有する。

- OpenAI Structured Outputs
- Nodeプロキシのレスポンス検証
- ブラウザAI clientのレスポンス検証
- fixture検証
- `StoryPlanV1` TypeScript型

公開関数は次の形にする。

```ts
export const STORY_PLAN_V1_SCHEMA = { /* JSON Schema */ } as const;

export interface StoryPlanV1 {
  // schemaと同期した必須フィールド
}

export function parseStoryPlanV1(input: unknown): StoryPlanV1;
```

型とschemaを別々に手作業で維持する場合は、全fixtureを双方へ通す契約テストを必須にする。実装時にschemaから型を導出するライブラリを採用する場合は、ブラウザbundle量、Node互換性、Structured Outputsへ渡すJSON Schemaの再現性を確認して版を固定する。

### 11.2 未使用入力を残さない

各StoryPlanフィールドについて、次のいずれかを設計書とadapterテストで明示する。

1. 本文・設問へ使用する。
2. metadataだけへ使用する。
3. 現行構造では受理しない。

`setting.name`、人物の `role`、`emotion.before`、`emotion.after`、`evidence_requirements` を必須のまま無視してはならない。対応方針を決めるまで、少なくとも「metadataだけ」「未対応として拒否」を区別する。

乱数とitem hashへ混ぜる値は、adapterが返した正規化済みcontextのうち、生成結果へ意味を持つcanonical inputだけとする。本文へ使わない説明用metadataの変更によって、無関係な補助文や選択肢順が変わらないようにする。

## 12. 設問型とUI契約

### 12.1 設問union

```ts
interface QuestionBase {
  readonly questionId: string;
  readonly prompt: RichText;
  readonly answer: RichText;
  readonly evidenceIds: readonly SentenceId[];
  readonly scoringElements: readonly ScoringElement[];
  readonly points: number;
}

export interface ExtractQuestion extends QuestionBase {
  readonly kind: "extract";
  readonly responseLayout:
    | { readonly kind: "character-grid"; readonly cells: number }
    | { readonly kind: "extract-box"; readonly lines: number };
}

export interface ChoiceQuestion extends QuestionBase {
  readonly kind: "choice";
  readonly choices: readonly Choice[];
  readonly correctChoiceId: string;
}

export interface OpenResponseQuestion extends QuestionBase {
  readonly kind: "open-response";
  readonly responseLayout: {
    readonly kind: "labeled-zones";
    readonly zones: readonly ResponseZone[];
  };
}

export type Question =
  | ExtractQuestion
  | ChoiceQuestion
  | OpenResponseQuestion;
```

UIは `extract_explicit_trait_term` のような測定上の詳細typeから紙面を推測しない。domainが `responseLayout` を明示し、UIは判別可能なunionを網羅的に描画する。

```ts
function renderQuestion(question: Question): ReactNode {
  switch (question.kind) {
    case "extract":
      return <ExtractQuestionView question={question} />;
    case "choice":
      return <ChoiceQuestionView question={question} />;
    case "open-response":
      return <OpenResponseQuestionView question={question} />;
    default:
      return assertNever(question);
  }
}
```

## 13. React UI設計

### 13.1 コンポーネント境界

```text
KokugoNoTanePage
├── PrototypeNotice
├── GenerationPanel
│   ├── GenerationModeField
│   ├── GradeField
│   ├── ProfileField
│   ├── LengthField
│   ├── TopicField
│   ├── SeedField
│   └── AiProxyConnectionPanel
├── WorksheetView
│   ├── PassageView
│   └── QuestionList
├── AnswerPanel
└── DiagnosticsPanel
```

Reactコンポーネントから直接生成アルゴリズムを呼び分けず、application use caseを1つ呼ぶ。UIは `document.querySelector`、`replaceChildren`、手動イベント登録を使用しない。

### 13.2 状態

画面状態はreducerで明示する。

```ts
type GenerationUiState =
  | { readonly status: "idle" }
  | { readonly status: "generating"; readonly requestId: string }
  | { readonly status: "success"; readonly worksheet: Worksheet }
  | { readonly status: "error"; readonly error: PublicGenerationError };
```

AI接続確認と問題生成の競合を避けるため、非同期処理ごとにrequest IDまたはAbortControllerを持つ。古いリクエストの完了で新しい画面状態を上書きしない。

### 13.3 印刷

- 共通SPAヘッダ・フッタは印刷しない。
- 国語モジュールの問題・解答紙面だけを印刷rootへ置く。
- A4横、縦書き、本文と設問の2ページ契約を維持する。
- モーダルや折りたたみ状態に関係なく、印刷対象は明示したDOMへ固定する。
- 画面用CSS Modulesと `print.css` の責務を分ける。

`window.print()` はUI層だけが呼ぶ。domainとapplication層へ印刷処理を置かない。

## 14. Application層とports

```ts
export interface StoryPlanProvider {
  getStoryPlan(
    request: StoryPlanProviderRequest,
    signal: AbortSignal,
  ): Promise<StoryPlanCandidate>;
}

export interface GenerateWorksheetDependencies {
  readonly language: LanguageDataProvider;
  readonly storyPlanProvider?: StoryPlanProvider;
  readonly clock: Clock;
}
```

application層は次を担当する。

- UI入力のruntime parse
- AI proxyを使うかローカル生成するかのユースケース制御
- fallback可否の適用
- domain `generateWorksheet()` の呼出し
- UIへ公開可能なエラーへの変換

domainはHTTP status、CORS、API quota、OpenAI model名を知らない。これらはinfrastructureとprovenance metadataの境界で扱う。

## 15. AIプロキシとNode TypeScript

serverはブラウザbundleへ含めない。`server/*.ts` はNode用tsconfigで型検査し、実行方法は実装時に次のいずれかへ固定する。

- TypeScriptをNode実行用JavaScriptへ事前compileする。
- 開発専用TypeScript runnerで起動し、本番・CIはcompile済み出力を使う。

実行時方式を曖昧にしたまま複数入口を残さない。

AIプロキシは現在の次の契約を維持する。

- loopback限定
- APIキーは環境変数
- Origin allowlist
- `GET /health`
- `POST /api/story-plan`
- request size、rate limit、timeout、retry
- raw候補とvalidated候補の分離
- quota・認証・schema・内容エラーの安全な写像

ブラウザとserverで共有するのは、protocol型、JSON Schema、公開エラーコードだけとする。OpenAI SDKの型をブラウザへexportしない。

## 16. エラー型

```ts
export type GenerationErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_BLUEPRINT_INPUT"
  | "CONTENT_PACK_INVALID"
  | "LANGUAGE_DATA_MISSING"
  | "MACHINE_CHECK_FAILED"
  | "AI_PROXY_UNREACHABLE"
  | "AI_TIMEOUT"
  | "AI_QUOTA_EXCEEDED"
  | "AI_SCHEMA_INVALID"
  | "AI_CONTENT_REJECTED";

export interface PublicGenerationError {
  readonly code: GenerationErrorCode;
  readonly message: string;
  readonly fallbackAllowed: boolean;
}
```

`catch (error)` は `unknown` として扱い、境界関数で既知エラーへ変換する。内部stack、OpenAIレスポンス本文、ファイルパス、APIキーを画面へ出さない。

## 17. seed・hash・来歴の互換性

### 17.1 同値性の分類

TypeScript移行では次を分ける。

1. **完全一致対象**：題名、本文、設問、選択肢順、正答、根拠、ふりがな、段落、本文構造選択。
2. **意味一致対象**：内部objectのproperty順、React内部DOM属性順。
3. **変更許可対象**：実装版、build版など、移行を記録する来歴フィールド。

`generator_version` を更新する場合は、その差だけを許容する比較projectionをテストに明示する。問題内容の差を「バージョン差」として一括除外しない。

### 17.2 乱数消費順

- random関数の実装を移行中に変更しない。
- データ配列の順序を型整理だけで並べ替えない。
- object列挙順に依存する箇所を明示する。
- blueprint選択に使うhash入力を固定する。
- AI入力は、意味のある正規化済みフィールドだけをcanonical signatureへ含める。この変更で既存AI fixture出力が変わる場合は、アルゴリズム変更として別versionにする。

## 18. テスト設計

### 18.1 型検査

- `strict` 下でerrorなし。
- `any` の使用箇所をallowlist化しない。
- blueprintの非対応inputがcompile-timeまたは解決時に拒否される。
- 設問union追加時にUIの未実装分岐がerrorになる。

### 18.2 runtime契約

- content packの欠損、重複ID、未知lexemeを拒否する。
- JSON Schema不適合のStoryPlanを拒否する。
- AI用StoryPlanを手がかり発見型へ渡せない。
- language releaseとprojectionの版不一致を検出する。

### 18.3 作問回帰

- 現行fixtureの旧JS出力と新TS出力を差分比較する。
- 2つのblueprintを明示選択した出力を比較する。
- seedによる自動構造選択を比較する。
- 3学年 × 5プロファイル × 3本文長 × 30seedの1,350件を再実行する。
- item ID、正答一意性、根拠距離、文字数、ふりがなを検査する。
- AI fixtureとfallbackを比較する。

### 18.4 UI・印刷

- フォームの既定値と説明を比較する。
- ローカル生成、AI成功、fallback不可、fallback可を確認する。
- 問題、解答、診断パネルを確認する。
- A4横・縦書き・2ページ、欠落、重なり、はみ出しを確認する。
- SPA共通シェルが印刷へ出ないことを確認する。

実APIテストは料金と利用枠に依存するため、通常の完了ゲートへ含めず、明示実行のsmoke testとして維持する。

## 19. 移行手順

### フェーズ0：基準固定

- [x] 現行JS版の全テストを成功させる。
- [x] 代表seed、AI fixture、フォールバックについて、旧入口と新入口の出力完全一致テストを追加する。
- [x] ブラウザ画面と既存の2ページ印刷結果を基準として確認する。
- [x] 1,350件コーパスで2つのblueprintが生成されることを確認する。

### フェーズ1：型とruntime境界

- [x] 基本型、Worksheet、Question、StoryPlanV1を定義する。
- [x] 外部入力parserを追加する。
- [x] JS実装から型付き入口を呼び、まだ生成処理を変更しない。

### フェーズ2：domain TypeScript化

- [x] random、text renderer、language providerを移行する。
- [x] 共通エンジンを移行する。
- [x] 移行前後をapplication境界のdifferential testで保護する。

### フェーズ3：blueprintとcontent pack

- [x] 再挑戦型をgeneric interfaceへ適合させる。
- [x] 手がかり発見型をgeneric interfaceへ適合させる。
- [x] scenario、trait、detailsをreadonlyの純粋データとして型付けする。
- [ ] `pickTrait` とStoryPlan parseの責務再配置は、出力同値性を維持する後続最適化で扱う。

### フェーズ4：applicationとAI infrastructure

- [x] AI proxy clientをTypeScriptへ移す。
- [x] fallback入力を判別可能なgeneration requestとしてapplication境界へ通す。
- [x] NodeプロキシをTypeScript化する。
- [x] browser/serverでStoryPlan runtime schemaとprotocol定数を共有する。

### フェーズ5：React UI

- [x] 現行DOM UIをReactコンポーネントへ移す。
- [x] 非同期状態を型付きReact stateで管理する。
- [x] 設問unionを網羅して紙面を描画する。
- [x] 画面CSSと印刷CSSを移植する。
- [ ] `responseLayout` のdomain追加とreducer分割は後続最適化で扱う。

### フェーズ6：SPA登録

- [x] `module.tsx` をホストregistryへ登録する。
- [x] Hash URLと戻る導線を確認する。
- [x] route-level error表示を追加する。
- [x] 旧URLを互換転送へ切り替える。

### フェーズ7：旧実装削除

- [x] TypeScript化したruntimeに対応する旧JSを削除する。
- [x] import、HTML script、テスト入口、仕様リンクの参照を確認する。
- [x] 削除後にtypecheck、build、関連テスト、ブラウザを再確認する。
- [ ] 現環境ではOS印刷プレビューを自動取得できないため、既存印刷回帰とCSS契約検査に加え、必要時に手動プレビューを再確認する。

## 20. 完了条件

- こくごのたねがSPAのlazy moduleとして動作する。
- domainがReact、DOM、fetch、OpenAI SDK、Node APIへ依存しない。
- blueprintごとの入力、context、content packが型で定義されている。
- 外部入力を `unknown` からruntime parseしている。
- 共通エンジンの `pickTrait()` と固定StoryPlan parseの責務再配置は後続最適化として記録されている。
- AI設計図を非対応blueprintへ渡せない。
- 設問unionと現在の紙面layoutの対応が網羅的である。
- language providerが注入可能で、DB releaseを来歴へ記録する。
- 旧JS版との差分検査で、許可した来歴差以外の問題内容が一致する。
- 1,350件コーパスが成功する。
- UI、既存A4横・縦書き・2ページ印刷契約、AI fallbackが確認済みである。
- `npm run typecheck`、`npm run build`、`npm test` が成功する。
- 仕様、進捗、起動方法、旧URLの説明が同期している。

## 21. 未決事項

- StoryPlan JSON SchemaとTypeScript型を単一ソース化する具体的な実装方法
- 現行の `|`／`{{lexeme}}` からtoken ASTへ移る時期
- paragraph layoutを全blueprint共通に保つか、構造側へ完全移管するか
- AI設計図の未使用フィールドを本文へ反映するか、schemaから削除するか
- provenanceのgenerator versionを移行時にどう更新するか
- Node TypeScriptはNode.js 26の型除去実行を採用し、`npm run serve:ai` から起動する。
- UIコンポーネントテストとブラウザE2Eの採用範囲
