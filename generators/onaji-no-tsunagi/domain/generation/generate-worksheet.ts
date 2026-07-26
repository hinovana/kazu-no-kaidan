/**
 * solution-first作問、独立solver、最適化、品質gateを統括してWorksheetを生成する。
 *
 * 個々の探索規則は専用moduleへ委譲し、このmoduleは採用・棄却の流れを管理する。
 *
 * @packageDocumentation
 */

import { optimizeSolution } from "../solver/optimize-solution.ts";
import { solvePuzzle } from "../solver/solve-puzzle.ts";
import type {
  CandidateRejection,
  CandidateRejectionReason,
  GenerationError,
  GenerationRequest,
} from "../types/generation.ts";
import type {
  GeneratedPuzzle,
  UniquePathCoverEntryAnalysis,
  Worksheet,
} from "../types/worksheet.ts";
import { analyzeSolutionCoverage } from "../validation/analyze-solution-coverage.ts";
import {
  analyzeSolutionGeometry,
  calculateSolutionCost,
} from "../validation/analyze-solution-geometry.ts";
import { analyzeUniquePathCoverEntry } from "../validation/analyze-unique-path-cover-entry.ts";
import {
  doesSolutionPreserveRouteRoles,
} from "../validation/solution-route-roles.ts";
import { explainUniquePathCover } from "../validation/explain-unique-path-cover.ts";
import { runMachineChecks } from "../validation/run-machine-checks.ts";
import { validateSolution } from "../validation/validate-solution.ts";
import { analyzeDifficulty } from "./analyze-difficulty.ts";
import {
  buildUniquePathCover,
  getSymbolAssignmentVariantCount,
  getUniquePathCoverProfile,
  selectUniquePathCoverProfileId,
  type UniquePathCoverProfile,
} from "./build-unique-path-cover.ts";
import { createSeededRandom, stableHash } from "./random.ts";

const STABLE_VERSIONS = {
  schemaVersion: "onaji-no-tsunagi.worksheet.v3.3",
  generatorVersion: "onaji-no-tsunagi-generator.v3.3",
  algorithmSpecVersion: "onaji-no-tsunagi-spec.v3.3",
  analyzerVersion: "onaji-no-tsunagi-difficulty.v3.3",
  profileVersion: "onaji-no-tsunagi-profiles.v3.3",
} as const;

const DRAFT_VERSIONS = {
  schemaVersion: "onaji-no-tsunagi.worksheet.v3.4-draft",
  generatorVersion: "onaji-no-tsunagi-generator.v3.4-draft",
  algorithmSpecVersion: "onaji-no-tsunagi-spec.v3.4-draft",
  analyzerVersion: "onaji-no-tsunagi-difficulty.v3.4-draft",
  profileVersion: "onaji-no-tsunagi-profiles.v3.4-draft",
} as const;

type GeneratorVersions = typeof STABLE_VERSIONS | typeof DRAFT_VERSIONS;

interface GenerationProgress {
  totalAttempts: number;
  readonly allRejections: CandidateRejection[];
}

interface CandidateIdentity {
  readonly candidateIndex: number;
  readonly routeSeed: string;
  readonly puzzleSeed: string;
  readonly symbolAssignmentVariant: number;
}

type CandidateEvaluation =
  | {
      readonly status: "accepted";
      readonly generatedPuzzle: GeneratedPuzzle;
    }
  | {
      readonly status: "rejected";
      readonly reason: CandidateRejectionReason;
      readonly skipRemainingSymbolAssignments: boolean;
    };

/**
 * Worksheet生成を続行できないdomain error。
 *
 * `detail`で候補予算超過と内部不変条件破損を区別する。
 */
export class GenerationFailure extends Error {
  readonly detail: GenerationError;

  constructor(detail: GenerationError) {
    super(detail.code);
    this.name = "GenerationFailure";
    this.detail = detail;
  }
}

