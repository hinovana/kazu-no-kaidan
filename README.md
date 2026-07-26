# 教材ジェネレータ

印刷用の教材をブラウザで作るジェネレータ集です。

## 構成

- `generators/`: 教材ごとのジェネレータ。各ディレクトリに画面、作問処理、仕様、テストをまとめます。
- `scripts/`: リポジトリ全体で使う開発用スクリプト。
- `docs/`: 構成方針などの横断ドキュメント。
- `index.html` と `src/app/`: Vite・React・Hash Routerで動くジェネレータ一覧とSPAホスト。

## 横断設計

- [`docs/directory-structure-proposal.md`](docs/directory-structure-proposal.md): 現行の教材単位ディレクトリ構成。
- [`docs/spa-framework-design.md`](docs/spa-framework-design.md): Vite・TypeScript・Reactによる段階的SPA移行と教材モジュール登録の設計。こくごのたねと、おなじのつなぎをSPA教材として実装済みです。

## 収録ジェネレータ

- `generators/kazu-no-kaidan/`: 数字の階段
- `generators/kazu-sagashi/`: かずさがし。入門のレベル1、3種類の問題を均等に混ぜるレベル2、リンゴとナシの関係を探すレベル3、3種類の大小関係を扱う「レベル: ノイマン（試験版）」に対応します。通常仕様は [`generators/kazu-sagashi/SPEC.md`](generators/kazu-sagashi/SPEC.md)、ノイマン専用仕様は [`generators/kazu-sagashi/SPEC-NEUMANN.md`](generators/kazu-sagashi/SPEC-NEUMANN.md) を参照してください。多数seedを複数解法で比較する開発用画面は [`generators/kazu-sagashi/difficulty-lab.html`](generators/kazu-sagashi/difficulty-lab.html) です。
- `generators/kokugo-no-tane/`: こくごのたね。TypeScript・ReactのSPA教材モジュールとして、小学1〜3年生向けの物語文と標準4問をseed付きで生成する開発確認用ブラウザプロトタイプです。構造的自動検査は通過していますが人間未確認であり、児童利用や学力判定には使用できません。設計資料は [`generators/kokugo-no-tane/docs/README.md`](generators/kokugo-no-tane/docs/README.md) を参照してください。
- `generators/onaji-no-tsunagi/`: おなじのつなぎ。同じ形を2個ずつ、同じマスを共有しない線で結ぶ問題をseed付きで生成するTypeScript・Reactの開発確認用SPA教材モジュールです。通常の開発画面で、v3.3の5×5・6/8/10端点（レベル1）と、v3.4 draft.3の6×6・10/12/14端点（暫定レベル2/3）を選べます。同記号4個・6個の組み方を含めて正規化解が1個と完全探索で証明できた問題だけを表示します。10端点では、端点配置の6条件を生成探索内で保証し、残る4条件と原本基準分類を後段の粗悪問題除外gateに使います。フォームで`原本近傍`・`明らかに難しい側`・`指標混合`の採用区分を選べますが、この分類は児童の体感難易度や良問であることを保証しません。人間レビュー・難易度校正・公開判定前のため、児童利用はできません。契約は [`generators/onaji-no-tsunagi/SPEC.md`](generators/onaji-no-tsunagi/SPEC.md)、原本6×6と生成3,000問の比較は [`generators/onaji-no-tsunagi/docs/six-by-six-difficulty-audit.md`](generators/onaji-no-tsunagi/docs/six-by-six-difficulty-audit.md) を参照してください。

## 起動

Node.js `26.5.0` を使用します。nodenvは `.node-version`、nvmは `.nvmrc` を読み込みます。

```bash
node --version
npm run serve
npm run build
npm run typecheck
npm test
npm run test:kazu-sagashi:corpus
npm run test:onaji-no-tsunagi
npm run test:onaji-no-tsunagi:corpus
npm run test:onaji-no-tsunagi:6x6-corpus
```

「こくごのたね」で開発用AI生成を使う場合は、Codex CLIへログインした状態で、別ターミナルからローカルAIプロキシを起動します。評価フェーズの既定providerはAPI課金を使わないCodexヘッドレス実行です。

```bash
npm run serve:ai
```

providerはサーバー環境変数だけで切り替えます。UIからは変更できません。

```bash
# 既定: Codex CLIの非対話実行
export KNT_AI_PROVIDER='codex'

# OpenAI Responses APIへ明示的に切り替える場合だけ設定
export KNT_AI_PROVIDER='openai'
export OPENAI_API_KEY='発行したAPIキー'
```

Codex側のモデルと推論強度を固定する場合は `KNT_CODEX_MODEL` と `KNT_CODEX_REASONING_EFFORT`、API側は `OPENAI_MODEL` を指定します。実接続のスモークテストは `npm run test:kokugo-no-tane:ai:live` です。

GPT-5.6 Terraを推論highで使う例：

```bash
KNT_CODEX_MODEL='gpt-5.6-terra' \
KNT_CODEX_REASONING_EFFORT='high' \
npm run serve:ai
```

サーバーの通常ログは次のJSONLファイルへ保存されます。

```text
generators/kokugo-no-tane/.local/logs/ai-proxy.jsonl
```

評価時に、providerへ渡した実リクエストと返却された実レスポンスを確認する場合は、入出力ログを有効にします。

```bash
KNT_AI_LOG_IO=1 npm run serve:ai
```

次の専用ログへ、1行JSONで `ai_provider_request` と `ai_provider_response` が追加されます。両者は `client_request_id` で対応付けられます。

```text
generators/kokugo-no-tane/.local/logs/ai-provider-io.jsonl
```

ターミナルには起動URLとログファイルの場所だけを表示します。APIキー、Authorizationヘッダー、reasoning本文は記録しません。

ブラウザでルートの一覧ページを開き、使用するジェネレータを選びます。

## ジェネレータの追加

`generators/<generator-slug>/` に自己完結したジェネレータを追加します。教材固有のソルバーや描画処理はそのディレクトリ内に置き、同じ実装が複数教材で必要になった場合だけ共有層を検討します。

現行構成の詳細は [`docs/directory-structure-proposal.md`](docs/directory-structure-proposal.md)、SPAへの段階移行は [`docs/spa-framework-design.md`](docs/spa-framework-design.md) を参照してください。
