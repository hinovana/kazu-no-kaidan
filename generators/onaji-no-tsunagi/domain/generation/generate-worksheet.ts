/**
 * solution-first作問、独立solver、最適化、品質gateを統括してWorksheetを生成する。
 *
 * 個々の探索規則は専用moduleへ委譲し、このmoduleは採用・棄却の流れを管理する。
 *
 * @packageDocumentation
 */

import {optimizeSolution} from '../solver/optimize-solution.ts';
import {solvePuzzle} from '../solver/solve-puzzle.ts';
import type {
  AcceptedDifficultyClassification,
  CandidateRejection,
  CandidateRejectionReason,
  DifficultyClassification,
  DifficultyRejectedCandidate,
  GenerationError,
  GenerationRequest,
} from '../types/generation.ts';
import {ACCEPTABLE_DIFFICULTY_CLASSIFICATIONS} from '../types/generation.ts';
import type {
  GeneratedPuzzle,
  UniquePathCoverEntryAnalysis,
  Worksheet,
} from '../types/worksheet.ts';
import {analyzeSolutionCoverage} from '../validation/analyze-solution-coverage.ts';
import {
  analyzeSolutionGeometry,
  calculateSolutionCost,
} from '../validation/analyze-solution-geometry.ts';
import {analyzeUniquePathCoverEntry} from '../validation/analyze-unique-path-cover-entry.ts';
import {doesSolutionPreserveRouteRoles} from '../validation/solution-route-roles.ts';
import {explainUniquePathCover} from '../validation/explain-unique-path-cover.ts';
import {runMachineChecks} from '../validation/run-machine-checks.ts';
import {validateSolution} from '../validation/validate-solution.ts';
import {analyzeDifficulty} from './analyze-difficulty.ts';
import {classifyDifficultySelection} from './classify-difficulty-selection.ts';
import {
  createDifficultyRetryState,
  observeDifficultyRetryCandidate,
  type DifficultyRetryState,
} from './difficulty-retry-policy.ts';
import {
  buildUniquePathCover,
  getUniquePathCoverProfile,
  selectUniquePathCoverProfileId,
  type UniquePathCoverProfile,
} from './build-unique-path-cover.ts';
import {
  createProfileCandidateIdentity,
  getGeneratorVersions,
  getProfileSymbolAssignmentVariantCount,
} from './generation-profile-adapter.ts';
import {createSeededRandom, stableHash} from './random.ts';
import {evaluatePuzzleSelectionFilters} from './puzzle-selection-policy.ts';

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
      readonly status: 'accepted';
      readonly generatedPuzzle: GeneratedPuzzle;
    }
  | {
      readonly status: 'rejected';
      readonly reason: CandidateRejectionReason;
      readonly skipRemainingSymbolAssignments: boolean;
      readonly difficultyClassification?: DifficultyClassification;
      readonly difficultyRejectedCandidate?: DifficultyRejectedCandidate;
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
    this.name = 'GenerationFailure';
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
  const profiles = selectWorksheetProfiles(request);
  const firstProfile = profiles[0];
  if (firstProfile === undefined) {
    throw brokenInvariant('worksheet_has_profile');
  }
  const versions = getGeneratorVersions(firstProfile);
  if (
    profiles.some(
      profile =>
        profile.generationPolicy.versionTrack !==
        firstProfile.generationPolicy.versionTrack,
    )
  ) {
    throw brokenInvariant('worksheet_profiles_share_version_track');
  }
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
    const profile = profiles[puzzleIndex];
    if (profile === undefined) {
      throw brokenInvariant('worksheet_profile_matches_puzzle_index');
    }
    puzzles.push(
      generatePuzzle(request, profile, puzzleIndex, puzzles, progress),
    );
  }

  const report = runMachineChecks(request, puzzles);
  if (!report.allPassed) {
    const failed = report.checks.find(check => !check.passed);
    throw new GenerationFailure({
      code: 'INTERNAL_INVARIANT_BROKEN',
      checkId: failed?.checkId ?? 'unknown',
    });
  }

  return {
    schemaVersion: versions.schemaVersion,
    worksheetId: `ots-sheet-${stableHash(JSON.stringify(request))}`,
    usageClass: 'development_preview',
    childUsePermitted: false,
    request,
    puzzles,
    machineChecks: {...report, allPassed: true},
    provenance: {
      generatorVersion: versions.generatorVersion,
      algorithmSpecVersion: versions.algorithmSpecVersion,
      solverVersion: 'onaji-no-tsunagi-solver.v3.1',
      analyzerVersion: versions.analyzerVersion,
      profileVersion: versions.profileVersion,
      seed: request.seed,
    },
  };
}

