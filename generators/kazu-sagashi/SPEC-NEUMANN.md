# かずさがし「レベル: ノイマン」専用仕様書

## 1. 位置づけ

「レベル: ノイマン」は、`kazu-sagashi` の最難関レベルである。内部レベル値は `7`、表示名は `レベル: ノイマン`、論理データの `mode` は `triple-order` とする。

「ノイマン」は最難関レベルの固有名であり、フォン・ノイマン近傍を意味しない。探索枠は既存レベルと同じ、格子線に沿った `3 × 3` とする。

このレベルは、単に盤面を大きくしたり図柄を増やしたりして作業量を増やすものではない。次を同時に満たす問題だけを採用する。

- 3種類を別々に数える必要がある。
- 二つの不等式を両方使わなければ正解を特定できない。
- 一つの図柄、総果物数、局所的な密集だけから正解位置が漏れない。
- 条件を片方だけ確認したときに、もっともらしい誤答候補が複数残る。
- 条件を満たす探索枠は1か所だけである。

`kazu-sagashi-v4` で生成、独立検証、描画、seedコーパスまで技術実装済みである。v4では実問題 `KS-N-0RTTQSI` で確認された複合手掛かりによる視覚漏洩を禁止した。15節の児童による難易度検証が完了するまでは、UIで「試験版」と明示し、実証済みの最難関とは説明しない。

## 2. 児童向け問題文

問題文は次を基準とする。

> どのくだものも1こ以上あります。リンゴ、ナシ、ミカンの順に数が多くなるところはどこ？

対象は小学1年生を含むため、不等号の知識を前提にしない。図柄名と盤面上の記号を迷わず対応できるように、問題文の直下へ盤面と同じSVG図柄を使った二つの比較文を表示する。色だけに依存せず、画面とグレースケール印刷の両方で次の対応が読めなければならない。

```text
[リンゴ画像] リンゴ より [ナシ画像] ナシ が多い
[ナシ画像] ナシ より [ミカン画像] ミカン が多い
```

内部データでは `<` を使用してよいが、児童が見る問題面と解答面には不等号だけの条件表示を出さない。

「各図柄1個以上」は正解枠だけの非表示条件にせず、問題文と判定述語の両方に含める。

## 3. 盤面とセル状態

| 項目 | 値 |
|---|---|
| 盤面 | 10 × 10 |
| 候補枠 | 3 × 3 |
| 候補枠数 | 64 |
| セル状態 | 空、リンゴ、ナシ、ミカン |
| 1セルの図柄数 | 0個または1個 |
| 正解数 | 必ず1か所 |

各セルは排他的な4状態とする。同じセルに複数の図柄を重ねない。

```text
cell[r][c] ∈ {empty, apple, pear, orange}
```

数値表現を使う場合は次で固定する。

```text
0 = empty
1 = apple
2 = pear
3 = orange
```

## 4. 正解条件

左上座標が `(r, c)` の候補枠について、各図柄の個数を次で表す。

```text
C(r, c) = (appleCount, pearCount, orangeCount)
```

正解条件は次の述語だけで判定する。

```text
P(C) := 1 ≤ appleCount < pearCount < orangeCount
```

全64候補枠を同じ述語で検査し、解集合を次で定義する。

```text
S = {(r, c) | P(C(r, c))}
```

採用問題は必ず `|S| = 1` を満たす。生成器が意図した座標ではなく、全探索で得た唯一の座標を正解と照合する。

`3 × 3` は9セルであり、1セル1図柄なので、述語を満たす個数三つ組は次の7通りである。

```text
(1, 2, 3), (1, 2, 4), (1, 2, 5),
(1, 2, 6), (1, 3, 4), (1, 3, 5),
(2, 3, 4)
```

ただし、正解枠の密集やミカンの大きな塊から位置が漏れるのを避けるため、生成時に正解枠へ選んでよい三つ組は次の3通りに限定する。

