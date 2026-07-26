# `generators/onaji-no-tsunagi/` ディレクトリ構成

| 項目 | 内容 |
| --- | --- |
| 対象 | `generators/onaji-no-tsunagi/` |
| 構成確認日 | 2026-07-26 |
| 正誤・品質契約の正本 | [`../SPEC.md`](../SPEC.md) |
| この文書の役割 | 実装の配置、依存方向、変更時の入口を示す |

この教材は、仕様、純粋な問題領域、Webとの接続、画面、参照JSON形式、テストを一つの教材ディレクトリ内に閉じている。
この文書は「どこに何があるか」の案内であり、問題ルールや唯一解保証を新たに定義しない。

## 1. 全体像

```text
SPA host
  |
  v
module.tsx
  |
  v
ui/ --------------------------+
  |                            |
  v                            v
application/ -------------> domain/
  |                            ^
  +-- Web Worker               |
  +-- 参照JSONデコーダー ------+

reference/ -- 架空見本・JSON Schema
tests/ ----- 各層と層間契約を検証
```

基本の依存方向は次のとおり。

- `ui/` は `application/` のユースケースと `domain/` の出力型を利用する。
- `application/` は入力、エラー、Worker通信をWeb向けに整え、`domain/` を呼び出す。
- `domain/` はReact、DOM、ブラウザAPI、別教材へ依存しない。
- `tests/` は検証目的に応じて各層へ直接アクセスしてよい。
- `reference/` の架空見本は確認画面の動作確認専用であり、生成テンプレートにしない。

## 2. ディレクトリツリー

```text
generators/onaji-no-tsunagi/
├── SPEC.md
├── docs/
│   ├── README.md
│   ├── directory-structure.md
│   └── typedoc-custom.js
├── application/
│   ├── decode-reference-corpus.ts
│   ├── generate-worksheet-use-case.ts
│   ├── generation-error-message.ts
│   ├── generation-worker-contract.ts
│   ├── generation-worker.ts
│   ├── parse-generation-request.ts
│   └── strict-json-reader.ts
├── domain/
│   ├── generation/
│   │   ├── analyze-difficulty.ts
│   │   ├── build-unique-path-cover.ts
│   │   ├── generate-worksheet.ts
│   │   ├── materialize-path-plan.ts
│   │   ├── path-candidate-source.ts
│   │   ├── path-cover-grid.ts
│   │   ├── path-symbol-assignment.ts
│   │   ├── random.ts
│   │   ├── select-path-cover.ts
│   │   └── unique-path-cover-profile.ts
│   ├── grid/
│   │   ├── adjacency.ts
│   │   └── coordinates.ts
│   ├── solver/
│   │   ├── enumerate-pairings.ts
│   │   ├── normalize-solution.ts
│   │   ├── optimize-solution.ts
│   │   ├── residual-reachability.ts
│   │   ├── search-grid.ts
│   │   └── solve-puzzle.ts
│   ├── types/
│   │   ├── difficulty.ts
│   │   ├── generation.ts
│   │   ├── puzzle.ts
│   │   ├── reference-corpus.ts
│   │   ├── solution.ts
│   │   └── worksheet.ts
│   └── validation/
│       ├── analyze-solution-coverage.ts
│       ├── analyze-solution-geometry.ts
│       ├── analyze-unique-path-cover-entry.ts
│       ├── explain-unique-path-cover.ts
│       ├── run-machine-checks.ts
│       ├── solution-route-roles.ts
│       ├── validate-puzzle.ts
│       └── validate-solution.ts
├── reference/
│   ├── example-source-corpus.json
│   └── source-corpus.schema.json
├── tests/
│   ├── application-boundary.test.js
│   ├── architecture.test.js
│   ├── corpus.mjs
│   ├── generator.test.js
│   ├── layout-quality.test.js
│   ├── reference-corpus.test.js
│   ├── six-by-six-corpus.mjs
│   ├── six-by-six-layout.test.js
│   ├── solver.test.js
│   ├── typescript-contract.test.ts
│   ├── ui-structure.test.js
│   └── validator.test.js
├── ui/
│   ├── AnswerPreview.tsx
│   ├── DeveloperDiagnostics.tsx
│   ├── OnajiNoTsunagiPage.tsx
│   ├── PuzzleBoard.tsx
│   ├── ReferenceCorpusReviewPage.tsx
│   ├── WorksheetGenerationControls.tsx
│   ├── WorksheetPreview.tsx
│   ├── symbol-label.ts
│   └── use-worksheet-generation.ts
├── index.html
├── module.tsx
├── redirect.ts
├── styles.css
├── tsconfig.docs.json
├── tsconfig.json
└── typedoc.json
```

