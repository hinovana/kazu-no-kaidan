import type { DifficultyLevel } from "./difficulty.ts";

export type AvailableDifficultyLevel = Extract<DifficultyLevel, 1 | 2 | 3>;
export type PuzzleCount = 1 | 2 | 3 | 4;

export interface GenerationRequest {
  readonly difficulty: AvailableDifficultyLevel;
  readonly puzzleCount: PuzzleCount;
  readonly seed: string;
}

export type CandidateRejectionReason =
  | "route_plan_not_constructed"
  | "construction_state_budget_exhausted"
  | "duplicate_topology_in_worksheet"
  | "known_solution_invalid"
  | "validity_solver_budget_exhausted"
  | "quality_optimizer_budget_exhausted"
  | "counterfactual_solver_budget_exhausted"
  | "shortest_thread_solution_exists"
  | "planted_solution_not_optimal"
  | "entry_structure_missing"
  | "interaction_witness_missing"
  | "geometry_gate_failed"
  | "difficulty_band_mismatch"
  | "solution_not_unique";

export interface CandidateRejection {
  readonly candidateIndex: number;
  readonly puzzleSeed: string;
  readonly reason: CandidateRejectionReason;
}

export type GenerationError =
  | {
      readonly code: "INVALID_REQUEST";
      readonly issues: readonly string[];
    }
  | {
      readonly code: "GENERATION_BUDGET_EXHAUSTED";
      readonly attemptedCandidates: number;
      readonly rejections: readonly CandidateRejection[];
    }
  | {
      readonly code: "INTERNAL_INVARIANT_BROKEN";
      readonly checkId: string;
    };