```text
ANSWER_TRIPLES = {(1, 2, 3), (1, 2, 4), (1, 3, 4)}
```

これは生成品質条件であり、他候補枠の判定を狭める条件ではない。他候補枠は7通りすべてを正解として扱い、競合が1か所でもあれば不採用とする。

## 5. 難しさの必須条件

### 5.1 部分条件だけでは解けないこと

候補枠集合を次のように定義する。

```text
A = {(r, c) | 1 ≤ appleCount < pearCount}
B = {(r, c) | pearCount < orangeCount}
```

正解集合は `A ∩ B` であり、採用問題は次を満たす。

```text
|A ∩ B| = 1
|A| ≥ 8
|B| ≥ 8
```

これにより、前半の不等式または後半の不等式だけを調べても正解を特定できないようにする。

### 5.2 二種類の認知的な紛らわしさ

正解ではない候補枠について、次の二種類を数える。

```text
typeLeft:
  1 ≤ appleCount < pearCount
  AND pearCount >= orangeCount
  AND pearCount - orangeCount ≤ 1

typeRight:
  appleCount >= pearCount
  AND pearCount < orangeCount
  AND appleCount - pearCount ≤ 1
  AND pearCount >= 1
```

`typeLeft` は後半だけ、`typeRight` は前半だけが惜しい候補である。採用問題は次を満たす。

```text
typeLeftCount  ≥ 3
typeRightCount ≥ 3
```

さらに、両種類を合わせた候補枠の左上座標が、8 × 8の候補座標領域を2 × 2に分けた4領域のうち3領域以上に存在することを要求する。紛らわしい枠が正解周辺だけに固まる盤面は採用しない。

### 5.3 一つの数え方による位置漏洩の禁止

正解枠の個数三つ組を `(a*, p*, o*)`、総果物数を `t* = a* + p* + o*` とする。正解枠を含め、同じ値を持つ候補枠数を次で定義する。

```text
sameAppleCount  = |{w | appleCount(w) = a*}|
samePearCount   = |{w | pearCount(w) = p*}|
sameOrangeCount = |{w | orangeCount(w) = o*}|
sameTotalCount  = |{w | totalFruitCount(w) = t*}|
```

採用問題は次を満たす。

```text
sameAppleCount  ≥ 5
samePearCount   ≥ 5
sameOrangeCount ≥ 5
sameTotalCount  ≥ 5
```

したがって、どれか1種類だけを数える方法や、総数だけを見る方法では正解を一意に特定できない。

### 5.4 二つの手掛かりを組み合わせた位置漏洩の禁止

5.3の単独一致数だけでは、「ミカン数と総果物数」「ミカン数と果物の塊」のような二つの目立つ特徴を合わせたときに正解が1枠へ絞れる問題を除外できない。この漏洩は、実問題 `KS-N-0RTTQSI` が対象児童に約1秒で発見された事例から追加した回帰条件である。

各候補枠について、果物の種類を区別せず上下左右の4近傍で連結した果物セルの最大数を `largestOccupiedCluster` とする。手掛かり集合を次で定義する。

```text
F = {
  appleCount,
  pearCount,
  orangeCount,
  totalFruitCount,
  largestOccupiedCluster
}
```

`F` から異なる二つの手掛かり `(x, y)` を選び、正解枠と両方の値が一致する候補枠数を次で数える。

```text
sameJointCount(x, y)
  = |{w | x(w) = x(answer) AND y(w) = y(answer)}|
```

10通りすべての組み合わせについて次を満たさなければならない。

```text
sameJointCount(x, y) ≥ 3
```

出力メトリクス名は `sameApplePearCount`, `sameAppleOrangeCount`, `samePearOrangeCount`, `sameAppleTotalCount`, `samePearTotalCount`, `sameOrangeTotalCount`, `sameAppleClusterCount`, `samePearClusterCount`, `sameOrangeClusterCount`, `sameTotalClusterCount` とする。

