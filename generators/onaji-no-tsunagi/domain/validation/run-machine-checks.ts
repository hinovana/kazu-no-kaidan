/**
 * 生成候補へ適用するvalidator、唯一解、profile、品質条件を一括実行する。
 *
 * 自動検査通過は、人間レビューや児童利用許可を意味しない。
 *
 * @packageDocumentation
 */

import {getUniquePathCoverProfile} from '../generation/build-unique-path-cover.ts';
import {countPerfectMatchings} from '../solver/enumerate-pairings.ts';
import type {GenerationRequest} from '../types/generation.ts';
import type {
  GeneratedPuzzle,
  MachineCheck,
  MachineCheckReport,
} from '../types/worksheet.ts';
import type {UniquePathCoverProfile} from '../generation/build-unique-path-cover.ts';
import {doesSolutionPreserveRouteRoles} from './solution-route-roles.ts';
import {validatePuzzle} from './validate-puzzle.ts';
import {validateSolution} from './validate-solution.ts';

/**
 * 生成済み問題群に対し、仕様で要求する技術gateを再集約する。
 *
 * @remarks
 * 合格は盤面・解・唯一性証拠・profile形状・再現性metadataの整合を示す。
 * 美しさ、面白さ、難易度校正、児童利用可否を評価しない。
 */
export function runMachineChecks(
  request: GenerationRequest,
  puzzles: readonly GeneratedPuzzle[],
): MachineCheckReport {
  const checks: MachineCheck[] = [
    {
      checkId: 'puzzle_count',
      passed: puzzles.length === request.puzzleCount,
      details: {expected: request.puzzleCount, actual: puzzles.length},
    },
    aggregateCheck(
      'puzzle_structure',
      puzzles.map(entry => validatePuzzle(entry.puzzle).valid),
    ),
    aggregateCheck(
      'canonical_solution_valid',
      puzzles.map(
        entry => validateSolution(entry.puzzle, entry.canonicalSolution).valid,
      ),
    ),
    aggregateCheck(
      'quality_optimality_proven',
      puzzles.map(entry => entry.qualityProof.status === 'optimal'),
    ),
    aggregateCheck(
      'planted_solution_not_inflated',
      puzzles.map(
        entry => entry.generationWitness.plantedInflationEdgeCount === 0,
      ),
    ),
    aggregateCheck(
      'route_roles_preserved',
      puzzles.map(
        entry =>
          entry.generationWitness.rolePreservationStatus === 'proven' &&
          doesSolutionPreserveRouteRoles(
            entry.puzzle,
            entry.canonicalSolution,
            entry.routeRoles,
          ),
      ),
    ),
    aggregateCheck(
      'unique_solution_proven',
      puzzles.map(
        entry =>
          entry.solutionCount.kind === 'exact' &&
          entry.solutionCount.count === 1 &&
          entry.uniquenessProof.status === 'proven' &&
          entry.uniquenessProof.exploredStateCount > 0,
      ),
    ),
    aggregateCheck(
      'entry_structure_present',
      puzzles.map(hasExpectedEntryStructure),
    ),
    aggregateCheck(
      'solution_geometry_natural',
      puzzles.map(hasNaturalSolutionGeometry),
    ),
    aggregateCheck(
      'interaction_witnesses_proven',
      puzzles.map(hasProvenInteractionWitnesses),
    ),
    aggregateCheck(
      'difficulty_profile_matched',
      puzzles.map(
        entry => entry.difficulty.measuredBand === request.difficulty,
      ),
    ),
    aggregateCheck(
      'seed_reproducibility_metadata',
      puzzles.map(entry => entry.provenance.puzzleSeed.length > 0),
    ),
    aggregateCheck(
      'problem_topology_hash_present',
      puzzles.map(entry =>
        /^[0-9a-f]{8}$/u.test(entry.provenance.topologyHash),
      ),
    ),
    aggregateCheck(
      'render_geometry_valid',
      puzzles.map(hasExpectedRenderGeometry),
    ),
  ];
  return {
    allPassed: checks.every(check => check.passed),
    checks,
  };
}

function hasExpectedEntryStructure(entry: GeneratedPuzzle): boolean {
  const profile = profileFor(entry);
  const expectedPairingChoiceCount = profile.symbolPathCounts.reduce(
    (product, pathCount) => product * countPerfectMatchings(pathCount * 2),
    1,
  );
  return (
    entry.entry.pattern === 'unique_path_cover' &&
    entry.entry.terminalPattern === profile.terminalPattern &&
    entry.entry.machineStatus === 'entry_candidate' &&
    entry.entry.symbolGroups.length === 3 &&
    entry.entry.pairingChoiceCount === expectedPairingChoiceCount &&
    isWithinRange(
      entry.entry.forcedExitTerminalIds.length,
      profile.minimumForcedExitCount,
      profile.maximumForcedExitCount,
    ) &&
    entry.entry.maximumLineConcentration <= profile.maximumLineConcentration
  );
}

function hasNaturalSolutionGeometry(entry: GeneratedPuzzle): boolean {
  const profile = profileFor(entry);
  const cellCount = profile.width * profile.height;
  return (
    isWithinRange(
      entry.answerCoverage.usedCellCount,
      profile.minimumUsedCellCount,
      profile.maximumUsedCellCount,
    ) &&
    entry.puzzle.terminals.length === profile.terminalCount &&
    entry.canonicalSolution.paths.length === profile.pathCount &&
    entry.geometry.totalEdgeCount === cellCount - profile.pathCount &&
    entry.geometry.unexplainedUnitBayCount === 0 &&
    entry.geometry.totalTurnCount <= profile.maximumTotalTurnCount &&
    entry.geometry.unusedComponentCount === 0 &&
    entry.geometry.isolatedUnusedCellCount === 0
  );
}

function hasProvenInteractionWitnesses(entry: GeneratedPuzzle): boolean {
  const hasForcedExit = entry.interactionWitnesses.some(
    witness => witness.kind === 'forced_exit',
  );
  const hasPairingChoiceWhenNeeded =
    entry.entry.pairingChoiceCount === 1 ||
    entry.interactionWitnesses.some(
      witness =>
        witness.kind === 'pairing_choice' && witness.exploredStateCount > 0,
    );
  const hasUniqueSolution = entry.interactionWitnesses.some(
    witness =>
      witness.kind === 'unique_solution' && witness.exploredStateCount > 0,
  );
  const everyWitnessIsProven = entry.interactionWitnesses.every(
    witness => witness.proofStatus === 'proven',
  );
  return (
    hasForcedExit &&
    hasPairingChoiceWhenNeeded &&
    hasUniqueSolution &&
    everyWitnessIsProven
  );
}

function hasExpectedRenderGeometry(entry: GeneratedPuzzle): boolean {
  const profile = profileFor(entry);
  return (
    entry.puzzle.width === profile.width &&
    entry.puzzle.height === profile.height &&
    entry.puzzle.terminals.length === profile.terminalCount
  );
}

function profileFor(entry: GeneratedPuzzle): UniquePathCoverProfile {
  return getUniquePathCoverProfile(entry.provenance.profileId);
}

function isWithinRange(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return value >= minimum && value <= maximum;
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
