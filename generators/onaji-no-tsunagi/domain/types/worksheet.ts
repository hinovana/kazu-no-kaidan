import type { DifficultyAnalysis } from "./difficulty.ts";
import type { CandidateRejection, GenerationRequest } from "./generation.ts";
import type {
  Puzzle,
  SymbolId,
  TerminalMultiplicityPattern,
  UniquePathCoverProfileId,
} from "./puzzle.ts";
import type {
  Solution,
  SolutionCost,
  SolutionCoverage,
  SolutionGeometryAnalysis,
} from "./solution.ts";

export type EntryPatternKind = "unique_path_cover";

interface EntrySymbolGroup {
  readonly symbol: SymbolId;
  readonly terminalIds: readonly string[];
  readonly pairingChoiceCount: number;
}

export interface UniquePathCoverEntryAnalysis {
  readonly analysisVersion:
    | "onaji-no-tsunagi-entry.v3.3"
    | "onaji-no-tsunagi-entry.v3.4-draft";
  readonly pattern: "unique_path_cover";
  readonly terminalPattern: TerminalMultiplicityPattern;
  readonly symbolGroups: readonly EntrySymbolGroup[];
  readonly pairingChoiceCount: number;
  readonly forcedExitTerminalIds: readonly string[];
  readonly openExitCountByTerminalId: Readonly<Record<string, number>>;
  readonly maximumLineConcentration: number;
  readonly naturalHypothesisCount: number;
  readonly machineStatus: "entry_candidate";
}

export type EntryAnalysis = UniquePathCoverEntryAnalysis;

export type InteractionMotifKind =
  | "anchor_route_conflict"
  | "visible_blocker"
  | "scaffold_gate"
  | "forced_exit"
  | "shared_gate"
  | "separation_trap"
  | "pairing_choice"
  | "ordering_dependency"
  | "unique_solution";

export interface InteractionWitness {
  readonly kind: InteractionMotifKind;
  readonly involvedTerminalIds: readonly string[];
  readonly temptingConstraint: Readonly<Record<string, unknown>>;
  readonly consequence:
    | "remaining_pair_unreachable"
    | "component_parity_impossible"
    | "shared_gate_conflict"
    | "strictly_worse_optimal_cost"
    | "alternative_solution_unsatisfiable";
  readonly proofStatus: "proven";
  readonly exploredStateCount: number;
}

export interface RouteRoles {
  readonly spineTerminalIds: readonly [string, string];
  readonly threadTerminalIds: readonly [string, string];
  readonly scaffoldTerminalIdPairs: readonly (readonly [string, string])[];
}

export interface GenerationWitnessAnalysis {
  readonly plantedCost: SolutionCost;
  readonly optimalCost: SolutionCost;
  readonly plantedInflationEdgeCount: number;
  readonly rolePreservationStatus: "proven";
}

export interface MachineCheck {
  readonly checkId: string;
  readonly passed: boolean;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface MachineCheckReport {
  readonly allPassed: boolean;
  readonly checks: readonly MachineCheck[];
  readonly qualityAssessment: {
    readonly status: "structural_candidate_only";
    readonly reason: string;
  };
}

export interface GenerationProvenance {
  readonly generatorVersion:
    | "onaji-no-tsunagi-generator.v3.3"
    | "onaji-no-tsunagi-generator.v3.4-draft";
  readonly algorithmSpecVersion:
    | "onaji-no-tsunagi-spec.v3.3"
    | "onaji-no-tsunagi-spec.v3.4-draft";
  readonly solverVersion: "onaji-no-tsunagi-solver.v3.1";
  readonly analyzerVersion:
    | "onaji-no-tsunagi-difficulty.v3.3"
    | "onaji-no-tsunagi-difficulty.v3.4-draft";
  readonly profileVersion:
    | "onaji-no-tsunagi-profiles.v3.3"
    | "onaji-no-tsunagi-profiles.v3.4-draft";
  readonly seed: string;
  readonly generatedAt: null;
}

export interface PuzzleProvenance {
  readonly terminalPattern: TerminalMultiplicityPattern;
  readonly profileId: UniquePathCoverProfileId;
  readonly constructionStateCount: number;
  readonly pathLengthProfile: readonly number[];
  readonly candidateIndex: number;
  readonly puzzleSeed: string;
  readonly topologyHash: string;
  readonly precedingRejections: readonly CandidateRejection[];
}

export interface GeneratedPuzzle {
  readonly puzzle: Puzzle;
  readonly canonicalSolution: Solution;
  readonly answerCoverage: SolutionCoverage;
  readonly solutionCount: {
    readonly kind: "exact";
    readonly count: 1;
  };
  readonly solutionCost: SolutionCost;
  readonly entry: EntryAnalysis;
  readonly geometry: SolutionGeometryAnalysis;
  readonly interactionWitnesses: readonly InteractionWitness[];
  readonly routeRoles: RouteRoles;
  readonly generationWitness: GenerationWitnessAnalysis;
  readonly difficulty: DifficultyAnalysis;
  readonly qualityProof: {
    readonly status: "optimal";
    readonly exploredStateCount: number;
  };
  readonly uniquenessProof: {
    readonly status: "proven";
    readonly exploredStateCount: number;
  };
  readonly provenance: PuzzleProvenance;
}

export interface Worksheet {
  readonly schemaVersion:
    | "onaji-no-tsunagi.worksheet.v3.3"
    | "onaji-no-tsunagi.worksheet.v3.4-draft";
  readonly worksheetId: string;
  readonly usageClass: "development_preview";
  readonly childUsePermitted: false;
  readonly request: GenerationRequest;
  readonly puzzles: readonly GeneratedPuzzle[];
  readonly machineChecks: MachineCheckReport & { readonly allPassed: true };
  readonly provenance: GenerationProvenance;
  readonly manualReview: { readonly status: "not_started" };
  readonly calibration: { readonly status: "not_calibrated" };
}