`KS-N-0RTTQSI` は `sameOrangeTotalCount = 1` かつ `sameOrangeClusterCount = 1` なので、この条件で必ず不採用になる。

### 5.5 見た目による位置漏洩の禁止

全候補枠について、リンゴ数、ナシ数、ミカン数、総果物数をそれぞれ昇順に並べる。正解枠の各値は、同順位を含めた経験分布の10パーセンタイル未満または90パーセンタイル超になってはならない。

実装では、値 `v` の下側率と上側率を次で計算し、すべての図柄数と総果物数で両方が0.9以下であることを確認する。

```text
lowerFraction(v) = count(value < v) / 64
upperFraction(v) = count(value > v) / 64
```

加えて、正解枠内では次を禁止する。

- 同じ図柄が縦または横に4近傍で4セル以上連結する配置。
- 2 × 2の4セルが同じ図柄になる配置。
- 9セルすべてが果物で埋まる配置。

### 5.6 密度と図柄比率

盤面全体について次を満たす。

```text
0.45 ≤ occupiedCellDensity ≤ 0.70
0.20 ≤ appleCount  / totalFruitCount ≤ 0.45
0.20 ≤ pearCount   / totalFruitCount ≤ 0.45
0.20 ≤ orangeCount / totalFruitCount ≤ 0.45
```

正解枠と盤面全体の占有密度差は0.25以下とする。これは全候補枠に対する順位条件と併用し、密度差だけで見た目の自然さを判定しない。

空行同士、充填行同士、空列同士、充填列同士が隣り合う盤面は採用しない。定義は通常仕様の `uniformLineViolationCount` と同じとする。

## 6. 探索用距離

候補枠を条件成立させるために必要な最小セル置換数を探索用距離とする。候補枠の状態別個数を `x = (empty, apple, pear, orange)`、条件を満たす状態別個数を `y` とする。

```text
Y = {y | y_empty + y_apple + y_pear + y_orange = 9
         AND 1 ≤ y_apple < y_pear < y_orange}

distanceNeumann(x)
  = min (9 - Σ min(x_state, y_state))
      y ∈ Y      state ∈ {empty, apple, pear, orange}
```

`distanceNeumann = 0` は解、`distanceNeumann = 1` は探索上の近似枠である。ただし、距離1の個数だけを教材難易度の採用条件にしてはならない。教材上の紛らわしさは5.1から5.6で判定する。

## 7. レベルプロファイル

初期値は次とする。

```text
level = 7
levelLabel = "ノイマン"
mode = "triple-order"
rows = 10
cols = 10
cellValues = [0, 1, 2, 3]
cellStates = ["empty", "apple", "pear", "orange"]
answerTriples = [[1,2,3], [1,2,4], [1,3,4]]
requiredJointCueCount = 3
initialProbabilities = [0.40, 0.20, 0.20, 0.20]
maxRestarts = 128
maxRepairStepsPerRestart = 1024
maxQualityMovesPerStep = 96
tabuLength = 24
stagnationLimit = 64
maxVariantIndex = 31
```

探索上限は生成失敗までの計算量を制限する値であり、品質条件を緩める値ではない。10,000 seed試験の結果に基づいて変更してよいが、変更時は `generatorVersion` を上げる。

## 8. 出題アルゴリズム

### 8.1 固定する乱数選択

問題専用seedは通常仕様と同様に次から導出する。

```text
generatorVersion / level / normalizedSeed / questionIndex / variantIndex
```

再始動より前に、次を一度だけ選び、同じ問題の全再始動で固定する。

1. 正解枠の左上座標を64座標から一様に選ぶ。
2. `ANSWER_TRIPLES` の3通りから正解三つ組を一様に選ぶ。
3. 三つ組を満たし、5.5の正解枠内配置条件を満たす9セル配置から一様に選ぶ。

生成しやすさを理由に、再始動時に正解座標または正解三つ組を選び直してはならない。