function generatePuzzle(
  request: GenerationRequest,
  profile: UniquePathCoverProfile,
  puzzleIndex: number,
  precedingPuzzles: readonly GeneratedPuzzle[],
  progress: GenerationProgress,
): GeneratedPuzzle {
  const symbolAssignmentVariantCount =
    getProfileSymbolAssignmentVariantCount(profile);
  const puzzleRejections: CandidateRejection[] = [];
  let difficultyRetryState = createDifficultyRetryState();

  for (
    let candidateIndex = 0;
    candidateIndex < profile.maximumCandidateCount;
    candidateIndex += 1
  ) {
    progress.totalAttempts += 1;
    const identity = createCandidateIdentity(
      request,
      puzzleIndex,
      candidateIndex,
      profile,
    );
    const evaluation = evaluateCandidate(
      request,
      identity,
      profile,
      precedingPuzzles,
      puzzleRejections,
    );
    if (evaluation.status === 'accepted') {
      return evaluation.generatedPuzzle;
    }

    recordRejection(
      identity,
      evaluation.reason,
      puzzleRejections,
      progress.allRejections,
    );
    difficultyRetryState = updateClearlyEasierRetryState(
      evaluation,
      difficultyRetryState,
    );
    const maximumClearlyEasierRetries =
      profile.puzzleSelectionPolicy.maximumConsecutiveClearlyEasierCandidates;
    if (
      maximumClearlyEasierRetries !== null &&
      difficultyRetryState.consecutiveClearlyEasierCandidates.length >=
        maximumClearlyEasierRetries
    ) {
      throw new GenerationFailure({
        code: 'DIFFICULTY_RETRY_EXHAUSTED',
        request,
        profileId: profile.profileId,
        puzzleIndex,
        retryCount: maximumClearlyEasierRetries,
        rejectedCandidates: [
          ...difficultyRetryState.consecutiveClearlyEasierCandidates,
        ],
      });
    }
    if (evaluation.skipRemainingSymbolAssignments) {
      candidateIndex +=
        symbolAssignmentVariantCount - identity.symbolAssignmentVariant - 1;
    }
  }

  throw new GenerationFailure({
    code: 'GENERATION_BUDGET_EXHAUSTED',
    attemptedCandidates: progress.totalAttempts,
    rejections: progress.allRejections,
  });
}

function createCandidateIdentity(
  request: GenerationRequest,
  puzzleIndex: number,
  candidateIndex: number,
  profile: UniquePathCoverProfile,
): CandidateIdentity {
  const profileIdentity = createProfileCandidateIdentity(
    profile,
    request.seed,
    puzzleIndex,
    candidateIndex,
  );
  return {
    candidateIndex,
    ...profileIdentity,
  };
}

