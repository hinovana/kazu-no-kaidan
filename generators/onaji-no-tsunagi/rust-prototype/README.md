# Rust builder・solver prototype

`onaji-no-tsunagi`のオフライン大量生成を高速化できるか検証するための、
本番未採用prototypeである。TypeScript版を置き換えず、独立solverの契約一致、
単体速度、対象profile限定builderのbatch throughputを測る。

## 現在の範囲

- 最大64マスのPuzzle JSON / NDJSON入力
- `u64` bitsetによるpartner非固定の完全探索
- 2解目までの探索と`exact` / `at-least`の区別
- `budget_exhausted`と`unsatisfiable`の区別
- component parity、残余到達可能性、失敗状態memoによる枝刈り
- TypeScript版と同じcanonical solution hash・探索順・metrics
- `--jobs`による独立入力の並列solver実行（入力順で出力）
- `6x6-4-4-4`限定の36マスsolution-first exact-cover builder
- builderからpartner非固定solver、総曲がり上限、直線gateまでのbatch pipeline
- 36マス基盤の経路端を5マス短縮し、31マスで唯一解を再証明するbatch
- seed番号を分割できる決定的な並列CLI
- release binaryを使う固定fixture benchmark
- 1,000問を既存アルゴリズムレビューschemaへ載せるTypeScript境界

含まないもの:

- Rust内での8条件集計、原本基準難易度分類、レビューJSON組み立て
- 本番と同じsymbol variant巡回順、optimizer、provenance
- 既存コーパス横断のtopology重複排除とデータベース永続化
- `6x6-4-4-2`の端点配置policyと難易度選別
- 本番Web UIからの呼び出し

builderは大量生成の速度を測るための限定移植である。高速な候補生成だけでは
唯一解保証を維持できないため、採用候補は同じRust独立solverで`exact: 1`を
確認し、比較testではさらにTypeScript solverで解き直す。

## 2026-07-30 初回結果

`rustc 1.97.1`、Node.js `v26.5.0`、arm64環境で確認した。

- 固定3問と決定的に生成した6×6各profile 3問、合計12問で、status、解数、
  canonical hash、全solver metricsがTypeScript版と一致
- 固定`6x6-4-4-4` 1問をwarm-up後100回測定
- TypeScript median: 6,894.04µs
- Rust release median: 2,087µs
- solver単体: 3.30倍
- builder batch 1,000 seed: 476問採用、470 topology、重複6問を検出
- 1 worker: 3.804秒、262.86試行/秒、125.12採用/秒
- 8 workers: 1.168秒、855.73試行/秒、407.33採用/秒

この値は一つの問題に対するsolver単体の初期測定であり、builderを含む
100万問の良問データベース生成所要時間をまだ表さない。builder値も36マスの
限定pipelineであり、共有経路候補の初期化時間、31マス短縮、難易度分類、
重複の棄却、永続化を含まない。476問を「難しい良問」と分類した値でもない。

31マス監査用batchでは、1,000基盤seed・97,600変形からRust solverで
1,117候補を採用し、topology非重複の先頭1,000問を出力した。Rust処理は
5.781秒、TypeScriptによる全問parityと監査JSON生成を含む全体は7.963秒だった。
生成した1,000問は全問31マス・`exact: 1`で、Rust/TypeScript間の解数、
canonical hash、solver metrics、topology hashが一致した。

## 実行

リポジトリルートで:

```bash
npm run test:onaji-no-tsunagi:rust-prototype
npm run benchmark:onaji-no-tsunagi:rust-prototype
npm run benchmark:onaji-no-tsunagi:rust-builder-prototype
npm run audit:onaji-no-tsunagi:6x6-rust-31-cell-filter-classification
```

直接実行する場合:

```bash
cargo run --release \
  --manifest-path generators/onaji-no-tsunagi/rust-prototype/Cargo.toml \
  -- \
  --input generators/onaji-no-tsunagi/rust-prototype/fixtures/parity-puzzles.ndjson \
  --state-budget 500000 \
  --solution-limit 2 \
  --jobs 3
```

入力は一行一問のPuzzle NDJSON、またはPuzzleのJSON配列とする。出力は
一行一結果のNDJSONで、`elapsedMicros`、解数状態、探索metrics、
canonical solution、正規化hashを含む。

builder batch:

```bash
cargo run --release \
  --manifest-path generators/onaji-no-tsunagi/rust-prototype/Cargo.toml \
  --bin build_batch \
  -- \
  --seed-prefix corpus-part-1 \
  --start 0 \
  --count 1000 \
  --jobs 8
```

標準出力はseed順の試行NDJSON、標準エラーはthroughput集計JSONである。
`--start`を分ければ、複数processや複数machineへseed範囲を割り当てられる。

31マスを1,000問だけNDJSONへ出すbinaryは`build_trimmed_batch`である。
監査用npm commandはこのbinaryを起動し、TypeScriptで全問を再照合してから
既存schema v6のJSONを`algorithm-review/data/`へ生成する。

## 採用判断

1,000問の一致だけで本番採用しない。Rust版は本番TypeScriptとsymbol variant
巡回順、optimizer、完全なprovenanceがまだ異なる。次段では同一seed・同一候補
順のA/B、topology重複棄却、永続化形式を定めてから本番切替を判断する。
