# 教材ジェネレータ

印刷用の教材をブラウザで作るジェネレータ集です。

## 構成

- `generators/`: 教材ごとのジェネレータ。各ディレクトリに画面、作問処理、仕様、テストをまとめます。
- `scripts/`: リポジトリ全体で使う開発用スクリプト。
- `docs/`: 構成方針などの横断ドキュメント。
- `index.html`: 動作中のジェネレータ一覧。

## 収録ジェネレータ

- `generators/kazu-no-kaidan/`: 数字の階段
- `generators/kazu-sagashi/`: かずさがし。入門のレベル1、3種類の問題を均等に混ぜるレベル2、リンゴとナシの関係を探すレベル3、3種類の大小関係を扱う「レベル: ノイマン（試験版）」に対応します。通常仕様は [`generators/kazu-sagashi/SPEC.md`](generators/kazu-sagashi/SPEC.md)、ノイマン専用仕様は [`generators/kazu-sagashi/SPEC-NEUMANN.md`](generators/kazu-sagashi/SPEC-NEUMANN.md) を参照してください。多数seedを複数解法で比較する開発用画面は [`generators/kazu-sagashi/difficulty-lab.html`](generators/kazu-sagashi/difficulty-lab.html) です。
- `generators/kokugo-no-tane/`: こくごのたね。小学1〜3年生向けの物語文と標準4問を、seed付きで生成する開発確認用ブラウザプロトタイプです。構造的自動検査は通過していますが人間未確認であり、児童利用や学力判定には使用できません。設計資料は [`generators/kokugo-no-tane/docs/README.md`](generators/kokugo-no-tane/docs/README.md) を参照してください。

## 起動

Node.js `26.5.0` を使用します。nodenvは `.node-version`、nvmは `.nvmrc` を読み込みます。

```bash
node --version
npm run serve
./scripts/server.sh 9000
npm test
npm run test:kazu-sagashi:corpus
```

「こくごのたね」で開発用AI生成を使う場合は、別ターミナルでローカルAIプロキシを起動します。APIキーはブラウザへ入力しません。

```bash
export OPENAI_API_KEY='発行したAPIキー'
npm run serve:ai
```

`OPENAI_MODEL` を省略した場合は `gpt-5.6` を使います。実接続のスモークテストは `npm run test:kokugo-no-tane:ai:live` で実行し、API利用量が発生します。

ブラウザでルートの一覧ページを開き、使用するジェネレータを選びます。

## ジェネレータの追加

`generators/<generator-slug>/` に自己完結したジェネレータを追加します。教材固有のソルバーや描画処理はそのディレクトリ内に置き、同じJavaScriptが複数教材で必要になった場合だけルートの `lib/` を作ります。

詳細は [`docs/directory-structure-proposal.md`](docs/directory-structure-proposal.md) を参照してください。
