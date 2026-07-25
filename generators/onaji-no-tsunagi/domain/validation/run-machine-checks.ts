import {
  getFiveByFiveTerminalProfile,
  UNIQUE_FIVE_BY_FIVE_PROFILE,
} from "../generation/build-unique-five-by-five.ts";
import { countPerfectMatchings } from "../solver/enumerate-pairings.ts";
import type { GenerationRequest } from "../types/generation.ts";
import type {
  GeneratedPuzzle,
  MachineCheck,
  MachineCheckReport,
} from "../types/worksheet.ts";
import { doesSolutionPreserveRouteRoles } from "./solution-route-roles.ts";
import { validatePuzzle } from "./validate-puzzle.ts";
import { validateSolution } from "./validate-solution.ts";

export function runMachineChecks(
  request: GenerationRequest,
  puzzles: readonly GeneratedPuzzle[],
): MachineCheckReport {
  const checks: MachineCheck[] = [
    {
      checkId: "puzzle_count",
      passed: puzzles.length === request.puzzleCount,
      details: { expected: request.puzzleCount, actual: puzzles.length },
    },
    aggregateCheck(
      "puzzle_structure",
      puzzles.map((entry) => validatePuzzle(entry.puzzle).valid),
    ),
    aggregateCheck(
      "canonical_solution_valid",
      puzzles.map((entry) => validateSolution(
        entry.puzzle,
        entry.canonicalSolution,
      ).valid),
    ),
    aggregateCheck(
      "quality_optimality_proven",
      puzzles.map((entry) => entry.qualityProof.status === "optimal"),
    ),
    aggregateCheck(
      "planted_solution_not_inflated",
      puzzles.map((entry) => (
        entry.generationWitness.plantedInflationEdgeCount === 0
      )),
    ),
    aggregateCheck(
      "route_roles_preserved",
      puzzles.map((entry) => (
        entry.generationWitness.rolePreservationStatus === "proven"
        && doesSolutionPreserveRouteRoles(
          entry.puzzle,
          entry.canonicalSolution,
          entry.routeRoles,
        )
      )),
    ),
    aggregateCheck(
      "unique_solution_proven",
      puzzles.map((entry) => (
        entry.solutionCount.kind === "exact"
        && entry.solutionCount.count === 1
        && entry.uniquenessProof.status === "proven"
        && entry.uniquenessProof.exploredStateCount > 0
      )),
    ),
    aggregateCheck(
      "entry_structure_present",
      puzzles.map((entry) => {
        const profile = getFiveByFiveTerminalProfile(
          entry.provenance.terminalPattern,
        );
        const expectedPairingChoiceCount = profile.symbolPathCounts.reduce(
          (product, pathCount) => (
            product * countPerfectMatchings(pathCount * 2)
          ),
          1,
        );
        return entry.entry.pattern === "unique_path_cover"
        && entry.entry.terminalPattern === profile.pattern
        && entry.entry.machineStatus === "entry_candidate"
        && entry.entry.symbolGroups.length === 3
        && entry.entry.pairingChoiceCount === expectedPairingChoiceCount
        && entry.entry.forcedExitTerminalIds.length
          >= profile.minimumForcedExitCount
        && entry.entry.forcedExitTerminalIds.length
          <= profile.maximumForcedExitCount
        && entry.entry.maximumLineConcentration
          <= profile.maximumLineConcentration;
      }),
    ),
    aggregateCheck(
      "solution_geometry_natural",
      puzzles.map((entry) => {
        const profile = getFiveByFiveTerminalProfile(
          entry.provenance.terminalPattern,
        );
        return entry.answerCoverage.usedCellCount
          >= UNIQUE_FIVE_BY_FIVE_PROFILE.minimumUsedCellCount
        && entry.puzzle.terminals.length === profile.terminalCount
        && entry.canonicalSolution.paths.length === profile.pathCount
        && entry.geometry.totalEdgeCount === 25 - profile.pathCount
        && entry.geometry.unexplainedUnitBayCount === 0
        && entry.geometry.totalTurnCount
          <= profile.maximumTotalTurnCount
        && entry.geometry.unusedComponentCount === 0
        && entry.geometry.isolatedUnusedCellCount === 0;
      }),
    ),
    aggregateCheck(
      "interaction_witnesses_proven",
      puzzles.map((entry) => (
        entry.interactionWitnesses.some((witness) => (
          witness.kind === "forced_exit"
        ))
        && (
          entry.entry.pairingChoiceCount === 1
          || entry.interactionWitnesses.some((witness) => (
            witness.kind === "pairing_choice"
            && witness.exploredStateCount > 0
          ))
        )
        && entry.interactionWitnesses.some((witness) => (
          witness.kind === "unique_solution"
          && witness.exploredStateCount > 0
        ))
        && entry.interactionWitnesses.every((witness) => (
          witness.proofStatus === "proven"
        ))
      )),
    ),
    aggregateCheck(
      "difficulty_profile_matched",
      puzzles.map((entry) => (
        entry.difficulty.measuredBand === request.difficulty
      )),
    ),
    aggregateCheck(
      "seed_reproducibility_metadata",
      puzzles.map((entry) => entry.provenance.puzzleSeed.length > 0),
    ),
    aggregateCheck(
      "problem_topology_hash_present",
      puzzles.map((entry) => (
        /^[0-9a-f]{8}$/u.test(entry.provenance.topologyHash)
      )),
    ),
    aggregateCheck(
      "render_geometry_valid",
      puzzles.map((entry) => (
        entry.puzzle.width === 5
        && entry.puzzle.height === 5
        && [6, 8, 10].includes(entry.puzzle.terminals.length)
      )),
    ),
  ];
  return {
    allPassed: checks.every((check) => check.passed),
    checks,
    qualityAssessment: {
      status: "structural_candidate_only",
      reason: [
        "5×5・6/8/10端点の唯一解、ペアリング、取っ掛かり、経路形状を機械検査済みです。",
        "挑戦したくなるか、解いて面白いか、児童向け難易度は人間未確認です。",
      ].join(""),
    },
  };
}

function aggregateCheck(
  checkId: string,
  results: readonly boolean[],
): MachineCheck {
  return {
    checkId,
    passed: results.every(Boolean),
    details: {
      passedCount: results.filter(Boolean).length,
      totalCount: results.length,
    },
  };
}