## 3. ルート直下

| パス | 責務 |
| --- | --- |
| `SPEC.md` | 原本から採用したルール、実装独自方針、唯一解契約、難易度、品質gateの正本 |
| `module.tsx` | SPAホストが遅延読込する教材モジュール。画面componentとCSSを登録する |
| `index.html` | 旧URLからアクセスされたときの互換入口 |
| `redirect.ts` | 旧URLをSPAのHash URLへ移動する |
| `styles.css` | 画面、盤面SVG、診断表示、参照JSON確認、A4印刷を含む教材専用CSS |
| `tsconfig.json` | この教材のTypeScript検査範囲と設定 |
| `tsconfig.docs.json` | TypeDocがapplication、domain、UIを一つのprogramとして読むための設定 |
| `typedoc.json` | HTML APIリファレンスの入口、出力先、document validationを定義する |
| `docs/` | 実装を読むための補助資料と、TypeDoc画面の軽微な日本語補正。仕様の正本は置かない |

TypeDocの生成物はリポジトリルートの
`docs/onaji-no-tsunagi/reference/`へ置く。生成物を直接編集せず、
`npm run docs:onaji-no-tsunagi`で再生成する。

## 4. `application/`: Webとdomainの境界

| ファイル | 責務 |
| --- | --- |
| `parse-generation-request.ts` | フォームなどから来る未知の入力を`GenerationRequest`へ厳格変換する |
| `generate-worksheet-use-case.ts` | 入力parse後にdomainのWorksheet生成を呼ぶ同期ユースケース |
| `generation-worker-contract.ts` | request ID付きのWorker要求と、同じIDを返す成功・失敗メッセージ型 |
| `generation-worker.ts` | 重い生成処理をメインスレッド外で実行するWorker入口 |
| `generation-error-message.ts` | domain/applicationの例外を画面向け日本語へ変換する |
| `decode-reference-corpus.ts` | 原本参照JSONを厳格デコードし、問題validatorへ接続する |
| `strict-json-reader.ts` | 未知のJSON値をpath付きエラーへ変換する、schema非依存の低水準reader |

ここには問題の正誤ルールを実装しない。入力形式やWeb実行方式を変えずに説明できる規則は、`domain/`へ置く。

## 5. `domain/`: 教材固有の純粋TypeScript

### `domain/types/`

| ファイル | 主な型 |
| --- | --- |
| `puzzle.ts` | マス、端点、記号、盤面、端点profile |
| `solution.ts` | 経路、解、解数、solver結果、形状cost |
| `generation.ts` | 生成要求、利用可能レベル、候補棄却理由 |
| `worksheet.ts` | 生成済み問題、Worksheet、来歴、機械検査、人間向け説明材料 |
| `difficulty.ts` | 難易度レベルと分析結果 |
| `reference-corpus.ts` | 原本参照JSONのsource、盤面、転記状態 |

型の変更は影響範囲が広い。`solver/`、`validation/`、`generation/`、UI、テスト、必要なら`SPEC.md`を同じ作業で確認する。

### `domain/grid/`

| ファイル | 責務 |
| --- | --- |
| `coordinates.ts` | 行列座標、一次元index、範囲内判定、マンハッタン距離 |
| `adjacency.ts` | 上下左右に隣接するマス・indexの決定順列挙 |

盤面サイズに依存する低水準処理を集める。作問品質や難易度の判断は置かない。

### `domain/generation/`

| ファイル | 責務 |
| --- | --- |
| `build-unique-path-cover.ts` | solution-first構成の公開入口。下記のprofile、候補、exact-cover、記号割当を統括する |
| `unique-path-cover-profile.ts` | 5×5・6×6の版付きprofile値、生成方針と、難易度・問題位置からのprofile選択 |
| `generation-profile-adapter.ts` | profileの版、seed互換、記号割当、cover再利用方針を実行手順へ変換する |
| `path-candidate-source.ts` | 低曲がり単純経路候補の列挙、向きの重複排除、geometry単位の遅延cache |
| `select-path-cover.ts` | 経路候補から盤面全体を一度ずつ覆う組を探すexact-cover探索 |
| `path-symbol-assignment.ts` | 構成済み経路への三記号割当と、6×6の割当variant列挙 |
| `path-cover-grid.ts` | 生成seed互換の隣接順と、経路構成用BigInt bitmask操作 |
| `materialize-path-plan.ts` | 選択した経路計画へ端点ID・記号・route roleを割り当て、PuzzleとSolutionへ変換する |
| `generate-worksheet.ts` | profile選択、候補生成、独立solver、optimizer、品質gateを統括しWorksheetを作る |
| `analyze-difficulty.ts` | 構造的な難易度指標を集計する |
| `random.ts` | seed付き乱数と安定hash |

