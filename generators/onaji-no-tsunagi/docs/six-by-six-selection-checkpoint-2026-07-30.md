# 6×6選別・31マス監査 チェックポイント

| 項目 | 内容 |
| --- | --- |
| 記録日 | 2026-07-30 |
| 対象branch | `codex/onaji-no-tsunagi` |
| 差分の親commit | `56f5857` |
| TypeScriptチェックポイントcommit | `0a9bc6c` |
| 対象profile | `6x6-4-4-2`、`6x6-4-4-4` |
| 位置づけ | Rustバッチ生成prototypeへ着手する直前のTypeScript実装・監査状態 |
| 正誤・唯一解契約 | [`../SPEC.md`](../SPEC.md) |
| 児童利用 | 未校正のため不可。`childUsePermitted: false`を維持する |

## 1. このチェックポイントで確定した変更

### 1.1 中央4×4の監査条件

31マス固定監査の中央端点数条件を、合計3〜5個から4〜6個へ変更した。
これは監査filterの変更であり、単独では児童の体感難易度または問題の美しさを
保証しない。

### 1.2 12端点の直線gate

`6x6-4-4-4`では、canonical solutionに曲がり0の真横経路が3本以上、
または曲がり0の真縦経路が3本以上ある候補を後段採用gateで棄却する。
横と縦は合算しない。

通常の36マス基盤生成時だけでなく、5マス短縮後に独立solverで再計算した
31マスcanonical solutionにも同じprofile policyを再適用する。
基盤だけにgateを適用した履歴母集団では直線違反が88/1,000問残ったが、
31マス完成候補にも適用した現行母集団では0/1,000問になった。

### 1.3 10端点の既存選別との違い

`6x6-4-4-2`は、端点配置filter通過後に原本基準4指標で分類し、
`clearly_easier`を棄却して再生成する。既定では`reference_like`、
`clearly_harder`、`mixed`を採用する。

`6x6-4-4-4`は、このチェックポイントでは直線gateだけを通常生成へ組み込み、
原本基準分類による出題候補の再生成はまだ実装していない。31マス監査だけが
`mixed_easier`と`mixed_harder`を分けて観測する。

## 2. 現行31マス1,000問監査

表示URL:

```text
http://127.0.0.1:8000/?report=6x6-4-4-4-31-cell-filter-classification-audit-central-4-to-6-1000.json
```

| 指標 | 現行値 |
| --- | ---: |
| 明らかに簡単側 | 203 |
| 原本近傍 | 179 |
| 明らかに難しい側 | 4 |
| 指標混合・簡単寄り | 461 |
| 指標混合・難しい寄り | 153 |
| 全8条件通過 | 420（42.0%） |
| 全条件通過群の原本近傍 | 84 |
| 全条件通過群の明らかに難しい側 | 4 |
| 直線filter違反 | 0 |

生成監査:

- 385基盤
- 76,836変形
- 非唯一解72,823件
- 31マス正準解のprofile policy違反88件
- 変形重複2,925件
- 採用1,000問
- 全問31マス、独立solverの`exact: 1`、topology非重複
- integrity check全項目通過

監査JSONは`algorithm-review/data/.gitignore`の方針に従いGit管理しない。
再生成コマンドと集計値を正本へ保存する。

| JSON | SHA-256 |
| --- | --- |
| `6x6-4-4-4-31-cell-filter-classification-audit-central-4-to-6-1000.json` | `ae4241050336cdb781548b04e2817ca665e05c55e764c0a2ac0bd76a277176cf` |
| `6x6-4-4-4-31-cell-filter-classification-audit-base-gate-only-1000.json` | `ba1aa2b84af770c5241bc2a5b8beff515b9b2020b8edd82e9b7d43e64846bfa3` |

再生成:

```bash
npm run audit:onaji-no-tsunagi:6x6-31-cell-filter-classification
```

## 3. 分析上の未確定事項

- `clearly_harder`は4/1,000問だけであり、児童にとって難しい良問と証明した
  labelではない。
- `縦横隣接で連なる端点4個以上を禁止`は392問に違反するが、
  違反群に原本近傍61問を含むため、現状の一括gate化はしない。
- 端点連結条件は、連結数4・5・6以上と、直線・L字・階段・2×2型へ分解して
  人間レビューする必要がある。
- `6x6-4-4-2`の簡単側1%は、中央端点数3〜5個だった履歴監査値である。
  現行4〜6個条件で同じ分布は再測定していない。
- `6x6-4-4-4`の原本近傍または難しい寄りをUIで選択し、内部再生成する機構は
  設計候補であり、このチェックポイントには含めない。

## 4. Rust prototypeへ引き渡す契約

prototypeは本番TypeScript実装を置き換えず、オフライン大量生成の速度と
移植可能性だけを検証する。

必ず維持する契約:

- 36マスmaskは64bitで保持する
- 同記号4個のpartnerを固定しない
- 2解目を探索し、完全探索完了時だけ`exact: 1`とする
- `budget_exhausted`、`unsatisfiable`、`exact`を区別する
- seedと列挙順を決定的にする
- topology hashで重複を検出する
- TypeScript版と固定fixtureの解数・正規化解を比較する

prototypeの初期範囲:

1. 6×6 Puzzle JSONまたはNDJSONを読み込む
2. partner非固定solverで最大2解まで探索する
3. 解数状態、探索状態数、canonical solutionをNDJSONで出力する
4. 独立したseed範囲を並列処理できるCLI境界を作る
5. TypeScript版との固定fixture比較と小規模benchmarkを記録する

solution-first builderの完全移植は、solver prototypeの一致と計測を確認した後の
次段階とする。prototypeを速いという理由だけで本番採用せず、同一問題集合の
正規化解一致を採用条件にする。

実装後、solverに加えて`6x6-4-4-4`の36マス構築だけを対象にした限定builderも
追加した。これは大量batchのthroughput測定用であり、31マス短縮、全品質gate、
topology重複排除、難易度分類、永続化をまだ含まないため、完全移植には当たらない。

## 5. チェックポイント検証

コミット前に次を実行し、すべて成功した。

```bash
npm run test:onaji-no-tsunagi
npm run audit:onaji-no-tsunagi:6x6-31-cell-filter-classification
npm run build
git diff --check
```

`test:onaji-no-tsunagi`はlint、application全体の型検査、教材単体の型検査、
全個別test、jsdom 5 test、5×5 30 seed、6×6 100問/profileを含む。
6×6 quick corpusは全300問で`exact: 1`、12端点100問で直線gate違反0、
回帰gate通過だった。31マス監査は1,000問を56.595秒で再生成し、
直線違反0、全8条件通過420、integrity check全項目通過を再現した。
production buildも成功した。

監査画面は既存の`index.html`、`app.js`、`style.css`を変更せず、
既存schemaへ適合するJSONとしてブラウザ表示を確認済みである。
