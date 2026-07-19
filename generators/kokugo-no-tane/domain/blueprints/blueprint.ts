import type { GenerationProfile } from "../types/generation.js";
import type {
  AnchorId,
  BlueprintId,
  StoryStructureId,
} from "../types/ids.js";
import type { QuestionContent } from "../questions/question-content.js";
import type { StoryPlanV1 } from "../types/story-plan.js";
import type {
  MachineCheck,
  Worksheet,
  WorksheetCheckInput,
} from "../types/worksheet.js";

/**
 * 本文長の選択値を、blueprintが本文を構築するときに使う具体的な制約へ変換した値。
 */
export interface LengthSetting {
  /** 本文構造の必須文に追加する補助文数の基準値。 */
  readonly extra_count: number;
  /** 機械検査で許容する本文文字数の下限と上限。両端を含む。 */
  readonly character_band: readonly [number, number];
  /** 画面や診断情報へ表示する本文長の名称。 */
  readonly label: string;
}

/**
 * 表記・ふりがな処理を行う前の本文1文分の下書き。
 *
 * @remarks
 * `stage` は生成後の文の役割になり、設問が参照する根拠IDの割当てにも使われる。
 */
export interface StorySentenceDraft {
  /** blueprint内での文の意味的な役割。 */
  readonly stage: string;
  /** テンプレート記法を含み得る、描画前の本文。 */
  readonly text: string;
}

/**
 * すべてのblueprintで共有する人物特性の最小契約。
 */
export interface BlueprintTrait {
  /** 本文と設問へ利用できる人物特性の表層形。 */
  readonly term: string;
}

/**
 * blueprintが構造固有のscenarioを作るために受け取る入力。
 */
export interface ScenarioInput {
  /** AI候補を利用する場合の検証済み設計図。ローカル生成では `null`。 */
  readonly storyPlan: StoryPlanV1 | null;
  /** 利用者が指定した題材。おまかせの場合は `undefined`。 */
  readonly topic: string | undefined;
  /** seedから生成された決定的な疑似乱数関数。 */
  readonly random: () => number;
}

/**
 * 1種類の物語教材を組み立てる生成戦略の契約。
 *
 * @remarks
 * この契約は本文、設問パターンへ渡す構造固有素材、物語メタデータ、構造固有の
 * 機械検査を扱う。個々の設問と解答欄の組立てはquestion pattern／question set層、
 * 教材全体の集約結果は {@link Worksheet} が定義する。
 *
 * 受け取った `random` 以外の乱数源を使わず、同じ正規化済み入力とseedから
 * 同じ出力を返すことを実装上の前提とする。
 *
 * @typeParam TScenario - blueprint固有の題材、登場人物、出来事を保持するscenario型。
 * @typeParam TTrait - blueprint固有の追加情報を持てる人物特性型。
 */
export interface Blueprint<TScenario, TTrait extends BlueprintTrait> {
  /** 生成方式と来歴を識別するblueprint ID。 */
  readonly id: BlueprintId;
  /** 生成される本文の意味構造を識別するID。 */
  readonly storyStructureId: StoryStructureId;
  /** 現行blueprintが扱う文章種別。 */
  readonly textType: "narrative";
  /** 画面と生成物へ記録するジャンル名。 */
  readonly genre: "物語文";
  /** 設計根拠として参照したアンカーID。 */
  readonly anchorIds: readonly AnchorId[];
  /** 文の `stage` のうち、設問根拠としてIDを割り当てる役割。 */
  readonly evidenceRoles: readonly string[];

  /**
   * 外部の生成条件を、本文生成に必要な構造固有scenarioへ変換する。
   *
   * @param input - 検証済み設計図、題材、決定的乱数を含む入力。
   * @returns blueprint固有のscenario。
   */
  createScenario(input: ScenarioInput): TScenario;

  /**
   * 本文と設問で扱う人物特性を選ぶ。
   *
   * @param random - seedから生成された決定的な疑似乱数関数。
   * @returns blueprint固有の人物特性。
   */
  pickTrait(random: () => number): TTrait;

  /**
   * scenarioから題名の描画前文字列を作る。
   *
   * @param input - 題名に必要な構造固有scenario。
   * @returns 表記処理前の題名。
   */
  buildTitle(input: { readonly scenario: TScenario }): string;

  /**
   * 本文を意味的な役割が付いた文の列として組み立てる。
   *
   * @param input - scenario、人物特性、生成難度、本文長、決定的乱数。
   * @returns 表記・ふりがな・段落処理前の本文文列。
   */
  buildStorySentences(input: {
    readonly scenario: TScenario;
    readonly trait: TTrait;
    readonly profile: GenerationProfile;
    readonly lengthSetting: LengthSetting;
    readonly random: () => number;
  }): readonly StorySentenceDraft[];

  /**
   * 構造固有scenarioを、共通の設問パターンが使う素材へ変換する。
   *
   * @remarks
   * この段階では設問順、設問番号、解答欄を決めない。それらは選択された
   * question setが決定する。
   *
   * @param input - scenarioと人物特性。
   * @returns 問題文、正答、誤答、根拠役割、採点要素の構造固有素材。
   */
  buildQuestionContent(input: {
    readonly scenario: TScenario;
    readonly trait: TTrait;
  }): QuestionContent;

  /**
   * 生成物へ保存する構造固有の物語メタデータを作る。
   *
   * @param input - scenario、人物特性、利用した設計図。
   * @returns {@link Worksheet.story} に格納するメタデータ。
   */
  buildStoryMetadata(input: {
    readonly scenario: TScenario;
    readonly trait: TTrait;
    readonly storyPlan: StoryPlanV1 | null;
  }): Worksheet["story"];

  /**
   * ローカルテンプレートまたはAI設計図に対応するテンプレート版を返す。
   *
   * @param input - 利用した設計図。ローカル生成では `null`。
   * @returns 生成来歴へ保存するテンプレート版。
   */
  templateVersion(input: { readonly storyPlan: StoryPlanV1 | null }): string;

  /**
   * blueprint固有の意味契約を生成済み教材に対して検査する。
   *
   * @remarks
   * 共通の本文長、根拠参照、表記などの検査は呼出し側が別途実行する。
   *
   * @param worksheet - 共通組立てが完了し、検査結果をまだ確定していない教材。
   * @returns 合否と診断詳細を持つ構造固有の機械検査結果。
   */
  runMachineChecks(worksheet: WorksheetCheckInput): readonly MachineCheck[];
}

/**
 * 異なるscenario型を持つblueprintを同じregistryへ格納するための型消去後の表現。
 *
 * @remarks
 * blueprint実装時は具体的な `TScenario` と `TTrait` を保ち、registry境界より内側で
 * この型へ変換する。
 */
export type ResolvedBlueprint = Blueprint<unknown, BlueprintTrait>;
