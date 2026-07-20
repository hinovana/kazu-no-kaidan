# ローカルAIプロキシ 実装仕様書

| 項目 | 値 |
| --- | --- |
| 文書状態 | 実装契約 |
| 文書版 | `local-ai-proxy.v0.4` |
| 最終更新日 | 2026-07-19 |
| 実装状態 | TypeScript Nodeプロキシとして実装。Codexヘッドレスを既定providerとし、Responses API経路もコード設定で選択可能 |
| 対象実装 | 開発者のPCで起動するNode.js製AIプロキシと、ブラウザ側の接続UI |
| Node.js | `26.5.0`（`.node-version` と `.nvmrc` で固定） |
| 既定フロントエンド | `http://127.0.0.1:5173/#/generators/kokugo-no-tane`（Vite） |
| 既定プロキシ | `http://127.0.0.1:8787` |
| AI実行provider | 既定: Codex CLIヘッドレス、任意: OpenAI Responses API |

本書は、ブラウザプロトタイプからローカルAIプロキシを介して物語設計図を取得する場合の実装契約を定める。AIモデルの責務、事前生成、候補再利用、未成年者向け方針は [model-api-integration.md](model-api-integration.md)、本文・設問・正答根拠の生成規則は [algorithm-draft.md](algorithm-draft.md) を正本候補とする。

## 1. 位置づけ

ローカルAIプロキシは、既存ジェネレータを置き換えない。AIモデルから物語設計図候補を取得し、検証済み候補だけをブラウザ側の決定的ジェネレータへ渡す追加エンジンとする。

```text
ブラウザ
  │ POST http://127.0.0.1:8787/api/story-plan
  │ 学年・生成条件・本文長・題材・seed
  ↓
ローカルAIプロキシ（Node.js）
  │ KNT_AI_PROVIDERを環境変数から読む（既定codex）
  │ 入力検証・レート制限・キャッシュ・候補保存
  ↓
Codex CLI `codex exec` または OpenAI Responses API
  │ JSON Schemaで制約したstory-plan.v1
  ↓
プロキシ側のスキーマ・内容検査
  ↓
ブラウザ側の再検査
  ↓
既存アルゴリズムが本文・4問または6問・解答・根拠を生成
```

初期の児童利用・静的配布では [model-api-integration.md](model-api-integration.md) の事前生成型を優先する。本書のライブ接続は、開発者が候補を試作・比較・保存するモードとして実装する。

## 2. 採用技術と責務

### 2.1 Node.jsを採用する理由

- 既存の作問エンジンとテストがJavaScriptである。
- story planの型、JSON Schema、検証処理をブラウザと共有しやすい。
- ルートの `npm test` と同じ実行環境へ統合できる。
- Pythonとの二重実装によるenum、必須項目、正規化規則のずれを避けられる。

HTTPサーバーのライブラリは実装時に選定できるが、教材固有のコードは `generators/kokugo-no-tane/` の外へ置かない。依存を追加する場合は、利用理由と更新方針を記録する。

実装はNode.js公式の2026年7月15日時点の最新リリース `26.5.0` を使用する。ルートの `.node-version` と `.nvmrc`、`package.json#engines` を同期し、EOLのNode.jsへ互換処理を追加しない。Node.js 26は現時点でCurrentであり、公開運用へ移す時点では公式の「production applicationsはLTSを使用する」という方針と、利用中SDKの対応状況を再確認する。

### 2.2 責務の分離

| 層 | 責務 | 行わないこと |
| --- | --- | --- |
| ブラウザ | 条件入力、接続状態表示、プロキシ呼出し、レスポンス再検査、問題生成 | provider選択、APIキーの保持、AI providerへの直接接続 |
| ローカルプロキシ | provider選択、秘密情報、入力検証、AI呼出し、出力検査、候補保存、キャッシュ、CORS | 最終本文・設問・正答の決定 |
| Codex CLI / OpenAI API | `story-plan.v1` 候補の生成 | 公開可否、正答一意性、学年適合性の最終判断 |
| 決定的ジェネレータ | story planから本文・4問または6問・正答・根拠を生成 | AI出力への無条件の信頼 |

