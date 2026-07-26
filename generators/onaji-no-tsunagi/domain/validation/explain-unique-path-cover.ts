/**
 * 唯一解問題の機械分析結果を、開発診断用の日本語説明へ変換する。
 *
 * @packageDocumentation
 */

import type {
  InteractionWitness,
  UniquePathCoverEntryAnalysis,
} from "../types/worksheet.ts";

/**
 * 端点分析と唯一性探索量から、Worksheetへ保存する機械証拠を組み立てる。
 *
 * 人間の実解順序や実際に迷った仮説を記録するものではない。
 */
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
