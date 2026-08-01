/**
 * 6×6・10端点profileの配置条件を、経路探索と記号割当ての制約へ変換する。
 *
 * profile設定、探索中の安全な枝刈り、完成coverの記号割当て列挙を一つの
 * 境界で扱う。体感難易度や児童向け品質は判定しない。
 *
 * @packageDocumentation
 */

import {indexToCell} from '../grid/coordinates.ts';
import type {
  TerminalGeometryRuleId,
  TerminalPlacementSearchDiagnostics,
  TerminalSymbolRuleId,
} from '../types/generation.ts';
import type {Cell, SymbolId} from '../types/puzzle.ts';
import {
  analyzeTerminalMask,
  analyzeTerminalSymbols,
} from '../validation/analyze-terminal-placement.ts';
import type {PathCandidate} from './path-candidate-source.ts';
import {enumerateSixBySixPathSymbols} from './path-symbol-assignment.ts';

/** 生成profileが有効化できる、版付き端点配置policy。 */
export interface TerminalPlacementPolicy {
  readonly policyId: 'onaji-no-tsunagi-terminal-placement.6x6-4-4-2.v1';
  readonly maximumOuterAdjacencyPairCount: 1;
  readonly maximumCentralAdjacencyPairCount: 1;
  readonly prohibitStraightTerminalRuns: true;
  readonly prohibitLShapedTerminalTriples: true;
  readonly requireEverySymbolInCentralRegion: true;
  readonly prohibitSameSymbolOuterAdjacency: true;
}

/** exact-cover探索へ渡す判定と、採用coverの記号割当てを共有する。 */
export interface TerminalPlacementSearch {
  /**
   * 現在の経路集合を続行してよいか返す。
   *
   * `complete=false`では単調な条件だけを使い、L字型3連と記号条件は
   * 完成coverになるまで判定しない。
   */
  readonly isPathSelectionAllowed: (
    paths: readonly PathCandidate[],
    complete: boolean,
  ) => boolean;
  /** 採用coverに対する、条件を満たす記号割当てを決定順で返す。 */
  readonly allowedSymbolAssignments: (
    paths: readonly PathCandidate[],
  ) => readonly (readonly SymbolId[])[];
  /** 現在までの探索診断値のsnapshotを返す。 */
  readonly diagnostics: () => TerminalPlacementSearchDiagnostics;
}

/**
 * profileの端点配置policyを、状態を持つ探索制約へ変換する。
 *
 * @remarks
 * 診断値は完成盤面の却下率ではなく、exact-cover探索枝と記号割当ての
 * 評価回数を表す。
 */
