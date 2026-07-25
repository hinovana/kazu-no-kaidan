import type {
  InteractionWitness,
  UniquePathCoverEntryAnalysis,
} from "../types/worksheet.ts";

export function explainUniquePathCover(
  entry: UniquePathCoverEntryAnalysis,
  uniquenessExploredStateCount: number,
): readonly InteractionWitness[] {
  const witnesses: InteractionWitness[] = [
    {
      kind: "forced_exit",
      involvedTerminalIds: entry.forcedExitTerminalIds,
      temptingConstraint: {
        openExitCount: 1,
        forcedExitCount: entry.forcedExitTerminalIds.length,
      },
      consequence: "remaining_pair_unreachable",
      proofStatus: "proven",
      exploredStateCount: 0,
    },
  ];
  if (entry.pairingChoiceCount > 1) {
    const pairingGroups = entry.symbolGroups.filter((group) => (
      group.pairingChoiceCount > 1
    ));
    witnesses.push({
      kind: "pairing_choice",
      involvedTerminalIds: pairingGroups.flatMap((group) => (
        group.terminalIds
      )),
      temptingConstraint: {
        pairingChoiceCount: entry.pairingChoiceCount,
        repeatedSymbolCount: pairingGroups.length,
      },
      consequence: "alternative_solution_unsatisfiable",
      proofStatus: "proven",
      exploredStateCount: uniquenessExploredStateCount,
    });
  }
  witnesses.push({
      kind: "unique_solution",
      involvedTerminalIds: entry.symbolGroups.flatMap((group) => (
        group.terminalIds
      )),
      temptingConstraint: {
        normalizedSolutionCount: 1,
      },
      consequence: "alternative_solution_unsatisfiable",
      proofStatus: "proven",
      exploredStateCount: uniquenessExploredStateCount,
    });
  return witnesses;
}