## 3. 起動とネットワーク

### 3.1 既定アドレス

```text
フロントエンド: http://127.0.0.1:5173/
AIプロキシ:     http://127.0.0.1:8787/
```

ホストには `127.0.0.0` ではなく `127.0.0.1` を使う。プロキシは既定で `127.0.0.1` にだけbindし、LAN内の別端末からアクセス可能な `0.0.0.0` では起動しない。

### 3.2 起動コマンド

Codex CLIへログイン済みであることを `codex login status` で確認し、標準コマンドを次とする。

```bash
npm run serve:ai
```

別ターミナルでフロントエンドを起動する。

```bash
npm run serve
```

OpenAI API経路を使うときだけ `KNT_AI_PROVIDER=openai` と `OPENAI_API_KEY` を環境変数へ設定する。APIキーをコマンド引数、URL、ブラウザフォームへ渡さない。

### 3.3 環境変数

| 変数 | 必須 | 既定値 | 用途 |
| --- | --- | --- | --- |
| `KNT_AI_PROVIDER` | 任意 | `codex` | `codex` または `openai`。UIからは変更しない |
| `KNT_CODEX_COMMAND` | 任意 | `codex` | Codex CLI実行ファイル。引数は指定しない |
| `KNT_CODEX_MODEL` | 任意 | Codex CLIの既定 | Codex側モデルを評価用に固定する場合のモデルID |
| `KNT_CODEX_REASONING_EFFORT` | 任意 | `high` | Codex側の推論強度。モデルが対応する `minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`ultra` |
| `OPENAI_API_KEY` | API時のみ必須 | なし | OpenAI API認証。ログ・レスポンスへ出さない |
| `OPENAI_MODEL` | 任意 | `gpt-5.6` | OpenAI API側のモデルIDまたはスナップショットID |
| `KNT_AI_HOST` | 任意 | `127.0.0.1` | bind先。初期実装ではloopback以外を拒否する |
| `KNT_AI_PORT` | 任意 | `8787` | プロキシの待受ポート |
| `KNT_FRONTEND_ORIGINS` | 任意 | `http://127.0.0.1:5173,http://127.0.0.1:8765` | CORSで許可する完全一致Originのカンマ区切り。前者はVite、後者は互換静的サーバー |
| `KNT_AI_TIMEOUT_MS` | 任意 | Codex `120000`、API `45000` | provider呼出しの上限時間。最大300000 |
| `KNT_AI_MAX_RETRIES` | 任意 | `1` | 一時障害時の追加試行回数 |
| `KNT_AI_SAVE_CANDIDATES` | 任意 | `1` | 合格候補をローカル保存するか |
| `KNT_AI_LOG_IO` | 任意 | `0` | `1` のとき評価用にproviderへの実リクエストと実レスポンスを `.local/logs/ai-provider-io.jsonl` へ記録する |

`KNT_AI_PROVIDER=openai` でAPIキーがない場合は、待受を開始せず、変数名だけを含むエラーを標準エラーへ出して終了コード1で停止する。Codex経路ではAPIキーを要求しない。

## 4. ブラウザUI契約

設定パネルに次を追加する。

| UI | 値・動作 |
| --- | --- |
| 生成方式 | `アルゴリズム`、`AI生成`のタブ状ラジオ。初期値はアルゴリズム |
| AIサーバURL | 初期値 `http://127.0.0.1:8787`。APIキーは入力させない |
| 接続確認 | `GET /health` を呼ぶ。OpenAI API呼出しは行わず、料金を発生させない |
| 接続状態 | 未確認、確認中、接続済み、切断中、設定不一致 |
| 接続情報 | provider、model、prompt version、schema version、proxy protocol version |

AIサーバURLは、初期実装では `http://127.0.0.1:<port>` のみ許可する。任意の外部URLやLAN内IPを入力できる汎用プロキシ設定にはしない。APIキーをlocalStorage、IndexedDB、URLパラメータへ保存しない。サーバーURLだけを保存する場合も、loopback検証を再実行してから使用する。