export function createTerminalPlacementSearch(
  policy: TerminalPlacementPolicy,
  width: number,
  height: number,
  symbolPathCounts: readonly [number, number, number],
  routeSeed: string,
): TerminalPlacementSearch {
  const pathPruningCounts: Record<TerminalGeometryRuleId, number> = {
    outer_adjacency_pair_limit: 0,
    central_adjacency_pair_limit: 0,
    straight_terminal_run: 0,
    l_shaped_terminal_triple: 0,
  };
  const symbolAssignmentRejectionCounts: Record<TerminalSymbolRuleId, number> =
    {
      central_symbol_coverage: 0,
      same_symbol_outer_adjacency: 0,
    };
  let pathExtensionEvaluationCount = 0;
  let completedCoverEvaluationCount = 0;
  let symbolAssignmentEvaluationCount = 0;
  let allowedSymbolAssignmentCount = 0;
  let cachedPathSignature = '';
  let cachedAllowedAssignments: readonly (readonly SymbolId[])[] = [];

  return {
    isPathSelectionAllowed(paths, complete) {
      pathExtensionEvaluationCount += 1;
      if (complete) {
        completedCoverEvaluationCount += 1;
      }
      const geometry = analyzeTerminalMask(endpointMask(paths), width, height);
      const failedGeometryRules: TerminalGeometryRuleId[] = [];
      if (
        geometry.adjacentEdgeTerminalPairCount >
        policy.maximumOuterAdjacencyPairCount
      ) {
        failedGeometryRules.push('outer_adjacency_pair_limit');
      }
      if (
        geometry.adjacentCentralTerminalPairCount >
        policy.maximumCentralAdjacencyPairCount
      ) {
        failedGeometryRules.push('central_adjacency_pair_limit');
      }
      if (
        policy.prohibitStraightTerminalRuns &&
        geometry.hasStraightTerminalRun
      ) {
        failedGeometryRules.push('straight_terminal_run');
      }
      if (
        complete &&
        policy.prohibitLShapedTerminalTriples &&
        geometry.hasLShapedTerminalTriple
      ) {
        failedGeometryRules.push('l_shaped_terminal_triple');
      }
      for (const ruleId of failedGeometryRules) {
        pathPruningCounts[ruleId] += 1;
      }
      if (failedGeometryRules.length > 0) {
        return false;
      }
      if (!complete) {
        return true;
      }

      const assignments = evaluateSymbolAssignments(paths, true);
      return assignments.length > 0;
    },

    allowedSymbolAssignments(paths) {
      const signature = pathSignature(paths);
      return signature === cachedPathSignature
        ? cachedAllowedAssignments
        : evaluateSymbolAssignments(paths, false);
    },

    diagnostics() {
      return {
        policyId: policy.policyId,
        pathExtensionEvaluationCount,
        completedCoverEvaluationCount,
        pathPruningCounts: {...pathPruningCounts},
        symbolAssignmentEvaluationCount,
        symbolAssignmentRejectionCounts: {
          ...symbolAssignmentRejectionCounts,
        },
        allowedSymbolAssignmentCount,
      };
    },
  };

  function evaluateSymbolAssignments(
    paths: readonly PathCandidate[],
    recordDiagnostics: boolean,
  ): readonly (readonly SymbolId[])[] {
    const assignments = enumerateSixBySixPathSymbols(
      routeSeed,
      symbolPathCounts,
    );
    const allowedAssignments: (readonly SymbolId[])[] = [];
    for (const assignment of assignments) {
      const symbolAnalysis = analyzeTerminalSymbols(
        symbolTerminalCells(paths, assignment, width),
        width,
        height,
      );
      if (recordDiagnostics) {
        symbolAssignmentEvaluationCount += 1;
        if (!symbolAnalysis.satisfiesCentralSymbolCoverage) {
          symbolAssignmentRejectionCounts.central_symbol_coverage += 1;
        }
        if (!symbolAnalysis.satisfiesDifferentSymbolEdgeAdjacency) {
          symbolAssignmentRejectionCounts.same_symbol_outer_adjacency += 1;
        }
      }
      if (
        (!policy.requireEverySymbolInCentralRegion ||
          symbolAnalysis.satisfiesCentralSymbolCoverage) &&
        (!policy.prohibitSameSymbolOuterAdjacency ||
          symbolAnalysis.satisfiesDifferentSymbolEdgeAdjacency)
      ) {
        allowedAssignments.push(assignment);
      }
    }
    cachedPathSignature = pathSignature(paths);
    cachedAllowedAssignments = allowedAssignments;
    allowedSymbolAssignmentCount = allowedAssignments.length;
    return allowedAssignments;
  }
}

function endpointMask(paths: readonly PathCandidate[]): bigint {
  let mask = 0n;
  for (const path of paths) {
    const first = path.cells[0];
    const last = path.cells.at(-1);
    if (first === undefined || last === undefined) {
      throw new TypeError('path candidate has no endpoints');
    }
    mask |= 1n << BigInt(first);
    mask |= 1n << BigInt(last);
  }
  return mask;
}

function symbolTerminalCells(
  paths: readonly PathCandidate[],
  symbols: readonly SymbolId[],
  width: number,
): readonly (Cell & {readonly symbol: SymbolId})[] {
  return paths.flatMap((path, index) => {
    const symbol = symbols[index];
    const first = path.cells[0];
    const last = path.cells.at(-1);
    if (symbol === undefined || first === undefined || last === undefined) {
      throw new TypeError('path symbol assignment is incomplete');
    }
    return [
      {...indexToCell(first, width), symbol},
      {...indexToCell(last, width), symbol},
    ];
  });
}

function pathSignature(paths: readonly PathCandidate[]): string {
  return paths
    .map(path => `${path.cells[0] ?? -1}-${path.cells.at(-1) ?? -1}`)
    .join('|');
}