function selectWorksheetProfiles(
  request: GenerationRequest,
): readonly UniquePathCoverProfile[] {
  return Array.from({length: request.puzzleCount}, (_, puzzleIndex) => {
    const profileId = selectUniquePathCoverProfileId(
      request.difficulty,
      request.seed,
      puzzleIndex,
      request.puzzleCount,
    );
    return getUniquePathCoverProfile(profileId);
  });
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
  if (buildResult.status === 'budget_exhausted') {
    return rejectedCandidate('construction_state_budget_exhausted', true);
  }
  if (buildResult.status === 'not_constructed') {
    return rejectedCandidate('route_plan_not_constructed', true);
  }
  if (buildResult.status === 'symbol_assignment_unavailable') {
    return rejectedCandidate('terminal_symbol_assignment_unavailable', true);
  }

  const {plan} = buildResult;
  if (
    precedingPuzzles.some(
      entry => entry.provenance.topologyHash === plan.topologyHash,
    )
  ) {
    return rejectedCandidate('duplicate_topology_in_worksheet');
  }
  if (!validateSolution(plan.puzzle, plan.plantedSolution).valid) {
    throw brokenInvariant('known_solution_valid');
  }

  const entryResult = analyzeUniquePathCoverEntry(plan.puzzle, profile);
  if (entryResult.status === 'rejected') {
    return rejectedCandidate('entry_structure_missing', true);
  }

  const validity = solvePuzzle(plan.puzzle, {
    solutionLimit: 2,
    stateBudget: profile.maximumValidityStates,
  });
  if (validity.status === 'budget_exhausted') {
    return rejectedCandidate('validity_solver_budget_exhausted');
  }
  if (validity.status === 'unsatisfiable') {
    throw brokenInvariant('independent_solver_found_solution');
  }
  if (
    validity.solutionCount.kind !== 'exact' ||
    validity.solutionCount.count !== 1
  ) {
    return rejectedCandidate('solution_not_unique');
  }

  const optimization = optimizeSolution(plan.puzzle, plan.plantedSolution, {
    stateBudget: profile.maximumProofStates,
  });
  if (optimization.status === 'budget_exhausted') {
    return rejectedCandidate('quality_optimizer_budget_exhausted');
  }
  if (optimization.status === 'unsatisfiable') {
    throw brokenInvariant('quality_optimizer_found_solution');
  }

  const plantedCost = calculateSolutionCost(plan.puzzle, plan.plantedSolution);
  const plantedSolutionIsOptimal =
    plantedCost.totalEdgeCount === optimization.cost.totalEdgeCount &&
    doesSolutionPreserveRouteRoles(
      plan.puzzle,
      optimization.solution,
      plan.routeRoles,
    );
  if (!plantedSolutionIsOptimal) {
    return rejectedCandidate('planted_solution_not_optimal');
  }

  const geometry = analyzeSolutionGeometry(plan.puzzle, optimization.solution);
  const coverage = analyzeSolutionCoverage(plan.puzzle, optimization.solution);
  if (
    !passesUniquePathCoverGates(
      coverage.usedCellCount,
      geometry,
      entryResult.analysis,
      profile,
    )
  ) {
    return rejectedCandidate('geometry_gate_failed');
  }

  const difficulty = analyzeDifficulty(
    request.difficulty,
    plan.puzzle,
    validity.metrics,
  );
  if (difficulty.measuredBand !== request.difficulty) {
    return rejectedCandidate('difficulty_band_mismatch');
  }

  const selectionFilterEvaluation = evaluatePuzzleSelectionFilters(
    plan.puzzle,
    profile.puzzleSelectionPolicy.filterRuleIds,
  );
  if (!selectionFilterEvaluation.allConfiguredFiltersPassed) {
    return rejectedCandidate('puzzle_selection_filter_failed');
  }

  const difficultyReference = profile.puzzleSelectionPolicy.difficultyReference;
  const difficultySelection =
    difficultyReference === null
      ? undefined
      : classifyDifficultySelection(
          {
            entryHypothesisCount: entryResult.analysis.naturalHypothesisCount,
            solverStateCount: validity.metrics.exploredStateCount,
            forcedExitCount: entryResult.analysis.forcedExitTerminalIds.length,
            totalTurnCount: optimization.cost.totalTurnCount,
          },
          difficultyReference,
        );

  const generatedPuzzle: GeneratedPuzzle = {
    puzzle: plan.puzzle,
    canonicalSolution: optimization.solution,
    answerCoverage: coverage,
    solutionCount: {kind: 'exact', count: 1},
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
        plantedCost.totalEdgeCount - optimization.cost.totalEdgeCount,
      rolePreservationStatus: 'proven',
    },
    difficulty,
    ...(difficultySelection === undefined ? {} : {difficultySelection}),
    qualityProof: {
      status: 'optimal',
      exploredStateCount: optimization.exploredStateCount,
    },
    uniquenessProof: {
      status: 'proven',
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
      ...(buildResult.terminalPlacementDiagnostics === undefined
        ? {}
        : {
            terminalPlacementDiagnostics:
              buildResult.terminalPlacementDiagnostics,
          }),
    },
  };
  if (difficultySelection?.classification === 'clearly_easier') {
    return rejectedCandidate('clearly_easier_candidate', false, {
      difficultyClassification: difficultySelection.classification,
      difficultyRejectedCandidate: {
        candidateIndex: identity.candidateIndex,
        puzzleSeed: identity.puzzleSeed,
        topologyHash: plan.topologyHash,
        puzzle: plan.puzzle,
        canonicalSolution: optimization.solution,
        selection: difficultySelection,
        terminalPlacementFilterResults: selectionFilterEvaluation.results,
      },
    });
  }
  if (
    difficultySelection !== undefined &&
    !acceptedDifficultyClassifications(request).includes(
      difficultySelection.classification,
    )
  ) {
    return rejectedCandidate('difficulty_classification_not_selected', false, {
      difficultyClassification: difficultySelection.classification,
    });
  }

  return {
    status: 'accepted',
    generatedPuzzle,
  };
}