学年、生成条件プロファイル、本文長、題材カテゴリ、seedは両タブの共通条件とする。タブ切替で入力値を消したり、同名の入力欄を複製したりしない。設定パネル自体に内部スクロールを設けず、ページ全体をスクロールする。

| 共通条件 | AIへ送る | 最終生成での扱い |
| --- | --- | --- |
| 学年 | 送る | AIの語彙・漢字コンテキストに使い、既存generatorが漢字・ふりがなを確定する |
| 生成条件プロファイル | 送る | AIの構成ヒントに使い、既存generatorが心情記述問題の根拠間距離を確定する |
| 本文長 | 送る | AIの構成ヒントに使い、既存generatorが文字数帯と補足文を確定する |
| 題材カテゴリ | 送る | AI出力のカテゴリ一致を検査し、既存generatorへ渡す |
| seed | 送る | 候補識別、キャッシュキー、生成来歴、変化のヒントに使う。AIモデル出力の完全一致は保証しない |

AI生成を選択中のseedの「ランダム」操作は入力値を変更するだけであり、API通信を開始しない。アルゴリズム生成では新しいseedを反映してそのまま問題を生成する。API通信はAI生成の「この条件でつくる」の明示操作でのみ開始する。

### 4.1 生成時の状態遷移

```text
「アルゴリズム」タブを選択
  → 既存generatorだけで生成

「AI生成」タブを選択
  → 未接続なら /health を1回確認
  → /api/story-plan を呼ぶ
  → 合格story planなら既存generatorへ渡す
  → 失敗・拒否・不正JSON・タイムアウトならローカル生成へフォールバック
```

フォールバック時は生成自体を成功扱いにできるが、次を画面へ明示する。

```text
AIサーバから物語の種を取得できなかったため、今回はローカルアルゴリズムで生成しました。
```

AI利用の有無は生成来歴にも `generation_source=ai_proxy|local_fallback|local` として残す。AI未使用の問題をAI生成と表示しない。

## 5. HTTP API契約

すべてのレスポンスは `application/json; charset=utf-8` とし、成功・失敗の両方に `request_id` を含める。未知のJSONプロパティは受け付けず、サイズ上限を超えるbodyはモデルへ送る前に拒否する。

### 5.1 `GET /health`

AI providerへ接続せず、プロキシの起動状態と公開可能な設定だけを返す。APIキーの値、先頭・末尾文字、ハッシュを返してはならない。

成功例：

```json
{
  "ok": true,
  "status": "ready",
  "service": "kokugo-no-tane-ai-proxy",
  "protocol_version": "knt-ai-proxy.v1",
  "provider": "codex",
  "model": "codex-default",
  "prompt_version": "story-plan-prompt.v2",
  "context_version": "story-plan-context.v1",
  "schema_version": "story-plan.v1",
  "api_key_configured": false
}
```

HTTPステータスは正常時200とする。起動後に設定不整合を検出した場合は503とする。

### 5.2 `POST /api/story-plan`

リクエスト例：

```json
{
  "protocol_version": "knt-ai-proxy.v1",
  "client_request_id": "ブラウザで生成したUUID",
  "grade": 1,
  "profile": 3,
  "length": "standard",
  "topic": "town",
  "seed": "tane-001"
}
```

| フィールド | 型・許容値 | 制約 |
| --- | --- | --- |
| `protocol_version` | `knt-ai-proxy.v1` | 完全一致 |
| `client_request_id` | string | UUID、最大64文字 |
| `grade` | integer | `1..3` |
| `profile` | integer | `1..5`。実測難易度ではない |
| `length` | enum | `short`, `standard`, `long` |
| `topic` | enum | `auto`, `school`, `home`, `nature`, `town`, `animal` |
| `seed` | string | 1〜80文字。制御文字を禁止 |

プロキシがモデルへ送るのは、このallowlist済みの生成条件とコード管理された固定プロンプトだけとする。ブラウザから自由記述プロンプト、モデル名、developer instruction、JSON Schemaを指定できない。

成功例：