`generate-worksheet.ts`はオーケストレーターであり、経路探索の詳細を抱え込ませない。新しい盤面サイズやprofileは、まず型と`build-unique-path-cover.ts`の境界を拡張する。

### `domain/solver/`

| ファイル | 責務 |
| --- | --- |
| `enumerate-pairings.ts` | 同記号端点のpartner候補と完全マッチング数 |
| `solve-puzzle.ts` | 端点だけを入力に、partnerを固定せず有効解を探索する独立solver |
| `residual-reachability.ts` | 使用済みマスを除いた残余盤面の到達可能性とBigInt bitset |
| `search-grid.ts` | solverとoptimizerが共有する端点順序、探索状態key、残余成分偶奇の判定 |
| `normalize-solution.ts` | 経路順・向きを正規化し、解の同一性を判定するhashを作る |
| `optimize-solution.ts` | 有効解の中から形状cost順の最適解を完全探索する |

唯一解の主張は`solve-puzzle.ts`の完全探索結果に基づく。植え込んだ経路との一致だけで一意性を判定しない。

### `domain/validation/`

| ファイル | 責務 |
| --- | --- |
| `validate-puzzle.ts` | 盤面寸法、端点ID、座標、記号個数などPuzzle単体の正当性 |
| `validate-solution.ts` | 同記号接続、上下左右、単純経路、端点使用、経路間非共有 |
| `analyze-solution-coverage.ts` | 解が使用するマス数と空きマス数 |
| `analyze-solution-geometry.ts` | 辺数、曲がり、U字、経路形状cost |
| `analyze-unique-path-cover-entry.ts` | 取っ掛かり候補、端点集中、ペアリング候補など入口品質 |
| `solution-route-roles.ts` | solver解がsolution-first時のroute roleを保つか調べる |
| `run-machine-checks.ts` | 採用前の機械gateをまとめて実行する |
| `explain-unique-path-cover.ts` | 機械分析を開発診断・説明用の文へ変換する |

validatorは「保存済みの答えと同じか」ではなく、ルールを満たす任意解かを判定する。生成採用条件は、その上で唯一解であることを別に証明する。

## 6. `ui/`: React表示

| ファイル | 責務 |
| --- | --- |
| `OnajiNoTsunagiPage.tsx` | 通常画面と参照JSON確認画面の切替、生成結果、答案表示、印刷を統括する |
| `WorksheetGenerationControls.tsx` | 難易度・問題数・seedと、生成・答案表示・印刷のform control |
| `use-worksheet-generation.ts` | request ID、前Worker終了、古い応答破棄、結果状態、unmount cleanupを管理するReact hook |
| `WorksheetPreview.tsx` | 問題用紙、氏名欄、難易度表示 |
| `AnswerPreview.tsx` | 唯一の答えを載せた答案表示 |
| `PuzzleBoard.tsx` | 問題と答えで共有するSVG盤面。参照確認時はセル座標も表示できる |
| `DeveloperDiagnostics.tsx` | 一意性、形状、棄却理由など開発者向け証拠 |
| `ReferenceCorpusReviewPage.tsx` | ローカルJSONの盤面再描画、座標表、原本PDF SHA-256照合 |
| `symbol-label.ts` | SVG盤面と参照確認画面で共有する記号の日本語表示名 |

問題用紙の`PuzzleBoard`へ解答経路を渡さない。印刷上の変更では、問題用紙と答えの両方をA4全ページで確認する。

## 7. `reference/`: 公開可能な参照JSON形式

| ファイル | 責務 |
| --- | --- |
| `source-corpus.schema.json` | 原本参照JSON v1のJSON Schema |
| `example-source-corpus.json` | UIと形式を確認するための架空問題 |

原本から転記した実座標はこのディレクトリへ置かない。実データは原本PDFと同じ外側worktreeの`ref/onaji-no-tsunagi-source-corpus.json`でローカル管理し、生成fixture、seed、テンプレートへ流用しない。

## 8. `tests/`: 検証の入口

