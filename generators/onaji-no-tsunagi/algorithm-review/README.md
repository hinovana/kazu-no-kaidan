# 人間の目によるアルゴリズムレビュー

この文書を、多数問監査レポートの作成、表示、更新に関する正本とする。

機械検査で得た集計値と問題標本を一覧表示し、人間が盤面を見ながら
生成アルゴリズムとfilter条件をレビューする。自動分類は比較の補助であり、
問題の美しさ、児童の体感難易度、児童利用可否を証明するものではない。

## ディレクトリの役割

### 参照テンプレート

`../../../../ref/human-algorithm-review-report/` は、新しいレポート実体を作るときに
参照する表示テンプレートである。これは作業用の参照資産であり、監査のために
変更しない。

```text
ref/human-algorithm-review-report/
├── template.html
├── template.css
└── template.js
```

ここには監査結果JSON、監査ごとの集計値、起動スクリプト、別のREADMEを置かない。
テンプレートの変更が必要に見える場合も、先にこのGit管理下のレビュー実体で
要件と回帰を確認し、参照テンプレートには明示的な変更依頼があるまで触れない。

### 現在のレポート実体

このディレクトリは、現在レビューしているレポート基盤を保持するGit管理対象である。
監査JSONはローカルで生成・更新する作業データであり、`data/.gitignore` により
Git管理しない。

```text
algorithm-review/
├── README.md
├── server.sh
├── index.html
├── style.css
├── app.js
└── data/
    ├── .gitignore
    └── *.json                         # ローカル生成物（Git管理しない）
```

- `index.html`: レポートの表示領域と既定JSONパス
- `style.css`: 採用したB3デザインと盤面一覧・モーダルのレイアウト
- `app.js`: JSON読込、集計表、SVG盤面、問題モーダルの描画
- `data/*.json`: 監査処理が生成した入力データ（Git管理しないローカル生成物）
- `server.sh`: このディレクトリだけをlocalhost配信する起動スクリプト

表示コードと監査データを分離し、集計値や問題座標をHTMLへ直書きしない。

## 起動する

このディレクトリで次を実行する。

```bash
./server.sh
```

ブラウザで次を開く。既定では6×6・12端点を2,000問生成した監査JSONを
表示する。

```text
http://127.0.0.1:8000/
```

`server.sh` は `127.0.0.1:8000` にだけbindし、このディレクトリより上は
配信しない。停止するときは、起動したterminalで `Ctrl+C` を押す。

## 入力JSONを切り替える

既定では、`index.html` の `data-default-report` で指定した
`data/6x6-4-4-4-filter-classification-audit-2000.json` を読み込む。

別の監査JSONを一時的に表示する場合は、`data/` に配置して `report` queryへ
ファイル名を指定する。

```text
http://127.0.0.1:8000/?report=別ファイル.json
```

`report` は `data/` 内のJSONファイル名だけを受け付ける。ディレクトリ区切り、
`..`、JSON以外の拡張子は拒否する。

既定の監査を変更する場合は、次のどちらかを行う。

1. 新しい監査結果で既定JSONを置き換える。
2. JSONを内容が分かる別名で保存し、`index.html` の
   `data-default-report` を変更する。

多数問監査の入力JSONは、現在
`onaji-no-tsunagi.six-by-six-filter-classification-audit.v3` を使用する。
新しいschemaを導入するときは、旧schemaを黙って読み替えず、`app.js` の
入力検査とこの文書を同じ変更で更新する。

## localhost配信を使う理由

`file://` で開いたHTMLから別ファイルのJSONを `fetch` すると、
ブラウザの同一オリジン制約により失敗する。ファイル選択やドロップ操作を
毎回要求せず、HTML・CSS・JavaScriptとJSONを分離したまま自動表示するため、
localhost配信を標準とする。

## 表示上のレビュー契約