```json
{
  "ok": true,
  "protocol_version": "knt-ai-proxy.v1",
  "request_id": "proxy-request-uuid",
  "client_request_id": "ブラウザで生成したUUID",
  "candidate_id": "kt-candidate-uuid",
  "source": "openai",
  "model": "固定したモデルID",
  "prompt_version": "story-plan-prompt.v2",
  "prompt_hash": "固定指示と教材コンテキストのSHA-256",
  "context_version": "story-plan-context.v1",
  "schema_version": "story-plan.v1",
  "validator_version": "story-plan-validator.v1",
  "cache": {
    "hit": false
  },
  "story_plan": {
    "schema_version": "story-plan.v1",
    "category": "町",
    "title_concept": "まちたんけんのちず",
    "setting": {
      "type": "public_space",
      "name": "まちのひろば"
    },
    "protagonist": {
      "name": "あお",
      "role": "しょうがくせい"
    },
    "supporting_character": {
      "name": "ゆう",
      "role": "ともだち"
    },
    "goal": "まちたんけんのちずをかんせいさせる",
    "event": {
      "action": "めじるしをかこう",
      "problem": "めじるしをちがうばしょにかいてしまいました",
      "decision": "あるいたじゅんばんをたしかめること",
      "resolution": "ただしいばしょへかきなおしました"
    },
    "emotion": {
      "before": "うれしい",
      "after": "はずかしい"
    },
    "evidence_requirements": [
      "せいかくをしめすことばをおける",
      "しっぱいをみられたばめんとはんのうをわけられる"
    ]
  },
  "validation": {
    "status": "passed",
    "checks": [
      "schema",
      "allowed_content",
      "story_structure",
      "evidence_placeable"
    ]
  }
}
```

ブラウザへOpenAIの生レスポンス、内部プロンプト、reasoning、APIキー、詳細なproviderエラーを返さない。

### 5.3 エラーレスポンス

```json
{
  "ok": false,
  "request_id": "proxy-request-uuid",
  "error": {
    "code": "AI_TIMEOUT",
    "message": "物語設計図を取得できませんでした。"
  },
  "fallback_allowed": true
}
```

| HTTP | `error.code` | 条件 |
| ---: | --- | --- |
| 400 | `INVALID_REQUEST` | 入力型、enum、文字数、protocol versionが不正 |
| 403 | `ORIGIN_NOT_ALLOWED` | CORS allowlist外 |
| 429 | `AI_RATE_LIMITED` | 呼出上限またはprovider rate limit |
| 429 | `AI_QUOTA_EXCEEDED` | OpenAI Projectの利用枠または請求設定が不足 |
| 502 | `AI_REFUSAL` | モデル拒否を検出 |
| 502 | `SCHEMA_INVALID` | Structured Outputs取得後の追加検査に不合格 |
| 502 | `CONTENT_REJECTED` | 年齢、安全性、物語構造検査に不合格 |
| 502 | `AI_AUTH_FAILED` | provider認証失敗。詳細はサーバーログだけに残す |
| 503 | `AI_UNAVAILABLE` | provider一時障害またはプロキシ設定不整合 |
| 504 | `AI_TIMEOUT` | 設定時間内に完了しない |
| 500 | `INTERNAL_ERROR` | その他の内部エラー |

失敗時にprovider本文をそのままブラウザへ転送しない。ブラウザは `fallback_allowed=true` の場合だけローカル生成へ切り替える。

## 6. CORSとローカル境界

フロントエンドとプロキシはポートが異なるため、ブラウザ上では別Originになる。プロキシは次を満たす。

- `Origin` を `KNT_FRONTEND_ORIGINS` の完全一致allowlistで確認する。
- `Access-Control-Allow-Origin: *` を使わない。
- 許可メソッドは `GET, POST, OPTIONS` とする。
- 許可リクエストヘッダーは初期実装では `Content-Type` だけとする。
- Cookie、HTTP認証、`Access-Control-Allow-Credentials` を使わない。
- `Vary: Origin` を返す。
- `OPTIONS` のpreflightへモデル呼出しなしで応答する。
- `Host` とbind先を確認し、loopback外からの利用を初期実装では拒否する。

