# こくごのたね ドキュメント案内

このディレクトリには、国語読解問題ジェネレータ「こくごのたね」の設計資料を置く。

現時点の文書は確定仕様ではないが、限定語彙を使うブラウザプロトタイプまで実装されている。各文書は扱う範囲ごとの正本候補であり、実装済み、AIによる自動検証済み、人間確認済み、実証済みを区別して管理する。本プロジェクトは個人開発であり、文書更新と公開判断は開発者本人が行う。

動作確認の入口は [ブラウザプロトタイプ](../index.html) である。最初の人間レビューまでは「構造的自動検査通過・人間未確認」「開発確認用／児童利用・学力判定不可」と表示する。

## ドキュメント一覧

| 文書 | 版 | 状態 | 正本とする領域 |
| --- | --- | --- | --- |
| [typescript-module-design.md](typescript-module-design.md) | `kokugo-no-tane-typescript-module.v0.3-draft` | runtime TypeScript化、React UI、SPA登録、旧URL互換転送を実装 | SPA教材モジュール境界、TypeScript型、domain・UI・AI・データの依存方向、移行と同値性検証 |
| [implementation-progress.md](implementation-progress.md) | `implementation-progress.v0.12` | 教育基本語彙候補DB、Codexヘッドレス評価経路、TypeScript/React SPAを実装 | 実装フェーズ、現在地点、完了ゲート、次アクション |
| [item-blueprint.md](item-blueprint.md) | `item-blueprint.v0.3-draft` | 再挑戦型・手がかり発見型の契約を実装・未実証 | 測定能力、測定対象外、文章種別、標準4問、本文構造モジュール境界、許容される変形 |
| [question-pattern-expansion.md](question-pattern-expansion.md) | `question-pattern-expansion.v0.1-draft` | 問題6・12・18の抽象分析に基づく設計案・問題6型のみ実装 | 設問パターン、設問セット、根拠グラフ、解答欄レイアウト、機械検査、段階的実装順 |
| [algorithm-draft.md](algorithm-draft.md) | `algorithm-spec.v0.8-draft` | AI設計図アダプターと本文構造2種類を含む限定プロトタイプ実装・未校閲 | 物語・本文・設問・正答根拠の生成、本文構造モジュール、機械検査、学年別初出ふりがな、語句間隔、A4横の縦書き印刷 |
| [model-api-integration.md](model-api-integration.md) | `model-api-integration.v0.5-draft` | Codexヘッドレス既定・API経路も選択可能・事前生成は未実装 | 文章生成モデルの責務、本文構造ごとの設計図契約、事前生成・ライブ生成、候補再利用、秘密情報、未成年者データ、検証ゲート |
| [local-ai-proxy-spec.md](local-ai-proxy-spec.md) | `local-ai-proxy.v0.3` | Codexヘッドレス既定・API経路も選択可能 | Node.jsローカルプロキシの起動、provider切替、HTTP API、CORS、ブラウザUI、障害時動作、候補保存、テスト |
| [database-spec.md](database-spec.md) | `database-spec.v0.4-draft` | 漢字候補版と教育基本語彙の低学年・高学年候補版を実装・人間未確認 | 漢字・語彙の根拠資料、権利、データモデル、配布DB |
| [item-review-and-release.md](item-review-and-release.md) | `item-review-release.v0.1-draft` | 検討中・未運用 | 個人開発での見直し、答えを隠した解き直し、修正時の再確認、公開状態 |
| [calibration-and-fairness.md](calibration-and-fairness.md) | `calibration-fairness.v0.1-draft` | 検討中・未実施 | 児童試行、実測難易度、識別力、再採点一致、公平性、校正失効 |
| [reference-anchor-registry.md](reference-anchor-registry.md) | `reference-anchors.v0.3-draft` | 検討中・分析専用 | 参照ID、出典位置、権利状態、抽出特徴、模倣禁止要素、解答用紙の抽象的紙面原則 |

