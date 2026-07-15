# 算数教材ジェネレータ

印刷用の算数教材をブラウザで作るジェネレータ集です。

## 構成

- `generators/`: 教材ごとのジェネレータ。各ディレクトリに画面、作問処理、仕様、テストをまとめます。
- `scripts/`: リポジトリ全体で使う開発用スクリプト。
- `docs/`: 構成方針などの横断ドキュメント。
- `index.html`: 動作中のジェネレータ一覧。

## 収録ジェネレータ

- `generators/kazu-no-kaidan/`: 数字の階段
- `generators/kazu-sagashi/`: かずさがし。入門のレベル1、3種類の問題を均等に混ぜるレベル2、リンゴとナシの関係を探すレベル3、3種類の大小関係を扱う「レベル: ノイマン（試験版）」に対応します。通常仕様は [`generators/kazu-sagashi/SPEC.md`](generators/kazu-sagashi/SPEC.md)、ノイマン専用仕様は [`generators/kazu-sagashi/SPEC-NEUMANN.md`](generators/kazu-sagashi/SPEC-NEUMANN.md) を参照してください。多数seedを複数解法で比較する開発用画面は [`generators/kazu-sagashi/difficulty-lab.html`](generators/kazu-sagashi/difficulty-lab.html) です。

## 起動

```bash
npm run serve
./scripts/server.sh 9000
npm test
npm run test:kazu-sagashi:corpus
```

ブラウザでルートの一覧ページを開き、使用するジェネレータを選びます。

## ジェネレータの追加

`generators/<generator-slug>/` に自己完結したジェネレータを追加します。教材固有のソルバーや描画処理はそのディレクトリ内に置き、同じJavaScriptが複数教材で必要になった場合だけルートの `lib/` を作ります。

詳細は [`docs/directory-structure-proposal.md`](docs/directory-structure-proposal.md) を参照してください。
