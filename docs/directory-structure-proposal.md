# 複数ジェネレータ向けディレクトリ構成案

> 現在の静的HTML・JavaScript構成と教材単位の配置原則は本書を参照する。Vite・TypeScript・ReactによるSPAホストと段階移行の目標設計は [spa-framework-design.md](spa-framework-design.md) を参照する。SPA移行後も、教材固有の仕様・domain・UI・印刷・テストを `generators/<slug>/` に閉じる原則は維持する。

## 結論

プロジェクトを実行方式（`web/`, `cli/`）ではなく、教材ジェネレータ単位で分ける。
ルートの `index.html` は各ジェネレータへ移動するための一覧ページとし、各ジェネレータは単独で開発・テストできる自己完結した構成にする。

CLI版は今後保守しないため、移行完了後に `cli/` を削除する。退避用の `legacy/` は作らず、必要になった場合はGit履歴から参照する。

## 実施状況

2026-07-11に、数字の階段を `generators/kazu-no-kaidan/` へ移動し、ルートの一覧ページ、起動コマンド、テスト入口を新構成へ更新した。Web版に必要な問題テンプレートがJavaScript側に実装されていることを確認し、`cli/` と旧 `web/` は削除した。

`generators/kazu-sagashi/` は、かずさがしの実装時に必要なファイルだけを作る。空ディレクトリや仮の画面は先に作らない。

## 推奨構成

```text
.
├── README.md
├── index.html                       # ジェネレータ一覧ページ
├── package.json                     # 全体のテスト・ローカル起動コマンド
├── generators/
│   ├── kazu-no-kaidan/              # 数字の階段
│   │   ├── index.html
│   │   ├── SPEC.md
│   │   ├── styles.css
│   │   ├── src/
│   │   │   ├── app.js               # DOM操作と画面イベント
│   │   │   ├── generator.js         # 作問
│   │   │   ├── solver.js            # 解答・一意性検査
│   │   │   └── renderer.js          # SVG・解説の描画
│   │   └── tests/
│   │       └── generator.test.js
│   └── kazu-sagashi/                # かずさがし
│       ├── index.html
│       ├── SPEC.md
│       ├── styles.css
│       ├── src/
│       │   ├── app.js
│       │   ├── generator.js
│       │   ├── solver.js             # 不要なら作らない
│       │   └── renderer.js
│       └── tests/
│           └── generator.test.js
├── scripts/
│   └── server.sh                    # リポジトリ全体をHTTP配信
└── docs/
    └── directory-structure-proposal.md
```

## この構成のルール

### 1. 教材ごとに閉じる

新しい教材は `generators/<generator-slug>/` を複製せず、必要なファイルだけを持つ。教材固有の作問規則、ソルバー、描画、CSS、テスト、仕様書はすべてその配下に置く。

`kazu-no-kaidan` のソルバーを `lib/` に置かない。数の階段の等差数列ルールは教材固有であり、かずさがしのルールとは共通基盤ではないためである。

### 2. 共通ディレクトリは最初から作らない

最初から空の `shared/` や `lib/` を用意しない。各ジェネレータを実装した結果、2つ以上で同じJavaScript実装が必要になった場合だけ、ルートに `lib/` を作って移す。

たとえばseed付き乱数が実際に共通になった時点で、次のように追加する。

```text
lib/
└── random.js
```

共通化の候補は、次のような教材ルールに依存しないJavaScriptに限定する。

- seed付き乱数
- ダウンロード、印刷ボタンの小さな補助処理

印刷CSSはわずかな重複を許容し、各ジェネレータの `styles.css` に置く。教材ごとに用紙構成が異なる可能性が高く、早い段階で共通CSSにすると変更理由が混ざるためである。

### 3. ルートは入口と開発コマンドだけにする

ルートの `index.html` に特定教材の画面を置かず、ジェネレータ一覧を表示する。GitHub Pagesでは次のURL構成になる。