function rejectedCandidate(
  reason: CandidateRejectionReason,
  skipRemainingSymbolAssignments = false,
  detail: Pick<
    Extract<CandidateEvaluation, {readonly status: 'rejected'}>,
    'difficultyClassification' | 'difficultyRejectedCandidate'
  > = {},
): CandidateEvaluation {
  return {
    status: 'rejected',
    reason,
    skipRemainingSymbolAssignments,
    ...detail,
  };
}

function updateClearlyEasierRetryState(
  evaluation: Extract<CandidateEvaluation, {readonly status: 'rejected'}>,
  state: DifficultyRetryState,
): DifficultyRetryState {
  if (evaluation.difficultyClassification === undefined) {
    return state;
  }
  return observeDifficultyRetryCandidate(state, {
    classification: evaluation.difficultyClassification,
    ...(evaluation.difficultyRejectedCandidate === undefined
      ? {}
      : {rejectedCandidate: evaluation.difficultyRejectedCandidate}),
  });
}

function acceptedDifficultyClassifications(
  request: GenerationRequest,
): readonly AcceptedDifficultyClassification[] {
  return (
    request.acceptedDifficultyClassifications ??
    ACCEPTABLE_DIFFICULTY_CLASSIFICATIONS
  );
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
    code: 'INTERNAL_INVARIANT_BROKEN',
    checkId,
  });
}

function passesUniquePathCoverGates(
  usedCellCount: number,
  geometry: GeneratedPuzzle['geometry'],
  entry: UniquePathCoverEntryAnalysis,
  profile: UniquePathCoverProfile,
): boolean {
  const cellCount = profile.width * profile.height;
  return (
    usedCellCount >= profile.minimumUsedCellCount &&
    usedCellCount <= profile.maximumUsedCellCount &&
    geometry.totalEdgeCount === cellCount - profile.pathCount &&
    geometry.unexplainedUnitBayCount === 0 &&
    geometry.totalTurnCount <= profile.maximumTotalTurnCount &&
    geometry.unusedComponentCount === 0 &&
    geometry.isolatedUnusedCellCount === 0 &&
    entry.forcedExitTerminalIds.length >= profile.minimumForcedExitCount &&
    entry.forcedExitTerminalIds.length <= profile.maximumForcedExitCount &&
    entry.maximumLineConcentration <= profile.maximumLineConcentration
  );
}
