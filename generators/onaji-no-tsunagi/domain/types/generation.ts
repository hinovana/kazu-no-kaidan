/**
 * Worksheet生成要求、候補棄却理由、生成失敗を表すdomain型を定義する。
 *
 * @packageDocumentation
 */

import type {DifficultyLevel} from './difficulty.ts';

/** 現在generatorが受け入れる難易度。レベル4は未実装のため含まない。 */
export type AvailableDifficultyLevel = Extract<DifficultyLevel, 1 | 2 | 3>;

/** 一枚のWorksheetへ生成できる問題数。 */
export type PuzzleCount = 1 | 2 | 3 | 4;

/**
 * Worksheet生成を決定する入力。
 *
 * 同じ実装version、難易度、問題数、seedから同一のWorksheetを生成する。
 */
export interface GenerationRequest {
  readonly difficulty: AvailableDifficultyLevel;
  readonly puzzleCount: PuzzleCount;
  readonly seed: string;
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
    };
