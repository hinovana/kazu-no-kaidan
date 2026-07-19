# 教材ジェネレータ SPAフレームワーク設計書

| 項目 | 値 |
| --- | --- |
| 文書状態 | 設計草案 |
| 文書版 | `spa-framework-design.v0.2-draft` |
| 最終更新日 | 2026-07-18 |
| 対象 | リポジトリ全体のブラウザアプリ基盤 |
| 初期導入モジュール | `kokugo-no-tane` |
| 実装状態 | フェーズ0〜3を実装。こくごのたねを最初のlazy moduleとして登録し、他2教材と難易度ラボは複数HTML入力で維持 |
| 非対象 | 教材固有の作問規則、採点規則、印刷紙面の共通化 |

## 1. 目的

本書は、複数の教材ジェネレータを段階的に受け入れるSPAホストの責務、教材モジュールとの境界、ビルド・配信・移行・検証契約を定める。

最初の移行対象は「こくごのたね」だけとする。数字の階段、かずさがし、難易度ラボは、移行が完了するまで既存の静的HTMLアプリとして維持する。SPAホストは未移行アプリも一覧へ掲載するが、その内部実装へ依存しない。

この変更は、現在の「教材ごとに仕様・作問処理・テストを閉じる」という原則を破棄しない。共通化するのは、実際に複数画面で必要になったアプリシェル、ナビゲーション、デザイントークン、モジュール登録契約、ビルド・型検査基盤に限定する。

## 2. 採用方針

| 領域 | 採用方針 |
| --- | --- |
| ビルド | Vite |
| 言語 | TypeScript |
| UI | React |
| ルーティング | React RouterのHash Router |
| SPA入口 | リポジトリルートの `index.html` |
| 教材登録 | 型付きモジュールレジストリ |
| モジュール読込 | dynamic importによる遅延読込 |
| 移行中の既存アプリ | Viteの複数HTML入力で静的ページとして併存 |
| 単体・コンポーネントテスト | Vitestを基本とし、既存Nodeテストは移行完了まで併存 |
| 配信 | 静的ホスティングを維持。SSRは導入しない |
| オフライン | 初版ではService Workerを導入しない |

採用パッケージの正確な版は実装開始時に固定し、`package-lock.json` で再現する。文書へ「latest」のような可変指定を書かない。

Viteはルートの `index.html` を通常のビルド入口にでき、移行中は複数のHTMLをビルド入力として扱える。公開先のサブパスはViteの `base` と `import.meta.env.BASE_URL` で解決する。Hash Routerを使うのは、GitHub Pagesなどの静的ホスティングで、各SPAルートへのサーバー側fallback設定を必要としないためである。

参考：

