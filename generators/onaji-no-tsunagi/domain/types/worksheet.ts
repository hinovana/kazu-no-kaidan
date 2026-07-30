/**
 * 生成済み問題、Worksheet、来歴、機械検査、人間向け説明材料の型を定義する。
 *
 * @packageDocumentation
 */

import type {DifficultyAnalysis} from './difficulty.ts';
import type {
  CandidateRejection,
  DifficultySelectionAnalysis,
  GenerationRequest,
  TerminalPlacementSearchDiagnostics,
} from './generation.ts';
import type {
  Puzzle,
  TerminalMultiplicityPattern,
  UniquePathCoverProfileId,
} from './puzzle.ts';
import type {
  Solution,
  SolutionCost,
  SolutionCoverage,
  SolutionGeometryAnalysis,
} from './solution.ts';

interface EntrySymbolGroup {
  readonly terminalIds: readonly string[];
  readonly pairingChoiceCount: number;
}

/**
 * 端点だけから計算した、取っ掛かり候補とpairing候補数の機械分析。
 *
 * 人間が実際に選ぶ初手や体感難易度を示すものではない。
 */
export interface UniquePathCoverEntryAnalysis {
  readonly analysisVersion:
    'onaji-no-tsunagi-entry.v3.3' | 'onaji-no-tsunagi-entry.v3.4-draft';
  readonly pattern: 'unique_path_cover';
  readonly terminalPattern: TerminalMultiplicityPattern;
  readonly symbolGroups: readonly EntrySymbolGroup[];
  readonly pairingChoiceCount: number;
  readonly forcedExitTerminalIds: readonly string[];
  readonly maximumLineConcentration: number;
  readonly naturalHypothesisCount: number;
  readonly machineStatus: 'entry_candidate';
}

/** Worksheetへ保存する機械的な相互作用証拠の種類。 */
export type InteractionMotifKind =
  'forced_exit' | 'pairing_choice' | 'unique_solution';

/**
 * 局所制約または完全探索から作った機械証拠。
 *
 * 人間がこの順序や仮説で解いたという観察記録ではない。
 */
export interface InteractionWitness {
  readonly kind: InteractionMotifKind;
  readonly involvedTerminalIds: readonly string[];
  readonly temptingConstraint: Readonly<Record<string, unknown>>;
  readonly consequence:
    'remaining_pair_unreachable' | 'alternative_solution_unsatisfiable';
  readonly proofStatus: 'proven';
  readonly exploredStateCount: number;
}

/**
 * solution-first構成時の経路役割を、端点pairへ射影した生成来歴。
 *
 * 役割名は問題のルールや利用者向け意味を持たない。
 */
export interface RouteRoles {
  readonly spineTerminalIds: readonly [string, string];
  readonly threadTerminalIds: readonly [string, string];
  readonly scaffoldTerminalIdPairs: readonly (readonly [string, string])[];
}

/** 植え込み解と最適解の整合性について保存する証拠。 */
export interface GenerationWitnessAnalysis {
  readonly plantedInflationEdgeCount: number;
  readonly rolePreservationStatus: 'proven';
}

/** 一つの技術gateの識別子、合否、診断値。 */
export interface MachineCheck {
  readonly checkId: string;
  readonly passed: boolean;
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * Worksheet全体に対する機械gateの集約結果。
 *
 * 美しさ、面白さ、児童利用可否、難易度校正を証明しない。
 */
export interface MachineCheckReport {
  readonly allPassed: boolean;
  readonly checks: readonly MachineCheck[];
}

/** 同一Worksheetを再現するための版とrequest seed。 */
export interface GenerationProvenance {
  readonly generatorVersion:
    | 'onaji-no-tsunagi-generator.v3.3'
    | 'onaji-no-tsunagi-generator.v3.4-draft.3';
  readonly algorithmSpecVersion:
    'onaji-no-tsunagi-spec.v3.3' | 'onaji-no-tsunagi-spec.v3.4-draft.3';
  readonly solverVersion: 'onaji-no-tsunagi-solver.v3.1';
  readonly analyzerVersion:
    | 'onaji-no-tsunagi-difficulty.v3.3'
    | 'onaji-no-tsunagi-difficulty.v3.4-draft.3';
  readonly profileVersion:
    'onaji-no-tsunagi-profiles.v3.3' | 'onaji-no-tsunagi-profiles.v3.4-draft.3';
  readonly seed: string;
}

/** 一問の候補選択と再現性を追跡する生成来歴。 */
export interface PuzzleProvenance {
  readonly terminalPattern: TerminalMultiplicityPattern;
  readonly profileId: UniquePathCoverProfileId;
  readonly constructionStateCount: number;
  readonly pathLengthProfile: readonly number[];
  readonly candidateIndex: number;
  readonly puzzleSeed: string;
  readonly topologyHash: string;
  readonly precedingRejections: readonly CandidateRejection[];
  readonly terminalPlacementDiagnostics?: TerminalPlacementSearchDiagnostics;
}

/**
 * 唯一解、最適性、profile別機械gateを通過した一問分の成果物。
 *
 * 児童向け品質や体感難易度の確認済みを意味しない。
 */
export interface GeneratedPuzzle {
  readonly puzzle: Puzzle;
  readonly canonicalSolution: Solution;
  readonly answerCoverage: SolutionCoverage;
  readonly solutionCount: {
    readonly kind: 'exact';
    readonly count: 1;
  };
  readonly solutionCost: SolutionCost;
  readonly entry: UniquePathCoverEntryAnalysis;
  readonly geometry: SolutionGeometryAnalysis;
  readonly interactionWitnesses: readonly InteractionWitness[];
  readonly routeRoles: RouteRoles;
  readonly generationWitness: GenerationWitnessAnalysis;
  readonly difficulty: DifficultyAnalysis;
  /** profileで原本基準分類が有効な場合だけ保存するレビュー区分。 */
  readonly difficultySelection?: DifficultySelectionAnalysis;
  readonly qualityProof: {
    readonly status: 'optimal';
    readonly exploredStateCount: number;
  };
  readonly uniquenessProof: {
    readonly status: 'proven';
    readonly exploredStateCount: number;
  };
  readonly provenance: PuzzleProvenance;
}

/**
 * 印刷・画面表示へ渡す決定的な教材成果物。
 *
 * @remarks
 * 現在は常に`development_preview`かつ`childUsePermitted: false`であり、
 * 機械検査合格だけを理由に児童利用へ変更してはならない。
 */
export interface Worksheet {
  readonly schemaVersion:
    | 'onaji-no-tsunagi.worksheet.v3.3'
    | 'onaji-no-tsunagi.worksheet.v3.4-draft.3';
  readonly worksheetId: string;
  readonly usageClass: 'development_preview';
  readonly childUsePermitted: false;
  readonly request: GenerationRequest;
  readonly puzzles: readonly GeneratedPuzzle[];
  readonly machineChecks: MachineCheckReport & {readonly allPassed: true};
  readonly provenance: GenerationProvenance;
}