プロキシに任意URL取得、ファイル取得、汎用転送機能を持たせない。

## 7. AI provider呼出し契約

- providerは `KNT_AI_PROVIDER=codex|openai` でサーバー起動時に選び、ブラウザから変更できない。
- 固定指示と可変入力を分離し、プロンプトをコードで版管理する。
- 推論設定は `high` に固定する。
- `story-plan-prompt.v2` は、良問化ルーブリック、学年別制約、反例、実在教材を転載しない合成例2件を含む。
- 文科省由来の学年別配当漢字候補、教育基本語彙の低学年・高学年候補DBは人間未確認で、限定 `prototype_lexicon` の監査投影にだけ接続されていること、参照アンカー12・18から抽出した読み支援の抽象特徴を `story-plan-context.v1` として送る。
- 漢字候補は下流の表記検査用であり、かな限定のstory planへ漢字を混入させる目的では使わない。監査用投影を生成利用許可や語彙の学年適合保証としてモデルへ伝えない。
- モデル拒否、途中終了、providerエラー、出力欠落を明示的に分岐する。
- 初期実装では会話継続、web search、file search、外部MCP、任意ツールを使用しない。
- 生成結果は必ずアプリ側の検証器へ通し、JSON Schema適合だけで教育的合格とみなさない。

### 7.1 Codexヘッドレス（既定）

- `codex exec` の非対話実行を使い、ChatGPT/Codexの既存ログインを利用する。APIキーは要求しない。
- `--ephemeral`、`--ignore-user-config`、`--sandbox read-only`、`approval_policy="never"` を固定する。
- 入出力は権限 `0600` の一時ディレクトリへ置き、終了時に削除する。教材リポジトリを作業ディレクトリにしない。
- `--output-schema` に `story-plan.v1` のJSON Schemaを渡し、`--output-last-message` の内容だけを読み取る。
- モデルを固定する場合だけ `KNT_CODEX_MODEL` を `--model` へ渡す。未指定時はCodex CLIの既定モデルを使う。
- 推論強度は `KNT_CODEX_REASONING_EFFORT` を `model_reasoning_effort` へ渡す。既定は `high` とする。

### 7.2 OpenAI Responses API（任意）

- OpenAI公式JavaScript SDKとResponses APIを使用する。
- APIキーは `OPENAI_API_KEY` からSDKへ渡す。
- モデルは `OPENAI_MODEL` で固定し、ブラウザから変更できない。
- `text.format` のJSON SchemaによるStructured Outputsを使う。
- `store: false` を指定する。ただし、これだけでZero Data Retentionになるとは扱わない。

OpenAI公式資料は、APIキーをブラウザへ露出せずサーバーの環境変数から読むこと、Responses APIを直接生成に使えること、Structured OutputsがJSON Schemaへの適合を保証することを示している。ただしStructured Outputsでも内容上の誤りは残り得るため、本プロジェクト独自の検査を維持する。

## 8. タイムアウト・再試行・キャッシュ

### 8.1 タイムアウトと再試行

- 1回のprovider呼出しはCodex経路では既定120秒、API経路では既定45秒で中断する。
- 追加試行は最大1回とする。
- 再試行対象は接続切断、明示的な一時障害、providerの5xxに限定する。
- 認証失敗、入力不正、モデル拒否、内容検査不合格は再試行しない。
- rate limitではproviderの待機指示がブラウザの上限時間内に収まる場合だけ1回待機する。
- ブラウザ側の上限時間はサーバー側より長くし、二重送信を防止する。

### 8.2 キャッシュ

キャッシュキーは次の正規化済み値のSHA-256とする。

```text
protocol_version
provider
model
prompt_version
context_version
schema_version
validator_version
grade / profile / length / topic / seed
```

APIキー、生成日時、request IDはキャッシュキーへ含めない。providerは含め、CodexとAPIの候補を同じキャッシュとして扱わない。キャッシュに入れるのは検証合格済みstory planだけとし、不合格・拒否・エラーを成功キャッシュへ保存しない。

## 9. AIレスポンスの保存と再利用