### 8.2 初期盤面

正解枠の9セルを固定配置で埋める。正解枠外は再始動専用seedから導出した疑似乱数を使い、次の分布で独立に初期化する。

```text
P(empty)  = 0.40
P(apple)  = 0.20
P(pear)   = 0.20
P(orange) = 0.20
```

### 8.3 全候補枠の解析

各盤面評価で64候補枠を行優先、列優先に列挙し、最低限次を再計算する。

- 3図柄の個数と総果物数。
- 正解述語を満たす解集合。
- 部分条件集合 `A`, `B`。
- `typeLeft`, `typeRight` と空間分布。
- 単独図柄数・総果物数の一致候補数。
- 5種類の手掛かりから選ぶ10通りの二要素一致候補数。
- 値の経験分布内順位。
- 探索用距離。
- 盤面密度、図柄比率、一様行列違反。

### 8.4 修復対象

正解枠の9セルは変更しない。

- 競合枠がある場合は、全競合枠に含まれるセルから正解枠セルを除いた和集合を優先対象とする。
- 一意解を達成後に品質条件が不足する場合は、正解枠外の全セルを対象とする。
- 競合枠がある間は、対象セルの現在値と異なる `empty / apple / pear / orange` への全変更を評価する。
- 一意解を達成した後の品質修復では、正解枠外の全変更を安定順に列挙し、再始動用疑似乱数による部分Fisher–Yates法で各手順最大96変更を選んで評価する。手順ごとに乱数列を進め、同じ部分集合へ固定しない。

### 8.5 辞書順スコア

各変更後の盤面を次の順序で比較し、辞書順で最小の候補を採用する。

```text
score = (
  competitorCount,
  partialConditionLeak,
  cognitiveDistractorShortfall,
  singleCountLeak,
  jointCueLeak,
  spatialCoverageShortfall,
  visualRankViolation,
  densityAndRatioViolation,
  uniformLineViolationCount
)
```

各成分は次とする。

```text
competitorCount
  = max(0, solutionCount - 1)

partialConditionLeak
  = max(0, 8 - |A|) + max(0, 8 - |B|)

cognitiveDistractorShortfall
  = max(0, 3 - typeLeftCount)
  + max(0, 3 - typeRightCount)

singleCountLeak
  = max(0, 5 - sameAppleCount)
  + max(0, 5 - samePearCount)
  + max(0, 5 - sameOrangeCount)
  + max(0, 5 - sameTotalCount)

jointCueLeak
  = Σ max(0, 3 - sameJointCount(x, y))
      {x, y} ⊂ F, x ≠ y

spatialCoverageShortfall
  = max(0, 3 - distractorRegionCount)
```

残りの違反値も0が条件充足を表す非負値として実装する。一意解は常に第一優先とし、難易度指標を改善するために競合枠を増やしてはならない。

同点候補は安定順に並べた後、再始動用疑似乱数で1つ選ぶ。通常仕様と同様に逆変更をtabuへ登録し、停滞上限に達したら次の再始動へ進む。

### 8.6 制約探索への切り替え

局所修復で10,000 seedの完了条件を満たせない場合は、条件を緩めず、レベル「ノイマン」専用の制約充足探索へ切り替える。

制約探索でも次を守る。

- 正解座標、正解三つ組、正解枠配置は再始動前の選択を維持する。
- 変数順と値順はseedから決定し、同じ入力から同じ問題を返す。
- 解が見つかった後も独立バリデータで全条件を再確認する。
- 探索上限を超えた場合は明示的な生成失敗を返す。

## 9. 採用判定

生成器は次をすべて満たした盤面だけを独立バリデータへ渡す。