各文書の先頭で、版、個人開発であること、最終更新日、実装状態、実証または運用状態を管理する。文書は草案のままだが、コードとして実装された範囲は各文書の実装状態に明記する。

## 初版の範囲

初版は物語文だけを対象とする。説明文は、中心文、具体例、順序、比較、因果、指示語、要旨について別の測定設計が必要であるため、専用の出題設計を確定するまで生成対象にしない。

## 推奨する読み順

全体像を把握するときは、次の順に読む。

1. [implementation-progress.md](implementation-progress.md) で、現在地点と次の作業を確認する。
2. SPA・TypeScript移行を行う場合は [typescript-module-design.md](typescript-module-design.md) と上位の [SPAフレームワーク設計書](../../../docs/spa-framework-design.md) で境界と移行ゲートを確認する。
3. [item-blueprint.md](item-blueprint.md) で、何を測り、何を測らないかを確認する。
4. 標準4問以外の設問・解答欄を検討する場合は [question-pattern-expansion.md](question-pattern-expansion.md) を確認する。
5. [algorithm-draft.md](algorithm-draft.md) で、出題設計から本文・設問を作る処理を確認する。
6. 文章生成モデルを接続する場合は [model-api-integration.md](model-api-integration.md) で、モデルの責務と検証境界を確認する。
7. ローカルライブ接続を実装する場合は [local-ai-proxy-spec.md](local-ai-proxy-spec.md) で、起動・HTTP・UI・保存・障害時契約を確認する。
8. [database-spec.md](database-spec.md) で、語彙・漢字・ふりがなの根拠と配布方法を確認する。
9. [item-review-and-release.md](item-review-and-release.md) で、自動生成後の見直しと利用状態を確認する。
10. [calibration-and-fairness.md](calibration-and-fairness.md) で、児童試行と実測値の条件を確認する。
11. 参照問題を根拠にする場合は [reference-anchor-registry.md](reference-anchor-registry.md) のアンカーIDを確認する。

目的別の入口は次のとおり。

| 目的 | 最初に読む文書 |
| --- | --- |
| SPAモジュール化、TypeScript移行、React UI移植を行う | [typescript-module-design.md](typescript-module-design.md)、[SPAフレームワーク設計書](../../../docs/spa-framework-design.md) |
| 現在の進捗や次の作業を確認する | [implementation-progress.md](implementation-progress.md) |
| 本文や設問の生成規則を変更する | [algorithm-draft.md](algorithm-draft.md) |
| 標準4問以外の設問パターン、設問セット、解答欄を追加する | [question-pattern-expansion.md](question-pattern-expansion.md)、採用時は [item-blueprint.md](item-blueprint.md) と [algorithm-draft.md](algorithm-draft.md) |
| 文章生成モデル、API接続、事前生成・ライブ生成を変更する | [model-api-integration.md](model-api-integration.md) |
| ローカルAIプロキシのURL、起動、HTTP API、CORS、接続UIを変更する | [local-ai-proxy-spec.md](local-ai-proxy-spec.md) |
| 生成難度、採点、機械的品質検査を変更する | [algorithm-draft.md](algorithm-draft.md) |
| 漢字、語彙、読み、表記を変更する | [database-spec.md](database-spec.md) |
| 初出ふりがなの仕様を変更する | 両方 |
| 対象学年や学年判定を変更する | 両方 |
| 配布データの形式や更新方法を変更する | [database-spec.md](database-spec.md) |
| 測定能力や4問の構成を変更する | [item-blueprint.md](item-blueprint.md) |
| 見直し手順や公開条件を変更する | [item-review-and-release.md](item-review-and-release.md) |
| 実測難易度や公平性基準を変更する | [calibration-and-fairness.md](calibration-and-fairness.md) |
| 参照問題や難度アンカーを追加する | [reference-anchor-registry.md](reference-anchor-registry.md) |

## 文書間の関係

作問処理とデータベースは、次の境界で分離する。