/**
 * solution-first構成、独立solver、optimizer、品質gateを通してWorksheetを作る。
 *
 * @remarks
 * 公開成果物へ採用するのは、partnerを固定しない完全探索で
 * `solutionCount = { kind: "exact", count: 1 }`と証明できた候補だけである。
 * 予算超過や複数解へfallbackしない。同じversionとrequestから同じ全fieldを
 * 再現する。
 *
 * @throws `GenerationFailure`
 * 候補上限までに採用問題を作れない場合、または植え込み解と独立検証の
 * 不変条件が壊れた場合。
 */
export function generateWorksheet(request: GenerationRequest): Worksheet {
  const versions = request.difficulty === 1
    ? STABLE_VERSIONS
    : DRAFT_VERSIONS;
  const puzzles: GeneratedPuzzle[] = [];
  const progress: GenerationProgress = {
    totalAttempts: 0,
    allRejections: [],
  };

  for (
    let puzzleIndex = 0;
    puzzleIndex < request.puzzleCount;
    puzzleIndex += 1
  ) {
    puzzles.push(generatePuzzle(
      request,
      versions,
      puzzleIndex,
      puzzles,
      progress,
    ));
  }

  const report = runMachineChecks(request, puzzles);
  if (!report.allPassed) {
    const failed = report.checks.find((check) => !check.passed);
    throw new GenerationFailure({
      code: "INTERNAL_INVARIANT_BROKEN",
      checkId: failed?.checkId ?? "unknown",
    });
  }

  return {
    schemaVersion: versions.schemaVersion,
    worksheetId: `ots-sheet-${stableHash(JSON.stringify(request))}`,
    usageClass: "development_preview",
    childUsePermitted: false,
    request,
    puzzles,
    machineChecks: { ...report, allPassed: true },
    provenance: {
      generatorVersion: versions.generatorVersion,
      algorithmSpecVersion: versions.algorithmSpecVersion,
      solverVersion: "onaji-no-tsunagi-solver.v3.1",
      analyzerVersion: versions.analyzerVersion,
      profileVersion: versions.profileVersion,
      seed: request.seed,
    },
  };
}

function generatePuzzle(
  request: GenerationRequest,
  versions: GeneratorVersions,
  puzzleIndex: number,
  precedingPuzzles: readonly GeneratedPuzzle[],
  progress: GenerationProgress,
): GeneratedPuzzle {
  const profileId = selectUniquePathCoverProfileId(
    request.difficulty,
    request.seed,
    puzzleIndex,
    request.puzzleCount,
  );
  const profile = getUniquePathCoverProfile(profileId);
  const symbolAssignmentVariantCount = profile.width === 6
    ? getSymbolAssignmentVariantCount(profileId)
    : 1;
  const puzzleRejections: CandidateRejection[] = [];

  for (
    let candidateIndex = 0;
    candidateIndex < profile.maximumCandidateCount;
    candidateIndex += 1
  ) {
    progress.totalAttempts += 1;
    const identity = createCandidateIdentity(
      request,
      versions,
      puzzleIndex,
      candidateIndex,
      profile,
      symbolAssignmentVariantCount,
    );
    const evaluation = evaluateCandidate(
      request,
      identity,
      profile,
      precedingPuzzles,
      puzzleRejections,
    );
    if (evaluation.status === "accepted") {
      return evaluation.generatedPuzzle;
    }

    recordRejection(
      identity,
      evaluation.reason,
      puzzleRejections,
      progress.allRejections,
    );
    if (evaluation.skipRemainingSymbolAssignments) {
      candidateIndex += (
        symbolAssignmentVariantCount
        - identity.symbolAssignmentVariant
        - 1
      );
    }
  }

  throw new GenerationFailure({
    code: "GENERATION_BUDGET_EXHAUSTED",
    attemptedCandidates: progress.totalAttempts,
    rejections: progress.allRejections,
  });
}