1. 正解述語を満たす枠が意図した1か所だけである。
2. 正解三つ組が `ANSWER_TRIPLES` に属する。
3. `|A| ≥ 8` かつ `|B| ≥ 8` である。
4. `typeLeftCount ≥ 3` かつ `typeRightCount ≥ 3` である。
5. 認知的な紛らわしさが3領域以上に分布する。
6. 各単独図柄数と総果物数の一致候補がそれぞれ5枠以上ある。
7. 5種類の手掛かりから選ぶ10通りの二要素一致候補がそれぞれ3枠以上ある。
8. 正解枠の各図柄数と総果物数が経験分布の極端な位置にない。
9. 正解枠内配置に禁止パターンがない。
10. 密度、図柄比率、一様行列条件を満たす。
11. seed再現性とデータモデル条件を満たす。

いずれかを満たせない場合、低いレベルへの切り替え、閾値低下、複数解許可を行わず、生成失敗を返す。

## 10. 独立バリデータ

生成器とは別の関数として実装する。

```text
validateNeumannProblem(problem) -> validationResult
```

バリデータは生成器のキャッシュ、競合枠一覧、採用判定結果を信用せず、盤面JSONから次を再計算する。

1. 10 × 10の盤面と排他的な4セル状態。
2. 全64候補枠の3図柄数。
3. 正解述語と一意解。
4. `answer.row`, `answer.col` との一致。
5. 正解三つ組。
6. 部分条件集合と認知的な紛らわしさ。
7. 単独図柄数と総果物数による位置漏洩。
8. 二つの手掛かりの組み合わせによる位置漏洩と最大連結塊。
9. 空間分布、経験分布内順位、禁止配置。
10. 密度、図柄比率、一様行列違反。
11. 出力された全メトリクスとの一致。

生成器とバリデータで同じ補助関数を共有してよいのはセル状態の定数と安定した座標列挙だけとする。正解述語、距離、採用条件は、固定盤面と表形式期待値を使って独立にテストする。

## 11. データモデル

通常問題JSONに次を追加または固定する。

```json
{
  "schemaVersion": 1,
  "generatorVersion": "kazu-sagashi-v4",
  "level": 7,
  "levelLabel": "ノイマン",
  "mode": "triple-order",
  "grid": {
    "rows": 10,
    "cols": 10,
    "maxPerCell": 1,
    "cellStates": ["empty", "apple", "pear", "orange"],
    "cells": []
  },
  "rule": {
    "windowRows": 3,
    "windowCols": 3,
    "order": ["apple", "pear", "orange"],
    "comparison": "strictly-increasing",
    "minimumEach": 1
  },
  "answer": {
    "row": 0,
    "col": 0
  },
  "metrics": {
    "solutionCount": 1,
    "firstPartialCandidateCount": 0,
    "secondPartialCandidateCount": 0,
    "typeLeftCount": 0,
    "typeRightCount": 0,
    "distractorRegionCount": 0,
    "sameAppleCount": 0,
    "samePearCount": 0,
    "sameOrangeCount": 0,
    "sameTotalCount": 0,
    "sameApplePearCount": 0,
    "sameAppleOrangeCount": 0,
    "samePearOrangeCount": 0,
    "sameAppleTotalCount": 0,
    "samePearTotalCount": 0,
    "sameOrangeTotalCount": 0,
    "sameAppleClusterCount": 0,
    "samePearClusterCount": 0,
    "sameOrangeClusterCount": 0,
    "sameTotalClusterCount": 0,
    "answerLargestOccupiedCluster": 0,
    "occupiedCellDensity": 0,
    "appleShare": 0,
    "pearShare": 0,
    "orangeShare": 0,
    "uniformLineViolationCount": 0,
    "restartCount": 0,
    "repairStepCount": 0
  }
}
```

`generatorVersion` の実値は実装時に採用する版とし、既存レベルの出力が変わる場合も含めてバージョンを更新する。

## 12. 描画と解答

