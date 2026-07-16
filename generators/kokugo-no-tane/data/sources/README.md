# 言語候補データの出典と再取得

このディレクトリは、小学1-3年の学年別配当漢字候補と、教育基本語彙の小学校低学年・高学年候補を追跡するための出典台帳、正規化前データを保持する。取得元、取得日、取得物のSHA-256を `source-registry.json` に固定する。

## 漢字の採用経路

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

## 語彙の採用経路

国立国語研究所が公開する `kyoikukihongoi_2009B.csv` を、教育基本語彙候補の正本とする。公式配布物はCP932であり、取得時のバイト列を変更せず保存する。

```bash
curl -fLsS https://mmsrv.ninjal.ac.jp/brfvep/kyoikukihongoi_2009B.csv \
  -o kyoikukihongoi_2009B.csv
shasum -a 256 kyoikukihongoi_2009B.csv
```

2026年7月16日の取得物のSHA-256は
`e6936dd184ce3d0bc0b714a94d40a6863ce9bcb827ffd5288ed12457c58a98bd`
である。

`import-vocabulary.mjs` は、語彙配当 `1` を小学校低学年（1〜3年）、`2` を小学校高学年（4〜6年）として候補DBへ取り込む。語彙配当 `3` の中学校11,749語は件数だけを記録し、今回の配布候補から除外する。元データの配当を、個別学年の公式配当や児童の理解保証として扱わない。

同データベースは公式配布ページでCC BY 4.0と明記されている。生成物にも `source_releases` と必要な出典表示を保持する。

## 確認状態

漢字の転記と2経路の突合はAIが実施した。人間による原典との目視照合は完了していないため、生成される全漢字レコードの `manual_check_status` は `pending` とする。

語彙は公式CSVの配当・見出し・表記・品詞・7語彙表の採否・分類番号を機械的に保持した候補版である。現代の児童向け文章での自然さ、多義語、表記、差別的・不適切な語、使用文脈を目視確認していないため、全語を `candidate_unreviewed`、`active_for_generation=false` とする。