- 条件別の違反問題数と、各違反群の難易度分類内訳を同じ表で比較できる。
- 表の末尾に、filter適用前の母集団と全filter通過群を表示する。
- 条件一覧のコピーボタンは、各条件をMarkdownの `* ` 箇条書きでコピーする。
- 問題カードは一覧性を優先して問題盤面だけを表示する。
- 問題ID、答え、機械指標、違反条件は問題カードのモーダル内に表示する。
- 該当問題が0問の分類も省略せず、「該当問題なし」と表示する。
- 原本問題を表示する場合も、監査JSONから読み込み、テンプレートへ座標を埋め込まない。

## 6x6-4-4-4のcover範囲比較

36マスcover 2,000問の監査は次を開く。

```text
http://127.0.0.1:8000/?report=6x6-4-4-4-filter-classification-audit-2000.json
```

31〜35マスcover 2,000問の監査は次を開く。

```text
http://127.0.0.1:8000/?report=6x6-4-4-4-partial-cover-filter-classification-audit-2000.json
```

両レポートは同じ原本基準、同じ5分類、同じ6配置条件、同じ集計schemaを使う。
部分cover側は、36マス唯一解を1〜5マス短縮した後、配置filterをかけずに
独立solverで`exact: 1`を再証明し、31〜35マスかつtopology非重複の2,000問を
母集団とする。これにより、生成時に同じfilterを先取りせずcover範囲の差を測る。

| 指標 | 36マス | 31〜35マス | 差 |
| --- | ---: | ---: | ---: |
| 原本近傍 | 1 | 64 | +63 |
| 明らかに簡単側 | 73 | 186 | +113 |
| 指標混合・簡単寄り | 1,908 | 1,623 | -285 |
| 指標混合・難しい寄り | 18 | 127 | +109 |
| 全filter通過 | 775（38.75%） | 812（40.6%） | +37（+1.85pt） |
| 初期選択肢量・中央値 | 124,416 | 373,248 | +248,832 |
| 強制出口・中央値 | 3 | 2 | -1 |
| solver状態・中央値 | 214 | 210 | -4 |
| 総曲がり・中央値 | 10 | 8 | -2 |

31〜35マス側の内訳は、31マス31問、32マス79問、33マス232問、
34マス525問、35マス1,133問である。

部分cover監査を再生成する場合は次を使う。HTML、JavaScript、CSSは変更せず、
既存schemaに適合するJSONだけを更新する。

```bash
cd ../../..
npm run audit:onaji-no-tsunagi:6x6-partial-cover-filter-classification -- \
  --sample-count=2000 \
  --output-prefix=generators/onaji-no-tsunagi/algorithm-review/data/6x6-4-4-4-partial-cover-filter-classification-audit-2000 \
  --write-html=false
```

機械分類の増減は、美しさや児童の体感難易度の証拠ではない。

## 新しい監査レポートを作る

1. 対象profileと母集団、seed系列、filter条件を決める。
2. 監査処理から、集計とレビュー標本を含むJSONを生成する。
3. JSONを内容が分かるファイル名で `data/` に配置し、必要なら
   `data-default-report` を変更する。
4. `server.sh` を起動して、集計値がJSONと一致することを確認する。
5. 実ブラウザで、表、問題カード、問題・答えモーダル、IDコピーを確認する。
6. consoleのwarning/error、狭幅表示、長い条件名や0問分類の表示を確認する。

自動検査を通過しても、人間による問題標本の確認が終わったことにはしない。

`data/*.json` はGit管理しない。既定JSONを含め、clone直後や別環境では上記の
再生成コマンドで必要な監査JSONを配置してから表示する。

## 表示基盤を変更するとき

`index.html`、`style.css`、`app.js` はこのGit管理下のレビュー実体である。
これらはユーザーから明示的な変更依頼がない限り変更しない。監査固有の集計値、
条件、問題標本だけが変わる場合は、既存schemaに適合する入力JSONだけを更新する。

外側の `ref/human-algorithm-review-report/` は不変の参照テンプレートとして扱う。
そのテンプレートを更新する作業は、このレビュー基盤の変更とは別途、明示的に依頼
された場合だけ行う。