- 問題面では3図柄を色だけでなく輪郭でも区別する。
- グレースケール印刷でもリンゴ、ナシ、ミカンを識別できるようにする。
- 問題面と解答面は同じ論理盤面を描画する。
- 解答面では正解枠を太線で囲み、3図柄の個数と、順に多くなることを文章で表示する。
- 例: `リンゴ1こ、ナシ2こ、ミカン4こ（じゅんに多い）`。
- 「ノイマン」の人物紹介を添える場合も、問題条件より目立たせない。

## 13. 単体テスト

最低限、次を固定テストにする。

- 条件を満たす個数三つ組が4節の7通りだけである。
- `ANSWER_TRIPLES` 以外の成立三つ組も競合解として検出する。
- 人工的な0解、1解、複数解を正しく判定する。
- `(0, 1, 2)` を各図柄1個以上違反として不正解にする。
- 部分条件集合 `A`, `B` を正しく数える。
- `typeLeft`, `typeRight` の境界値を正しく分類する。
- 単独図柄数と総果物数の一致候補を正しく数える。
- 二つの手掛かりの10通りの一致候補と最大連結塊を正しく数える。
- `KS-N-0RTTQSI` の固定盤面を複合手掛かり漏洩として拒否する。
- 4領域の境界にある候補座標を正しく分類する。
- 経験分布内順位と同順位を正しく扱う。
- 正解枠内の連結成分、2 × 2同一図柄、全セル占有を検出する。
- `distanceNeumann` が全状態別個数に対する全探索結果と一致する。
- 同じ入力から同じ論理問題JSONを生成する。
- 回転・反転を含む重複署名がミカン状態を含めて機能する。

## 14. seedコーパステスト

通常CIでは200固定seed、リリース前およびアルゴリズム変更時には10,000固定seedを検査する。

全量コーパスは次を満たす。

- 生成失敗0件。
- 不正問題0件。
- 複数解0件。
- 全問題が9節の採用条件を満たす。
- 回転・反転込みの盤面重複率1%以下。
- 64正解座標に欠落がなく、各出現数が期待値の0.5倍から1.5倍に収まる。
- `ANSWER_TRIPLES` の3通りに欠落がなく、各出現数が期待値の0.8倍から1.2倍に収まる。
- `typeLeftCount`, `typeRightCount`, 部分条件候補数、単独数一致候補数、二要素一致候補数の分布を保存する。
- 生成時間95パーセンタイルが参照環境で500ms未満である。

閾値を満たせない場合は、テスト数、一意解、位置漏洩防止条件を弱めず、探索方式または根拠が暫定的な数値閾値を見直す。

## 15. 人間による難易度検証

「ノイマン」を最難関として正式表示する前に、対象年齢の児童による試行でレベル6と比較する。

最低限、次を記録する。

- 正答率。
- 解答時間中央値と10分以内完答率。
- 数え直し回数。
- 前半または後半の不等式だけを確認した誤答率。
- 一つの図柄だけを手掛かりにした誤答率。
- 途中で解答を中止した割合。
- 問題文または図柄を誤読した割合。

単に時間が長いだけで、誤読や図柄の見づらさが原因の場合は最難関として採用しない。二つの条件を組織的に処理する必要があり、その結果としてレベル6より解答負荷が高いことを確認する。

## 16. 実装完了条件

次をすべて満たした時点で「レベル: ノイマン」の実装完了とする。

1. `level = 7`, `levelLabel = "ノイマン"`, `mode = "triple-order"` で生成・再生成できる。
2. 3図柄と二つの不等式を問題文どおりに判定する。
3. 全64候補枠を調べ、一意解を保証する。
4. 5節の位置漏洩防止と認知的な紛らわしさをすべて検証する。
5. 独立バリデータが盤面JSONから全条件とメトリクスを再計算する。
6. 3図柄を画面とグレースケール印刷で区別できる。
7. 単体テスト、200 seed通常CI、10,000 seed全量コーパス、描画テストが通る。
8. 人間による試行で、誤読ではなく条件統合の負荷によって既存レベルより難しいことを確認する。