| ファイル | 主な検証対象 |
| --- | --- |
| `application-boundary.test.js` | 入力parse、未対応入力、ユースケース境界、エラー文 |
| `generator.test.js` | 再現性、profile構成、生成結果、唯一解、来歴 |
| `layout-quality.test.js` | solution-first構築、形状gate、取っ掛かり、トポロジー多様性 |
| `solver.test.js` | pairing、bitset、solver、optimizer、正規化、予算超過 |
| `solver-oracle.test.js` | 独立総当たり参照器と3×3・4×3の全4端点配置における解hash集合一致 |
| `validator.test.js` | PuzzleとSolutionの正例・反例 |
| `reference-corpus.test.js` | 参照JSONのschema、厳格デコード、SHA結合、異常系 |
| `six-by-six-layout.test.js` | 6×6の構成成功率、状態予算、経路長profile、トポロジー |
| `six-by-six-corpus.mjs` | 6×6各profileの多数seed生成、完全探索、品質gate、JSON基準値との性能・多様性回帰 |
| `ui-structure.test.js` | SPA登録、問題・答え分離、印刷CSS、参照確認画面の静的構造 |
| `ui-behavior.test.tsx` | 実DOMでWorker多重要求、最新結果の表示順、印刷前の答案状態 |
| `typescript-contract.test.ts` | 公開する教材内型のコンパイル契約 |
| `corpus.mjs` | 多数seedでの再現性、品質gate、分布、重複、性能 |

個別テストはリポジトリルートから直接実行できる。全体の標準検証は次のとおり。

```bash
node generators/onaji-no-tsunagi/tests/<対象>.test.js
npm run test:onaji-no-tsunagi
npm run test:onaji-no-tsunagi:corpus
npm run typecheck:onaji-no-tsunagi
npm test
npm run build
```

コーパステストは通常の単体テストより重いため、作問文法、solver、品質gate、profile、seed再現性を変更したときに実行する。

## 9. 主な処理フロー

### 問題生成

```text
OnajiNoTsunagiPage
  -> generation-worker
  -> generate-worksheet-use-case
  -> parse-generation-request
  -> generateWorksheet
  -> buildUniquePathCover
  -> solvePuzzle / optimizeSolution
  -> validation・machine checks
  -> Worksheet
  -> WorksheetPreview / AnswerPreview / DeveloperDiagnostics
```

### 原本参照JSONの確認

```text
ReferenceCorpusReviewPage
  -> decodeReferenceCorpusJson
  -> validatePuzzle
  -> PuzzleBoardで全問題を再描画
  -> 原本PDFのSHA-256をブラウザ内で照合
```

JSONのデコード成功やPDFのSHA一致だけでは、座標転記の正しさを証明しない。再描画した盤面と原本の目視照合を別に行う。

## 10. 変更内容から入口を探す

| 変更したいこと | 最初に確認する場所 | 同時に確認する場所 |
| --- | --- | --- |
| 正誤ルール・唯一解契約 | `SPEC.md` | `types/`、`solver/`、`validation/`、画面説明、反例テスト |
| 盤面サイズ・端点profile | `domain/types/puzzle.ts`、`unique-path-cover-profile.ts` | `generation-profile-adapter.ts`、`build-unique-path-cover.ts`、solver、品質gate、コーパス |
| solution-first作問文法 | `build-unique-path-cover.ts` | `materialize-path-plan.ts`、独立solver、layout品質テスト |
| 解探索・一意性証明 | `domain/solver/` | validator、generator、solverテスト、予算超過表示 |
| 取っ掛かり・形状gate | `domain/validation/` | `SPEC.md`、生成採用処理、layout品質テスト |
| 生成フォーム・Worker | `ui/OnajiNoTsunagiPage.tsx`、`application/` | Worker契約、実DOMテスト、実ブラウザ |
| SVG盤面・印刷 | `ui/PuzzleBoard.tsx`、`styles.css` | 問題と答え、狭幅、A4全ページ |
| 原本参照JSON形式 | `reference/source-corpus.schema.json`、`reference-corpus.ts` | decoder、確認画面、異常系テスト、ローカル実データ |
| 開発診断 | `DeveloperDiagnostics.tsx`、`worksheet.ts` | 分析処理、説明生成、UI構造テスト |
| SPA入口・旧URL | `module.tsx`、`index.html`、`redirect.ts` | ルートregistry、実ブラウザ遷移 |

## 11. 配置上の禁止事項

- React、DOM、Worker、ファイルAPIを`domain/`へ持ち込まない。
- 原本の実座標、誌面、解答線を公開fixtureや生成テンプレートへ置かない。
- 同じ記号が4個以上のとき、partnerを作問時の組へ固定してsolverを省略しない。
- `unsatisfiable`と探索予算超過を同じ結果にしない。
- 自動検査通過を、美しさ、児童利用許可、体感難易度の証拠にしない。
- 別教材との見かけ上の重複だけで、教材固有domainをルート共通化しない。