```text
item-blueprint.md で測定設計を固定
        ↓
根拠資料・語彙の目視確認
        ↓
database-spec.md に従って事前構築・検証
        ↓
学年別の配布用静的JSON
        ↓
必要な場合のみ、model-api-integration.md に従って物語設計図候補を事前生成・検証
        ↓
ブラウザが必要なデータを読み込む
        ↓
algorithm-draft.md に従って本文・設問・解答を生成
        ↓
開発確認用として表示（最初の人間レビュー前は児童利用不可）

評価問題・校正済み問題集へ採用する場合のみ:
作問チェック → 別セッションで解き直し → 表現・公平性確認 → 児童試行 → 公開判断
```

利用時のアプリはブラウザ内で完結させる。一方、原典の取込、正規化、権利確認、学年推奨値の決定、配布用JSONの生成は、開発時にNode.jsで行う。文章生成モデルの初期導入も開発時の事前生成とし、ブラウザは配布可能と確認したデータだけを読み込み、作問と表示を担当する。開発者向けライブ生成へ変更する場合は [model-api-integration.md](model-api-integration.md) の責務・安全要件と [local-ai-proxy-spec.md](local-ai-proxy-spec.md) の実装契約を先に満たす。

自動生成直後の問題は、正答と根拠が機械検査を通過していても開発確認用とする。少なくとも最初の人間レビューが終わるまでは児童に利用しない。その後の日常練習への採否と、見直し済み練習問題・校正済み評価問題への採用を区別する。状態遷移は [item-review-and-release.md](item-review-and-release.md) に従う。生成系自身による品質点を、独立した正しさの証明として扱わない。

## 正本の境界

- 測定能力、能力間の境界、測定対象外、標準4問、許容変形は `item-blueprint.md` を正本候補とする。
- 文章構造、設問生成、正答根拠、採点データ、生成難度、生成フローは `algorithm-draft.md` を正本候補とする。
- 文章生成モデルの責務、API接続方式、秘密情報、モデル出力スキーマ、候補のテンプレート化・再利用、事前生成・ライブ生成、障害時フォールバックは `model-api-integration.md` を正本候補とする。
- Node.jsローカルAIプロキシのアドレス、環境変数、HTTP API、CORS、接続UI、候補保存、テストは `local-ai-proxy-spec.md` を正本候補とする。
- 出典、権利状態、語彙・漢字の学年、読み、表記、DB版、配布形式は `database-spec.md` を正本候補とする。
- 個人開発での見直し、答えを隠した解き直し、却下理由、公開状態は `item-review-and-release.md` を正本候補とする。
- 児童試行、実測難易度、再採点一致、公平性分析、校正失効は `calibration-and-fairness.md` を正本候補とする。
- 参照問題の所在、権利状態、抽出特徴、模倣禁止要素は `reference-anchor-registry.md` を正本候補とする。
- 学年、既習漢字、表記選択、初出ふりがなのように両領域へ影響する変更は、両文書を同時に更新する。
- 文書間に矛盾を見つけた場合は、一方へ暗黙に寄せず、根拠と影響範囲を確認して両方を修正する。

## 生成難度と実測難易度

現行の1〜5は、問4の根拠間距離を指定する**生成難度プロファイル**であり、児童にとっての難しさを実測した値ではない。本文長は「短め・ふつう・長め」から独立して選択する。

児童試行によって正答率、識別力、無回答率、選択肢別選択率などを確認し、採否基準を満たした固定問題だけに実測難易度を付与する。校正方法とラベルの付与条件は [calibration-and-fairness.md](calibration-and-fairness.md) に従う。

## レビュー指摘と反映先

2026-07-14に受けたレビューのうち、妥当と判断した指摘は次の正本候補へ反映した。

