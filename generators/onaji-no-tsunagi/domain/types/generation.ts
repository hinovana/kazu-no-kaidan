/**
 * Worksheet生成要求、候補棄却理由、生成失敗を表すdomain型を定義する。
 *
 * @packageDocumentation
 */

import type {DifficultyLevel} from './difficulty.ts';
import type {Puzzle, UniquePathCoverProfileId} from './puzzle.ts';
import type {Solution} from './solution.ts';

/** 現在generatorが受け入れる難易度。レベル4は未実装のため含まない。 */
export type AvailableDifficultyLevel = Extract<DifficultyLevel, 1 | 2 | 3>;

/** 一枚のWorksheetへ生成できる問題数。 */
export type PuzzleCount = 1 | 2 | 3 | 4;

/** 原本基準の機械指標で分類する、生成候補のレビュー区分。 */
export type DifficultyClassification =
  'reference_like' | 'clearly_easier' | 'clearly_harder' | 'mixed';

/** 利用者が採用条件として選べる区分。明らかに簡単側は常に不採用とする。 */
export type AcceptedDifficultyClassification = Exclude<
  DifficultyClassification,
  'clearly_easier'
>;

/** 採用条件checkboxとruntime検証で共有する決定的な表示順。 */
export const ACCEPTABLE_DIFFICULTY_CLASSIFICATIONS = [
  'reference_like',
  'clearly_harder',
  'mixed',
] as const satisfies readonly AcceptedDifficultyClassification[];

/**
 * Worksheet生成を決定する入力。
 *
 * 同じ実装version、難易度、問題数、seedから同一のWorksheetを生成する。
 */
export interface GenerationRequest {
  readonly difficulty: AvailableDifficultyLevel;
  readonly puzzleCount: PuzzleCount;
  readonly seed: string;
  /**
   * 通常の難易度別profile選択を使わず、全問題を指定profileで生成する。
   *
   * 省略時は従来どおりseed・問題数・位置からprofileを選ぶ。指定時は
   * `difficulty`とprofileの対応が一致しなければならない。
   */
  readonly profileId?: UniquePathCoverProfileId;
  /**
   * 原本基準の分類policyが有効なprofileで採用する区分。
   *
   * 省略時は選択可能な3区分をすべて採用する。policy未設定profileでは
   * 生成結果へ影響しないため、v3.3の既存requestはこのfieldを持たない。
   */
  readonly acceptedDifficultyClassifications?: readonly AcceptedDifficultyClassification[];
}

/** 端点配置の後段採用フィルターを識別する。 */
export type PuzzleSelectionFilterRuleId =
  | 'central_terminal_count_range'
  | 'filled_two_by_two_terminal_block'
  | 'central_boundary_adjacency_pair_limit'
  | 'concentrated_orthogonal_outer_side_pairs';

/** 原本との比較に使う4指標。値は同一solver・analyzer版の間だけで比較する。 */
export interface DifficultyReferenceMetrics {
  readonly entryHypothesisCount: number;
  readonly solverStateCount: number;
  readonly forcedExitCount: number;
  readonly totalTurnCount: number;
}

/** 一指標が原本に対して示す難易度方向。 */
export type DifficultyIndicatorDirection = 'easier' | 'comparable' | 'harder';

/** 原本基準の4指標と、その集約分類。 */
export interface DifficultySelectionAnalysis {
  readonly policyId: 'onaji-no-tsunagi.difficulty-selection.v1';
  readonly referenceSourceProblemId: string;
  readonly classification: DifficultyClassification;
  readonly metrics: DifficultyReferenceMetrics;
  readonly referenceMetrics: DifficultyReferenceMetrics;
  readonly indicatorDirections: {
    readonly entryHypotheses: DifficultyIndicatorDirection;
    readonly solverStates: DifficultyIndicatorDirection;
    readonly forcedExits: DifficultyIndicatorDirection;
    readonly solutionTurns: DifficultyIndicatorDirection;
  };
}

/**
 * 10回連続棄却時に、人間が盤面と判定根拠を再現するため保存する候補。
 */
export interface DifficultyRejectedCandidate {
  readonly candidateIndex: number;
  readonly puzzleSeed: string;
  readonly topologyHash: string;
  readonly puzzle: Puzzle;
  readonly canonicalSolution: Solution;
  readonly selection: DifficultySelectionAnalysis;
  readonly terminalPlacementFilterResults: Readonly<
    Record<PuzzleSelectionFilterRuleId, boolean>
  >;
}

/** 経路探索中に座標だけで剪定できる端点配置条件ID。 */
export type TerminalGeometryRuleId =
  | 'outer_adjacency_pair_limit'
  | 'central_adjacency_pair_limit'
  | 'straight_terminal_run'
  | 'l_shaped_terminal_triple';

/** 完成coverの記号割当てを除外する端点配置条件ID。 */
export type TerminalSymbolRuleId =
  'central_symbol_coverage' | 'same_symbol_outer_adjacency';

/**
 * 一つのroute cover探索で収集した、配置制約の診断値。
 *
 * 完成盤面の却下率ではなく、探索枝と記号割当ての評価回数を表す。
 */
export interface TerminalPlacementSearchDiagnostics {
  readonly policyId: 'onaji-no-tsunagi-terminal-placement.6x6-4-4-2.v1';
  readonly pathExtensionEvaluationCount: number;
  readonly completedCoverEvaluationCount: number;
  readonly pathPruningCounts: Readonly<Record<TerminalGeometryRuleId, number>>;
  readonly symbolAssignmentEvaluationCount: number;
  readonly symbolAssignmentRejectionCounts: Readonly<
    Record<TerminalSymbolRuleId, number>
  >;
  readonly allowedSymbolAssignmentCount: number;
}

/**
 * 候補をWorksheetへ採用しなかった、機械的かつ再現可能な理由。
 */
export type CandidateRejectionReason =
  | 'route_plan_not_constructed'
  | 'construction_state_budget_exhausted'
  | 'duplicate_topology_in_worksheet'
  | 'validity_solver_budget_exhausted'
  | 'quality_optimizer_budget_exhausted'
  | 'planted_solution_not_optimal'
  | 'entry_structure_missing'
  | 'terminal_symbol_assignment_unavailable'
  | 'puzzle_selection_filter_failed'
  | 'clearly_easier_candidate'
  | 'difficulty_classification_not_selected'
  | 'geometry_gate_failed'
  | 'difficulty_band_mismatch'
  | 'solution_not_unique';

/** 採用候補より前に調べた一候補の棄却記録。 */
export interface CandidateRejection {
  readonly candidateIndex: number;
  readonly puzzleSeed: string;
  readonly reason: CandidateRejectionReason;
}

/**
 * Worksheetを返せないときのdomain error。
 *
 * 予算内で採用候補がなかった状態と、実装上の不変条件破損を区別する。
 */
export type GenerationError =
  | {
      readonly code: 'GENERATION_BUDGET_EXHAUSTED';
      readonly attemptedCandidates: number;
      readonly rejections: readonly CandidateRejection[];
    }
  | {
      readonly code: 'INTERNAL_INVARIANT_BROKEN';
      readonly checkId: string;
    }
  | {
      readonly code: 'DIFFICULTY_RETRY_EXHAUSTED';
      readonly request: GenerationRequest;
      readonly profileId: UniquePathCoverProfileId;
      readonly puzzleIndex: number;
      readonly retryCount: 10;
      readonly rejectedCandidates: readonly DifficultyRejectedCandidate[];
    };