```text
/<repository>/                              # 一覧
/<repository>/generators/kazu-no-kaidan/   # 数字の階段
/<repository>/generators/kazu-sagashi/     # かずさがし
```

`package.json` と `scripts/server.sh` もルートに1つだけ置き、どのジェネレータを作業するときも同じ起動方法にする。

### 4. テストは実装の近くに置く

各テストは対象ジェネレータの `tests/` に置く。ルートの `npm test` から全ジェネレータのテストをまとめて実行できるようにする一方、個別テストも直接実行できる状態を保つ。

## 現行ファイルの移動先

| 現在 | 移動先 |
|---|---|
| `web/index.html` | `generators/kazu-no-kaidan/index.html` |
| `web/SPEC.md` | `generators/kazu-no-kaidan/SPEC.md` |
| `web/styles.css` | `generators/kazu-no-kaidan/styles.css` |
| `web/js/app.js` | `generators/kazu-no-kaidan/src/app.js` |
| `web/js/problem-generator.js` | `generators/kazu-no-kaidan/src/generator.js` |
| `web/js/solver.js` | `generators/kazu-no-kaidan/src/solver.js` |
| `web/js/renderer.js` | `generators/kazu-no-kaidan/src/renderer.js` |
| `web/tests/level7-generator.test.js` | `generators/kazu-no-kaidan/tests/generator.test.js` |
| `web/server.sh` | `scripts/server.sh`（配信起点をリポジトリルートへ変更） |
| ルートの `index.html` | ジェネレータ一覧ページに置換 |
| `cli/` | Web版の動作確認後に削除 |

`cli/problem_models/*.json` にWeb版へ移していない正本データがある場合だけ、削除前に `generators/kazu-no-kaidan/fixtures/` へJSONを移す。Web側に同じデータが実装済みであれば残さない。

## 「かずさがし」を追加するときの最小単位

最初は次の6ファイル程度から始めればよい。

```text
generators/kazu-sagashi/
├── index.html
├── SPEC.md
├── styles.css
├── src/
│   ├── app.js
│   ├── generator.js
│   └── renderer.js
└── tests/
    └── generator.test.js
```

解の検証処理が必要になった時点で `solver.js` を追加する。別のジェネレータに合わせるためだけの空ファイルは作らない。

## 移行順序

1. `generators/kazu-no-kaidan/` を作り、現在のWeb版をそのまま移す。
2. import、HTMLの参照パス、テストの参照パスを直し、既存テストとブラウザ表示を確認する。
3. ルートの `index.html` を一覧ページに変更し、数字の階段へのリンクを置く。
4. ローカルサーバーと `package.json` をルートへ移す。
5. `generators/kazu-sagashi/` を追加し、一覧ページからリンクする。
6. Python側だけに必要なデータがないことを確認して `cli/` と空になった `web/` を削除する。
7. 2つの実装で同じJavaScriptが実際に重複した場合だけ、必要に応じて `lib/` を作って移す。

## 今回採用しない構成

- `web/kazu-no-kaidan/`, `web/kazu-sagashi/`: Web以外を作らない方針では `web/` が意味のない中間階層になる。
- `apps/`: 一般的だが、このリポジトリでは「何が並ぶ場所か」が `generators/` の方が明確である。
- `src/generators/...`: 画面、仕様書、テスト、スタイルまで `src/` に混ざりやすい。
- `legacy/cli/`: 保守対象に見え続ける。履歴はGitに任せる。
- 空の `shared/` や `lib/`: 将来の共通化を先回りせず、必要になった時点で作る。
- 最初から大きな共通ライブラリを作る: 教材固有ルールが混ざり、次のジェネレータを追加しにくくなる。

## 将来の追加例

```text
generators/
├── kazu-no-kaidan/
├── kazu-sagashi/
├── number-crossword/
└── magic-square/
```

追加時に触る場所は、原則として新しいジェネレータのディレクトリ、ルート一覧ページ、ルートのテスト設定の3箇所だけにする。