- [Vite: Building for Production](https://vite.dev/guide/build.html)
- [React Router: createHashRouter](https://reactrouter.com/api/data-routers/createHashRouter)
- [TypeScript: Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)

## 3. ゴールと非ゴール

### 3.1 ゴール

- こくごのたねを、SPAホストから読み込まれる最初の教材モジュールにする。
- 後から別教材を追加するとき、ホストの内部を教材固有コードで変更しない。
- 共通ヘッダ、フッタ、一覧、状態表示、エラー境界、基本アクセシビリティを統一する。
- モジュールごとのコード分割を行い、未使用教材の実装を初期ロードへ含めない。
- 既存の静的ジェネレータを壊さず、段階的に移行できる。
- TypeScriptの依存方向で、ホストと教材domainの境界を明示する。
- 静的配信、直接URL、印刷、ローカルAIプロキシを維持する。

### 3.2 非ゴール

- 全教材の作問アルゴリズムを共通基底クラスへ統合しない。
- 教材固有のSVG、縦書き、解答欄、ページ分割を共通コンポーネントへ押し込まない。
- 初回移行で見た目、作問結果、seed互換性を同時に変更しない。
- ホストに国語固有の `StoryPlan`、`Blueprint`、設問型を持たせない。
- 公開サーバーへOpenAI APIキーやAIプロキシ機能を埋め込まない。
- SSR、認証、利用者データ保存、クラウドAPIを初版へ追加しない。

## 4. 全体アーキテクチャ

```text
ブラウザ
  |
  v
Viteで構築したルートSPA
  |
  +-- App Shell
  |     +-- 共通ヘッダ・フッタ
  |     +-- 教材一覧
  |     +-- Hash Router
  |     +-- モジュール単位Error Boundary
  |     +-- 共通デザイントークン
  |
  +-- Generator Registry
        |
        +-- SPA module: kokugo-no-tane --dynamic import--> 国語UI/application/domain
        |
        +-- legacy link: kazu-no-kaidan -------------> 既存静的HTML
        |
        +-- legacy link: kazu-sagashi ---------------> 既存静的HTML

ローカル開発時のみ:
kokugo-no-tane infrastructure --HTTP--> 127.0.0.1 AI proxy --OpenAI SDK--> OpenAI API
```

SPAホストは、教材を「一覧へ表示でき、選択時に開けるモジュール」として扱う。教材の入力条件、生成結果、問題形式、印刷構造はモジュール内部の責務とする。

## 5. 目標ディレクトリ構成

```text
.
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── src/
│   └── app/
│       ├── main.tsx
│       ├── App.tsx
│       ├── router.tsx
│       ├── generator-registry.ts
│       ├── generator-module.ts
│       ├── shell/
│       │   ├── AppShell.tsx
│       │   ├── AppHeader.tsx
│       │   ├── AppFooter.tsx
│       │   ├── GeneratorIndexPage.tsx
│       │   └── ModuleErrorBoundary.tsx
│       └── styles/
│           ├── reset.css
│           ├── tokens.css
│           └── shell.css
├── generators/
│   ├── kokugo-no-tane/
│   │   ├── module.tsx
│   │   ├── docs/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── ui/
│   │   ├── server/
│   │   └── tests/
│   ├── kazu-no-kaidan/          # 未移行中は既存構成
│   └── kazu-sagashi/            # 未移行中は既存構成
├── docs/
└── scripts/
```

`src/app/` はホスト専用であり、教材固有ロジックを置かない。`generators/<slug>/` はSPA移行後も、仕様、domain、UI、テストを同じ教材配下へ置く。

2つ目の教材をTypeScript化するまで、空の共通domainライブラリや複雑なTypeScript Project References構成を先に作らない。複数のTypeScript教材が実在した時点で、型検査時間と依存境界を確認し、必要ならsolution `tsconfig.json` と教材単位のproject referenceへ移行する。

## 6. モジュール登録契約

### 6.1 基本型

SPAモジュールと未移行アプリを同じ一覧へ載せるため、レジストリエントリを判別可能なunionにする。

```ts
import type { ComponentType } from "react";

export type GeneratorId =
  | "kokugo-no-tane"
  | "kazu-no-kaidan"
  | "kazu-sagashi";

export type GeneratorStatus =
  | "stable"
  | "prototype"
  | "development";

export interface GeneratorCapabilities {
  readonly print: boolean;
  readonly ai: boolean;
  readonly developerTools: boolean;
}

export interface GeneratorModuleProps {
  readonly moduleId: GeneratorId;
  readonly onRequestPrint: () => void;
}

export interface LoadedGeneratorModule {
  readonly Page: ComponentType<GeneratorModuleProps>;
}

interface GeneratorEntryBase {
  readonly id: GeneratorId;
  readonly title: string;
  readonly description: string;
  readonly subject: "math" | "japanese";
  readonly status: GeneratorStatus;
  readonly capabilities: GeneratorCapabilities;
}

export interface SpaGeneratorEntry extends GeneratorEntryBase {
  readonly kind: "spa";
  readonly route: `/generators/${string}`;
  readonly load: () => Promise<LoadedGeneratorModule>;
}

export interface LegacyGeneratorEntry extends GeneratorEntryBase {
  readonly kind: "legacy";
  readonly href: string;
}

export type GeneratorRegistryEntry =
  | SpaGeneratorEntry
  | LegacyGeneratorEntry;
```

`GeneratorId` を永久に手書きunionへ固定する意図はない。初版では誤記を防ぐため明示し、登録数が増えた場合は `satisfies readonly GeneratorRegistryEntry[]` から型を導出する。

### 6.2 登録例

```ts
export const generatorRegistry = [
  {
    kind: "spa",
    id: "kokugo-no-tane",
    title: "こくごのたね",
    description: "小学1〜3年生向け国語文章問題",
    subject: "japanese",
    status: "prototype",
    route: "/generators/kokugo-no-tane",
    capabilities: { print: true, ai: true, developerTools: true },
    load: () => import("../../generators/kokugo-no-tane/module"),
  },
  {
    kind: "legacy",
    id: "kazu-no-kaidan",
    title: "数字の階段",
    description: "数の並びを使う印刷教材",
    subject: "math",
    status: "stable",
    href: `${import.meta.env.BASE_URL}generators/kazu-no-kaidan/`,
    capabilities: { print: true, ai: false, developerTools: false },
  },
] satisfies readonly GeneratorRegistryEntry[];
```

ホストがモジュールから参照してよいのは、公開された `module.tsx` とmanifest情報だけとする。`generators/kokugo-no-tane/domain/` の内部ファイルをホストから直接importしてはならない。

## 7. ルーティングとURL

### 7.1 初版URL

```text
/#/                                      教材一覧
/#/generators/kokugo-no-tane             こくごのたねSPA
/generators/kazu-no-kaidan/              既存静的アプリ
/generators/kazu-sagashi/                 既存静的アプリ
/generators/kazu-sagashi/difficulty-lab.html
```

Hash部分はHTTPリクエスト先を変えないため、静的ホスティングでもSPAの直接表示を維持できる。将来、すべての配信環境でhistory fallbackを保証できる場合に限り、Browser Routerへの移行を別設計として検討する。

### 7.2 旧こくごURL

`/generators/kokugo-no-tane/` は移行完了後も壊さない。旧URLには、`BASE_URL` 相当を考慮してSPAのHash URLへ転送する小さな互換ページを残す。JavaScript無効時にも移動先リンクを表示する。

転送開始前に、新SPAでUI、印刷、AI接続、seed再現性の完了条件を満たす。移行中は旧画面と新画面を比較できるようにし、先に旧画面を削除しない。

## 8. ホストとモジュールの責務

### 8.1 ホストが持つもの

- ルート、教材一覧、404表示
- 共通ヘッダとフッタ
- module loading、loading表示、Error Boundary
- 画面用の色、余白、文字サイズ、フォーカス表示の基礎トークン
- ページタイトルと教材状態ラベル
- 未移行アプリへのリンク
- 全モジュールに共通する利用上の最上位注意

### 8.2 教材モジュールが持つもの

- 入力フォームと画面状態
- 作問、検証、採点、描画
- 教材固有の注意文
- 問題用紙・解答用紙・印刷向けレイアウト
- 教材固有のCSS変数とコンポーネント
- API client、候補保存など教材固有infrastructure
- 仕様書、fixture、単体テスト、コーパステスト

### 8.3 禁止する依存

- ホストから教材domain内部への直接import
- 教材domainからReact、DOM、CSS、`window`、`document` への依存
- 教材domainから `fetch`、OpenAI SDK、Node.js `fs` への依存
- ある教材から別教材の内部実装への依存
- 共通シェルCSSから教材の印刷要素を指定すること

## 9. UIとCSSの境界

共通シェルは画面用UIだけを担当し、印刷時は非表示にする。各教材の印刷CSSはモジュール配下へ残す。

共通化するデザイントークンの例：

```css
:root {
  --app-font-sans: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
  --app-color-canvas: #f3f4ef;
  --app-color-surface: #ffffff;
  --app-color-text: #26302b;
  --app-color-muted: #66706a;
  --app-focus-ring: 0 0 0 3px rgb(49 95 72 / 28%);
  --app-content-max: 1440px;
}
```

教材は必要に応じて独自トークンを追加できるが、`--app-*` を教材固有の意味へ上書きしない。CSS Modulesまたは教材ルートclassによって、モジュールCSSが他教材へ漏れないようにする。

フッタへ教材の生成来歴やitem IDを混在させない。共通フッタはリポジトリ・利用上の入口に限定し、問題固有情報は各教材の診断領域へ置く。

## 10. 状態管理とエラー境界

初版では全体状態管理ライブラリを導入しない。

- URLで表すべき状態はルーターへ置く。
- 教材フォームと生成結果は教材モジュール内のReact stateまたはreducerへ置く。
- API接続状態は国語モジュール内へ置く。
- 教材をまたいだ生成結果共有は実装しない。
- localStorage、IndexedDBへ問題本文やAI候補を自動保存しない。

各SPA教材はモジュール単位のError Boundaryで囲む。一つの教材が例外を投げても、シェルと教材一覧へ戻る導線を維持する。例外詳細やAPIキーを利用者向け画面へ表示しない。

dynamic import失敗時は、再読込と一覧へ戻る選択肢を表示する。新しいデプロイ後に古いHTMLが削除済みchunkを参照する場合を考慮し、HTMLのキャッシュ方針を配信手順で定める。

## 11. TypeScript方針

初版の推奨compiler設定は次とする。

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  }
}
```

- `any` は境界逃避に使わず、外部入力は `unknown` からvalidatorで絞る。
- データ構造は `interface`、`type`、判別可能なunionを基本とする。
- 入力データへclass継承を要求しない。
- `abstract class` は共有状態や不変条件を実装として再利用する必要が実在した場合だけ採用する。
- ブラウザ用とNode用の型環境を分け、domainへNode型を漏らさない。
- Viteは変換とbundle、`tsc` は型検査を担当する。Vite build成功だけを型検査成功とみなさない。

## 12. 開発・ビルド契約

目標コマンドは次とする。

```bash
npm run dev
npm run build
npm run preview
npm run typecheck
npm test
npm run test:kokugo-no-tane:corpus
```

Vite開発サーバーは既定の `127.0.0.1:5173` を使用する。AIプロキシの既定CORS allowlistはViteの `5173` と互換静的サーバーの `8765` を完全一致で許可し、任意のポートへ変える場合は `KNT_FRONTEND_ORIGINS` も明示的に同期する。

`npm run build` は少なくとも次を出力する。

- ルートSPAの `index.html` とhashed assets
- 未移行中の数字の階段HTMLとassets
- 未移行中のかずさがしHTML、難易度ラボとassets
- 旧こくごURLの互換転送ページ

`dist/` は生成物として扱い、正本のソースや仕様を置かない。配布方式が未確定な間はGit管理対象にしない。

## 13. セキュリティとデータ

- OpenAI APIキーはNode.jsプロキシの環境変数だけで管理する。
- `VITE_*` 環境変数へ秘密情報を置かない。Viteで埋め込まれる値は公開情報として扱う。
- ホストは児童名、回答、生成履歴を収集しない。
- モジュールの表示文字列を `dangerouslySetInnerHTML` へ渡さない。
- AIレスポンスやJSONは、TypeScript型だけで信用せずruntime validatorを通す。
- CSPを導入する場合も、ローカルAIプロキシ接続先を必要最小限で許可する。

## 14. テスト戦略

### 14.1 ホスト

- レジストリのID、route、legacy hrefが重複しない。
- SPA entryは遅延読込される。
- legacy entryは既存URLへ遷移する。
- module load失敗時にシェルが残る。
- Hash URLの直接表示で対象教材が開く。
- キーボードだけで一覧、戻る、主要操作へ到達できる。

### 14.2 共通シェル

- 全SPA教材で同じヘッダ・フッタ構造になる。
- フォーカス表示、見出し順、landmarkが成立する。
- 共通シェルが印刷時に非表示になる。
- モジュールCSSがシェルと別教材へ漏れない。

### 14.3 移行互換

- 数字の階段とかずさがしの既存URLが維持される。
- 既存テストとコーパステストがSPA基盤導入中も成功する。
- 旧こくごURLから新SPAへ移動できる。
- 公開サブパスでもasset URLとlegacy hrefが成立する。

## 15. 移行フェーズ

### フェーズ0：基準固定

- [x] 現行ルート一覧と3教材のURLを記録する。
- [x] 各画面と印刷の基準画像・PDFまたは検査結果を保存する。
- [x] `npm test` と各コーパステストの成功を確認する。

### フェーズ1：ホスト基盤

- [x] Vite、TypeScript、React、React Routerを導入する。既存Nodeテストを維持し、Vitestはコンポーネントテスト導入時まで追加しない。
- [x] ルートSPA、Hash Router、共通シェル、レジストリを実装する。
- [x] 既存教材をlegacy entryとして一覧へ登録する。
- [x] Vite buildへ既存HTMLを複数入力として追加する。

### フェーズ2：こくごのたねdomain移行

- [x] [こくごのたね TypeScriptモジュール化設計書](../generators/kokugo-no-tane/docs/typescript-module-design.md) に従ってruntimeをTypeScriptへ移す。
- [x] application境界のdifferential testと既存回帰テストで出力を保護する。

### フェーズ3：こくごのたねUI移行

- [x] React UIをSPA moduleとして登録する。
- [x] UI、既存印刷契約、AIプロキシclient、フォールバックを確認する。
- [x] 旧URLをHash URLへの互換転送へ切り替える。

### フェーズ4：後続教材

- 数字の階段またはかずさがしを、教材側の仕様更新後に個別移行する。
- 2つ目の実装で本当に共通した型・UIだけを共有層へ昇格する。
- 全教材移行後にViteのlegacy HTML入力を削除する。

## 16. 完了条件

- ルートSPAからこくごのたねを遅延読込できる。
- 数字の階段、かずさがし、難易度ラボの既存URLと機能が残る。
- ホストが国語固有のdomain型をimportしていない。
- `npm run typecheck`、`npm run build`、`npm test` が成功する。
- こくごのたねの関連テストとコーパステストが成功する。
- 画面と印刷の回帰確認が完了する。
- 旧こくごURLの互換導線が成立する。
- APIキーがbundle、HTML、ログ、URLへ含まれない。
- 文書、実装、テスト、起動コマンドが同期している。

## 17. 未決事項

- 共通フッタへ掲載する最小情報
- 対応ブラウザの下限
- 公開先の確定base path
- UIテストに採用するDOM環境とブラウザE2Eの分担
- 2つ目のSPA教材移行時にTypeScript Project Referencesを導入するか
- 将来Browser Routerへ移行する配信条件
