# こくごのたね 本文品質 人間レビュー票

| 項目 | 値 |
| --- | --- |
| 文書状態 | 実施待ち |
| 文書版 | `passage-quality-human-review.v0.4` |
| 最終更新日 | 2026-07-25 |
| 対象generator | `kokugo-no-tane.prototype.v0.12` |
| 対象 | 本文構造3種類 × 本文長3種類の固定9件 |
| 利用条件 | `development_preview`、`child_use_permitted=false` |

## 1. 目的

本文品質修正の自動検査は、未解決参照、採点要素ごとの根拠欠落、展開文による正答の重複などを検出する。しかし、文章の自然さ、読み止まり、妥当な別解、答えのためだけに置かれた文は機械検査だけでは確定できない。

このレビューでは、解答と本文根拠を見ずに固定9件を解き、修正版を根拠グラフ導入前の回帰基準にできるか判断する。

## 2. 共通条件

- 生成方式：アルゴリズム
- 学年：小学1年生
- 生成プロファイル：3
- 題材：動物
- 画面上の「解答・解説」は閉じたまま解く。
- 解き終えるまで、生成診断にある根拠文IDを見ない。
- 印刷確認では「問題用紙を印刷」を使い、A4横・縦書きの全ページを確認する。

## 3. 固定fixture

同じ構造の3件は同じseedを使い、本文長だけを変える。先に `npm run serve -- --port 5173 --strictPort` を起動し、「開く」から直接生成物を表示する。リンクには `autogenerate=1` が含まれるため、フォームの再入力と生成ボタンの操作は不要である。