良問をテンプレートへ昇格できるよう、ローカルライブ生成でも候補を失わない設計にする。

```text
generators/kokugo-no-tane/.local/model-candidates/raw/
  └── <candidate_id>.json       # 生レスポンスと来歴。Git管理外

generators/kokugo-no-tane/.local/model-candidates/validated/
  └── <candidate_id>.json       # 正規化・検証済み候補。Git管理外

明示的なimport・レビュー
  ↓
data/model-candidates/
  └── <candidate_id>.json       # 再利用候補として管理する正規化データ
```

実装時に `.local/` をGit管理対象外へ追加する。自動保存したファイルをそのまま配布データへ昇格させない。保存レコードには、`candidate_id`、provider、モデル、プロンプト版・ハッシュ、スキーマ版、入力条件、provider response ID（取得できる場合）、取得日時、生レスポンスのSHA-256、正規化済みstory plan、検査結果を含める。APIキーは含めない。

レビュー済み良問から承認済みテンプレートを作る状態遷移と抽象化規則は [model-api-integration.md](model-api-integration.md) の「AI出力の再利用とテンプレート化」に従う。

## 10. ログと秘密情報

`generators/kokugo-no-tane/.local/logs/ai-proxy.jsonl` に、起動・リクエスト・エラーを時系列のJSONLで追記する。ファイルと親ディレクトリはGit管理外とし、ファイル権限は `0600`、ディレクトリ権限は `0700` とする。ターミナルには起動URLとログファイルの場所だけを表示する。

通常ログに記録してよいもの：

- proxy request ID、client request ID、candidate ID
- endpoint、HTTP status、処理時間、再試行回数、cache hit
- model、prompt version、schema version、validator version
- provider request/response ID、利用量
- エラーコードと安全に要約した原因

通常ログに記録しないもの：

- APIキーまたはその一部・ハッシュ
- Authorizationヘッダー
- 子どもの氏名、回答、点数、行動履歴
- reasoningまたは内部推論
- 生プロンプト・生レスポンス全文

生レスポンスは通常ログではなく、前節のGit管理外候補ファイルへアクセス権を限定して保存する。

### 10.1 評価用の入出力ログ

`KNT_AI_LOG_IO=1` を明示した評価実行に限り、次の2イベントを専用の `.local/logs/ai-provider-io.jsonl` へ1行JSONで記録できる。requestとresponseは `client_request_id` で対応付ける。

- `ai_provider_request`: 実際に渡したプロンプトまたはResponses APIリクエスト、出力JSON Schema、provider、model
- `ai_provider_response`: CodexまたはResponses APIが返した最終 `output_text`、provider、model。API経路ではresponse ID、status、usageも含む

このモードは生プロンプトと最終レスポンスを含むため、子どもの氏名、回答、個人情報を入力する運用では有効にしない。APIキー、Authorizationヘッダー、Codexの内部イベント、reasoning本文は、このモードでも出力しない。

## 11. 想定ファイル構成

```text
generators/kokugo-no-tane/
├── server/
│   ├── ai-proxy.ts
│   ├── config.ts
│   ├── openai-story-plan.ts
│   ├── codex-story-plan.ts
│   ├── candidate-store.ts
│   └── story-plan-context.ts
├── infrastructure/ai/
│   └── ai-proxy-client.ts
├── domain/schemas/
│   └── story-plan-v1.ts
├── ui/
│   └── KokugoNoTanePage.tsx
├── tests/
│   ├── ai-proxy.test.js
│   ├── ai-proxy-client.test.js
│   ├── story-plan-context.test.js
│   └── ai-proxy-live.mjs
└── .local/                    # Git管理外
```

スキーマのサーバー版とブラウザ版を手書きで二重管理しない。同一定義を共有するか、一方から生成し、CIで差分を検出する。

## 12. テスト仕様

通常の `npm test` は実providerやAPIキーなしで成功しなければならない。Codex子プロセスとOpenAI SDK呼出しを差し替え可能にし、fixtureで次を検証する。

### 12.1 プロキシ