| 指摘 | 反映先 | 反映内容 |
| --- | --- | --- |
| 測定設計の正本がない | [item-blueprint.md](item-blueprint.md) | 能力の操作的定義、能力間の境界、測定対象外、標準4問、許容変形を定義 |
| 生成後の見直し・公開ゲートがない | [item-review-and-release.md](item-review-and-release.md) | 状態遷移、情報とセッションの分離、答えを隠した解き直し、却下理由、修正時の失効、公開ゲートを定義 |
| 1〜5が実測値ではない | [calibration-and-fairness.md](calibration-and-fairness.md) | 生成難度と実測難易度を分離し、対象数、実施条件、指標、採否、校正失効を定義 |
| 物語文と説明文の扱いが矛盾する | [item-blueprint.md](item-blueprint.md)、[algorithm-draft.md](algorithm-draft.md) | 初版を物語文に限定し、説明文を未対応として生成選択肢から除外 |
| 再現条件が不足する | [algorithm-draft.md](algorithm-draft.md) | generator・仕様・DB・seed・テンプレート・モデル・正規化・ふりがな処理の版とitem履歴を追加 |
| 参照問題と難度アンカーを追跡できない | [reference-anchor-registry.md](reference-anchor-registry.md) | 問題6・12・18をアンカーID化し、所在、権利、抽出特徴、模倣禁止、難度上の限界を記録 |
| 公平性・アクセシビリティが弱い | [item-review-and-release.md](item-review-and-release.md)、[calibration-and-fairness.md](calibration-and-fairness.md) | 内容チェック、表示確認、集団別分析、読み支援の試行、個人情報保護を定義 |
| 草案・正本・確定状態が曖昧 | 全仕様文書 | 版、状態、個人開発、更新日、実装・実証状態、現段階の実装範囲、未決事項を文書先頭へ追加 |

## 変更時の確認事項

- 学年と生成難度を同じ軸として扱っていないか。
- 何を測る設問か、測定対象外の語彙力・記述力・生活経験が正答を左右していないか。
- 正答と本文中の根拠を追跡できるか。
- 初出ふりがなの適用範囲と初出判定が一致しているか。
- データの出典、版、加工規則、権利状態を追跡できるか。
- `license_status` が配布可能でないデータを公開用JSONへ含めていないか。
- 特定の家庭構成、経済環境、地域、文化経験、性別役割を当然視していないか。
- 読みの困難や発達特性による不要な負荷、ふりがなの視認性低下がないか。
- 自動生成後の問題を、未校閲のまま見直し済み・校正済みと表示していないか。
- 問題ごとに、item ID、generator版、アルゴリズム仕様版、DB版、seed、テンプレートまたはプロンプト版、使用モデルと推論設定、正規化・ふりがな処理版、生成日時、編集履歴、見直し・校正・公開状態を追跡できるか。
- APIキーや秘密情報がHTML、ブラウザJavaScript、静的JSON、Git管理対象へ含まれていないか。
- 文章生成モデルの出力を、既存の検証ゲートを通さず児童向け画面へ表示していないか。
- 完全に同じ問題の再生成と、同じ条件による同等問題の生成を区別しているか。
- 仕様変更に対応する実装、テスト、画面説明がある場合、それらも同期されているか。

## 新しい文書を追加するとき

新しいMarkdown文書を追加したら、このREADMEの「ドキュメント一覧」と「推奨する読み順」を更新する。既存文書と役割が重なる場合は、先にどちらを正本にするかを明記し、同じ仕様を複数箇所へ重複記載しない。

## `AGENTS.md` との使い分け

この案内には `README.md` を使う。

`AGENTS.md` は、Codexなどの作業エージェントに守らせる手順、検証コマンド、編集上の制約を置くファイルであり、設計資料の一般的な目次には向かない。このリポジトリではルートの `AGENTS.md` が全体の作業規約を定めている。

将来、「こくごのたね」だけに適用する作業規則が増えた場合は、`generators/kokugo-no-tane/AGENTS.md` を追加する。その場合も、文書の内容や読み順はこのREADMEに残し、`AGENTS.md` には作業者が必ず守る指示だけを書く。