| ID | 開く | 期待する本文構造 | 本文長 | seed | 主な確認点 |
| --- | --- | --- | --- | --- | --- |
| `retry-craft-short` | [開く](http://127.0.0.1:5173/#/generators/kokugo-no-tane?grade=1&profile=3&length=short&topic=animal&seed=human-review-0&autogenerate=1) | `story-retry-craft.v1` | 短め | `human-review-0` | 失敗、見られた状況、反応、やり直しの因果 |
| `retry-craft-standard` | [開く](http://127.0.0.1:5173/#/generators/kokugo-no-tane?grade=1&profile=3&length=standard&topic=animal&seed=human-review-0&autogenerate=1) | `story-retry-craft.v1` | ふつう | `human-review-0` | 展開文が試行や見直しへ寄与するか |
| `retry-craft-long` | [開く](http://127.0.0.1:5173/#/generators/kokugo-no-tane?grade=1&profile=3&length=long&topic=animal&seed=human-review-0&autogenerate=1) | `story-retry-craft.v1` | 長め | `human-review-0` | 根拠間の文を読んでも因果を保持できるか |
| `clue-discovery-short` | [開く](http://127.0.0.1:5173/#/generators/kokugo-no-tane?grade=1&profile=3&length=short&topic=animal&seed=human-review-1&autogenerate=1) | `story-clue-discovery.v1` | 短め | `human-review-1` | 観察、予想、比較、理解、反応が最短構成で通るか |
| `clue-discovery-standard` | [開く](http://127.0.0.1:5173/#/generators/kokugo-no-tane?grade=1&profile=3&length=standard&topic=animal&seed=human-review-1&autogenerate=1) | `story-clue-discovery.v1` | ふつう | `human-review-1` | 「はじめの予想」の内容と参照先が明確か |
| `clue-discovery-long` | [開く](http://127.0.0.1:5173/#/generators/kokugo-no-tane?grade=1&profile=3&length=long&topic=animal&seed=human-review-1&autogenerate=1) | `story-clue-discovery.v1` | 長め | `human-review-1` | 展開文が発見の過程を豊かにし、答えを漏らさないか |
| `late-arrival-short` | [開く](http://127.0.0.1:5173/#/generators/kokugo-no-tane?grade=1&profile=3&length=short&topic=animal&seed=human-review-3&autogenerate=1) | `story-late-arrival.v1` | 短め | `human-review-3` | 第三人物の初登場、介入、主人公の理解が通るか |
| `late-arrival-standard` | [開く](http://127.0.0.1:5173/#/generators/kokugo-no-tane?grade=1&profile=3&length=standard&topic=animal&seed=human-review-3&autogenerate=1) | `story-late-arrival.v1` | ふつう | `human-review-3` | 三人の行動主体を読み分けられるか |
| `late-arrival-long` | [開く](http://127.0.0.1:5173/#/generators/kokugo-no-tane?grade=1&profile=3&length=long&topic=animal&seed=human-review-3&autogenerate=1) | `story-late-arrival.v1` | 長め | `human-review-3` | 人物間のやり取りが意味のある負荷になっているか |

コード上の正本は `tests/fixtures/passage-quality-review-cases.js` とし、この表とずれた場合は同じ変更で同期する。

## 4. 各fixtureで記録すること

1. 本文だけを読み、各問への自分の答えを書く。
2. 読み止まった文、前後がつながらない文、参照先を探し直した表現を記録する。
3. 設問に使われないが物語理解に必要だった文と、削除しても理解が変わらない文を分ける。
4. 解答・解説を開き、自分の答えと模範解答を比較する。
5. 模範解答と異なるが本文に合う答えを別解として記録する。
6. 記述問題について、理由1点と心情1点を本文だけから採点できるか確認する。
7. 印刷プレビューまたはPDFで、欠落、重なり、はみ出し、過度な文字縮小、不自然な改ページを確認する。
8. 本文に異なる漢字が5字以上あり、そのうち5字以上が自然な文脈で複数回現れるか確認する。

## 5. 記録欄

| fixture ID | 全問回答可能 | 読み止まり | 妥当な別解 | 不要に見える文 | 表記 | 印刷 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `retry-craft-short` | 未完 | 「じぶんがするところ」に違和感。`deterministic-story-template.v0.6` で「それぞれがすることをきめました」へ修正 | 未確認 | 未確認 | `v0.12` で小学1〜3年配当の管理語彙を使う契約へ更新。固定fixtureは漢字9種類、そのうち7種類が複数回出現 | 本文変更後もChrome印刷プレビュー2ページに欠落・重なり・はみ出し・不自然な改ページがないことを技術確認済み。紙での再確認待ち | 要修正（修正済み・再確認待ち） |
| `retry-craft-standard` | 未実施 |  |  |  |  | 未実施 | 保留 |
| `retry-craft-long` | 未実施 |  |  |  |  | 未実施 | 保留 |
| `clue-discovery-short` | 未実施 |  |  |  |  | 未実施 | 保留 |
| `clue-discovery-standard` | 未実施 |  |  |  |  | 未実施 | 保留 |
| `clue-discovery-long` | 未実施 |  |  |  |  | 未実施 | 保留 |
| `late-arrival-short` | 未実施 |  |  |  |  | 未実施 | 保留 |
| `late-arrival-standard` | 未実施 |  |  |  |  | 未実施 | 保留 |
| `late-arrival-long` | 未実施 |  |  |  |  | 未実施 | 保留 |

判定は次のいずれかとする。

- `承認`：本文だけで全問へ答えられ、重大な読み止まりと紙面不良がない。
- `要修正`：本文、設問、模範解答、許容解、採点基準、紙面のいずれかを直す必要がある。
- `却下`：局所修正では測定契約または物語構造を保てない。

## 6. 完了ゲート

- 9件すべてに判定と記録がある。
- 記述問題の理由と心情を、解答を見ずに本文から採点できる。
- 妥当な別解が `acceptable_answers` または採点基準へ反映されている。
- 全印刷ページに欠落、重なり、はみ出し、不自然な改ページがない。
- `要修正` と `却下` が0件になった時点で、9件を根拠グラフ段階1の承認fixtureとする。

このゲートを通るまで、新たな児童試行、学力判定、公開教材化へ進めない。
