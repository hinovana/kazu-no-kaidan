# 漢字候補データの出典と再取得

このディレクトリは、小学1-3年の学年別配当漢字候補を追跡するための出典台帳と、正規化前の転記データを保持する。PDF本体はリポジトリへ同梱せず、公式URL、取得日、取得物のSHA-256を `source-registry.json` に固定する。

## 採用経路

正本は、文部科学省の平成29年告示に基づく次の公式PDF 2点である。

1. `mext_elementary_curriculum_h29_kanji`: 告示本文の別表
2. `mext_elementary_japanese_explanation_h29_kanji`: 国語編解説の付録3に収録された同別表

2資料から別々に転記した `grades[*].rows` を `import-kanji.mjs` が比較する。学年ごとの文字列が一致しない場合、取込処理は失敗する。

文部科学省の公式HTML `https://www.mext.go.jp/a_menu/shotou/cs/1320015.htm` にも学年別漢字配当表があるが、これは平成20年告示版である。第1-3学年の一覧が同じであっても、平成29年告示の独立抽出経路としては採用しない。

## 取得物の確認

2026年7月15日の取得物は次のコマンドでSHA-256を確認した。

```bash
curl -fLsS https://www.mext.go.jp/content/20230120-mxt_kyoiku02-100002604_01.pdf -o mext-h29-curriculum.pdf
curl -fLsS https://www.mext.go.jp/content/20220606-mxt_kyoiku02-100002607_002.pdf -o mext-h29-explanation.pdf
shasum -a 256 mext-h29-curriculum.pdf mext-h29-explanation.pdf
```

PDFのURL上の内容は将来差し替わる可能性がある。再取得時に台帳のハッシュと一致しない場合は、同じ版と仮定せず、資料の更新内容と漢字表の差分を確認してから台帳を更新する。

## 確認状態

転記と2経路の突合はAIが実施した。人間による原典との目視照合は完了していないため、生成される全レコードの `manual_check_status` は `pending` とする。
