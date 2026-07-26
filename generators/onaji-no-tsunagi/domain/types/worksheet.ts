import type { DifficultyAnalysis } from "./difficulty.ts";
import type { CandidateRejection, GenerationRequest } from "./generation.ts";
import type {
  Puzzle,
  TerminalMultiplicityPattern,
  UniquePathCoverProfileId,
} from "./puzzle.ts";
import type {
  Solution,
  SolutionCost,
  SolutionCoverage,
  SolutionGeometryAnalysis,
} from "./solution.ts";

interface EntrySymbolGroup {
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
  readonly maximumLineConcentration: number;
  readonly naturalHypothesisCount: number;
  readonly machineStatus: "entry_candidate";
}

export type InteractionMotifKind =
  | "forced_exit"
  | "pairing_choice"
  | "unique_solution";

export interface InteractionWitness {
  readonly kind: InteractionMotifKind;
  readonly involvedTerminalIds: readonly string[];
  readonly temptingConstraint: Readonly<Record<string, unknown>>;
  readonly consequence:
    | "remaining_pair_unreachable"
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
  readonly entry: UniquePathCoverEntryAnalysis;
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
}