- 既定がCodexでAPIキーなしに設定を読み込める。API経路ではキー欠落時に秘密値を出さず停止する。
- Codex実行引数が非対話・ephemeral・read-only・schema指定になっている。
- `/health` がAPIキーを返さない。
- 正常リクエストを1回だけproviderへ渡す。
- 不正な型、enum、追加プロパティ、長すぎるseedを400で拒否する。
- Origin allowlist、preflight、`Vary: Origin` が正しい。
- refusal、schema不一致、内容不合格、401、429、5xx、timeoutを規定エラーへ写像する。
- 再試行上限を超えない。
- 同じキャッシュキーでproviderを再呼出ししない。
- 合格候補だけを保存し、APIキーをファイルへ含めない。

### 12.2 ブラウザクライアント

- 初期値がローカルアルゴリズムである。
- `127.0.0.1` 以外のURLを初期仕様では拒否する。
- 接続確認が `/health` だけを呼ぶ。
- 成功story planを再検査してgeneratorへ渡す。
- 切断、timeout、不正レスポンスでローカル生成へ戻る。
- フォールバックを画面と生成来歴に明示する。
- AIモードでもAPIキー入力欄が存在しない。

### 12.3 任意の実providerスモークテスト

実providerテストは標準テストから分離して1件実行する。出力内容を固定一致で検査せず、HTTP成功、schema適合、来歴、候補保存、秘密情報非露出を確認する。API経路を選んだ場合はAPI利用量が発生する。

## 13. 実装完了条件

- `npm run serve:ai` で `127.0.0.1:8787` にNode.jsプロキシが起動する。
- 既定のCodex経路はAPIキーなしで起動し、API経路はキーなしで安全に起動失敗する。APIキーはHTML、JavaScript、JSON、ログ、Gitへ含まれない。
- providerを環境変数で切り替えられ、UIにprovider切替を追加しない。
- ブラウザで生成方式、AIサーバURL、接続確認、接続状態を操作できる。
- 生成方式はタブ状UIで切り替え、学年・プロファイル・本文長・題材・seedが両方式へ適用される。
- ランダムseedの変更だけでは生成もAPI通信も起きず、設定パネル内に独立スクロールがない。
- `/health` と `/api/story-plan` が本書の契約に一致する。
- CORSがViteの `http://127.0.0.1:5173` と互換静的サーバーの `http://127.0.0.1:8765` の完全一致allowlistで動作する。
- AI成功時は検証済みstory planから既存アルゴリズムが問題を生成する。
- AI障害時はローカル生成へ戻り、AI未使用を明示する。
- 合格候補がGit管理外へ保存され、明示的なimport後に再利用候補へ進められる。
- 同一の固定候補・DB・generator版・seedから同じitemを再表示できる。
- 実APIなしの単体・契約・UIテストとルートの `npm test` が成功する。
- A4横・縦書き固定の印刷レイアウトで、AI接続UIが教材本文・設問へ混入しないことを確認する。

### 13.1 2026年7月16日の検証状況

- Node.js `26.5.0` を対象に、Codexヘッドレスを既定provider、Responses APIを任意providerとする実装へ更新した。
- `npm run test:kokugo-no-tane:ai:live` は選択中のproviderを使う。CodexログインまたはAPIキーが必要なため、通常の `npm test` には含めない。
- Codexログイン経路の実接続スモークテストに合格し、`story-plan.v1` のschema適合、既存作問への接続、4問生成、候補保存を確認した。

## 14. 公式資料

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [Node.js 26.5.0 release](https://nodejs.org/en/blog/release/v26.5.0)
- [API authentication](https://developers.openai.com/api/reference/overview#authentication)
- [Text generation / Responses API](https://developers.openai.com/api/docs/guides/text)
- [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Data controls for `/v1/responses`](https://developers.openai.com/api/docs/guides/your-data#v1responses)
- [Under 18 API Guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
- [Codex CLI non-interactive mode](https://learn.chatgpt.com/docs/developer-commands#codex-exec)

公式資料は更新され得る。実装開始時、OpenAI SDK更新時、モデル変更時に再確認し、モデルID、SDKの呼出し形式、データ保持方針を本書と同期する。
