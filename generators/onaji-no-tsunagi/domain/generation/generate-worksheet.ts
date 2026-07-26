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
  let totalAttempts = 0;
  const allRejections: CandidateRejection[] = [];

  for (
    let puzzleIndex = 0;
    puzzleIndex < request.puzzleCount;
    puzzleIndex += 1
  ) {
    const puzzleRejections: CandidateRejection[] = [];
    let generated: GeneratedPuzzle | null = null;
    const profileId = selectUniquePathCoverProfileId(
      request.difficulty,
      request.seed,
      puzzleIndex,
      request.puzzleCount,
    );
    const terminalProfile = getUniquePathCoverProfile(profileId);
    const terminalPattern = terminalProfile.terminalPattern;
    const symbolAssignmentVariantCount = terminalProfile.width === 6
      ? getSymbolAssignmentVariantCount(profileId)
      : 1;
    for (
      let candidateIndex = 0;
      candidateIndex < terminalProfile.maximumCandidateCount;
      candidateIndex += 1
    ) {
      totalAttempts += 1;
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
          ? `terminals-${terminalPattern}`
          : `profile-${profileId}`,
        `candidate-${routeCandidateIndex}`,
      ].join("::");
      const puzzleSeed = terminalProfile.width === 5
        ? routeSeed
        : `${routeSeed}::symbol-${symbolAssignmentVariant}`;
      const random = createSeededRandom(routeSeed);
      const buildResult = buildUniquePathCover(
        routeSeed,
        random,
        profileId,
        {
          symbolAssignmentVariant,
          materializedPuzzleSeed: puzzleSeed,
        },
      );
      if (buildResult.status === "budget_exhausted") {
        reject("construction_state_budget_exhausted");
        skipRemainingSymbolAssignments();
        continue;
      }
      if (buildResult.status === "not_constructed") {
        reject("route_plan_not_constructed");
        skipRemainingSymbolAssignments();
        continue;
      }
      const { plan } = buildResult;
      if (puzzles.some((entry) => (
        entry.provenance.topologyHash === plan.topologyHash
      ))) {
        reject("duplicate_topology_in_worksheet");
        continue;
      }
      const knownValidation = validateSolution(
        plan.puzzle,
        plan.plantedSolution,
      );
      if (!knownValidation.valid) {
        throw new GenerationFailure({
          code: "INTERNAL_INVARIANT_BROKEN",
          checkId: "known_solution_valid",
        });
      }
      const entryResult = analyzeUniquePathCoverEntry(
        plan.puzzle,
        terminalProfile,
      );
      if (entryResult.status === "rejected") {
        reject("entry_structure_missing");
        skipRemainingSymbolAssignments();
        continue;
      }
      const validity = solvePuzzle(plan.puzzle, {
        solutionLimit: 2,
        stateBudget: terminalProfile.maximumValidityStates,
      });
      if (validity.status === "budget_exhausted") {
        reject("validity_solver_budget_exhausted");
        continue;
      }
      if (validity.status === "unsatisfiable") {
        throw new GenerationFailure({
          code: "INTERNAL_INVARIANT_BROKEN",
          checkId: "independent_solver_found_solution",
        });
      }
      if (
        validity.solutionCount.kind !== "exact"
        || validity.solutionCount.count !== 1
      ) {
        reject("solution_not_unique");
        continue;
      }
      const optimization = optimizeSolution(
        plan.puzzle,
        plan.plantedSolution,
        {
          stateBudget: terminalProfile.maximumProofStates,
        },
      );
      if (optimization.status === "budget_exhausted") {
        reject("quality_optimizer_budget_exhausted");
        continue;
      }
      if (optimization.status === "unsatisfiable") {
        throw new GenerationFailure({
          code: "INTERNAL_INVARIANT_BROKEN",
          checkId: "quality_optimizer_found_solution",
        });
      }
      const plantedCost = calculateSolutionCost(
        plan.puzzle,
        plan.plantedSolution,
      );
      if (
        plantedCost.totalEdgeCount
          !== optimization.cost.totalEdgeCount
      ) {
        reject("planted_solution_not_optimal");
        continue;
      }
      if (!doesSolutionPreserveRouteRoles(
        plan.puzzle,
        optimization.solution,
        plan.routeRoles,
      )) {
        reject("planted_solution_not_optimal");
        continue;
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
        terminalProfile,
      )) {
        reject("geometry_gate_failed");
        continue;
      }
      const interactionWitnesses = explainUniquePathCover(
        entryResult.analysis,
        validity.metrics.exploredStateCount,
      );
      const difficulty = analyzeDifficulty(
        request.difficulty,
        plan.puzzle,
        validity.metrics,
      );
      if (difficulty.measuredBand !== request.difficulty) {
        reject("difficulty_band_mismatch");
        continue;
      }
      generated = {
        puzzle: plan.puzzle,
        canonicalSolution: optimization.solution,
        answerCoverage: coverage,
        solutionCount: { kind: "exact", count: 1 },
        solutionCost: optimization.cost,
        entry: entryResult.analysis,
        geometry,
        interactionWitnesses,
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
          terminalPattern,
          profileId,
          constructionStateCount: buildResult.constructionStateCount,
          pathLengthProfile: buildResult.pathLengthProfile,
          candidateIndex,
          puzzleSeed,
          topologyHash: plan.topologyHash,
          precedingRejections: [...puzzleRejections],
        },
      };
      break;

      function reject(reason: CandidateRejectionReason): void {
        const rejection = { candidateIndex, puzzleSeed, reason } as const;
        puzzleRejections.push(rejection);
        allRejections.push(rejection);
      }

      function skipRemainingSymbolAssignments(): void {
        candidateIndex += (
          symbolAssignmentVariantCount
          - symbolAssignmentVariant
          - 1
        );
      }
    }
    if (generated === null) {
      throw new GenerationFailure({
        code: "GENERATION_BUDGET_EXHAUSTED",
        attemptedCandidates: totalAttempts,
        rejections: allRejections,
      });
    }
    puzzles.push(generated);
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