function createCandidateIdentity(
  request: GenerationRequest,
  versions: GeneratorVersions,
  puzzleIndex: number,
  candidateIndex: number,
  profile: UniquePathCoverProfile,
  symbolAssignmentVariantCount: number,
): CandidateIdentity {
  const routeCandidateIndex = Math.floor(
    candidateIndex / symbolAssignmentVariantCount,
  );
  const symbolAssignmentVariant = (
    candidateIndex % symbolAssignmentVariantCount
  );
  const routeSeed = [
    request.seed,
    versions.generatorVersion,
    `puzzle-${puzzleIndex + 1}`,
    request.difficulty === 1
      ? `terminals-${profile.terminalPattern}`
      : `profile-${profile.profileId}`,
    `candidate-${routeCandidateIndex}`,
  ].join("::");
  const puzzleSeed = profile.width === 5
    ? routeSeed
    : `${routeSeed}::symbol-${symbolAssignmentVariant}`;
  return {
    candidateIndex,
    routeSeed,
    puzzleSeed,
    symbolAssignmentVariant,
  };
}

function evaluateCandidate(
  request: GenerationRequest,
  identity: CandidateIdentity,
  profile: UniquePathCoverProfile,
  precedingPuzzles: readonly GeneratedPuzzle[],
  precedingRejections: readonly CandidateRejection[],
): CandidateEvaluation {
  const buildResult = buildUniquePathCover(
    identity.routeSeed,
    createSeededRandom(identity.routeSeed),
    profile.profileId,
    {
      symbolAssignmentVariant: identity.symbolAssignmentVariant,
      materializedPuzzleSeed: identity.puzzleSeed,
    },
  );
  if (buildResult.status === "budget_exhausted") {
    return rejectedCandidate(
      "construction_state_budget_exhausted",
      true,
    );
  }
  if (buildResult.status === "not_constructed") {
    return rejectedCandidate("route_plan_not_constructed", true);
  }

  const { plan } = buildResult;
  if (precedingPuzzles.some((entry) => (
    entry.provenance.topologyHash === plan.topologyHash
  ))) {
    return rejectedCandidate("duplicate_topology_in_worksheet");
  }
  if (!validateSolution(plan.puzzle, plan.plantedSolution).valid) {
    throw brokenInvariant("known_solution_valid");
  }

  const entryResult = analyzeUniquePathCoverEntry(plan.puzzle, profile);
  if (entryResult.status === "rejected") {
    return rejectedCandidate("entry_structure_missing", true);
  }

  const validity = solvePuzzle(plan.puzzle, {
    solutionLimit: 2,
    stateBudget: profile.maximumValidityStates,
  });
  if (validity.status === "budget_exhausted") {
    return rejectedCandidate("validity_solver_budget_exhausted");
  }
  if (validity.status === "unsatisfiable") {
    throw brokenInvariant("independent_solver_found_solution");
  }
  if (
    validity.solutionCount.kind !== "exact"
    || validity.solutionCount.count !== 1
  ) {
    return rejectedCandidate("solution_not_unique");
  }

  const optimization = optimizeSolution(
    plan.puzzle,
    plan.plantedSolution,
    { stateBudget: profile.maximumProofStates },
  );
  if (optimization.status === "budget_exhausted") {
    return rejectedCandidate("quality_optimizer_budget_exhausted");
  }
  if (optimization.status === "unsatisfiable") {
    throw brokenInvariant("quality_optimizer_found_solution");
  }

  const plantedCost = calculateSolutionCost(
    plan.puzzle,
    plan.plantedSolution,
  );
  const plantedSolutionIsOptimal = (
    plantedCost.totalEdgeCount === optimization.cost.totalEdgeCount
    && doesSolutionPreserveRouteRoles(
      plan.puzzle,
      optimization.solution,
      plan.routeRoles,
    )
  );
  if (!plantedSolutionIsOptimal) {
    return rejectedCandidate("planted_solution_not_optimal");
  }

  const geometry = analyzeSolutionGeometry(
    plan.puzzle,
    optimization.solution,
  );
  const coverage = analyzeSolutionCoverage(
    plan.puzzle,
    optimization.solution,
  );
  if (!passesUniquePathCoverGates(
    coverage.usedCellCount,
    geometry,
    entryResult.analysis,
    profile,
  )) {
    return rejectedCandidate("geometry_gate_failed");
  }

  const difficulty = analyzeDifficulty(
    request.difficulty,
    plan.puzzle,
    validity.metrics,
  );
  if (difficulty.measuredBand !== request.difficulty) {
    return rejectedCandidate("difficulty_band_mismatch");
  }

  return {
    status: "accepted",
    generatedPuzzle: {
      puzzle: plan.puzzle,
      canonicalSolution: optimization.solution,
      answerCoverage: coverage,
      solutionCount: { kind: "exact", count: 1 },
      solutionCost: optimization.cost,
      entry: entryResult.analysis,
      geometry,
      interactionWitnesses: explainUniquePathCover(
        entryResult.analysis,
        validity.metrics.exploredStateCount,
      ),
      routeRoles: plan.routeRoles,
      generationWitness: {
        plantedInflationEdgeCount:
          plantedCost.totalEdgeCount
          - optimization.cost.totalEdgeCount,
        rolePreservationStatus: "proven",
      },
      difficulty,
      qualityProof: {
        status: "optimal",
        exploredStateCount: optimization.exploredStateCount,
      },
      uniquenessProof: {
        status: "proven",
        exploredStateCount: validity.metrics.exploredStateCount,
      },
      provenance: {
        terminalPattern: profile.terminalPattern,
        profileId: profile.profileId,
        constructionStateCount: buildResult.constructionStateCount,
        pathLengthProfile: buildResult.pathLengthProfile,
        candidateIndex: identity.candidateIndex,
        puzzleSeed: identity.puzzleSeed,
        topologyHash: plan.topologyHash,
        precedingRejections: [...precedingRejections],
      },
    },
  };
}

