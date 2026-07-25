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
  buildUniqueFiveByFive,
  getFiveByFiveTerminalProfile,
  selectFiveByFiveTerminalPattern,
  type FiveByFiveTerminalProfile,
  UNIQUE_FIVE_BY_FIVE_PROFILE,
} from "./build-unique-five-by-five.ts";
import { createSeededRandom, stableHash } from "./random.ts";

export class GenerationFailure extends Error {
  readonly detail: GenerationError;

  constructor(detail: GenerationError) {
    super(detail.code);
    this.name = "GenerationFailure";
    this.detail = detail;
  }
}

export function generateWorksheet(request: GenerationRequest): Worksheet {
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
    const terminalPattern = selectFiveByFiveTerminalPattern(
      request.seed,
      puzzleIndex,
      request.puzzleCount,
    );
    const terminalProfile = getFiveByFiveTerminalProfile(terminalPattern);
    for (
      let candidateIndex = 0;
      candidateIndex < UNIQUE_FIVE_BY_FIVE_PROFILE.maximumCandidateCount;
      candidateIndex += 1
    ) {
      totalAttempts += 1;
      const puzzleSeed = [
        request.seed,
        "onaji-no-tsunagi-generator.v3.3",
        `puzzle-${puzzleIndex + 1}`,
        `terminals-${terminalPattern}`,
        `candidate-${candidateIndex}`,
      ].join("::");
      const random = createSeededRandom(puzzleSeed);
      const plan = buildUniqueFiveByFive(
        puzzleSeed,
        random,
        terminalPattern,
      );
      if (plan === null) {
        reject("route_plan_not_constructed");
        continue;
      }
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
        continue;
      }
      const validity = solvePuzzle(plan.puzzle, {
        solutionLimit: 2,
        stateBudget: UNIQUE_FIVE_BY_FIVE_PROFILE.maximumValidityStates,
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
          stateBudget:
            UNIQUE_FIVE_BY_FIVE_PROFILE.maximumProofStates,
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
        plan.routeRoles,
        optimization.optimalPrimaryCostSolutionCount,
      );
      const coverage = analyzeSolutionCoverage(
        plan.puzzle,
        optimization.solution,
      );
      if (!passesUniqueFiveByFiveGates(
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
        geometry,
        entryResult.analysis,
        interactionWitnesses,
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
          plantedCost,
          optimalCost: optimization.cost,
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
    schemaVersion: "onaji-no-tsunagi.worksheet.v3.3",
    worksheetId: `ots-sheet-${stableHash(JSON.stringify(request))}`,
    usageClass: "development_preview",
    childUsePermitted: false,
    request,
    puzzles,
    machineChecks: { ...report, allPassed: true },
    provenance: {
      generatorVersion: "onaji-no-tsunagi-generator.v3.3",
      algorithmSpecVersion: "onaji-no-tsunagi-spec.v3.3",
      solverVersion: "onaji-no-tsunagi-solver.v3.1",
      analyzerVersion: "onaji-no-tsunagi-difficulty.v3.3",
      profileVersion: "onaji-no-tsunagi-profiles.v3.3",
      seed: request.seed,
      generatedAt: null,
    },
    manualReview: { status: "not_started" },
    calibration: { status: "not_calibrated" },
  };
}

function passesUniqueFiveByFiveGates(
  usedCellCount: number,
  geometry: GeneratedPuzzle["geometry"],
  entry: UniquePathCoverEntryAnalysis,
  profile: FiveByFiveTerminalProfile,
): boolean {
  return usedCellCount
      >= UNIQUE_FIVE_BY_FIVE_PROFILE.minimumUsedCellCount
    && geometry.totalEdgeCount === 25 - profile.pathCount
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