function rejectedCandidate(
  reason: CandidateRejectionReason,
  skipRemainingSymbolAssignments = false,
): CandidateEvaluation {
  return {
    status: "rejected",
    reason,
    skipRemainingSymbolAssignments,
  };
}

function recordRejection(
  identity: CandidateIdentity,
  reason: CandidateRejectionReason,
  puzzleRejections: CandidateRejection[],
  allRejections: CandidateRejection[],
): void {
  const rejection = {
    candidateIndex: identity.candidateIndex,
    puzzleSeed: identity.puzzleSeed,
    reason,
  } as const;
  puzzleRejections.push(rejection);
  allRejections.push(rejection);
}

function brokenInvariant(checkId: string): GenerationFailure {
  return new GenerationFailure({
    code: "INTERNAL_INVARIANT_BROKEN",
    checkId,
  });
}

function passesUniquePathCoverGates(
  usedCellCount: number,
  geometry: GeneratedPuzzle["geometry"],
  entry: UniquePathCoverEntryAnalysis,
  profile: UniquePathCoverProfile,
): boolean {
  const cellCount = profile.width * profile.height;
  return usedCellCount
      >= profile.minimumUsedCellCount
    && usedCellCount <= profile.maximumUsedCellCount
    && geometry.totalEdgeCount === cellCount - profile.pathCount
    && geometry.unexplainedUnitBayCount === 0
    && geometry.totalTurnCount
      <= profile.maximumTotalTurnCount
    && geometry.unusedComponentCount === 0
    && geometry.isolatedUnusedCellCount === 0
    && entry.forcedExitTerminalIds.length
      >= profile.minimumForcedExitCount
    && entry.forcedExitTerminalIds.length
      <= profile.maximumForcedExitCount
    && entry.maximumLineConcentration
      <= profile.maximumLineConcentration;
}
